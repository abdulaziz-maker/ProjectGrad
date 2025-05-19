from flask import Flask
from flask_sqlalchemy import SQLAlchemy
from flask_migrate import Migrate
from flask_login import LoginManager
from flask_mail import Mail  # ✅ استيراد Mail
from config import Config  

# تهيئة الإضافات مرة وحدة
db = SQLAlchemy()
migrate = Migrate()
login_manager = LoginManager()
mail = Mail()  # ✅ هنا صح

def create_app():
    app = Flask(__name__)
    app.config.from_object(Config)

    # ربط الإضافات بالتطبيق
    db.init_app(app)
    migrate.init_app(app, db)
    login_manager.init_app(app)
    mail.init_app(app)  # ✅ هنا ربط mail بالتطبيق

    # استيراد النماذج بعد تهيئة db
    from app import models

    # إعداد تسجيل الدخول
    login_manager.login_view = "main.login"
    login_manager.login_message = "⚠️ الرجاء تسجيل الدخول للوصول إلى هذه الصفحة!"
    login_manager.login_message_category = "warning"

    # user_loader
    @login_manager.user_loader
    def load_user(user_id):
        return models.User.query.get(int(user_id))

    # تسجيل Blueprints
    from app.routes import main
    app.register_blueprint(main)

    return app  
