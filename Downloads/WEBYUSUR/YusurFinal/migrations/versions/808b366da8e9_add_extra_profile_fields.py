"""add extra profile fields

Revision ID: 808b366da8e9
Revises: a525dac35540
Create Date: 2025-04-19 06:59:01.924565

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '808b366da8e9'
down_revision = '2460785a0e80'
branch_labels = None
depends_on = None


def upgrade():
    # ### commands auto generated by Alembic - please adjust! ###
    with op.batch_alter_table('user', schema=None) as batch_op:
        batch_op.add_column(sa.Column('phone', sa.String(length=20), nullable=True))
        batch_op.add_column(sa.Column('address', sa.String(length=255), nullable=True))
        batch_op.add_column(sa.Column('bio', sa.Text(), nullable=True))
        batch_op.add_column(sa.Column('linkedin', sa.String(length=255), nullable=True))
        batch_op.add_column(sa.Column('twitter', sa.String(length=255), nullable=True))
        batch_op.add_column(sa.Column('github', sa.String(length=255), nullable=True))
        batch_op.add_column(sa.Column('personality_type', sa.String(length=50), nullable=True))
        batch_op.add_column(sa.Column('personal_values', sa.String(length=255), nullable=True))
        batch_op.add_column(sa.Column('achievement', sa.String(length=255), nullable=True))

    # ### end Alembic commands ###


def downgrade():
    # ### commands auto generated by Alembic - please adjust! ###
    with op.batch_alter_table('user', schema=None) as batch_op:
        batch_op.drop_column('achievement')
        batch_op.drop_column('personal_values')
        batch_op.drop_column('personality_type')
        batch_op.drop_column('github')
        batch_op.drop_column('twitter')
        batch_op.drop_column('linkedin')
        batch_op.drop_column('bio')
        batch_op.drop_column('address')
        batch_op.drop_column('phone')

    # ### end Alembic commands ###
