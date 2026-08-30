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
