"""Logging for the API process.

Every line carries the id of the request that produced it, so "the goal that
did not arrive at 16:42" can be followed from the access line through whatever
the handler logged on the way. In production the lines are JSON — one object
per line, which is what a log collector parses without a regex; in
development they are plain text for a human reading a terminal.
"""

from __future__ import annotations

import json
import logging
import sys
from contextvars import ContextVar
from datetime import UTC, datetime

#: The id of the request being handled, or "-" outside one.
request_id: ContextVar[str] = ContextVar("request_id", default="-")


class _RequestIdFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        record.request_id = request_id.get()
        return True


class JsonFormatter(logging.Formatter):
    """One JSON object per line. Extra fields passed with `extra=` are kept."""

    _STANDARD = set(vars(logging.makeLogRecord({}))) | {"message", "request_id"}

    def format(self, record: logging.LogRecord) -> str:
        payload = {
            "ts": datetime.fromtimestamp(record.created, UTC).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "request_id": getattr(record, "request_id", "-"),
            "message": record.getMessage(),
        }
        for key, value in vars(record).items():
            if key not in self._STANDARD and not key.startswith("_"):
                payload[key] = value
        if record.exc_info:
            payload["exc"] = self.formatException(record.exc_info)
        return json.dumps(payload, ensure_ascii=False, default=str)


def configure(*, json_lines: bool, level: int = logging.INFO) -> None:
    """Install the handler on the root logger. Idempotent."""
    root = logging.getLogger()
    for handler in list(root.handlers):
        if getattr(handler, "_pamesentra", False):
            root.removeHandler(handler)

    handler = logging.StreamHandler(sys.stdout)
    handler._pamesentra = True  # type: ignore[attr-defined]
    handler.addFilter(_RequestIdFilter())
    handler.setFormatter(
        JsonFormatter()
        if json_lines
        else logging.Formatter("%(asctime)s %(levelname)s [%(request_id)s] %(name)s: %(message)s")
    )
    root.addHandler(handler)
    root.setLevel(level)
    # Replaced by our own access line, which carries the request id and the
    # duration; uvicorn's would be a second, less useful copy of it.
    logging.getLogger("uvicorn.access").disabled = True
