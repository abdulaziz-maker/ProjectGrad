"""Add company_name to user and company to job

Revision ID: 4e575430a996
Revises: f9c9443e3aed
Create Date: 2025-05-02 10:35:30.146915
"""

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '4e575430a996'
down_revision = 'f9c9443e3aed'
branch_labels = None
depends_on = None

def upgrade():
    op.add_column('user', sa.Column('company_name', sa.String(length=100), nullable=True))
    op.add_column('job', sa.Column('company', sa.String(length=100), nullable=True))
    
def downgrade():
    op.drop_column('user', 'company_name')
    op.drop_column('job', 'company')