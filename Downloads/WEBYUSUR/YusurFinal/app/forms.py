from flask_wtf import FlaskForm
from wtforms import StringField, PasswordField, SubmitField, TextAreaField, FileField, SelectField,IntegerField,DateField
from wtforms.validators import DataRequired, Email, EqualTo, Length, Optional,NumberRange

class RegistrationForm(FlaskForm):
    username = StringField("اسم المستخدم", validators=[DataRequired(), Length(min=3, max=20)])
    email = StringField("البريد الإلكتروني", validators=[DataRequired(), Email()])
    password = PasswordField("كلمة المرور", validators=[DataRequired(), Length(min=6)])
    confirm_password = PasswordField("تأكيد كلمة المرور", validators=[DataRequired(), EqualTo('password')])
    role = SelectField("نوع الحساب", choices=[("JobSeeker", "باحث عن عمل"), ("Employer", "صاحب عمل")], validators=[DataRequired()])
    # company_name = StringField("اسم الشركة", validators=[Length(max=100)])  # يظهر فقط إذا كان المستخدم "صاحب عمل"
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
    # company = StringField('اسم الشركة', validators=[DataRequired()])
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
    job_title = StringField("📌 اسم الوظيفة", validators=[DataRequired(), Length(min=3, max=100)])

    job_type = SelectField("💼 نوع الوظيفة", choices=[
        ("full_time", "دوام كامل"),
        ("part_time", "دوام جزئي"),
        ("remote", "عن بُعد"),
        ("freelance", "عمل حر")
    ], validators=[DataRequired()])

    industry = SelectField("🏭 المجال الصناعي", choices=[
        ("IT", "تقنية المعلومات"),
        ("Engineering", "الهندسة"),
        ("Marketing", "التسويق"),
        ("Education", "التعليم"),
        ("Finance", "المالية"),
        ("Healthcare", "الرعاية الصحية"),
        ("Other", "أخرى")
    ], validators=[DataRequired()])

    skills_required = TextAreaField("🛠️ المهارات المطلوبة", validators=[DataRequired(), Length(min=3, max=500)])

    qualifications = SelectField("🎓 المؤهلات المطلوبة", choices=[
        ("High School", "ثانوية عامة"),
        ("Diploma", "دبلوم"),
        ("Bachelor", "بكالوريوس"),
        ("Master", "ماجستير"),
        ("PhD", "دكتوراه"),
        ("Other", "أخرى")
    ], validators=[DataRequired()])

    experience_required = SelectField("📈 سنوات الخبرة المطلوبة", choices=[
        ("0", "بدون خبرة"),
        ("1-2", "1-2 سنوات"),
        ("3-5", "3-5 سنوات"),
        ("6+", "أكثر من 6 سنوات")
    ], validators=[DataRequired()])

    salary = StringField('💰 الراتب', validators=[Optional()])

    location = SelectField("📍 الموقع", choices=[
        ("riyadh", "الرياض"),
        ("jeddah", "جدة"),
        ("dammam", "الدمام"),
        ("abha", "أبها"),
        ("other", "أخرى")
    ], validators=[DataRequired()])

    description = TextAreaField("📝 وصف الوظيفة", validators=[DataRequired(), Length(min=3, max=1000)])

    submit = SubmitField("💼 إضافة الوظيفة")

