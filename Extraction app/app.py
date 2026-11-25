
from flask import Flask, render_template, request, jsonify
import numpy as np


import json
from io import BytesIO

from flask import jsonify, request, send_file
from openpyxl import Workbook
from openpyxl.styles import (
    Font,
    PatternFill,
    Border,
    Side,
    Alignment
)
from openpyxl.cell.cell import MergedCell
from openpyxl.utils import get_column_letter


from calculations.parameters import get_parameters
from calculations.lle import calculate_binodal
from calculations.stages import (
    calculate_cross_current,
    calculate_counter_current,
    FeedSolventLineError,
)


app = Flask(__name__)


# =========================================================
# JSON CONVERSION
# =========================================================

def convert_to_json(value):
    """
    Recursively converts NumPy data into JSON-compatible Python data.
    Non-finite numbers are returned as None.
    """

    if isinstance(value, np.ndarray):
        return convert_to_json(value.tolist())

    if isinstance(value, np.integer):
        return int(value)

    if isinstance(value, np.floating):
        if not np.isfinite(value):
            return None
        return float(value)

    if isinstance(value, np.bool_):
        return bool(value)

    if isinstance(value, float):
        if not np.isfinite(value):
            return None
        return value

    if isinstance(value, dict):
        return {
            key: convert_to_json(item)
            for key, item in value.items()
        }

    if isinstance(value, (list, tuple)):
        return [
            convert_to_json(item)
            for item in value
        ]

    return value


# =========================================================
# VALIDATE COMPOSITIONS
# =========================================================

def validate_composition(composition, name):

    composition = np.asarray(composition, dtype=float)

    if composition.shape != (3,):
        raise ValueError(
            f"{name} must contain exactly three components."
        )

    if not np.all(np.isfinite(composition)):
        raise ValueError(
            f"{name} contains invalid values."
        )

    if np.any(composition < 0) or np.any(composition > 1):
        raise ValueError(
            f"The component fractions of {name} must be between 0 and 1."
        )

    if not np.isclose(composition.sum(), 1.0, atol=1e-6):
        raise ValueError(
            f"The composition of {name} must sum to 1."
        )

    return composition


# =========================================================
# VALIDATE BINODAL DATA
# =========================================================

def validate_binodal_data(data):

    X_P1 = np.asarray(data["X_P1"], dtype=float)
    X_P2 = np.asarray(data["X_P2"], dtype=float)
    X_PP = np.asarray(data["X_PP"], dtype=float)

    if X_P1.ndim != 2 or X_P1.shape[1] != 3:
        raise ValueError(
            "X_P1 must be a matrix with three columns."
        )

    if X_P2.ndim != 2 or X_P2.shape[1] != 3:
        raise ValueError(
            "X_P2 must be a matrix with three columns."
        )

    if X_P1.shape != X_P2.shape:
        raise ValueError(
            "X_P1 and X_P2 must have the same shape."
        )

    if len(X_P1) < 2:
        raise ValueError(
            "The binodal curve contains too few points."
        )

    if not np.all(np.isfinite(X_P1)):
        raise ValueError("X_P1 contains invalid values.")

    if not np.all(np.isfinite(X_P2)):
        raise ValueError("X_P2 contains invalid values.")

    if X_PP.shape != (3,):
        raise ValueError(
            "X_PP must contain exactly three components."
        )

    if not np.all(np.isfinite(X_PP)):
        raise ValueError("X_PP contains invalid values.")

    if not np.isclose(X_PP.sum(), 1.0, atol=1e-6):
        raise ValueError(
            "X_PP must sum to 1."
        )

    return X_P1, X_P2, X_PP


# =========================================================
# START PAGE
# =========================================================

@app.route("/")
def index():
    return render_template("index.html")


# =========================================================
# CALCULATE LLE
# =========================================================

@app.route("/calculate-lle", methods=["POST"])
def calculate_lle():

    try:

        data = request.get_json()

        if not data:
            raise ValueError(
                "No JSON data received."
            )

        mixture = data["mixture"]
        temperature = float(data["temperature"])

        if not np.isfinite(temperature):
            raise ValueError(
                "Invalid temperature."
            )

        A, alpha = get_parameters(mixture)

        result = calculate_binodal(
            T=temperature,
            A=A,
            alpha=alpha,
            n_points=3000,
        )

        if "X_PP" not in result:
            raise ValueError(
                "calculate_binodal() did not return X_PP."
            )

        return jsonify(convert_to_json(result))

    except (ValueError, KeyError, TypeError) as error:

        return jsonify({
            "error": str(error)
        }), 400

    except Exception:

        app.logger.exception(
            "LLE calculation failed."
        )

        return jsonify({
            "error": "An internal error occurred during the LLE calculation."
        }), 500


