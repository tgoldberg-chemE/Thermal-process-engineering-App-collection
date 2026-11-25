
from flask import (
    Flask,
    render_template,
    request,
    jsonify,
    send_file
)

from ponchon_calculation.vle import calculate_vle
from ponchon_calculation.parameters import PARAMETERS
from ponchon_calculation.stages import calculate_stages
from ponchon_calculation.enthalpy import calculate_enthalpy_diagram

from io import BytesIO
from datetime import datetime

from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment

import json
import math


app = Flask(__name__)


# ======================================================
# GENERAL HELPERS
# ======================================================

def is_finite_number(value):
    """Check whether a value is a finite number."""

    try:
        return math.isfinite(float(value))
    except (TypeError, ValueError):
        return False


def json_value(value):
    """Convert complex values into JSON strings for Excel."""

    return json.dumps(
        value,
        ensure_ascii=False,
        default=str
    )


def format_sheet(sheet):
    """Apply consistent formatting to an Excel worksheet."""

    sheet.freeze_panes = "A2"

    if sheet.max_row >= 1 and sheet.max_column >= 1:
        sheet.auto_filter.ref = sheet.dimensions

    header_fill = PatternFill(
        fill_type="solid",
        fgColor="244A64"
    )

    header_font = Font(
        bold=True,
        color="FFFFFF"
    )

    for cell in sheet[1]:

        cell.fill = header_fill
        cell.font = header_font

        cell.alignment = Alignment(
            horizontal="center",
            vertical="center",
            wrap_text=True
        )

    for row in sheet.iter_rows(min_row=2):

        for cell in row:
            cell.alignment = Alignment(
                vertical="center",
                wrap_text=True
            )

    for column in sheet.columns:

        max_length = 0

        column_letter = column[0].column_letter

        for cell in column:

            if cell.value is not None:

                max_length = max(
                    max_length,
                    len(str(cell.value))
                )

        sheet.column_dimensions[column_letter].width = min(
            max(max_length + 3, 12),
            40
        )


def add_key_value_sheet(workbook, title, data, empty_message):
    """
    Create an Excel worksheet for dictionary or list data.
    """

    sheet = workbook.create_sheet(title)

    sheet.append([
        "Parameter",
        "Value"
    ])

    if data is None:

        sheet.append([
            title,
            empty_message
        ])

    elif isinstance(data, dict):

        for key, value in data.items():

            if isinstance(value, (dict, list, tuple)):
                value = json_value(value)

            sheet.append([
                str(key),
                value
            ])

    elif isinstance(data, (list, tuple)):

        for index, value in enumerate(data):

            if isinstance(value, (dict, list, tuple)):
                value = json_value(value)

            sheet.append([
                str(index),
                value
            ])

    else:

        sheet.append([
            title,
            str(data)
        ])

    format_sheet(sheet)

    return sheet


# ======================================================
# INDEX
# ======================================================

@app.route("/")
def index():

    return render_template("index.html")


# ======================================================
# AVAILABLE PRESSURES
# ======================================================

@app.route("/available-pressures/<mixture>")
def available_pressures(mixture):

    mixture = mixture.strip().lower()

    if mixture not in PARAMETERS:

        return jsonify({
            "error": "Unknown mixture."
        }), 404

    return jsonify({
        "pressures": sorted(
            PARAMETERS[mixture].keys()
        )
    })


# ======================================================
# VLE CALCULATION
# ======================================================

@app.route("/calculate-vle", methods=["POST"])
def calculate_vle_route():

    try:

        data = request.get_json(silent=True)

        if not isinstance(data, dict):

            return jsonify({
                "error": "No valid calculation data received."
            }), 400

        mixture = data.get(
            "mixture",
            "ethanol-water"
        )

        if not isinstance(mixture, str) or not mixture.strip():

            return jsonify({
                "error": "Invalid mixture name."
            }), 400

        mixture = mixture.strip().lower()

        if mixture not in PARAMETERS:

            return jsonify({
                "error": "Unknown mixture."
            }), 400

        try:

            pressure = float(
                data.get("pressure", 1.013)
            )

        except (TypeError, ValueError):

            return jsonify({
                "error": "Pressure must be a valid number."
            }), 400

        if not math.isfinite(pressure) or pressure <= 0:

            return jsonify({
                "error": "Pressure must be positive."
            }), 400

        # Perform VLE calculation.
        result = calculate_vle(
            mixture,
            pressure
        )

        # Add mixture and pressure information.
        # These values are required by the Excel export.
        result["mixture"] = mixture
        result["pressure"] = pressure

        return jsonify(result)

    except (ValueError, TypeError, ArithmeticError) as error:

        return jsonify({
            "error": str(error)
        }), 400

    except Exception:

        app.logger.exception(
            "Unexpected VLE calculation error."
        )

        return jsonify({
            "error": "Unexpected error during VLE calculation."
        }), 500


# ======================================================
# ENTHALPY DIAGRAM
# ======================================================

