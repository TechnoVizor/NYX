"""built-in profiles gain naabu, tlsx, katana and gau (brief: Quick and Balanced scan)

Revision ID: 0007
Revises: 0006
"""

import json

import sqlalchemy as sa

from alembic import op

revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None

NUCLEI = "projectdiscovery.nuclei"
PROFILES = {
    "Quick": (
        "Subdomains, live web services, a shallow crawl and high-impact Nuclei checks. Minutes, not hours.",
        ["projectdiscovery.subfinder", "projectdiscovery.httpx", "projectdiscovery.katana", NUCLEI],
        {"projectdiscovery.katana": {"depth": 1}, NUCLEI: {"severity": ["high", "critical"]}},
    ),
    "Balanced": (
        "The default: subdomains, DNS, common ports, TLS certificates, live web services, a crawl, archived URLs "
        "and every Nuclei check from low severity up.",
        [
            "projectdiscovery.subfinder",
            "projectdiscovery.dnsx",
            "projectdiscovery.naabu",
            "projectdiscovery.httpx",
            "projectdiscovery.tlsx",
            "projectdiscovery.katana",
            "lc.gau",
            NUCLEI,
        ],
        {
            "projectdiscovery.naabu": {"top_ports": "100"},
            "projectdiscovery.katana": {"depth": 2},
            NUCLEI: {"severity": ["low", "medium", "high", "critical"]},
        },
    ),
}
BEFORE = {
    "Quick": (
        "Subdomains, live web services and high-impact Nuclei checks. Minutes, not hours.",
        ["projectdiscovery.subfinder", "projectdiscovery.httpx", NUCLEI],
        {NUCLEI: {"severity": ["high", "critical"]}},
    ),
    "Balanced": (
        "The default: subdomains, DNS, live web services and every Nuclei check from low severity up.",
        ["projectdiscovery.subfinder", "projectdiscovery.dnsx", "projectdiscovery.httpx", NUCLEI],
        {NUCLEI: {"severity": ["low", "medium", "high", "critical"]}},
    ),
}


def _set(profiles: dict) -> None:
    for name, (description, ids, config) in profiles.items():
        op.get_bind().execute(
            sa.text(
                "update scan_profiles set description = :d, plugin_ids = :ids, plugin_config = cast(:cfg as jsonb), "
                "updated_at = now() where name = :n and builtin"
            ),
            {"n": name, "d": description, "ids": ids, "cfg": json.dumps(config)},
        )


def upgrade() -> None:
    _set(PROFILES)


def downgrade() -> None:
    _set(BEFORE)
