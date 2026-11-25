
from flask import Flask, render_template, request, jsonify

from mccabe_calculation.vle import calculate_vle
from mccabe_calculation.parameters import PARAMETERS
from mccabe_calculation.stages import calculate_stages

from io import BytesIO
from datetime import datetime
from flask import send_file
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment

import json

app = Flask(__name__)


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/available-pressures/<mixture>")
def available_pressures(mixture):
    mixture = mixture.strip().lower()

    if mixture not in PARAMETERS:
        return jsonify({"error": "Unknown mixture."}), 404

    return jsonify({"pressures": sorted(PARAMETERS[mixture].keys())})


@app.route("/calculate-vle", methods=["POST"])
def calculate_vle_route():
    try:
        data = request.get_json(silent=True)
        if not data:
            return jsonify({"error": "No calculation data received."}), 400

        mixture = data.get("mixture", "ethanol-water")
        if not isinstance(mixture, str):
            return jsonify({"error": "Invalid mixture name."}), 400

        pressure = float(data.get("pressure", 1.013))
        return jsonify(calculate_vle(mixture, pressure))

    except (ValueError, TypeError, ArithmeticError) as error:
        return jsonify({"error": str(error)}), 400
    except Exception:
        app.logger.exception("Unexpected VLE calculation error.")
        return jsonify({"error": "Unexpected error during VLE calculation."}), 500


@app.route("/calculate-stages", methods=["POST"])
def calculate_stages_route():
    try:
        data = request.get_json(silent=True)
        if not data:
            return jsonify({"error": "No calculation data received."}), 400

        vle_data = data.get("vle_data")
        if not vle_data:
            return jsonify({"error": "Please calculate VLE first."}), 400

        result = calculate_stages(
            vle_data=vle_data,
            feed=data.get("feed"),
            distillate=data.get("distillate"),
            bottom=data.get("bottom"),
            reflux_factor=data.get("reflux"),
            q=data.get("q")
        )
        return jsonify(result)

    except (ValueError, TypeError, ArithmeticError) as error:
        return jsonify({"error": str(error)}), 400
    except Exception:
        app.logger.exception("Unexpected stage calculation error.")
        return jsonify({"error": "Unexpected error during stage calculation."}), 500


