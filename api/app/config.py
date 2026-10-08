from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="NYX_")

    database_url: str = "postgresql+psycopg://nyx:nyx@127.0.0.1:5432/nyx"
    allow_signup: bool = False
    cookie_secure: bool = False
    session_ttl_hours: int = 168


settings = Settings()
