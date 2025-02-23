from app import db
from flask_login import UserMixin
from datetime import datetime

class User(db.Model, UserMixin):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    email = db.Column(db.String(100), unique=True, nullable=False)
    password = db.Column(db.String(100), nullable=False)
    role = db.Column(db.String(20), nullable=False, default="JobSeeker")  # JobSeeker أو Employer فقط
    certificates = db.relationship('Certificate', backref='user', lazy=True)
    jobs = db.relationship('Job', backref='employer', lazy=True)

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
    
    def __repr__(self):
        return f"<Job {self.title} at {self.company}>"

class Certificate(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    file_path = db.Column(db.String(255), nullable=False)
    uploaded_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    def __repr__(self):
        return f"<Certificate {self.file_path} uploaded by User {self.user_id}>"
