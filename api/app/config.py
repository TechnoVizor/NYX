from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="NYX_")

    database_url: str = "postgresql+psycopg://nyx:nyx@127.0.0.1:5432/nyx"
    allow_signup: bool = False
    cookie_secure: bool = False
    session_ttl_hours: int = 168
    # Repo root /plugins locally (api/app/config.py -> parents[2]); /plugins inside the API image.
    plugins_dir: str = str(Path(__file__).resolve().parents[2] / "plugins")


settings = Settings()
