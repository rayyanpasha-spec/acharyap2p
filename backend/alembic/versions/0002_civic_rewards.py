"""civic rewards (cash-value reward per 10 resolved + verified reports)

Revision ID: 0002
Revises: 0001
Create Date: 2026-11-21 18:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '0002'
down_revision: Union[str, None] = '0001'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'civic_rewards',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('user_id', sa.String(length=36), nullable=False),
        sa.Column('milestone', sa.Integer(), nullable=False),
        sa.Column('amount', sa.Integer(), nullable=False),
        sa.Column('currency', sa.String(length=3), nullable=False),
        sa.Column('status', sa.String(length=12), nullable=False),
        sa.Column('complaint_ids', sa.JSON(), nullable=True),
        sa.Column('is_demo', sa.Boolean(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('fulfilled_at', sa.DateTime(), nullable=True),
        sa.Column('fulfilled_by_user_id', sa.String(length=36), nullable=True),
        sa.Column('fulfilment_note', sa.String(length=300), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('user_id', 'milestone', name='uq_reward_user_milestone'),
    )
    with op.batch_alter_table('civic_rewards', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_civic_rewards_user_id'), ['user_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_civic_rewards_status'), ['status'], unique=False)


def downgrade() -> None:
    with op.batch_alter_table('civic_rewards', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_civic_rewards_status'))
        batch_op.drop_index(batch_op.f('ix_civic_rewards_user_id'))
    op.drop_table('civic_rewards')
