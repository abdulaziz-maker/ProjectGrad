# app/utils/recommender.py

from app.models import Job, User
from sqlalchemy.orm import joinedload

class Recommender:
    @staticmethod
    def parse_experience(exp_string):
        """ يحاول يقرأ سنوات الخبرة كرقم """
        if not exp_string:
            return 0
        exp_string = exp_string.strip().lower()
        if '+' in exp_string:
            return float(exp_string.replace('+', '').strip())
        elif '-' in exp_string:
            return float(exp_string.split('-')[0].strip())
        else:
            try:
                return float(exp_string)
            except:
                return 0

    @staticmethod
    def recommend_jobs_for_user(user, limit=10):
        if not user:
            return []

        all_jobs = Job.query.options(joinedload(Job.employer)).all()
        scored_jobs = []

        for job in all_jobs:
            match_percent = Recommender.calculate_match_percent(user, job)
            if match_percent >= 50:
                scored_jobs.append((job, match_percent))

        scored_jobs.sort(key=lambda x: x[1], reverse=True)
        return scored_jobs[:limit]

    @staticmethod
    def calculate_match_percent(user, job):
        """تحسب نسبة التطابق بين مستخدم محدد ووظيفة محددة"""
        if not user or not job:
            return 0

        match_score = 0
        total_weight = 0

        # 🎯 التخصص (32%)
        industry_weight = 32
        if user.industry and job.industry:
            if user.industry.strip().lower() == job.industry.strip().lower():
                match_score += industry_weight
        total_weight += industry_weight

        # 📜 الشهادات (25%)
        cert_weight = 25
        if user.certifications and job.qualifications:
            user_certs = [c.strip().lower() for c in user.certifications.split(',')]
            job_certs = [c.strip().lower() for c in job.qualifications.split(',')]
            matches = sum(1 for cert in user_certs if cert in job_certs)
            if job_certs:
                percent_match = (matches / len(job_certs)) * cert_weight
                match_score += percent_match
        total_weight += cert_weight

        # 💼 المهارات العامة (3%)
        skills_weight = 3
        if user.skills and job.skills_required:
            user_skills = [s.strip().lower() for s in user.skills.split(',')]
            job_skills = [s.strip().lower() for s in job.skills_required.split(',')]
            matches = sum(1 for skill in user_skills if skill in job_skills)
            if job_skills:
                percent_match = (matches / len(job_skills)) * skills_weight
                match_score += percent_match
        total_weight += skills_weight

        # 🔧 المهارات التقنية (7%)
        tech_skills_weight = 7
        if user.technical_skills and job.skills_required:
            user_tech_skills = [s.strip().lower() for s in user.technical_skills.split(',')]
            job_skills = [s.strip().lower() for s in job.skills_required.split(',')]
            matches = sum(1 for skill in user_tech_skills if skill in job_skills)
            if job_skills:
                percent_match = (matches / len(job_skills)) * tech_skills_weight
                match_score += percent_match
        total_weight += tech_skills_weight

        # 🗣️ المهارات الشخصية (3%)
        soft_skills_weight = 3
        if user.soft_skills and job.skills_required:
            user_soft_skills = [s.strip().lower() for s in user.soft_skills.split(',')]
            job_skills = [s.strip().lower() for s in job.skills_required.split(',')]
            matches = sum(1 for skill in user_soft_skills if skill in job_skills)
            if job_skills:
                percent_match = (matches / len(job_skills)) * soft_skills_weight
                match_score += percent_match
        total_weight += soft_skills_weight

        # 📍 الموقع المفضل (5%)
        location_weight = 5
        if user.preferred_location and job.location:
            if user.preferred_location.strip().lower() in job.location.strip().lower():
                match_score += location_weight
        total_weight += location_weight

        # 📊 سنوات الخبرة (25%)
        exp_weight = 25
        if user.experience_years and job.experience_required:
            try:
                user_exp = Recommender.parse_experience(user.experience_years)
                job_exp = Recommender.parse_experience(job.experience_required)
                if user_exp >= job_exp:
                    match_score += exp_weight  # ✅ أعلى أو مساوي = ياخذ النقاط كاملة
            except:
                pass
        total_weight += exp_weight

        # ✅ نحسب نسبة التطابق النهائية
        match_percent = round((match_score / total_weight) * 100, 2)
        return match_percent
