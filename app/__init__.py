from flask import Flask
from flask_sqlalchemy import SQLAlchemy
from flask_migrate import Migrate
from flask_login import LoginManager
from config import Config

# ✅ إنشاء متغير `db` مرة واحدة فقط
db = SQLAlchemy()
migrate = Migrate()
login_manager = LoginManager()

def create_app():
    app = Flask(__name__)
    app.config.from_object(Config)

    # ✅ ربط `db` و `migrate` و `login_manager` مع التطبيق
    db.init_app(app)
    migrate.init_app(app, db)
    login_manager.init_app(app)

    # ✅ استيراد النماذج بعد تهيئة `db`
    from app import models

    # ✅ إعداد تسجيل الدخول
    login_manager.login_view = "main.login"
    login_manager.login_message = "⚠️ الرجاء تسجيل الدخول للوصول إلى هذه الصفحة!"
    login_manager.login_message_category = "warning"

    # ✅ تعريف `user_loader`
    @login_manager.user_loader
    def load_user(user_id):
        return models.User.query.get(int(user_id))

    # ✅ تسجيل Blueprints
    from app.models import User  # استيراد النماذج بعد تهيئة db
    from app.routes import main
    app.register_blueprint(main)

    return app
