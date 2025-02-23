from flask_wtf import FlaskForm
from wtforms import StringField, PasswordField, SubmitField, TextAreaField, FileField, SelectField
from wtforms.validators import DataRequired, Email, EqualTo, Length

class RegistrationForm(FlaskForm):
    """نموذج تسجيل المستخدم الجديد"""
    name = StringField('الاسم', validators=[DataRequired()])
    email = StringField('البريد الإلكتروني', validators=[DataRequired(), Email()])
    password = PasswordField('كلمة المرور', validators=[DataRequired()])
    role = SelectField('نوع الحساب', choices=[('JobSeeker', 'باحث عن عمل'), ('Employer', 'صاحب عمل')], validators=[DataRequired()])
    
    submit = SubmitField('تسجيل')

class LoginForm(FlaskForm):
    """نموذج تسجيل الدخول"""
    email = StringField('البريد الإلكتروني', validators=[DataRequired(), Email()])
    password = PasswordField('كلمة المرور', validators=[DataRequired()])
    submit = SubmitField('تسجيل الدخول')

class JobForm(FlaskForm):
    """نموذج لإضافة وظيفة جديدة"""
    title = StringField('عنوان الوظيفة', validators=[DataRequired()])
    description = TextAreaField('وصف الوظيفة', validators=[DataRequired()])
    company = StringField('اسم الشركة', validators=[DataRequired()])
    submit = SubmitField('إضافة الوظيفة')

class CertificateForm(FlaskForm):
    file_path = FileField('رفع الشهادة', validators=[DataRequired()])
    submit = SubmitField('رفع الشهادة')