@app.route("/calculate-enthalpy", methods=["POST"])
def calculate_enthalpy_route():

    try:

        data = request.get_json(silent=True)

        if not isinstance(data, dict):

            return jsonify({
                "error": "No valid calculation data received."
            }), 400

        vle_data = data.get("vle_data")

        if not isinstance(vle_data, dict) or not vle_data:

            return jsonify({
                "error": "Please calculate VLE first."
            }), 400

        result = calculate_enthalpy_diagram(
            vle_data
        )

        return jsonify(result)

    except (ValueError, TypeError, ArithmeticError) as error:

        return jsonify({
            "error": str(error)
        }), 400

    except Exception:

        app.logger.exception(
            "Enthalpy calculation failed."
        )

        return jsonify({
            "error": "Enthalpy calculation failed."
        }), 500


# ======================================================
# PONCHON-SAVARIT STAGE CALCULATION
# ======================================================

@app.route("/calculate-stages", methods=["POST"])
def calculate_stages_route():

    try:

        data = request.get_json(silent=True)

        if not isinstance(data, dict):

            return jsonify({
                "error": "No valid calculation data received."
            }), 400

        vle_data = data.get("vle_data")

        if not isinstance(vle_data, dict) or not vle_data:

            return jsonify({
                "error": "Please calculate VLE first."
            }), 400

        # --------------------------------------------------
        # READ NUMERICAL INPUTS
        # --------------------------------------------------

        try:

            feed = float(data.get("feed"))
            distillate = float(data.get("distillate"))
            bottom = float(data.get("bottom"))
            reflux = float(data.get("reflux"))

            q_input = data.get("q")

            if (
                not isinstance(q_input, (list, tuple))
                or len(q_input) != 3
            ):

                raise ValueError(
                    "The q parameter must contain exactly three values."
                )

            q = [
                float(value)
                for value in q_input
            ]

        except (TypeError, ValueError):

            return jsonify({
                "error": (
                    "Please provide valid numerical "
                    "stage parameters."
                )
            }), 400

        # --------------------------------------------------
        # CHECK FINITE VALUES
        # --------------------------------------------------

        numerical_values = [
            feed,
            distillate,
            bottom,
            reflux,
            *q
        ]

        if not all(
            math.isfinite(value)
            for value in numerical_values
        ):

            return jsonify({
                "error": (
                    "All calculation parameters "
                    "must be finite numbers."
                )
            }), 400

        # --------------------------------------------------
        # VALIDATE COMPOSITIONS
        # --------------------------------------------------

        if not (
            0 <= bottom < feed < distillate <= 1
        ):

            return jsonify({
                "error": (
                    "Compositions must satisfy "
                    "0 <= bottom < feed < distillate <= 1."
                )
            }), 400

        # --------------------------------------------------
        # VALIDATE REFLUX
        # --------------------------------------------------

        if reflux < 0:

            return jsonify({
                "error": (
                    "Reflux factor must be greater than "
                    "or equal to zero."
                )
            }), 400

        # --------------------------------------------------
        # PERFORM STAGE CALCULATION
        # --------------------------------------------------

        result = calculate_stages(
            vle_data=vle_data,
            feed=feed,
            distillate=distillate,
            bottom=bottom,
            reflux_factor=reflux,
            q=q
        )

        return jsonify(result)

    except (ValueError, TypeError, ArithmeticError) as error:

        return jsonify({
            "error": str(error)
        }), 400

    except Exception:

        app.logger.exception(
            "Unexpected stage calculation error."
        )

        return jsonify({
            "error": "Unexpected error during stage calculation."
        }), 500


# ======================================================
# EXPORT RESULTS TO EXCEL
# ======================================================

