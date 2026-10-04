"""Appointment-linked reminder preferences."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
revision = '0007_appointment_reminders'
down_revision = '0006_appointment_change_requests'
branch_labels = None
depends_on = None

def upgrade():
    op.create_table('appointment_reminders',
        sa.Column('appointment_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('appointments.id'), primary_key=True),
        sa.Column('channels', sa.JSON(), nullable=False),
        sa.Column('lead_days', sa.Integer(), nullable=False, server_default='1'),
        sa.Column('consent', sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()))

def downgrade():
    op.drop_table('appointment_reminders')
