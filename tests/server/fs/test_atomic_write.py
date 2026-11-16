"""Tests for provjup/fs/atomic_write.py."""

from __future__ import annotations

import os
from pathlib import Path

import pytest

import provjup.fs.atomic_write as atomic
from provjup.fs.atomic_write import Written, atomic_write
from provjup.fs.paths import Rejected

META = "session-0b3f2c6e-1d2a-4f5b-9c7d-8e9f0a1b2c3d.slog.meta"


@pytest.fixture
def assignment(tmp_path: Path) -> Path:
    folder = tmp_path / "hw1"
    folder.mkdir()
    (folder / ".provenance-manifest").write_text("{}", encoding="utf-8")
    return tmp_path


def leftovers(root: Path) -> list[str]:
    return sorted(p.name for p in root.rglob("*.tmp"))


def test_writes_the_file_and_replaces_it_whole(assignment: Path) -> None:
    assert atomic_write(assignment, "hw1", META, b'{"v":1}') == Written(7)
    assert atomic_write(assignment, "hw1", META, b'{"v":22}') == Written(8)
    assert (assignment / "hw1" / ".provenance" / META).read_bytes() == b'{"v":22}'
    assert leftovers(assignment) == []


def test_stages_the_temp_file_outside_provenance(
    assignment: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    # Otter zips every file it lists in .provenance/, so a temp file there could vanish
    # between the listing and the zip and fail the student's export.
    staged: list[Path] = []
    real_replace = os.replace

    def spy(src: str | Path, dst: str | Path) -> None:
        staged.append(Path(src))
        real_replace(src, dst)

    monkeypatch.setattr(atomic.os, "replace", spy)
    atomic_write(assignment, "hw1", META, b"x")
    assert [p.parent for p in staged] == [assignment / "hw1"]
    assert staged[0].name.startswith(".provenance-") and staged[0].name.endswith(".tmp")


def test_removes_the_temp_file_and_keeps_the_old_file_when_the_rename_fails(
    assignment: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    atomic_write(assignment, "hw1", META, b"old")

    def fail(src: str | Path, dst: str | Path) -> None:
        raise OSError(28, "No space left on device")

    monkeypatch.setattr(atomic.os, "replace", fail)
    with pytest.raises(OSError):
        atomic_write(assignment, "hw1", META, b"new")
    assert (assignment / "hw1" / ".provenance" / META).read_bytes() == b"old"
    assert leftovers(assignment) == []


@pytest.mark.parametrize(
    "name",
    [
        "session-0b3f2c6e.slog",  # the log is append-only
        "manifest.json",  # signed; never rewritten after seal
        "manifest.sig",
        "../escape.slog.meta",
        "notes.txt",
    ],
)
def test_refuses_any_other_file_name(assignment: Path, name: str) -> None:
    assert isinstance(atomic_write(assignment, "hw1", name, b"x"), Rejected)
    assert not (assignment / "hw1" / ".provenance").exists()


def test_refuses_a_folder_without_a_manifest(tmp_path: Path) -> None:
    (tmp_path / "scratch").mkdir()
    assert atomic_write(tmp_path, "scratch", META, b"x") == Rejected(
        "folder has no .provenance-manifest"
    )
    assert not (tmp_path / "scratch" / ".provenance").exists()


def test_refuses_paths_outside_the_root(assignment: Path) -> None:
    assert isinstance(atomic_write(assignment, "../elsewhere", META, b"x"), Rejected)


def test_refuses_a_symlinked_provenance_folder(assignment: Path, tmp_path: Path) -> None:
    outside = tmp_path / "outside"
    outside.mkdir()
    (assignment / "hw1" / ".provenance").symlink_to(outside)
    assert atomic_write(assignment, "hw1", META, b"x") == Rejected(
        ".provenance must not be a symlink"
    )


def test_refuses_a_symlinked_target(assignment: Path) -> None:
    provenance = assignment / "hw1" / ".provenance"
    provenance.mkdir()
    victim = assignment / "hw1" / "hw1.ipynb"
    victim.write_text("student work", encoding="utf-8")
    (provenance / META).symlink_to(victim)
    assert atomic_write(assignment, "hw1", META, b"x") == Rejected("target must not be a symlink")
    assert victim.read_text(encoding="utf-8") == "student work"
