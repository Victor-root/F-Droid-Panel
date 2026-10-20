"""repositories

Revision ID: 0002
Revises: 0001
Create Date: 2026-10-20 15:44:21.352045
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0002"
down_revision: str | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "access_accounts",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("repository_id", sa.Integer(), nullable=False),
        sa.Column("username", sa.String(length=64), nullable=False),
        sa.Column("label", sa.String(length=128), nullable=False),
        sa.Column("password_hash", sa.String(length=256), nullable=False),
        sa.Column("disabled", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("last_used_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["repository_id"], ["repositories.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("repository_id", "username"),
    )
    op.create_table(
        "pending_changes",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("repository_id", sa.Integer(), nullable=False),
        sa.Column("at", sa.DateTime(), nullable=False),
        sa.Column("username", sa.String(length=64), nullable=True),
        sa.Column("kind", sa.String(length=64), nullable=False),
        sa.Column("target", sa.String(length=256), nullable=True),
        sa.ForeignKeyConstraint(["repository_id"], ["repositories.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("pending_changes", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_pending_changes_repository_id"), ["repository_id"], unique=False)

    with op.batch_alter_table("repositories", schema=None) as batch_op:
        batch_op.add_column(
            sa.Column("created_by_panel", sa.Boolean(), nullable=False, server_default=sa.false())
        )
        batch_op.add_column(sa.Column("fingerprint", sa.String(length=64), nullable=True))
        batch_op.add_column(sa.Column("published_at", sa.DateTime(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("repositories", schema=None) as batch_op:
        batch_op.drop_column("published_at")
        batch_op.drop_column("fingerprint")
        batch_op.drop_column("created_by_panel")

    with op.batch_alter_table("pending_changes", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_pending_changes_repository_id"))

    op.drop_table("pending_changes")
    op.drop_table("access_accounts")
