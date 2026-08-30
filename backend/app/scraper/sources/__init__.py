"""Registry of source adapters.

`associations.scraper_config["source"]` names one of these. Adding a federation
that runs a different platform means adding a module here, not editing config.
"""

from app.scraper.sources.base import Source
from app.scraper.sources.epsip import EpsipSource

SOURCES: dict[str, type] = {
    EpsipSource.key: EpsipSource,
}


def get_source(key: str) -> Source:
    """Instantiate the adapter named by an association's scraper_config."""
    try:
        return SOURCES[key]()
    except KeyError:
        known = ", ".join(sorted(SOURCES)) or "none"
        raise LookupError(
            f"Άγνωστη πηγή '{key}'. Διαθέσιμες: {known}."
        ) from None


__all__ = ["SOURCES", "Source", "get_source"]
