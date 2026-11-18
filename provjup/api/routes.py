"""Registers the server extension's routes under `<base_url>/provjup/`."""

from __future__ import annotations

import getpass
import json
import platform
import socket
from collections.abc import Callable
from pathlib import Path
from typing import Any

import tornado.web
from jupyter_server.base.handlers import APIHandler
from jupyter_server.utils import url_path_join

from ..extension.inventory import LabExtension, ServerExtension
from .extension import ExtensionsHandler
from .files import FileWriteHandler, ManifestsHandler
from .log import LogAppendHandler

Inventory = Callable[[], tuple[list[LabExtension], list[ServerExtension]]]


def host_facts() -> dict[str, str]:
    """Raw facts the frontend needs for `session.start.machine_id` and `platform`."""
    try:
        user = getpass.getuser()
    except (KeyError, OSError):
        user = "unknown"
    return {"hostname": socket.gethostname(), "username": user, "platform": platform.system()}


class HostHandler(APIHandler):
    # Recorder requests are not student activity, so they never keep an idle server alive.
    _track_activity = False

    @tornado.web.authenticated
    def get(self) -> None:
        self.finish(json.dumps(host_facts()))


def setup_handlers(web_app: Any, root_dir: str, inventory: Inventory) -> None:
    base = url_path_join(web_app.settings["base_url"], "provjup")
    root = {"root": Path(root_dir)}
    web_app.add_handlers(
        ".*$",
        [
            (url_path_join(base, "manifests"), ManifestsHandler, root),
            (url_path_join(base, "log", "append"), LogAppendHandler, root),
            (url_path_join(base, "files", "write"), FileWriteHandler, root),
            (url_path_join(base, "host"), HostHandler),
            (url_path_join(base, "extensions"), ExtensionsHandler, {"inventory": inventory}),
        ],
    )
