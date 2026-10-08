"""plugin runs and events

Revision ID: 0004
Revises: 0003
"""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "plugin_runs",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "plugin_version_id", sa.Uuid(), sa.ForeignKey("plugin_versions.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("target", postgresql.JSONB(), nullable=False),
        sa.Column("status", sa.String(12), nullable=False),
        sa.Column("requested_by", sa.Uuid(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("exit_code", sa.Integer(), nullable=True),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("event_count", sa.Integer(), nullable=False),
    )
    op.create_index("ix_plugin_runs_plugin_version_id", "plugin_runs", ["plugin_version_id"])
    op.create_table(
        "plugin_events",
        sa.Column("run_id", sa.Uuid(), sa.ForeignKey("plugin_runs.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("seq", sa.Integer(), primary_key=True),
        sa.Column("type", sa.String(16), nullable=False),
        sa.Column("payload", postgresql.JSONB(), nullable=False),
        sa.Column("valid", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("plugin_events")
    op.drop_table("plugin_runs")
