"""إعادة إنشاء جدول المستخدم

Revision ID: ee42e593faac
Revises: 945d0a48d530
Create Date: 2025-03-04 05:49:48.876577

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'ee42e593faac'
down_revision = '945d0a48d530'
branch_labels = None
depends_on = None


def upgrade():
    # ### commands auto generated by Alembic - please adjust! ###
    with op.batch_alter_table('user', schema=None) as batch_op:
        batch_op.add_column(sa.Column('username', sa.String(length=100), nullable=True))
        batch_op.add_column(sa.Column('phone', sa.String(length=15), nullable=True))
        batch_op.add_column(sa.Column('address', sa.String(length=100), nullable=True))
        batch_op.add_column(sa.Column('bio', sa.String(length=250), nullable=True))
        batch_op.add_column(sa.Column('profile_picture', sa.String(length=100), nullable=True))
        batch_op.create_unique_constraint("uq_user_username", ["username"])
        batch_op.create_unique_constraint("uq_user_phone", ["phone"])
        batch_op.drop_column('name')

    # تحديث جميع المستخدمين الحاليين وإعطائهم قيمة `username` مساوية لبريدهم الإلكتروني
    op.execute("UPDATE user SET username = email WHERE username IS NULL")

    # بعد تعيين القيم، اجعل العمود `username` غير قابل لأن يكون فارغًا
    with op.batch_alter_table('user', schema=None) as batch_op:
        batch_op.alter_column('username', existing_type=sa.String(length=100), nullable=False)

    # ### end Alembic commands ###



def downgrade():
    # ### commands auto generated by Alembic - please adjust! ###
    with op.batch_alter_table('user', schema=None) as batch_op:
        batch_op.add_column(sa.Column('name', sa.VARCHAR(length=100), nullable=False))
        batch_op.drop_constraint("uq_user_username", type_='unique')
        batch_op.drop_constraint("uq_user_phone", type_='unique')
        batch_op.drop_column('profile_picture')
        batch_op.drop_column('bio')
        batch_op.drop_column('address')
        batch_op.drop_column('phone')
        batch_op.drop_column('username')

    # ### end Alembic commands ###

