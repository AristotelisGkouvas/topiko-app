from datetime import datetime

from pydantic import BaseModel, ConfigDict


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class Meta(BaseModel):
    """Freshness banner under every page title in the UI kit.

    The client colours the dot from `age_minutes`, so the server sends the
    timestamp rather than a pre-rendered "πριν 4 λεπτά" string — the label keeps
    ticking while the page sits open.
    """

    association: str
    source_url: str | None = None
    last_scraped_at: datetime | None = None
    live_matches: int = 0
