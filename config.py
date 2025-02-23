import os

class Config:
    SECRET_KEY = os.getenv('SECRET_KEY', 'supersecretkey')  # مفتاح سري لحماية الجلسات
    BASE_DIR = os.path.abspath(os.path.dirname(__file__))  # المسار الأساسي للمشروع
    SQLALCHEMY_DATABASE_URI = f"sqlite:///{os.path.join(BASE_DIR, 'yusur.db')}"  # قاعدة بيانات SQLite
    SQLALCHEMY_TRACK_MODIFICATIONS = False  # تعطيل التعديلات التلقائية لتوفير الأداء

    # إعدادات أخرى (مستقبلية)
    UPLOAD_FOLDER = os.path.join(BASE_DIR, 'uploads/certificates')  # مجلد رفع الشهادات

    @staticmethod
    def init_app(app):
        """دالة إضافية يمكن استخدامها مستقبلاً لتهيئة الإعدادات إذا لزم الأمر."""
        pass