class JobSeekerProfileForm(FlaskForm):

    # ✅ البيانات الأساسية
    date_of_birth = DateField("📅 تاريخ الميلاد (YYYY-MM-DD)", format='%Y-%m-%d', validators=[Optional()])
    gender = SelectField("👤 الجنس", choices=[("male", "ذكر"), ("female", "أنثى")], validators=[Optional()])

    # ✅ الخلفية التعليمية
    highest_education = SelectField("🎓 أعلى شهادة تعليمية", choices=[
        ("high_school", "ثانوي"),
        ("bachelor", "بكالوريوس"),
        ("master", "ماجستير"),
        ("phd", "دكتوراه")
    ], validators=[Optional()])
    university_name = StringField("🏫 اسم الجامعة", validators=[Optional()])
    graduation_year = StringField("📅 سنة التخرج", validators=[Optional()])
    field_of_study = StringField("📚 التخصص الأكاديمي", validators=[Optional()])

    # ✅ الخبرة المهنية
    experience_years = SelectField("📊 عدد سنوات الخبرة", choices=[
        ("0", "بدون خبرة"),
        ("1-2", "1-2 سنة"),
        ("3-5", "3-5 سنوات"),
        ("6+", "أكثر من 6 سنوات")
    ], validators=[DataRequired()])
    previous_jobs = TextAreaField("🏢 الوظائف السابقة", validators=[Optional()])
    industry = SelectField("🏭 المجال الصناعي", choices=[
        ("IT", "تقنية المعلومات"),
        ("Engineering", "الهندسة"),
        ("Finance", "المالية"),
        ("Marketing", "التسويق"),
        ("Healthcare", "الرعاية الصحية"),
        ("Other", "أخرى")
    ], validators=[Optional()])
    certifications = TextAreaField("📜 الشهادات المهنية", validators=[Optional()])

    # ✅ المهارات
    skills = TextAreaField("💼 المهارات", validators=[Optional()])
    technical_skills = TextAreaField("🔧 المهارات التقنية", validators=[Optional()])
    soft_skills = TextAreaField("🗣️ المهارات الشخصية", validators=[Optional()])

    # ✅ تفضيلات التوظيف
    preferred_location = SelectField("📍 الموقع المفضل", choices=[
        ("riyadh", "الرياض"),
        ("jeddah", "جدة"),
        ("dammam", "الدمام"),
        ("abha", "أبها"),
        ("other", "مدينة أخرى")
    ], validators=[DataRequired()])
    preferred_salary = SelectField("💰 الراتب المتوقع", choices=[
        ("3000-5000", "3000 - 5000 ريال"),
        ("5000-8000", "5000 - 8000 ريال"),
        ("8000-12000", "8000 - 12000 ريال"),
        ("12000+", "أكثر من 12000 ريال")
    ], validators=[DataRequired()])
    job_type = SelectField("🏢 نوع العمل المفضل", choices=[
        ("full-time", "دوام كامل"),
        ("part-time", "دوام جزئي"),
        ("remote", "عن بُعد"),
        ("freelance", "عمل حر")
    ], validators=[DataRequired()])
    willing_to_relocate = SelectField("🚚 القابلية للانتقال", choices=[
        ("yes", "نعم"),
        ("no", "لا")
    ], validators=[Optional()])
    available_start_date = DateField("📅 تاريخ بدء العمل المتوقع", format='%Y-%m-%d', validators=[Optional()])

    # ✅ اللغات
    languages = SelectField("🗣️ عدد اللغات", choices=[
        ("1", "لغة واحدة"),
        ("2", "لغتين"),
        ("3", "3 لغات"),
        ("4+", "أكثر من 4 لغات")
    ], validators=[DataRequired()])
    language_proficiency = SelectField("🎯 مستوى اللغة", choices=[
        ("beginner", "مبتدئ"),
        ("intermediate", "متوسط"),
        ("advanced", "متقدم")
    ], validators=[Optional()])

    submit = SubmitField("💾 حفظ التغييرات")
    
class EmployerProfileForm(FlaskForm):
    # company_name = StringField('🏢 اسم الشركة', validators=[DataRequired(), Length(max=100)])
    username = StringField("اسم الشركة", validators=[DataRequired()])
    email = StringField('📧 البريد الإلكتروني', validators=[DataRequired(), Email()])
    phone = StringField('📞 رقم الهاتف', validators=[Optional(), Length(min=8, max=15)])
    address = StringField('📍 العنوان', validators=[Optional(), Length(max=255)])
    bio = TextAreaField('📝 نبذة عن الشركة', validators=[Optional(), Length(max=500)])
    contact_method = StringField('💬 طريقة التواصل مع المرشحين', validators=[Optional(), Length(max=255)])
    submit = SubmitField('💾 حفظ التغييرات')
    
    
class ForgotPasswordForm(FlaskForm):
    email = StringField('البريد الإلكتروني', validators=[DataRequired(), Email()])
    submit = SubmitField('استعادة كلمة المرور')