from app import db, create_app
from app.models import User

app = create_app()

with app.app_context():
    user = User.query.first()  # نحاول جلب أي مستخدم
    if user:
        print(f"✅ المستخدم موجود بالفعل: {user.name} - {user.email}")
    else:
        print("❌ لا يوجد مستخدم، سيتم إنشاء مستخدم جديد...")
        new_user = User(name="Admin", email="admin@example.com", password="admin123", role="Admin")
        db.session.add(new_user)
        db.session.commit()
        print("🎉 تم إنشاء المستخدم بنجاح!")
        print("📌 استخدم هذه البيانات لتسجيل الدخول:")
        print("📧 Email: admin@example.com")
        print("🔑 Password: admin123")