from app import db
from flask_login import UserMixin
from datetime import datetime

class User(db.Model, UserMixin):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(100), unique=True, nullable=False)
    email = db.Column(db.String(100), unique=True, nullable=False)
    password = db.Column(db.String(100), nullable=False)
    role = db.Column(db.String(20), nullable=False, default="JobSeeker")

    notifications_enabled = db.Column(db.Boolean, default=True)
    theme = db.Column(db.String(10), default="light")
    profile_picture = db.Column(db.String(100), nullable=True, default="default_profile.png")

    # 🔹 البيانات الأساسية
    date_of_birth = db.Column(db.Date, nullable=True)
    gender = db.Column(db.String(10), nullable=True)

    # 🔹 الخلفية التعليمية
    highest_education = db.Column(db.String(50), nullable=True)
    university_name = db.Column(db.String(100), nullable=True)
    graduation_year = db.Column(db.Integer, nullable=True)
    field_of_study = db.Column(db.String(100), nullable=True)

    # 🔹 الخبرة المهنية
    experience_years = db.Column(db.String(10), nullable=True)
    previous_jobs = db.Column(db.Text, nullable=True)
    industry = db.Column(db.String(100), nullable=True)
    certifications = db.Column(db.Text, nullable=True)

    # 🔹 المهارات
    skills = db.Column(db.Text, nullable=True)
    technical_skills = db.Column(db.Text, nullable=True)
    soft_skills = db.Column(db.Text, nullable=True)

    # 🔹 تفضيلات التوظيف
    preferred_location = db.Column(db.String(100), nullable=True)
    preferred_salary = db.Column(db.String(20), nullable=True)
    job_type = db.Column(db.String(20), nullable=True)
    willing_to_relocate = db.Column(db.Boolean, default=False)
    available_start_date = db.Column(db.Date, nullable=True)

    # 🔹 اللغات
    languages = db.Column(db.String(255), nullable=True)
    language_proficiency = db.Column(db.String(255), nullable=True)

    def __repr__(self):
        return f'<User {self.username}>'

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
    posted_date = db.Column(db.DateTime, default=db.func.current_timestamp())
    employer_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)

    # 🔹 العلاقة مع المتقدمين (الباحثين عن عمل)
    applicants = db.relationship('Application', backref='job', lazy=True)

    def __repr__(self):
        return f"<Job {self.title} at {self.company}>"

class Certificate(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    file_path = db.Column(db.String(255), nullable=False)
    uploaded_at = db.Column(db.DateTime, default=datetime.utcnow)
    qr_code = db.Column(db.String(255), nullable=True)  # 🆕 حقل تخزين مسار QR Code

    def __repr__(self):
        return f"<Certificate {self.file_path} uploaded by User {self.user_id}>"

class Application(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    job_id = db.Column(db.Integer, db.ForeignKey('job.id'), nullable=False)
    applied_date = db.Column(db.DateTime, default=db.func.current_timestamp())

    # 🔹 ربط المتقدمين بالوظائف
    user = db.relationship('User', backref='applications', lazy=True)
