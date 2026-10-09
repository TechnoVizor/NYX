from alembic.config import Config

from alembic import command
from app.config import settings


def test_migrations_accept_url_encoded_password(monkeypatch):
    # "%6Eyx" is "nyx" percent-encoded; ConfigParser interpolation used to choke on the "%".
    url = settings.database_url.replace("nyx:nyx@", "nyx:%6Eyx@")
    assert "%6E" in url
    monkeypatch.setattr(settings, "database_url", url)
    command.current(Config("alembic.ini"))


def test_0005_moves_target_into_targets_and_back():
    from sqlalchemy import text

    from app.db import engine

    cfg = Config("alembic.ini")
    command.downgrade(cfg, "0004")
    try:
        with engine.begin() as c:
            c.execute(
                text(
                    "insert into plugins (id, name, publisher, description, categories, risk_level, trust_level) "
                    "values ('m.p', 'P', 'NYX', '', '{}', 'passive', 'custom')"
                )
            )
            vid = c.scalar(
                text(
                    "insert into plugin_versions (id, plugin_id, version, image, manifest) "
                    "values (gen_random_uuid(), 'm.p', '1', 'i', '{}') returning id"
                )
            )
            c.execute(
                text(
                    "insert into plugin_runs (id, plugin_version_id, target, status, event_count) values "
                    '(gen_random_uuid(), :v, \'{"type": "domain", "value": "a.example.com"}\', \'RUNNING\', 0)'
                ),
                {"v": vid},
            )
        command.upgrade(cfg, "0005")
        with engine.begin() as c:
            targets, status, attempt = c.execute(text("select targets, status, attempt from plugin_runs")).one()
        assert targets == [{"type": "domain", "value": "a.example.com"}]
        assert (status, attempt) == ("FAILED", 0)
        command.downgrade(cfg, "0004")
        with engine.begin() as c:
            assert c.scalar(text("select target from plugin_runs")) == {"type": "domain", "value": "a.example.com"}
    finally:
        command.upgrade(cfg, "head")
        with engine.begin() as c:
            c.execute(text("delete from plugins where id = 'm.p'"))
