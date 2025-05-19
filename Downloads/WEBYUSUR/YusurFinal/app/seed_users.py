import sys
import os
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app import create_app, db
from app.models import User
import random
from datetime import date

app = create_app()
app.app_context().push()

industries = ["IT", "Education", "Healthcare", "Engineering", "Marketing"]
locations = ["Riyadh", "Jeddah", "Dammam", "Khobar", "Makkah"]
job_types = ["Full-time", "Part-time", "Remote", "Freelance"]
skills_pool = ["Python", "Java", "SQL", "Excel", "Project Management", "Communication", "Django", "React", "AWS", "UI/UX"]
soft_skills = ["Teamwork", "Leadership", "Adaptability", "Creativity"]
technical_skills = ["Python", "Java", "React", "SQL", "Django", "AWS"]

def generate_user(role, index):
    name = f"{role}_{index}"
    email = f"{role}{index}@example.com"
    password = "pbkdf2:sha256:260000$abc$1234567890abcdef"

    base = User(
        username=name,
        email=email,
        password=password,
        role=role
    )

    # خصائص عامة
    base.location = random.choice(locations)
    base.industry = random.choice(industries)
    base.job_type = random.choice(job_types)
    base.skills = ",".join(random.sample(skills_pool, 3))
    base.technical_skills = ",".join(random.sample(technical_skills, 2))
    base.soft_skills = ",".join(random.sample(soft_skills, 2))
    base.bio = f"This is a sample bio for {name}."
    base.linkedin = f"https://linkedin.com/in/{name}"
    base.github = f"https://github.com/{name}"

    # خصائص الباحث عن عمل
    if role == "jobseeker":
        base.graduation_year = random.randint(2018, 2024)
        base.field_of_study = random.choice(["Computer Science", "Engineering", "Business", "Education"])
        base.university_name = random.choice(["KSU", "KAU", "KFUPM"])
        base.experience_years = random.randint(0, 5)
        base.previous_jobs = "Previous job 1, Previous job 2"
        base.preferred_location = random.choice(locations)
        base.preferred_salary = random.randint(6000, 15000)
        base.willing_to_relocate = True
        base.available_start_date = date(2025, 6, 1)
        base.certifications = "AWS Certified, PMP"
        base.languages = "English,Arabic"
        base.language_proficiency = "Fluent,Native"
        base.personality_type = "INTJ"
        base.personal_values = "Integrity,Ambition"
        base.achievement = "Developed an internal system at KSU"
    else:
        base.company_name = f"Company_{index}"

    return base

# إضافة المستخدمين
for i in range(1, 21):
    db.session.add(generate_user("jobseeker", i))
    db.session.add(generate_user("employer", i))

db.session.commit()
print("✅ تمت إضافة 40 مستخدم بنجاح!")