"""إضافة بيانات مفصلة للباحث عن عمل

Revision ID: b98075c38984
Revises: ccaa02aa909b
Create Date: 2025-03-06 02:29:56.268364

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'b98075c38984'
down_revision = 'ccaa02aa909b'
branch_labels = None
depends_on = None


def upgrade():
    # ### commands auto generated by Alembic - please adjust! ###
    with op.batch_alter_table('user', schema=None) as batch_op:
        batch_op.add_column(sa.Column('date_of_birth', sa.Date(), nullable=True))
        batch_op.add_column(sa.Column('gender', sa.String(length=10), nullable=True))
        batch_op.add_column(sa.Column('highest_education', sa.String(length=50), nullable=True))
        batch_op.add_column(sa.Column('university_name', sa.String(length=100), nullable=True))
        batch_op.add_column(sa.Column('graduation_year', sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column('field_of_study', sa.String(length=100), nullable=True))
        batch_op.add_column(sa.Column('experience_years', sa.String(length=10), nullable=True))
        batch_op.add_column(sa.Column('previous_jobs', sa.Text(), nullable=True))
        batch_op.add_column(sa.Column('industry', sa.String(length=100), nullable=True))
        batch_op.add_column(sa.Column('certifications', sa.Text(), nullable=True))
        batch_op.add_column(sa.Column('skills', sa.Text(), nullable=True))
        batch_op.add_column(sa.Column('technical_skills', sa.Text(), nullable=True))
        batch_op.add_column(sa.Column('soft_skills', sa.Text(), nullable=True))
        batch_op.add_column(sa.Column('preferred_salary', sa.String(length=20), nullable=True))
        batch_op.add_column(sa.Column('job_type', sa.String(length=20), nullable=True))
        batch_op.add_column(sa.Column('willing_to_relocate', sa.Boolean(), nullable=True))
        batch_op.add_column(sa.Column('available_start_date', sa.Date(), nullable=True))
        batch_op.add_column(sa.Column('language_proficiency', sa.String(length=255), nullable=True))
        batch_op.alter_column('preferred_location',
               existing_type=sa.VARCHAR(length=50),
               type_=sa.String(length=100),
               existing_nullable=True)
        batch_op.alter_column('languages',
               existing_type=sa.VARCHAR(length=50),
               type_=sa.String(length=255),
               existing_nullable=True)
        batch_op.drop_column('experience')
        batch_op.drop_column('desired_role')

    # ### end Alembic commands ###


def downgrade():
    # ### commands auto generated by Alembic - please adjust! ###
    with op.batch_alter_table('user', schema=None) as batch_op:
        batch_op.add_column(sa.Column('desired_role', sa.VARCHAR(length=50), nullable=True))
        batch_op.add_column(sa.Column('experience', sa.VARCHAR(length=10), nullable=True))
        batch_op.alter_column('languages',
               existing_type=sa.String(length=255),
               type_=sa.VARCHAR(length=50),
               existing_nullable=True)
        batch_op.alter_column('preferred_location',
               existing_type=sa.String(length=100),
               type_=sa.VARCHAR(length=50),
               existing_nullable=True)
        batch_op.drop_column('language_proficiency')
        batch_op.drop_column('available_start_date')
        batch_op.drop_column('willing_to_relocate')
        batch_op.drop_column('job_type')
        batch_op.drop_column('preferred_salary')
        batch_op.drop_column('soft_skills')
        batch_op.drop_column('technical_skills')
        batch_op.drop_column('skills')
        batch_op.drop_column('certifications')
        batch_op.drop_column('industry')
        batch_op.drop_column('previous_jobs')
        batch_op.drop_column('experience_years')
        batch_op.drop_column('field_of_study')
        batch_op.drop_column('graduation_year')
        batch_op.drop_column('university_name')
        batch_op.drop_column('highest_education')
        batch_op.drop_column('gender')
        batch_op.drop_column('date_of_birth')

    # ### end Alembic commands ###
