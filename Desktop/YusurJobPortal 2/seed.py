from app import db, create_app
from app.models import Job

# إنشاء التطبيق داخل السياق
app = create_app()

with app.app_context():
    # إنشاء بيانات وهمية
    new_job1 = Job(title="Software Engineer", description="Develop web applications.", company="Tech Corp", employer_id=1)
    new_job2 = Job(title="Data Scientist", description="Analyze large datasets.", company="AI Solutions", employer_id=1)

    # إضافة البيانات إلى الجلسة
    db.session.add(new_job1)
    db.session.add(new_job2)

    # تنفيذ التغييرات في قاعدة البيانات
    db.session.commit()

    print("🎉 تمت إضافة الوظائف بنجاح!")