"""scope targets

Revision ID: 0002
Revises: 0001
"""

import sqlalchemy as sa

from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "scope_targets",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("kind", sa.String(8), nullable=False),
        sa.Column("value", sa.String(253), nullable=False),
        sa.Column("active_allowed", sa.Boolean(), nullable=False),
        sa.Column("authorization", sa.Text(), nullable=False),
        sa.Column("created_by", sa.Uuid(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("kind in ('domain', 'cidr')", name="scope_targets_kind_check"),
        sa.UniqueConstraint("kind", "value", name="scope_targets_kind_value_key"),
    )


def downgrade() -> None:
    op.drop_table("scope_targets")
