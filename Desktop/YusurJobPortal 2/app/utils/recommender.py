# app/utils/recommender.py

from app.models import Job, User
from sqlalchemy import or_

class Recommender:
    @staticmethod
    def recommend_jobs_for_user(user, limit=5):
        if not user:
            return []

        query = Job.query

        filters = []
        if user.preferred_location:
            filters.append(Job.location.ilike(f"%{user.preferred_location}%"))

        if user.industry:
            filters.append(Job.industry.ilike(f"%{user.industry}%"))

        if user.skills:
            for skill in user.skills.split(','):
                filters.append(Job.skills_required.ilike(f"%{skill.strip()}%"))

        recommended_jobs = query.filter(or_(*filters)).limit(limit).all()
        return recommended_jobs

    @staticmethod
    def recommend_users_for_job(job, limit=5):
        if not job:
            return []

        query = User.query.filter_by(role="JobSeeker")

        filters = []
        if job.location:
            filters.append(User.preferred_location.ilike(f"%{job.location}%"))

        if job.industry:
            filters.append(User.industry.ilike(f"%{job.industry}%"))

        if job.skills_required:
            for skill in job.skills_required.split(','):
                filters.append(User.skills.ilike(f"%{skill.strip()}%"))

        recommended_users = query.filter(or_(*filters)).limit(limit).all()
        return recommended_users