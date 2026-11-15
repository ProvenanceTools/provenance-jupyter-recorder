"""Writes a whole file in `<assignment>/.provenance/` atomically: write a temp file, fsync, rename.

The frontend builds the bytes; this module only writes them, so a reader never sees a partly
written file. Used for `session-<uuid>.slog.meta`, which is rewritten whole. The `.slog` is
append-only and goes through `slog_append.py` instead.

The temp file is staged in the assignment folder, next to `.provenance/` rather than inside it.
Otter's export lists `.provenance/` and then zips each file it listed, so a temp file that is
renamed away between the listing and the zip would fail the student's export. The assignment
folder is the parent of `.provenance/`, so the rename stays on the same disk and is atomic.
"""

from __future__ import annotations

import os
import re
import secrets
from dataclasses import dataclass
from pathlib import Path

from .paths import Rejected, resolve_inside
from .slog_append import MANIFEST_NAMES, PROVENANCE_DIR

# The only names this route may write: the session's meta file. Never the `.slog` (append-only)
# and never `manifest.json` / `manifest.sig`, which are signed and must not change after seal.
WRITABLE_NAME = re.compile(r"^session-[0-9a-f-]+\.slog\.meta$")


@dataclass(frozen=True)
class Written:
    size: int


def temp_name(file_name: str) -> str:
    """A unique, hidden temp file name for `file_name`, staged in the assignment folder."""
    return f".provenance-{file_name}.{secrets.token_hex(8)}.tmp"


def atomic_write(
    root: Path, assignment_dir: str, file_name: str, data: bytes
) -> Written | Rejected:
    """Replace `<assignment_dir>/.provenance/<file_name>` with `data`, atomically.

    Raises `OSError` if the disk write itself fails, after removing the temp file.
    """
    if not WRITABLE_NAME.fullmatch(file_name):
        return Rejected("file must be named session-<uuid>.slog.meta")

    assignment = resolve_inside(root, assignment_dir)
    if isinstance(assignment, Rejected):
        return assignment
    # Only an assignment folder may hold provenance files, as for the log itself.
    if not any((assignment / name).is_file() for name in MANIFEST_NAMES):
        return Rejected("folder has no .provenance-manifest")

    provenance = assignment / PROVENANCE_DIR
    if provenance.is_symlink():
        return Rejected(".provenance must not be a symlink")
    provenance.mkdir(exist_ok=True)
    target = provenance / file_name
    if target.is_symlink():
        return Rejected("target must not be a symlink")

    temp = assignment / temp_name(file_name)
    try:
        with open(temp, "xb") as out:
            out.write(data)
            out.flush()
            os.fsync(out.fileno())
        os.replace(temp, target)
    except BaseException:
        temp.unlink(missing_ok=True)
        raise
    _fsync_directory(provenance)
    return Written(len(data))


def _fsync_directory(folder: Path) -> None:
    """Persist the rename itself. Best effort: not every platform can fsync a directory."""
    try:
        fd = os.open(folder, os.O_RDONLY)
    except OSError:
        return
    try:
        os.fsync(fd)
    except OSError:
        pass
    finally:
        os.close(fd)
