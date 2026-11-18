"""Jupyter entry points for provjup.

`_jupyter_labextension_paths` tells JupyterLab where the prebuilt frontend lives, and
`_jupyter_server_extension_points` registers the server extension. The server extension
moves bytes only; see `provjup/api/routes.py` for its routes.
"""

from __future__ import annotations

from typing import Any

__all__ = ["__version__"]

__version__ = "0.0.0"


def _jupyter_labextension_paths() -> list[dict[str, str]]:
    return [{"src": "labextension", "dest": "provjup"}]


def _jupyter_server_extension_points() -> list[dict[str, str]]:
    return [{"module": "provjup"}]


def _load_jupyter_server_extension(server_app: Any) -> None:
    from pathlib import Path

    from jupyter_core.paths import jupyter_path

    from .api.routes import setup_handlers
    from .extension.inventory import (
        LabExtension,
        ServerExtension,
        lab_extensions,
        server_extensions,
    )

    def inventory() -> tuple[list[LabExtension], list[ServerExtension]]:
        # The same directories JupyterLab loads labextensions from, by default.
        lab = lab_extensions(Path(p) for p in jupyter_path("labextensions"))
        return lab, server_extensions(server_app.extension_manager.extensions)

    setup_handlers(server_app.web_app, server_app.root_dir, inventory)
    server_app.log.info("provjup: server extension loaded")
