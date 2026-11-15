"""Tests for provjup/api/files.py: request parsing for the write route."""

from __future__ import annotations

import json

import pytest

from provjup.api.files import parse_write
from provjup.fs.paths import Rejected


def test_parses_a_valid_write_request() -> None:
    body = json.dumps({"dir": "hw1", "file": "f.slog.meta", "data": "é"}).encode()
    assert parse_write(body) == ("hw1", "f.slog.meta", "é".encode())


@pytest.mark.parametrize(
    "body",
    [
        b"not json",
        b"[]",
        json.dumps({"dir": "hw1", "file": "f.slog.meta"}).encode(),
        json.dumps({"dir": "hw1", "file": 3, "data": "x"}).encode(),
    ],
)
def test_rejects_malformed_write_requests(body: bytes) -> None:
    assert isinstance(parse_write(body), Rejected)
