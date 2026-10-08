"""plugin registry

Revision ID: 0003
Revises: 0002
"""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "plugins",
        sa.Column("id", sa.String(120), primary_key=True),
        sa.Column("name", sa.String(80), nullable=False),
        sa.Column("publisher", sa.String(80), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("categories", postgresql.ARRAY(sa.String()), nullable=False),
        sa.Column("risk_level", sa.String(16), nullable=False),
        sa.Column("trust_level", sa.String(16), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_table(
        "plugin_versions",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("plugin_id", sa.String(120), sa.ForeignKey("plugins.id", ondelete="CASCADE"), nullable=False),
        sa.Column("version", sa.String(40), nullable=False),
        sa.Column("image", sa.String(200), nullable=False),
        sa.Column("digest", sa.String(80), nullable=True),
        sa.Column("manifest", postgresql.JSONB(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("plugin_id", "version", "digest", name="plugin_versions_key"),
    )
    op.create_index("ix_plugin_versions_plugin_id", "plugin_versions", ["plugin_id"])
    op.create_table(
        "plugin_installations",
        sa.Column("plugin_id", sa.String(120), sa.ForeignKey("plugins.id", ondelete="CASCADE"), primary_key=True),
        sa.Column(
            "plugin_version_id", sa.Uuid(), sa.ForeignKey("plugin_versions.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("enabled", sa.Boolean(), nullable=False),
        sa.Column("config", postgresql.JSONB(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("plugin_installations")
    op.drop_table("plugin_versions")
    op.drop_table("plugins")