# =========================================================
# CALCULATE CROSS-CURRENT EXTRACTION
# =========================================================

@app.route("/calculate-cross-current", methods=["POST"])
def calculate_cross_current_endpoint():

    try:

        data = request.get_json()

        if not data:
            raise ValueError(
                "No JSON data received."
            )

        # Input data
        x_feed = validate_composition(
            data["x_feed"],
            "Feed"
        )

        y_solvent = validate_composition(
            data["y_solvent"],
            "Solvent"
        )

        X_P1, X_P2, X_PP = validate_binodal_data(data)

        f = float(data["f"])

        # Operating parameters
        nu_const = bool(data.get("nu_const", True))
        S_const = bool(data.get("S_const", False))

        xR_limit = data.get("xR_limit")
        yield_limit = data.get("yield_limit")

        if xR_limit is not None:
            xR_limit = float(xR_limit)

        if yield_limit is not None:
            yield_limit = float(yield_limit)

        max_stages = int(data.get("max_stages", 100))
        feed = float(data.get("feed", 1.0))

        # Validation
        if not np.isfinite(f) or f < 0:
            raise ValueError(
                "The factor f must be non-negative."
            )

        if nu_const == S_const:
            raise ValueError(
                "Please select exactly one operating mode."
            )

        if max_stages < 1:
            raise ValueError(
                "The maximum number of stages must be at least 1."
            )

        if not np.isfinite(feed) or feed <= 0:
            raise ValueError(
                "The feed flow rate must be positive."
            )

        if xR_limit is not None:
            if not np.isfinite(xR_limit) or not 0 <= xR_limit <= 1:
                raise ValueError(
                    "The raffinate limit must be between 0 and 1."
                )

        if yield_limit is not None:
            if not np.isfinite(yield_limit) or not 0 <= yield_limit <= 100:
                raise ValueError(
                    "The yield limit must be between 0 and 100%."
                )

        if xR_limit is None and yield_limit is None:
            raise ValueError(
                "A calculation criterion must be specified."
            )

        # Cross-current extraction calculation
        result = calculate_cross_current(
            x_feed=x_feed,
            y_solvent=y_solvent,
            X_P1=X_P1,
            X_P2=X_P2,
            X_PP=X_PP,
            f=f,
            nu_const=nu_const,
            S_const=S_const,
            xR_limit=xR_limit,
            yield_limit=yield_limit,
            max_stages=max_stages,
            feed=feed,
        )

        # Return binodal data for plotting
        result["X_P1"] = X_P1
        result["X_P2"] = X_P2
        result["X_PP"] = X_PP

        result["x_feed"] = x_feed
        result["y_solvent"] = y_solvent

        return jsonify(convert_to_json(result))

    except FeedSolventLineError as error:

        return jsonify({
            "error": str(error),
            "plot_data": convert_to_json(error.plot_data)
        }), 400

    except (ValueError, KeyError, TypeError) as error:

        return jsonify({
            "error": str(error)
        }), 400

    except Exception:

        app.logger.exception(
            "Cross-current extraction failed."
        )

        return jsonify({
            "error": "An internal error occurred during the cross-current extraction calculation."
        }), 500


# =========================================================
# CALCULATE COUNTER-CURRENT EXTRACTION
# =========================================================

