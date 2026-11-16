"""File endpoints.

- GET /provjup/manifests: the raw text of every manifest under the server root.
- POST /provjup/files/write: replace a provenance file atomically.
  Request body: {"dir": str, "file": str, "data": str}
  Responses: 200 {"size": n}; 400 {"error": reason} for a refused path or a malformed request;
  500 {"error": reason} when the disk write fails.
"""

from __future__ import annotations

import asyncio
import json
from dataclasses import asdict
from pathlib import Path
from typing import Any

import tornado.web
from jupyter_server.base.handlers import APIHandler

from ..fs.atomic_write import atomic_write
from ..fs.paths import Rejected
from ..fs.walk import find_manifests


class ManifestsHandler(APIHandler):
    def initialize(self, root: Path) -> None:
        self.root = root

    @tornado.web.authenticated
    def get(self) -> None:
        manifests = [asdict(manifest) for manifest in find_manifests(self.root)]
        self.finish(json.dumps({"manifests": manifests}))


def parse_write(body: bytes) -> tuple[str, str, bytes] | Rejected:
    """Validate the request body. Pure, so it is tested without a server."""
    try:
        raw: Any = json.loads(body)
    except ValueError:
        return Rejected("body must be JSON")
    if not isinstance(raw, dict):
        return Rejected("body must be a JSON object")
    folder, name, data = raw.get("dir"), raw.get("file"), raw.get("data")
    if not (isinstance(folder, str) and isinstance(name, str) and isinstance(data, str)):
        return Rejected("dir, file and data must be strings")
    return folder, name, data.encode("utf-8")


class FileWriteHandler(APIHandler):
    def initialize(self, root: Path) -> None:
        self.root = root

    @tornado.web.authenticated
    async def post(self) -> None:
        request = parse_write(self.request.body)
        if isinstance(request, Rejected):
            self.set_status(400)
            self.finish(json.dumps({"error": request.reason}))
            return
        # fsync can be slow on network storage, so it runs off the event loop.
        loop = asyncio.get_running_loop()
        try:
            result = await loop.run_in_executor(None, atomic_write, self.root, *request)
        except OSError as error:
            self.set_status(500)
            self.finish(json.dumps({"error": f"write failed: {error.strerror or error}"}))
            return
        if isinstance(result, Rejected):
            self.set_status(400)
            self.finish(json.dumps({"error": result.reason}))
            return
        self.finish(json.dumps({"size": result.size}))
