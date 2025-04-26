# app/utils/recommender.py

from app.models import Job, User
from sqlalchemy import or_

class Recommender:
    @staticmethod
    def recommend_jobs_for_user(user, limit=10):
        if not user:
            return []

        all_jobs = Job.query.all()
        scored_jobs = []

        for job in all_jobs:
            score = 0

            # المهارات
            if user.skills and job.skills_required:
                user_skills = [s.strip().lower() for s in user.skills.split(',')]
                job_skills = [s.strip().lower() for s in job.skills_required.split(',')]
                for skill in user_skills:
                    if skill in job_skills:
                        score += 2

            # المجال الصناعي
            if user.industry and job.industry and user.industry.lower() in job.industry.lower():
                score += 2

            # الموقع المفضل
            if user.preferred_location and job.location and user.preferred_location.lower() in job.location.lower():
                score += 1

            # الشهادات (qualifications)
            if user.certifications and job.qualifications:
                user_certs = [c.strip().lower() for c in user.certifications.split(',')]
                job_certs = [c.strip().lower() for c in job.qualifications.split(',')]
                for cert in user_certs:
                    if cert in job_certs:
                        score += 2

            # الخبرة
            if user.experience_years and job.experience_required:
                try:
                    if int(user.experience_years) >= int(job.experience_required):
                        score += 1
                except:
                    pass

            if score > 0:
                scored_jobs.append((job, score))

        scored_jobs.sort(key=lambda x: x[1], reverse=True)
        recommended_jobs = [job for job, score in scored_jobs[:limit]]
        return recommended_jobs