@app.route("/calculate-counter-current", methods=["POST"])
def calculate_counter_current_endpoint():

    try:

        data = request.get_json()

        if not data:
            raise ValueError(
                "No JSON data received."
            )

        # Input data
        x_feed = validate_composition(
            data["x_feed"],
            "Feed"
        )

        y_solvent = validate_composition(
            data["y_solvent"],
            "Solvent"
        )

        X_P1, X_P2, X_PP = validate_binodal_data(data)

        # Calculation criterion
        xR_limit = data.get("xR_limit")
        yield_limit = data.get("yield_limit")

        # Convert only values that are provided
        if xR_limit is not None:
            xR_limit = float(xR_limit)

        if yield_limit is not None:
            yield_limit = float(yield_limit)

        # Operating parameters
        f = float(data["f"])
        max_stages = int(data.get("max_stages", 100))

        # Exactly one calculation criterion must be specified
        if (xR_limit is None) == (yield_limit is None):
            raise ValueError(
                "Please specify either a raffinate limit "
                "or a minimum yield."
            )

        if xR_limit is not None:
            if not np.isfinite(xR_limit) or not 0 <= xR_limit <= 1:
                raise ValueError(
                    "The raffinate limit must be between 0 and 1."
                )

        if yield_limit is not None:
            if not np.isfinite(yield_limit) or not 0 <= yield_limit <= 100:
                raise ValueError(
                    "The minimum yield must be between 0 and 100%."
                )

        if not np.isfinite(f) or f < 1:
            raise ValueError(
                "The factor f must be at least 1."
            )

        if max_stages < 1:
            raise ValueError(
                "The maximum number of stages must be at least 1."
            )

        # Counter-current extraction calculation
        result = calculate_counter_current(
            x_feed=x_feed,
            y_solvent=y_solvent,
            xR_limit=xR_limit,
            yield_limit=yield_limit,
            X_P1=X_P1,
            X_P2=X_P2,
            X_PP=X_PP,
            f=f,
            max_stages=max_stages,
        )

        # Return data for plotting
        result["X_P1"] = X_P1
        result["X_P2"] = X_P2
        result["X_PP"] = X_PP

        result["x_feed"] = x_feed
        result["y_solvent"] = y_solvent

        return jsonify(convert_to_json(result))

    except FeedSolventLineError as error:

        return jsonify({
            "error": str(error),
            "plot_data": convert_to_json(error.plot_data)
        }), 400

    except (ValueError, KeyError, TypeError) as error:

        return jsonify({
            "error": str(error)
        }), 400

    except Exception:

        app.logger.exception(
            "Counter-current extraction failed."
        )

        return jsonify({
            "error": "An internal error occurred during the counter-current extraction calculation."
        }), 500





