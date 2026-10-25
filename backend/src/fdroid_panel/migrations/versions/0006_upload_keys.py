"""upload keys

Revision ID: 0006
Revises: 0005
Create Date: 2026-10-25 12:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0006"
down_revision: str | None = "0005"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "upload_keys",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("repository_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=128), nullable=False),
        sa.Column("key_hash", sa.String(length=64), nullable=False),
        sa.Column("hint", sa.String(length=8), nullable=False),
        sa.Column("can_publish", sa.Boolean(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("last_used_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["repository_id"], ["repositories.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("key_hash"),
    )
    with op.batch_alter_table("upload_keys", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_upload_keys_repository_id"), ["repository_id"], unique=False)


def downgrade() -> None:
    with op.batch_alter_table("upload_keys", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_upload_keys_repository_id"))

    op.drop_table("upload_keys")
