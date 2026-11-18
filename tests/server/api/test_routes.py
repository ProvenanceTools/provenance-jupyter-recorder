"""Tests for provjup/api/routes.py."""

from __future__ import annotations

from typing import Any
from unittest.mock import MagicMock

import pytest
import tornado.web
from jupyter_server.base.handlers import APIHandler
from tornado.httputil import HTTPHeaders, HTTPServerRequest, RequestStartLine

from provjup.api.routes import host_facts, setup_handlers


def test_host_facts_are_non_empty_strings() -> None:
    facts = host_facts()
    assert set(facts) == {"hostname", "username", "platform"}
    assert all(isinstance(value, str) and value for value in facts.values())


class _FakeWebApp:
    def __init__(self) -> None:
        self.settings = {"base_url": "/"}
        self.routes: list[tuple[Any, ...]] = []

    def add_handlers(self, _host: str, routes: list[tuple[Any, ...]]) -> None:
        self.routes.extend(routes)


def _registered_routes() -> list[tuple[Any, ...]]:
    app = _FakeWebApp()
    setup_handlers(app, "/srv", lambda: ([], []))
    return app.routes


def _activity_after_request(handler_class: type[APIHandler], kwargs: dict[str, Any]) -> Any:
    """Runs Jupyter Server's own activity update for one authenticated request."""
    app = tornado.web.Application()
    start = RequestStartLine("POST", "/provjup/x", "HTTP/1.1")
    headers = HTTPHeaders({"Host": "localhost"})
    request = HTTPServerRequest(start_line=start, headers=headers, connection=MagicMock())
    handler = handler_class(app, request, **kwargs)
    handler._jupyter_current_user = "student"  # what @authenticated sets
    handler.update_api_activity()
    return app.settings.get("api_last_activity")


def test_an_ordinary_api_handler_counts_as_activity() -> None:
    # The control: without this, the next test would pass even if tracking never ran.
    assert _activity_after_request(APIHandler, {}) is not None


@pytest.mark.parametrize("route", _registered_routes(), ids=lambda route: route[1].__name__)
def test_no_provjup_request_counts_as_activity(route: tuple[Any, ...]) -> None:
    # Heartbeats from a hidden tab would otherwise keep an abandoned DataHub server
    # running until the hub's 8-hour limit instead of its 30-minute idle shutdown (#26).
    handler_class = route[1]
    kwargs = route[2] if len(route) > 2 else {}
    assert _activity_after_request(handler_class, kwargs) is None


def test_routes_are_found() -> None:
    # Guards the parametrized test above against passing on an empty list.
    assert len(_registered_routes()) >= 5
