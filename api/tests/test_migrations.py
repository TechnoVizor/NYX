from alembic.config import Config

from alembic import command
from app.config import settings


def test_migrations_accept_url_encoded_password(monkeypatch):
    # "%6Eyx" is "nyx" percent-encoded; ConfigParser interpolation used to choke on the "%".
    url = settings.database_url.replace("nyx:nyx@", "nyx:%6Eyx@")
    assert "%6E" in url
    monkeypatch.setattr(settings, "database_url", url)
    command.current(Config("alembic.ini"))