@app.route("/export-results", methods=["POST"])
def export_results():

    try:

        data = request.get_json(silent=True)

        if not isinstance(data, dict):

            return jsonify({
                "error": "No valid export data received."
            }), 400

        vle_data = data.get("vle_data")
        stage_data = data.get("stage_data")

        calculation_history = data.get(
            "calculation_history",
            []
        )

        # --------------------------------------------------
        # VALIDATE EXPORT DATA
        # --------------------------------------------------

        if not isinstance(vle_data, dict) or not vle_data:

            return jsonify({
                "error": "Please calculate VLE first."
            }), 400

        if not isinstance(stage_data, dict) or not stage_data:

            return jsonify({
                "error": (
                    "Please calculate Stage Construction first."
                )
            }), 400

        if not isinstance(calculation_history, list):

            return jsonify({
                "error": "Invalid calculation history."
            }), 400

        # --------------------------------------------------
        # CREATE WORKBOOK
        # --------------------------------------------------

        workbook = Workbook()

        # --------------------------------------------------
        # SHEET 1: VLE DATA
        # --------------------------------------------------

        vle_sheet = workbook.active

        vle_sheet.title = "VLE Data"

        vle_sheet.append([
            "Mixture",
            "Pressure / bar",
            "Liquid composition x",
            "Vapor composition y",
            "Temperature / K"
        ])

        mixture = vle_data.get(
            "mixture",
            ""
        )

        pressure = vle_data.get(
            "pressure",
            ""
        )

        x_values = vle_data.get("x", [])
        y_values = vle_data.get("y", [])
        temperatures = vle_data.get("temperature", [])

        if not (
            isinstance(x_values, list)
            and isinstance(y_values, list)
            and isinstance(temperatures, list)
        ):

            raise ValueError(
                "Invalid VLE arrays in export data."
            )

        if not (
            len(x_values)
            == len(y_values)
            == len(temperatures)
        ):

            raise ValueError(
                "VLE arrays must have equal lengths."
            )

        for x, y, temperature in zip(
            x_values,
            y_values,
            temperatures
        ):

            vle_sheet.append([
                mixture,
                pressure,
                x,
                y,
                temperature
            ])

        format_sheet(vle_sheet)

        # --------------------------------------------------
        # SHEET 3: LLE DATA
        # --------------------------------------------------

        add_key_value_sheet(
            workbook,
            "LLE Data",
            vle_data.get("lle"),
            "No LLE data available"
        )

        # --------------------------------------------------
        # SHEET 4: VLLE DATA
        # --------------------------------------------------

        add_key_value_sheet(
            workbook,
            "VLLE Data",
            vle_data.get("vlle"),
            "No VLLE data available"
        )

        # --------------------------------------------------
        # SHEET 5: AZEOTROPE DATA
        # --------------------------------------------------

        add_key_value_sheet(
            workbook,
            "Azeotrope Data",
            vle_data.get("azeotrope"),
            "No azeotrope data available"
        )

        # --------------------------------------------------
        # SHEET 7: STAGE DETAILS
        # --------------------------------------------------

        details_sheet = workbook.create_sheet(
            "Stage Details"
        )

        details_sheet.append([
            "Parameter",
            "Value"
        ])

        # Rename terminology for Excel export only.
        excel_labels = {
            "rectifying_line": "enriching_line",
            "rectifying_stages": "enriching_stages",
            "rectifying_stages_data": "enriching_stages_data",
            "relative_volatility": "relative_volatility_feed",
            "temperature_distillate_saturated": "temperature_distillate_boiling_liquid",
        }

        # Exclude redundant data from Excel export.
        excluded_keys = {
            "equilibrium_stage_x",
            "equilibrium_stage_y",
            "equilibrium_stage_temperature",

            "difference_points",
            "construction",
            "temperature_head_saturated",
            "x_head_saturated"

        }

        for key, value in stage_data.items():

            if key in excluded_keys:
                continue

            excel_key = excel_labels.get(
                key,
                key
            )

            if isinstance(value, (dict, list, tuple)):
                value = json_value(value)

            details_sheet.append([
                excel_key,
                value
            ])

        format_sheet(details_sheet)


        # --------------------------------------------------
        # SHEET 8: CALCULATION HISTORY
        # --------------------------------------------------

        history_sheet = workbook.create_sheet(
            "Calculation History"
        )

        history_sheet.append([
            "Mixture",
            "Pressure / bar",
            "Feed zF",
            "Distillate xD",
            "Bottom xB",
            "Reflux",

            "q B",
            "T B / K",

            "q F",
            "T F / K",

            "q D",
            "T D / K",

            "Enriching stages",
            "Stripping stages",
            "Total stages",

            "Minimum reflux",
            "Actual reflux",
            "Relative volatility"
        ])


        for result in calculation_history:

            if not isinstance(result, dict):
                continue

            history_sheet.append([

                result.get("mixture"),
                result.get("pressure"),
                result.get("feed"),
                result.get("distillate"),
                result.get("bottom"),
                result.get("reflux"),

                result.get("qA"),
                result.get("temperature_bottom"),

                result.get("qF"),
                result.get("temperature_feed"),

                result.get("qE"),
                result.get("temperature_distillate"),

                result.get("enrichingStages"),
                result.get("strippingStages"),
                result.get("totalStages"),

                result.get("minimumReflux"),
                result.get("actualReflux"),
                result.get("relativeVolatility")

            ])


        format_sheet(history_sheet)


        # --------------------------------------------------
        # FORMAT ALL WORKSHEETS
        # --------------------------------------------------

        for sheet in workbook.worksheets:

            if sheet.max_row > 0:
                format_sheet(sheet)

        # --------------------------------------------------
        # SAVE WORKBOOK TO MEMORY
        # --------------------------------------------------

        output = BytesIO()

        workbook.save(output)

        output.seek(0)

        filename = (
            "Ponchon_Savarit_Results_"
            + datetime.now().strftime("%Y%m%d_%H%M%S")
            + ".xlsx"
        )

        return send_file(
            output,
            as_attachment=True,
            download_name=filename,
            mimetype=(
                "application/vnd.openxmlformats-officedocument."
                "spreadsheetml.sheet"
            )
        )

    except (ValueError, TypeError, ArithmeticError) as error:

        app.logger.exception(
            "Excel export data error."
        )

        return jsonify({
            "error": str(error)
        }), 400

    except Exception:

        app.logger.exception(
            "Excel export failed."
        )

        return jsonify({
            "error": "Excel export failed."
        }), 500


# ======================================================
# START APPLICATION
# ======================================================

import os

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))

    app.run(
        host="127.0.0.1",
        port=port,
        debug=False,
        use_reloader=False
    )