from flask_wtf import FlaskForm
from wtforms import StringField, PasswordField, SubmitField, TextAreaField, FileField, SelectField
from wtforms.validators import DataRequired, Email, EqualTo, Length, Optional

class RegistrationForm(FlaskForm):
    username = StringField("اسم المستخدم", validators=[DataRequired(), Length(min=3, max=20)])
    email = StringField("البريد الإلكتروني", validators=[DataRequired(), Email()])
    password = PasswordField("كلمة المرور", validators=[DataRequired(), Length(min=6)])
    confirm_password = PasswordField("تأكيد كلمة المرور", validators=[DataRequired(), EqualTo('password')])
    role = SelectField("نوع الحساب", choices=[("JobSeeker", "باحث عن عمل"), ("Employer", "صاحب عمل")], validators=[DataRequired()])
    submit = SubmitField("تسجيل")

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

class SettingsForm(FlaskForm):
    new_password = PasswordField("كلمة المرور الجديدة", validators=[Optional(), Length(min=6, max=100)])
    notifications = SelectField("الإشعارات", choices=[("enabled", "تفعيل"), ("disabled", "تعطيل")])
    theme = SelectField("وضع المظهر", choices=[("light", "الوضع الفاتح"), ("dark", "الوضع الليلي")])
    submit = SubmitField("حفظ التغييرات")

class ProfileForm(FlaskForm):
    username = StringField('اسم المستخدم', validators=[DataRequired(), Length(min=2, max=100)])
    email = StringField('البريد الإلكتروني', validators=[DataRequired(), Email()])
    phone = StringField('رقم الهاتف', validators=[Optional(), Length(min=8, max=15)])
    address = StringField('العنوان', validators=[Optional(), Length(max=100)])
    bio = StringField('نبذة شخصية', validators=[Optional(), Length(max=250)])
    profile_picture = FileField('صورة الملف الشخصي', validators=[Optional()])
    submit = SubmitField('حفظ التغييرات')