"""Tests for provjup/extension/inventory.py."""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

from provjup.extension.inventory import (
    LabExtension,
    ServerExtension,
    lab_extensions,
    server_extensions,
)


def _install(root: Path, name: str, package: object) -> None:
    directory = root.joinpath(*name.split("/"))
    directory.mkdir(parents=True)
    text = package if isinstance(package, str) else json.dumps(package)
    (directory / "package.json").write_text(text, encoding="utf-8")


def test_lists_top_level_and_scoped_labextensions_with_versions(tmp_path: Path) -> None:
    _install(tmp_path, "jupyterlab-git", {"name": "@jupyterlab/git", "version": "0.51.1"})
    _install(tmp_path, "@jupyter-ai/core", {"name": "@jupyter-ai/core", "version": "2.31.0"})
    assert lab_extensions([tmp_path]) == [
        LabExtension("@jupyter-ai/core", "2.31.0"),
        LabExtension("@jupyterlab/git", "0.51.1"),
    ]


def test_the_first_directory_wins_as_in_jupyterlab(tmp_path: Path) -> None:
    user, system = tmp_path / "user", tmp_path / "system"
    _install(user, "provjup", {"name": "provjup", "version": "0.2.0"})
    _install(system, "provjup", {"name": "provjup", "version": "0.1.0"})
    assert lab_extensions([user, system]) == [LabExtension("provjup", "0.2.0")]


def test_skips_what_is_not_a_package_and_keeps_a_missing_version(tmp_path: Path) -> None:
    _install(tmp_path, "broken", "{not json")
    _install(tmp_path, "nameless", {"version": "1.0.0"})
    _install(tmp_path, "unversioned", {"name": "unversioned"})
    (tmp_path / "empty").mkdir()
    (tmp_path / "stray-file.txt").write_text("x", encoding="utf-8")
    assert lab_extensions([tmp_path, tmp_path / "missing"]) == [
        LabExtension("unversioned", "unknown")
    ]


@dataclass
class _Package:
    version: str
    enabled: bool


def test_lists_server_extensions_by_name_with_version_and_enabled() -> None:
    packages = {
        "provjup": _Package("0.0.0", True),
        "jupyter_ai": _Package("2.31.0", False),
        "no_version": _Package("", True),
    }
    assert server_extensions(packages) == [
        ServerExtension("jupyter_ai", "2.31.0", False),
        ServerExtension("no_version", "unknown", True),
        ServerExtension("provjup", "0.0.0", True),
    ]
