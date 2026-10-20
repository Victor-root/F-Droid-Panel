"""apps

Revision ID: 0003
Revises: 0002
Create Date: 2026-10-20 16:14:45.895074
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0003"
down_revision: str | None = "0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "apk_cache",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("repository_id", sa.Integer(), nullable=False),
        sa.Column("path", sa.Text(), nullable=False),
        sa.Column("size", sa.Integer(), nullable=False),
        sa.Column("modified", sa.Double(), nullable=False),
        sa.Column("info", sa.JSON(), nullable=False),
        sa.ForeignKeyConstraint(["repository_id"], ["repositories.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("repository_id", "path"),
    )
    op.create_table(
        "uploads",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("repository_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=True),
        sa.Column("filename", sa.String(length=256), nullable=False),
        sa.Column("size", sa.Integer(), nullable=False),
        sa.Column("received", sa.Integer(), nullable=False),
        sa.Column(
            "status",
            sa.Enum(
                "RECEIVING", "READY", "REJECTED", "ADDED", name="uploadstatus", native_enum=False, length=16
            ),
            nullable=False,
        ),
        sa.Column("info", sa.JSON(), nullable=True),
        sa.Column("checks", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["repository_id"], ["repositories.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("uploads", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_uploads_repository_id"), ["repository_id"], unique=False)


def downgrade() -> None:
    with op.batch_alter_table("uploads", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_uploads_repository_id"))

    op.drop_table("uploads")
    op.drop_table("apk_cache")
