from functools import lru_cache
from typing import Annotated

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )

    app_name: str = "Pame Gipedo API"
    environment: str = "development"
    debug: bool = True
    # Opt-in, not tied to debug: echoed SQL buries the output of any CLI script.
    sql_echo: bool = False

    database_url: str = Field(
        default="postgresql+asyncpg://pamesentra:pamesentra@localhost:5432/pamesentra"
    )

    # Sent on every scraper request. Must name the project and carry a real
    # way to reach a human: a federation webmaster who wants this stopped
    # should not have to guess who is asking.
    #
    # ASCII only. HTTP header values are latin-1 at best, so the Greek name of
    # the federation cannot go in here — httpx would raise on the request
    # rather than on the setting, which is a long way from the cause.
    scraper_user_agent: str = (
        "PameSentraBot/0.1 (+mailto:CHANGE-ME@example.com; "
        "aggregator for Greek amateur football results)"
    )

    # --- Scheduled scraping -------------------------------------------------
    #
    # Amateur football is not a continuous feed: almost everything is played
    # across a weekend afternoon, and for most of the week the source publishes
    # nothing at all. Polling one fixed interval therefore has to choose between
    # being slow when it matters and hammering a federation's site when it does
    # not — so the scheduler reads the fixture list and picks.
    #
    # How often to look while at least one fixture is in its kickoff window.
    scraper_live_interval_seconds: int = 300
    # How often to look when none is. Late results, corrections and next week's
    # programme still arrive, just not by the minute.
    scraper_idle_interval_seconds: int = 21600
    # How long after kickoff a fixture still counts as possibly in play. Ninety
    # minutes plus halftime, stoppages and a referee writing the sheet up.
    scraper_match_window_hours: float = 3.0
    # How long before kickoff to start looking, so a postponement announced at
    # the last minute is not missed.
    scraper_lead_minutes: int = 30
    # Ceiling for the exponential backoff applied after a failed run.
    scraper_max_backoff_seconds: int = 3600

    # NoDecode: without it pydantic-settings tries to JSON-parse the env var
    # before the validator below gets to split the comma-separated form.
    cors_origins: Annotated[list[str], NoDecode] = Field(
        default_factory=lambda: ["http://localhost:3000"]
    )

    @field_validator("cors_origins", mode="before")
    @classmethod
    def _split_origins(cls, v: object) -> object:
        if isinstance(v, str):
            return [o.strip() for o in v.split(",") if o.strip()]
        return v

    @property
    def sync_database_url(self) -> str:
        """Alembic runs migrations synchronously."""
        return self.database_url.replace("+asyncpg", "+psycopg2").replace(
            "postgresql+psycopg2", "postgresql"
        )


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