@app.route("/export-results", methods=["POST"])
def export_results():

    try:
        data = request.get_json()

        if not data:
            return jsonify({"error": "No export data received."}), 400

        lle_data = data.get("lle")
        extraction_data = data.get("extraction")
        inputs = data.get("inputs", {})
        history = data.get("calculationHistory", [])

        if not lle_data or not extraction_data:
            return jsonify({
                "error": "Both LLE and extraction results are required."
            }), 400

        workbook = Workbook()

        # -------------------------------------------------
        # General formatting
        # -------------------------------------------------

        title_fill = PatternFill(
            fill_type="solid",
            fgColor="17365D"
        )

        header_fill = PatternFill(
            fill_type="solid",
            fgColor="1F4E78"
        )

        lle_fill = PatternFill(
            fill_type="solid",
            fgColor="D9EAF7"
        )

        extraction_fill = PatternFill(
            fill_type="solid",
            fgColor="E2F0D9"
        )

        input_fill = PatternFill(
            fill_type="solid",
            fgColor="FFF2CC"
        )

        white_font = Font(
            bold=True,
            color="FFFFFF"
        )

        bold_font = Font(bold=True)

        section_font = Font(
            bold=True,
            color="17365D",
            size=12
        )

        thin_border = Border(
            bottom=Side(
                style="thin",
                color="D9E2F3"
            )
        )

        # -------------------------------------------------
        # Helper functions
        # -------------------------------------------------

        def excel_value(value):

            if isinstance(value, (dict, list, tuple)):
                return json.dumps(
                    value,
                    ensure_ascii=False
                )

            return value

        def style_header(worksheet, row_number):

            for cell in worksheet[row_number]:
                cell.font = white_font
                cell.fill = header_fill
                cell.alignment = Alignment(
                    horizontal="center",
                    vertical="center"
                )

            worksheet.row_dimensions[row_number].height = 24

        def style_data_rows(worksheet):

            for row in worksheet.iter_rows():

                for cell in row:
                    cell.border = thin_border
                    cell.alignment = Alignment(
                        vertical="center"
                    )

        def auto_adjust_columns(worksheet):

            for column_index, column_cells in enumerate(
                worksheet.iter_cols(),
                start=1
            ):

                max_length = 0
                column_letter = get_column_letter(column_index)

                for cell in column_cells:

                    # Skip merged cells.
                    if isinstance(cell, MergedCell):
                        continue

                    if cell.value is not None:
                        max_length = max(
                            max_length,
                            len(str(cell.value))
                        )

                worksheet.column_dimensions[column_letter].width = min(
                    max_length + 3,
                    45
                )

        # -------------------------------------------------
        # Worksheet 1: LLE Results
        # -------------------------------------------------

        ws_lle = workbook.active
        ws_lle.title = "LLE_Extraction_results"

        ws_lle["A1"] = "LIQUID-LIQUID EQUILIBRIUM RESULTS"
        ws_lle.merge_cells("A1:F1")

        ws_lle["A1"].font = Font(
            bold=True,
            color="FFFFFF",
            size=14
        )

        ws_lle["A1"].fill = title_fill
        ws_lle["A1"].alignment = Alignment(
            horizontal="center"
        )

        # General LLE information

        ws_lle.append(["Mixture", inputs.get("mixture", "")])
        ws_lle.append(["Temperature", inputs.get("temperature", "")])

        ws_lle.append(["", ""])

        # Plait point information

        ws_lle["A5"] = "PLAIT POINT"
        ws_lle.merge_cells("A5:B5")
        ws_lle["A5"].font = section_font

        ws_lle.append([
            "Component",
            "Composition"
        ])

        plait_point = lle_data.get("X_PP", [])

        for index in range(3):

            value = (
                plait_point[index]
                if isinstance(plait_point, (list, tuple))
                and len(plait_point) > index
                else None
            )

            ws_lle.append([
                f"Component {index + 1}",
                excel_value(value)
            ])

        # Binodal data

        ws_lle["A10"] = "BINODAL CURVE"
        ws_lle.merge_cells("A10:F10")
        ws_lle["A10"].font = section_font

        ws_lle["A11"] = "X_P1"
        ws_lle.merge_cells("A11:C11")

        ws_lle["D11"] = "X_P2"
        ws_lle.merge_cells("D11:F11")

        for cell in ["A11", "D11"]:
            ws_lle[cell].font = white_font
            ws_lle[cell].fill = header_fill
            ws_lle[cell].alignment = Alignment(
                horizontal="center"
            )

        ws_lle.append([
            "Component 1",
            "Component 2",
            "Component 3",
            "Component 1",
            "Component 2",
            "Component 3"
        ])

        style_header(ws_lle, 12)

        x_p1 = lle_data.get("X_P1", [])
        x_p2 = lle_data.get("X_P2", [])

        if not isinstance(x_p1, list):
            x_p1 = []

        if not isinstance(x_p2, list):
            x_p2 = []

        # Write both binodal branches side by side.

        number_of_rows = max(
            len(x_p1),
            len(x_p2)
        )

        for index in range(number_of_rows):

            point_p1 = (
                x_p1[index]
                if index < len(x_p1)
                else []
            )

            point_p2 = (
                x_p2[index]
                if index < len(x_p2)
                else []
            )

            if not isinstance(point_p1, (list, tuple)):
                point_p1 = []

            if not isinstance(point_p2, (list, tuple)):
                point_p2 = []

            row = []

            for component in range(3):

                row.append(
                    excel_value(point_p1[component])
                    if len(point_p1) > component
                    else None
                )

            for component in range(3):

                row.append(
                    excel_value(point_p2[component])
                    if len(point_p2) > component
                    else None
                )

            ws_lle.append(row)

        # Additional LLE data

        ws_lle.append(["", ""])
        extra_start = ws_lle.max_row + 1

        ws_lle.cell(
            row=extra_start,
            column=1,
            value="ADDITIONAL LLE DATA"
        )

        ws_lle.merge_cells(
            start_row=extra_start,
            start_column=1,
            end_row=extra_start,
            end_column=2
        )

        ws_lle.cell(
            row=extra_start,
            column=1
        ).font = section_font

        excluded_keys = {
            "X_P1",
            "X_P2",
            "X_PP"
        }

        for key, value in lle_data.items():

            if key in excluded_keys:
                continue

            ws_lle.append([
                key,
                excel_value(value)
            ])

        ws_lle.freeze_panes = "A13"

        # -------------------------------------------------
        # Worksheet 2: Extraction Results
        # -------------------------------------------------

        ws_extraction = workbook.create_sheet(
            "Extraction Results"
        )

        ws_extraction["A1"] = "EXTRACTION RESULTS"
        ws_extraction.merge_cells("A1:B1")

        ws_extraction["A1"].font = Font(
            bold=True,
            color="FFFFFF",
            size=14
        )

        ws_extraction["A1"].fill = title_fill
        ws_extraction["A1"].alignment = Alignment(
            horizontal="center"
        )

        # Input parameters

        ws_extraction["A3"] = "INPUT PARAMETERS"
        ws_extraction.merge_cells("A3:B3")
        ws_extraction["A3"].font = section_font

        ws_extraction.append([
            "Parameter",
            "Value"
        ])

        style_header(ws_extraction, 4)

        input_start = 5

        for key, value in inputs.items():

            ws_extraction.append([
                key,
                excel_value(value)
            ])

        input_end = ws_extraction.max_row

        # Extraction results

        extraction_section_row = input_end + 2

        ws_extraction.cell(
            row=extraction_section_row,
            column=1,
            value="CALCULATED EXTRACTION RESULTS"
        )

        ws_extraction.merge_cells(
            start_row=extraction_section_row,
            start_column=1,
            end_row=extraction_section_row,
            end_column=2
        )

        ws_extraction.cell(
            row=extraction_section_row,
            column=1
        ).font = section_font

        extraction_header_row = extraction_section_row + 1

        ws_extraction.cell(
            row=extraction_header_row,
            column=1,
            value="Parameter"
        )

        ws_extraction.cell(
            row=extraction_header_row,
            column=2,
            value="Value"
        )

        style_header(
            ws_extraction,
            extraction_header_row
        )

        for key, value in extraction_data.items():

            ws_extraction.append([
                key,
                excel_value(value)
            ])

        ws_extraction.freeze_panes = "A5"

        # -------------------------------------------------
        # Worksheet 3: Calculation History
        # -------------------------------------------------

        ws_history = workbook.create_sheet(
            "Calculation History"
        )

        ws_history["A1"] = "CALCULATION HISTORY"

        if history:

            headers = list(history[0].keys())

            ws_history.append(headers)

            style_header(ws_history, 2)

            for result in history:

                ws_history.append([
                    excel_value(result.get(header))
                    for header in headers
                ])

            ws_history.freeze_panes = "A3"

        else:

            ws_history.append([
                "No calculation history available."
            ])

        # -------------------------------------------------
        # Apply worksheet formatting
        # -------------------------------------------------

        for worksheet in workbook.worksheets:

            style_data_rows(worksheet)
            auto_adjust_columns(worksheet)

            worksheet.sheet_view.showGridLines = False

        # Restore title and section styling after general formatting.

        for worksheet in workbook.worksheets:

            for row in worksheet.iter_rows():

                for cell in row:

                    if cell.value and isinstance(cell.value, str):

                        if cell.value in [
                            "PLAIT POINT",
                            "BINODAL CURVE",
                            "ADDITIONAL LLE DATA",
                            "INPUT PARAMETERS",
                            "CALCULATED EXTRACTION RESULTS"
                        ]:
                            cell.font = section_font

        # Highlight LLE binodal group headers.

        for cell in ws_lle[11]:
            if cell.value is not None:
                cell.fill = header_fill
                cell.font = white_font

        # Highlight extraction input parameters.

        for row in range(input_start, input_end + 1):

            for cell in ws_extraction[row]:
                cell.fill = input_fill

        # -------------------------------------------------
        # Create Excel file in memory
        # -------------------------------------------------

        output = BytesIO()

        workbook.save(output)

        output.seek(0)

        return send_file(
            output,
            as_attachment=True,
            download_name="LLE_Results.xlsx",
            mimetype=(
                "application/vnd.openxmlformats-officedocument."
                "spreadsheetml.sheet"
            )
        )

    except Exception as error:

        print("Excel export error:", error)

        return jsonify({
            "error": str(error)
        }), 500

# =========================================================
# START FLASK
# =========================================================

import os

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))

    app.run(
        host="127.0.0.1",
        port=port,
        debug=False,
        use_reloader=False
    )