from flask_wtf import FlaskForm
from wtforms import StringField, PasswordField, SubmitField, TextAreaField, FileField, SelectField,IntegerField
from wtforms.validators import DataRequired, Email, EqualTo, Length, Optional,NumberRange

class RegistrationForm(FlaskForm):
    username = StringField("اسم المستخدم", validators=[DataRequired(), Length(min=3, max=20)])
    email = StringField("البريد الإلكتروني", validators=[DataRequired(), Email()])
    password = PasswordField("كلمة المرور", validators=[DataRequired(), Length(min=6)])
    confirm_password = PasswordField("تأكيد كلمة المرور", validators=[DataRequired(), EqualTo('password')])
    role = SelectField("نوع الحساب", choices=[("JobSeeker", "باحث عن عمل"), ("Employer", "صاحب عمل")], validators=[DataRequired()])
    company_name = StringField("اسم الشركة", validators=[Length(max=100)])  # يظهر فقط إذا كان المستخدم "صاحب عمل"
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
    
class EmployerJobForm(FlaskForm):
    job_title = StringField("اسم الوظيفة", validators=[DataRequired(), Length(min=3, max=100)])
    job_type = SelectField(
        "نوع الوظيفة", 
        choices=[
            ("full_time", "دوام كامل"), 
            ("part_time", "دوام جزئي"), 
            ("freelance", "عمل حر")
        ], 
        validators=[DataRequired()]
    )
    industry = SelectField(
        "مجال الوظيفة",
        choices=[
            ("it", "تقنية المعلومات"),
            ("finance", "المالية"),
            ("education", "التعليم"),
            ("healthcare", "الرعاية الصحية"),
            ("engineering", "الهندسة"),
            ("marketing", "التسويق")
        ],
        validators=[DataRequired()]
    )
    skills_required = TextAreaField("المهارات المطلوبة", validators=[DataRequired(), Length(min=3, max=500)])
    qualifications = TextAreaField("المؤهلات المطلوبة", validators=[DataRequired(), Length(min=3, max=500)])
    experience_required = IntegerField("سنوات الخبرة المطلوبة", validators=[DataRequired(), NumberRange(min=0, max=30)])
    salary = IntegerField("الراتب (ريال)", validators=[DataRequired(), NumberRange( max=100000)])
    location = StringField("الموقع", validators=[DataRequired(), Length(min=3, max=100)])
    submit = SubmitField("إضافة الوظيفة")
    description = TextAreaField("وصف الوظيفة", validators=[DataRequired(), Length(min=3, max=1000)]) 
    #company = StringField("اسم الشركة", validators=[DataRequired(), Length(min=3, max=100)])  # تأكد من أنه موجود!