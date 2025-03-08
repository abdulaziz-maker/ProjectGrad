from flask import Flask
from flask_sqlalchemy import SQLAlchemy
from flask_migrate import Migrate
from flask_login import LoginManager
from config import Config

# ✅ تهيئة الإضافات
db = SQLAlchemy()
migrate = Migrate()
login_manager = LoginManager()

def create_app():
    app = Flask(__name__)
    app.config.from_object(Config)

    # ✅ ربط الإضافات بالتطبيق
    db.init_app(app)
    migrate.init_app(app, db)
    login_manager.init_app(app)

    # ✅ تحديد صفحة تسجيل الدخول الافتراضية
    login_manager.login_view = "main.login"
    login_manager.login_message = "⚠️ الرجاء تسجيل الدخول للوصول إلى هذه الصفحة!"
    login_manager.login_message_category = "warning"

    # ✅ استيراد النماذج بعد تهيئة `db` لتجنب الأخطاء
    from app import models

    @login_manager.user_loader
    def load_user(user_id):
        return User.query.get(int(user_id))

    # ✅ تسجيل `Blueprints`
    from app.routes import main
    app.register_blueprint(main, url_prefix="/")

    return app
