from app import db
from flask_login import UserMixin
from datetime import datetime, date
from flask_sqlalchemy import SQLAlchemy

class User(db.Model, UserMixin):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(100), unique=True, nullable=False)
    email = db.Column(db.String(100), unique=True, nullable=False)
    password = db.Column(db.String(100), nullable=False)
    role = db.Column(db.String(20), nullable=False, default="JobSeeker")
    company_name = db.Column(db.String(100), nullable=True)  # اسم الشركة لصاحب العمل فقط
    notifications_enabled = db.Column(db.Boolean, default=True)  # تفعيل الإشعارات
    theme = db.Column(db.String(10), default="light")  # الوضع الفاتح افتراضيًا

    def is_admin(self):
        return self.role == "Admin"

    def is_employer(self):
        return self.role == "Employer"

    def is_job_seeker(self):
        return self.role == "JobSeeker"

class Job(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(200), nullable=False)
    description = db.Column(db.Text, nullable=True)
    company = db.Column(db.String(100), nullable=False)
    location = db.Column(db.String(100), nullable=False)  # ✅ إضافة الموقع    
    employer_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    industry = db.Column(db.String(100), nullable=True)  # ✅ إضافة هذا العمود
    # الحقول الجديدة
    salary = db.Column(db.String(50), nullable=True)  # الراتب
    job_type = db.Column(db.String(50), nullable=False, default="Full-time")  # نوع الوظيفة
    experience_required = db.Column(db.String(50), nullable=True)  # الخبرة المطلوبة
    qualifications = db.Column(db.Text, nullable=True)  # المؤهلات
    skills_required = db.Column(db.Text, nullable=True) 
    posted_date = db.Column(db.Date, nullable=False, default=date.today)  # ✅ تأكد أنه `db.Date`
    def __repr__(self):
        return f"<Job {self.title} at {self.company}>"

class Certificate(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    file_path = db.Column(db.String(255), nullable=False)
    uploaded_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    def __repr__(self):
        return f"<Certificate {self.file_path} uploaded by User {self.user_id}>"
