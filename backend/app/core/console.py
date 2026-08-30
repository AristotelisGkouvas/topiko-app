"""Console helpers for CLI entry points.

Every script in this project prints Greek. On Windows the default console
encoding is still cp1252, which raises UnicodeEncodeError the moment a Greek
letter is written — so stdout is switched to UTF-8 explicitly rather than left
to the OS.
"""

import sys


def use_utf8_stdout() -> None:
    for stream in (sys.stdout, sys.stderr):
        reconfigure = getattr(stream, "reconfigure", None)
        if reconfigure is not None:
            reconfigure(encoding="utf-8", errors="replace")
