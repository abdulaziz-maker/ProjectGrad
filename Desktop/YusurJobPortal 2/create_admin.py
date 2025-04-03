from app import db, create_app
from app.models import User

app = create_app()

with app.app_context():
    # تحقق مما إذا كان هناك بالفعل حساب أدمن
    admin_exists = User.query.filter_by(role="Admin").first()
    
    if not admin_exists:
        # إنشاء حساب أدمن جديد
        admin_user = User(name="admin", email="admin@admin.com", password="admin", role="Admin")
        db.session.add(admin_user)
        db.session.commit()
        print("✅ تم إنشاء حساب الأدمن بنجاح!")
    else:
        print("⚠️ هناك بالفعل حساب أدمن في النظام.")