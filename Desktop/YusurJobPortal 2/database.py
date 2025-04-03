
from flask import Flask
from flask_sqlalchemy import SQLAlchemy
import os

# إنشاء التطبيق
app = Flask(__name__)

# تحديد مسار قاعدة البيانات SQLite
BASE_DIR = os.path.abspath(os.path.dirname(__file__))
app.config['SQLALCHEMY_DATABASE_URI'] = f"sqlite:///{os.path.join(BASE_DIR, 'yusur.db')}"
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

# إنشاء كائن SQLAlchemy
db = SQLAlchemy(app)

# تعريف نموذج للمستخدمين
class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    email = db.Column(db.String(100), unique=True, nullable=False)

    def __repr__(self):
        return f"<User {self.name}>"

# تشغيل التطبيق داخل سياق التطبيق الصحيح
if __name__ == "__main__":
    with app.app_context():
        db.create_all()
        print("✅ تم إنشاء قاعدة البيانات والجداول بنجاح!")

        # إضافة بيانات جديدة إلى جدول users (إن لم تكن موجودة)
        if not User.query.first():  # التحقق إذا كانت قاعدة البيانات فارغة
            new_user = User(name="Ali", email="ali@example.com")
            db.session.add(new_user)
            db.session.commit()
            print("✅ تم إضافة مستخدم جديد!")

        # جلب جميع المستخدمين من قاعدة البيانات وعرضهم في الـ Terminal
        users = User.query.all()
        print("📌 قائمة المستخدمين:")
        for user in users:
            print(f"👤 {user.id}: {user.name} - {user.email}")
