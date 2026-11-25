import sys
import importlib.util
from pathlib import Path

from werkzeug.middleware.dispatcher import DispatcherMiddleware
from werkzeug.wrappers import Response

ROOT = Path(__file__).resolve().parent


def load_app(module_name, folder_name):
    app_folder = ROOT / folder_name

    sys.path.insert(0, str(app_folder))

    app_file = app_folder / "app.py"

    spec = importlib.util.spec_from_file_location(
        module_name,
        app_file
    )

    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module
    spec.loader.exec_module(module)

    return module.app


# Die drei Flask-Anwendungen laden
mccabe_app = load_app(
    "mccabe_app",
    "McCabeThiele app"
)

ponchon_app = load_app(
    "ponchon_app",
    "PonchonSavarit app"
)

extraction_app = load_app(
    "extraction_app",
    "Extraction app"
)


# Launcher laden
sys.path.insert(0, str(ROOT))

from launcher import app as launcher_app


# Alle Anwendungen unter einer Domain zusammenführen
application = DispatcherMiddleware(
    launcher_app,
    {
        "/mccabe": mccabe_app,
        "/ponchon": ponchon_app,
        "/extraction": extraction_app,
    }
)