import os

class Config:
    # مفتاح سري لحماية الجلسات
    SECRET_KEY = os.getenv('SECRET_KEY', 'supersecretkey')
    
    SESSION_PERMANENT = False 
    SESSION_TYPE = "filesystem"

    # تحديد المسار الأساسي للمشروع
    BASE_DIR = os.path.abspath(os.path.dirname(__file__))
    SESSION_COOKIE_SECURE = False
    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = "Lax"

    # قاعدة بيانات SQLite
    SQLALCHEMY_DATABASE_URI = f"sqlite:///{os.path.join(BASE_DIR, 'yusur.db')}"
    SQLALCHEMY_TRACK_MODIFICATIONS = False  # تعطيل التعديلات التلقائية لتوفير الأداء

    # مسار مجلد رفع الملفات (الشهادات)
    UPLOAD_FOLDER = os.path.join(BASE_DIR, 'uploads/certificates')

    # مسار رفع صور الملف الشخصي
    PROFILE_PIC_FOLDER = os.path.join(BASE_DIR, 'static/profile_pics')

    # أنواع الملفات المسموح برفعها
    ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'pdf'}

    @staticmethod
    def init_app(app):
        """دالة يمكن استخدامها مستقبلاً لتهيئة الإعدادات إذا لزم الأمر."""
        pass