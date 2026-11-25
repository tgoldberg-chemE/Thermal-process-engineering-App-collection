
from flask import Flask, render_template, redirect, url_for, flash
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent

app = Flask(
    __name__,
    template_folder=str(BASE_DIR / "launcher_templates"),
    static_folder=str(BASE_DIR / "launcher_static")
)

app.secret_key = "separation-engineering-local"

APPLICATIONS = {
    "mccabe": {
        "name": "McCabe-Thiele App",
        "description": "Graphical distillation design",
        "folder": "McCabeThiele app",
        "icon": "chart",
        "color": "purple",
        "url": "/mccabe/"
    },

    "ponchon": {
        "name": "Ponchon-Savarit App",
        "description": "Enthalpy-based graphical distillation design",
        "folder": "PonchonSavarit app",
        "icon": "activity",
        "color": "green",
        "url": "/ponchon/"
    },

    "extraction": {
        "name": "Extraction App",
        "description": "Graphical liquid-liquid extraction design",
        "folder": "Extraction app",
        "icon": "droplets",
        "color": "cyan",
        "url": "/extraction/"
    }
}


@app.route("/")
def index():
    return render_template(
        "index.html",
        applications=APPLICATIONS
    )


@app.route("/launch/<app_id>")
def launch(app_id):
    if app_id not in APPLICATIONS:
        flash("Application not found.", "error")
        return redirect(url_for("index"))

    return redirect(APPLICATIONS[app_id]["url"])


@app.route("/back/<app_id>")
def back_to_launcher(app_id):
    return redirect(url_for("index"))
