"""scans, scan targets, run target lists

Revision ID: 0005
Revises: 0004
"""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "scans",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("root_target", postgresql.JSONB(), nullable=False),
        sa.Column("plugin_ids", postgresql.ARRAY(sa.String()), nullable=False),
        sa.Column("max_depth", sa.Integer(), server_default="2", nullable=False),
        sa.Column("max_targets", sa.Integer(), server_default="5000", nullable=False),
        sa.Column("status", sa.String(12), nullable=False),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("requested_by", sa.Uuid(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "plugin_runs", sa.Column("scan_id", sa.Uuid(), sa.ForeignKey("scans.id", ondelete="CASCADE"), nullable=True)
    )
    op.create_index("ix_plugin_runs_scan_id", "plugin_runs", ["scan_id"])
    op.add_column("plugin_runs", sa.Column("targets", postgresql.JSONB(), nullable=True))
    op.execute("update plugin_runs set targets = jsonb_build_array(target)")
    op.alter_column("plugin_runs", "targets", nullable=False)
    op.drop_column("plugin_runs", "target")
    op.add_column("plugin_runs", sa.Column("attempt", sa.Integer(), server_default="0", nullable=False))
    # Phase 2 runs had no durable executor; whatever was in flight at upgrade time is gone.
    op.execute(
        "update plugin_runs set status = 'FAILED', error = 'Interrupted by restart.', finished_at = now() "
        "where status in ('PENDING', 'RUNNING')"
    )
    op.create_table(
        "scan_targets",
        sa.Column("scan_id", sa.Uuid(), sa.ForeignKey("scans.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("type", sa.String(8), primary_key=True),
        sa.Column("value", sa.String(2000), primary_key=True),
        sa.Column("depth", sa.Integer(), nullable=False),
        sa.Column("source_run_id", sa.Uuid(), sa.ForeignKey("plugin_runs.id", ondelete="SET NULL"), nullable=True),
        sa.Column("in_scope", sa.Boolean(), nullable=False),
        sa.Column("refusal", sa.Text(), nullable=True),
        sa.Column("routed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("scan_targets")
    op.drop_column("plugin_runs", "attempt")
    op.add_column("plugin_runs", sa.Column("target", postgresql.JSONB(), nullable=True))
    op.execute("update plugin_runs set target = targets -> 0")
    op.alter_column("plugin_runs", "target", nullable=False)
    op.drop_column("plugin_runs", "targets")
    op.drop_index("ix_plugin_runs_scan_id", table_name="plugin_runs")
    op.drop_column("plugin_runs", "scan_id")
    op.drop_table("scans")
