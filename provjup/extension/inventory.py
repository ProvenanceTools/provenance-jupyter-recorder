"""Lists the installed extensions, as raw facts for the frontend's `ext.snapshot`.

Two kinds, because a JupyterLab tool such as jupyter-ai ships both:

- labextensions: the prebuilt frontend packages in the `labextensions` data directories, by
  npm name, with the version from each one's `package.json`. JupyterLab reads the same
  directories, in the same order, and the first copy of a name wins (`jupyterlab_server`'s
  `get_federated_extensions`).
- server extensions: the Python packages Jupyter Server knows about, with their version and
  whether they are enabled.

The browser knows which labextensions it loaded and which are disabled, but not their
versions, so it joins its own list with this one. Nothing here builds a log entry.
"""

from __future__ import annotations

import json
from collections.abc import Iterable, Mapping
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Protocol


@dataclass(frozen=True)
class LabExtension:
    name: str
    version: str


@dataclass(frozen=True)
class ServerExtension:
    name: str
    version: str
    enabled: bool


def _package_dirs(root: Path) -> Iterable[Path]:
    """Top-level packages, and scoped ones two deep (`@org/name`), in a stable order."""
    if not root.is_dir():
        return
    for entry in sorted(root.iterdir()):
        if entry.name.startswith("@") and entry.is_dir():
            yield from sorted(child for child in entry.iterdir() if child.is_dir())
        elif entry.is_dir():
            yield entry


def _read_package(directory: Path) -> LabExtension | None:
    try:
        data: Any = json.loads((directory / "package.json").read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    if not isinstance(data, dict) or not isinstance(data.get("name"), str):
        return None
    version = data.get("version")
    return LabExtension(data["name"], version if isinstance(version, str) else "unknown")


def lab_extensions(paths: Iterable[Path]) -> list[LabExtension]:
    """Installed labextensions, the first copy of each name winning, as JupyterLab does."""
    found: dict[str, LabExtension] = {}
    for root in paths:
        for directory in _package_dirs(root):
            package = _read_package(directory)
            if package is not None and package.name not in found:
                found[package.name] = package
    return sorted(found.values(), key=lambda p: p.name)


class ExtensionPackageLike(Protocol):
    @property
    def version(self) -> str: ...
    @property
    def enabled(self) -> bool: ...


def server_extensions(packages: Mapping[str, ExtensionPackageLike]) -> list[ServerExtension]:
    """Jupyter Server's extension packages (`ExtensionManager.extensions`), by name."""
    return [
        ServerExtension(name, packages[name].version or "unknown", bool(packages[name].enabled))
        for name in sorted(packages)
    ]
