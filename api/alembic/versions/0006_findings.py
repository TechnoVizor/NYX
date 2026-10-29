"""assets, findings, occurrences, scan profiles; scan config

Revision ID: 0006
Revises: 0005
"""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None

UUID_DEFAULT = sa.text("gen_random_uuid()")
BUILTIN = [
    (
        "Quick",
        "Subdomains, live web services and high-impact Nuclei checks. Minutes, not hours.",
        ["projectdiscovery.subfinder", "projectdiscovery.httpx", "projectdiscovery.nuclei"],
        {"projectdiscovery.nuclei": {"severity": ["high", "critical"]}},
    ),
    (
        "Balanced",
        "The default: subdomains, DNS, live web services and every Nuclei check from low severity up.",
        ["projectdiscovery.subfinder", "projectdiscovery.dnsx", "projectdiscovery.httpx", "projectdiscovery.nuclei"],
        {"projectdiscovery.nuclei": {"severity": ["low", "medium", "high", "critical"]}},
    ),
]


def upgrade() -> None:
    op.create_table(
        "assets",
        sa.Column("id", sa.Uuid(), primary_key=True, server_default=UUID_DEFAULT),
        sa.Column("kind", sa.String(32), nullable=False),
        sa.Column("value", sa.String(2000), nullable=False),
        sa.Column("data", postgresql.JSONB(), server_default="{}", nullable=False),
        sa.Column("first_seen", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_seen", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_scan_id", sa.Uuid(), sa.ForeignKey("scans.id", ondelete="SET NULL"), nullable=True),
        sa.UniqueConstraint("kind", "value", name="assets_kind_value_key"),
    )
    op.create_index("ix_assets_last_seen", "assets", ["last_seen"])
    op.create_table(
        "findings",
        sa.Column("id", sa.Uuid(), primary_key=True, server_default=UUID_DEFAULT),
        sa.Column("fingerprint", sa.String(64), nullable=False, unique=True),
        sa.Column("plugin_id", sa.String(120), nullable=False),
        sa.Column("template_id", sa.String(200), nullable=False),
        sa.Column("title", sa.String(300), nullable=False),
        sa.Column("severity", sa.String(8), nullable=False),
        sa.Column("matched_at", sa.String(2000), nullable=False),
        sa.Column("asset_id", sa.Uuid(), sa.ForeignKey("assets.id", ondelete="SET NULL"), nullable=True),
        sa.Column("data", postgresql.JSONB(), server_default="{}", nullable=False),
        sa.Column("status", sa.String(16), server_default="open", nullable=False),
        sa.Column("status_note", sa.Text(), nullable=True),
        sa.Column("status_by", sa.Uuid(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("status_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("first_seen", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_seen", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("severity in ('critical', 'high', 'medium', 'low', 'info')", name="findings_severity_check"),
        sa.CheckConstraint(
            "status in ('open', 'confirmed', 'false_positive', 'accepted_risk', 'fixed')", name="findings_status_check"
        ),
    )
    for col in ("severity", "status", "last_seen", "asset_id"):
        op.create_index(f"ix_findings_{col}", "findings", [col])
    op.create_table(
        "finding_occurrences",
        sa.Column("finding_id", sa.Uuid(), sa.ForeignKey("findings.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("scan_id", sa.Uuid(), sa.ForeignKey("scans.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("run_id", sa.Uuid(), sa.ForeignKey("plugin_runs.id", ondelete="SET NULL"), nullable=True),
        sa.Column("event_seq", sa.Integer(), nullable=True),
        sa.Column("seen_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_scan_targets_value", "scan_targets", ["value"])  # an asset's scans
    op.create_index("ix_finding_occurrences_scan_id", "finding_occurrences", ["scan_id"])
    profiles = op.create_table(
        "scan_profiles",
        sa.Column("id", sa.Uuid(), primary_key=True, server_default=UUID_DEFAULT),
        sa.Column("name", sa.String(80), nullable=False, unique=True),
        sa.Column("description", sa.Text(), server_default="", nullable=False),
        sa.Column("builtin", sa.Boolean(), server_default=sa.false(), nullable=False),
        sa.Column("plugin_ids", postgresql.ARRAY(sa.String()), nullable=False),
        sa.Column("plugin_config", postgresql.JSONB(), server_default="{}", nullable=False),
        sa.Column("max_depth", sa.Integer(), nullable=False),
        sa.Column("created_by", sa.Uuid(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("max_depth between 1 and 3", name="scan_profiles_depth_check"),
    )
    op.bulk_insert(
        profiles,
        [
            {"name": n, "description": d, "builtin": True, "plugin_ids": ids, "plugin_config": cfg, "max_depth": 3}
            for n, d, ids, cfg in BUILTIN
        ],
    )
    op.add_column("scans", sa.Column("plugin_config", postgresql.JSONB(), server_default="{}", nullable=False))
    op.add_column(
        "scans",
        sa.Column("profile_id", sa.Uuid(), sa.ForeignKey("scan_profiles.id", ondelete="SET NULL"), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("scans", "profile_id")
    op.drop_column("scans", "plugin_config")
    op.drop_table("scan_profiles")
    op.drop_table("finding_occurrences")
    op.drop_table("findings")
    op.drop_table("assets")
    op.drop_index("ix_scan_targets_value", table_name="scan_targets")
