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


def test_0006_seeds_builtin_profiles_and_round_trips():
    from sqlalchemy import text

    from app.db import engine

    cfg = Config("alembic.ini")
    command.downgrade(cfg, "0006")
    with engine.begin() as c:
        rows = c.execute(
            text("select name, builtin, plugin_ids, plugin_config, max_depth from scan_profiles order by name")
        ).all()
    assert [(r.name, r.builtin, r.max_depth) for r in rows] == [("Balanced", True, 3), ("Quick", True, 3)]
    balanced, quick = rows
    assert balanced.plugin_ids == [
        "projectdiscovery.subfinder",
        "projectdiscovery.dnsx",
        "projectdiscovery.httpx",
        "projectdiscovery.nuclei",
    ]
    assert quick.plugin_config == {"projectdiscovery.nuclei": {"severity": ["high", "critical"]}}
    command.downgrade(cfg, "0005")
    try:
        with engine.begin() as c:
            assert c.scalar(text("select to_regclass('findings')")) is None
    finally:
        command.upgrade(cfg, "head")


def test_0007_adds_the_4b_plugins_to_builtin_profiles_and_round_trips():
    from sqlalchemy import text

    from app.db import engine

    def profiles():
        with engine.begin() as c:
            rows = c.execute(text("select name, plugin_ids, plugin_config from scan_profiles order by name")).all()
        return {r.name: (r.plugin_ids, r.plugin_config) for r in rows}

    balanced, quick = profiles()["Balanced"], profiles()["Quick"]
    assert {"projectdiscovery.naabu", "projectdiscovery.tlsx", "projectdiscovery.katana", "lc.gau"} <= set(balanced[0])
    assert quick[0] == [
        "projectdiscovery.subfinder",
        "projectdiscovery.httpx",
        "projectdiscovery.katana",
        "projectdiscovery.nuclei",
    ]
    assert quick[1]["projectdiscovery.katana"] == {"depth": 1}
    cfg = Config("alembic.ini")
    command.downgrade(cfg, "0006")
    try:
        assert "projectdiscovery.naabu" not in profiles()["Balanced"][0]
    finally:
        command.upgrade(cfg, "head")
