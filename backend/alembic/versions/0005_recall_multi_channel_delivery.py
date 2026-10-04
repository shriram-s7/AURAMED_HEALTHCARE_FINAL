"""add recall schedules with per-channel message status

Revision ID: 0005_recall_multi_channel_delivery
Revises: 0004_patient_notes_and_urgent
Create Date: 2026-09-30
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0005_recall_multi_channel_delivery"
down_revision: Union[str, None] = "0004_patient_notes_and_urgent"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "recalls" not in inspector.get_table_names():
        op.create_table(
            "recalls",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column("patient_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("patient_profiles.id"), nullable=False),
            sa.Column("doctor_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("doctor_profiles.id"), nullable=False),
            sa.Column("risk_tier", sa.String(20), nullable=False, server_default="moderate"),
            sa.Column("recommended_interval_months", sa.Integer(), nullable=False, server_default="6"),
            sa.Column("due_date", sa.Date(), nullable=False),
            sa.Column("status", sa.String(30), nullable=False, server_default="SCHEDULED"),
            sa.Column("is_demo", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column("message_channel", sa.String(20), nullable=True),
            sa.Column("message_status", sa.String(30), nullable=False, server_default="NOT_SENT"),
            sa.Column("message_text", sa.Text(), nullable=True),
            sa.Column("reminder_logged_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        )
        op.create_index("ix_recalls_patient_id", "recalls", ["patient_id"])
        op.create_index("ix_recalls_doctor_id", "recalls", ["doctor_id"])
        op.create_index("ix_recalls_due_date", "recalls", ["due_date"])
        op.create_index("ix_recalls_status", "recalls", ["status"])

    existing = {column["name"] for column in sa.inspect(bind).get_columns("recalls")}
    for name in ("sms_status", "whatsapp_status", "email_status"):
        if name not in existing:
            op.add_column(
                "recalls",
                sa.Column(name, sa.String(20), nullable=False, server_default="NOT_SENT"),
            )


def downgrade() -> None:
    op.drop_column("recalls", "email_status")
    op.drop_column("recalls", "whatsapp_status")
    op.drop_column("recalls", "sms_status")
    # Keep recall records on downgrade; they may contain patient follow-up history.
