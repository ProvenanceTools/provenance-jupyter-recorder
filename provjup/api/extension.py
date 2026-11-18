"""Extension hash and installed-extension inventory endpoints.

- GET /provjup/extensions: the installed labextensions and server extensions.
  Response: 200 {"lab": [{"name", "version"}], "server": [{"name", "version", "enabled"}]}

The extension hash endpoint comes with the rolling seal (task 7.4).
"""

from __future__ import annotations

import json
from collections.abc import Callable
from dataclasses import asdict
from typing import Any

import tornado.web
from jupyter_server.base.handlers import APIHandler

from ..extension.inventory import LabExtension, ServerExtension


class ExtensionsHandler(APIHandler):
    # Recorder requests are not student activity, so they never keep an idle server alive.
    _track_activity = False

    def initialize(
        self, inventory: Callable[[], tuple[list[LabExtension], list[ServerExtension]]]
    ) -> None:
        self.inventory = inventory

    @tornado.web.authenticated
    def get(self) -> None:
        lab, server = self.inventory()
        body: dict[str, Any] = {
            "lab": [asdict(e) for e in lab],
            "server": [asdict(e) for e in server],
        }
        self.finish(json.dumps(body))
