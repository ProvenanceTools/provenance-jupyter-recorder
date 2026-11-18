"""Tests for provjup/api/extension.py: the inventory endpoint's response."""

from __future__ import annotations

import json
from typing import Any
from unittest.mock import MagicMock

import tornado.web
from tornado.httputil import HTTPHeaders, HTTPServerRequest, RequestStartLine

from provjup.api.extension import ExtensionsHandler
from provjup.extension.inventory import LabExtension, ServerExtension


def test_returns_both_kinds_of_extension_as_json() -> None:
    inventory = (
        [LabExtension("@jupyter-ai/core", "2.31.0")],
        [ServerExtension("jupyter_ai", "2.31.0", True)],
    )
    start = RequestStartLine("GET", "/provjup/extensions", "HTTP/1.1")
    headers = HTTPHeaders({"Host": "localhost"})
    request = HTTPServerRequest(start_line=start, headers=headers, connection=MagicMock())
    handler = ExtensionsHandler(tornado.web.Application(), request, inventory=lambda: inventory)
    written: list[Any] = []
    handler.finish = lambda chunk=None, **_: written.append(chunk)  # type: ignore[method-assign]

    ExtensionsHandler.get.__wrapped__(handler)  # type: ignore[attr-defined]

    assert json.loads(written[0]) == {
        "lab": [{"name": "@jupyter-ai/core", "version": "2.31.0"}],
        "server": [{"name": "jupyter_ai", "version": "2.31.0", "enabled": True}],
    }