@app.route("/export-results", methods=["POST"])
def export_results():
    try:
        data = request.get_json(silent=True)

        if not data:
            return jsonify({"error": "No export data received."}), 400

        vle_data = data.get("vle_data")
        stage_data = data.get("stage_data")
        calculation_history = data.get("calculation_history", [])

        if not vle_data:
            return jsonify({"error": "Please calculate VLE first."}), 400

        if not stage_data:
            return jsonify({
                "error": "Please calculate Stage Construction first."
            }), 400

        workbook = Workbook()

        # --------------------------------------------------
        # GENERAL EXCEL FORMATTING
        # --------------------------------------------------

        header_fill = PatternFill(
            "solid",
            fgColor="244A64"
        )

        header_font = Font(
            bold=True,
            color="FFFFFF"
        )

        def format_sheet(sheet):
            sheet.freeze_panes = "A2"
            sheet.auto_filter.ref = sheet.dimensions

            for cell in sheet[1]:
                cell.fill = header_fill
                cell.font = header_font
                cell.alignment = Alignment(
                    horizontal="center"
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

        def json_value(value):
            return json.dumps(
                value,
                ensure_ascii=False,
                default=str
            )

        # --------------------------------------------------
        # SHEET 1: VLE DATA
        # --------------------------------------------------

        # VLE Data
        vle_sheet = workbook.active
        vle_sheet.title = "VLE Data"

        vle_sheet.append([
            "Mixture",
            "Pressure / bar",
            "Liquid composition x",
            "Vapour composition y",
            "Temperature / K"
        ])

        mixture = vle_data.get("mixture", "")
        pressure = vle_data.get("pressure", "")

        for x, y, temperature in zip(
            vle_data.get("x", []),
            vle_data.get("y", []),
            vle_data.get("temperature", [])
        ):
            vle_sheet.append([
                mixture,
                pressure,
                x,
                y,
                temperature
            ])

        # --------------------------------------------------
        # SHEET 2: LLE DATA
        # --------------------------------------------------

        lle_sheet = workbook.create_sheet("LLE Data")

        lle_sheet.append([
            "Parameter",
            "Value"
        ])

        lle_data = vle_data.get("lle")

        if lle_data is not None:

            if isinstance(lle_data, dict):

                for key, value in lle_data.items():

                    if isinstance(value, (dict, list, tuple)):
                        value = json_value(value)

                    lle_sheet.append([
                        key,
                        value
                    ])

            elif isinstance(lle_data, (list, tuple)):

                lle_sheet.append([
                    "LLE data",
                    json_value(lle_data)
                ])

            else:

                lle_sheet.append([
                    "LLE data",
                    str(lle_data)
                ])

        else:

            lle_sheet.append([
                "LLE data",
                "No LLE data available"
            ])

        format_sheet(lle_sheet)

        # --------------------------------------------------
        # SHEET 3: VLLE DATA
        # --------------------------------------------------

        vlle_sheet = workbook.create_sheet("VLLE Data")

        vlle_sheet.append([
            "Parameter",
            "Value"
        ])

        vlle_data = vle_data.get("vlle")

        if vlle_data is not None:

            for key, value in vlle_data.items():

                if isinstance(value, (dict, list, tuple)):
                    value = json_value(value)

                vlle_sheet.append([
                    key,
                    value
                ])

        else:

            vlle_sheet.append([
                "VLLE data",
                "No VLLE data available"
            ])

        format_sheet(vlle_sheet)

        # --------------------------------------------------
        # SHEET 2: STAGE CONSTRUCTION
        # --------------------------------------------------

        # Stage Construction
        stage_sheet = workbook.create_sheet("Stage Construction")

        stage_sheet.append([
            "Mixture",
            "Pressure / bar",
            "Equilibrium stage x",
            "Equilibrium stage y",
            "Equilibrium stage temperature / K"
        ])

        mixture = vle_data.get("mixture", "")
        pressure = vle_data.get("pressure", "")

        for x, y, temperature in zip(
            stage_data.get("equilibrium_stage_x", []),
            stage_data.get("equilibrium_stage_y", []),
            stage_data.get("equilibrium_stage_temperature", [])
        ):
            stage_sheet.append([
                mixture,
                pressure,
                x,
                y,
                temperature
            ])

        # --------------------------------------------------
        # SHEET 3: STAGE DETAILS
        # Stores all other returned stage calculation data
        # --------------------------------------------------

        details_sheet = workbook.create_sheet(
            "Stage Details"
        )

        details_sheet.append([
            "Parameter",
            "Value"
        ])

        for key, value in stage_data.items():

            if key in (
                "equilibrium_stage_x",
                "equilibrium_stage_y",
                "equilibrium_stage_temperature"
            ):
                continue

            # Rename terminology for Excel export only.
            excel_labels = {
                "rectifying_line": "enriching_line",
                "rectifying_stages": "enriching_stages",
            }

            excel_key = excel_labels.get(key, key)

            if isinstance(value, (dict, list, tuple)):
                value = json_value(value)

            details_sheet.append([
                excel_key,
                value
            ])

        format_sheet(details_sheet)

        # --------------------------------------------------
        # SHEET 4: CALCULATION HISTORY
        # --------------------------------------------------

        history_sheet = workbook.create_sheet(
            "Calculation History"
        )

        history_columns = [
            "Mixture",
            "Pressure / bar",
            "Feed zF",
            "Distillate xD",
            "Bottom xB",
            "Reflux",
            "q",
            "Enriching stages",
            "Stripping stages",
            "Total stages",
            "Minimum reflux",
            "Actual reflux",
            "Relative volatility"
        ]

        history_sheet.append(history_columns)

        for result in calculation_history:

            history_sheet.append([
                result.get("mixture"),
                result.get("pressure"),
                result.get("feed"),
                result.get("distillate"),
                result.get("bottom"),
                result.get("reflux"),
                result.get("q"),
                result.get("enrichingStages"),
                result.get("strippingStages"),
                result.get("totalStages"),
                result.get("minimumReflux"),
                result.get("actualReflux"),
                result.get("relativeVolatility")
            ])

        format_sheet(history_sheet)

        # --------------------------------------------------
        # EXPORT FILE
        # --------------------------------------------------

        output = BytesIO()
        workbook.save(output)
        output.seek(0)

        filename = (
            "Rectification_Results_"
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

    except Exception:
        app.logger.exception("Excel export failed.")
        return jsonify({
            "error": "Excel export failed."
        }), 500
import os

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))

    app.run(
        host="127.0.0.1",
        port=port,
        debug=False,
        use_reloader=False
    )