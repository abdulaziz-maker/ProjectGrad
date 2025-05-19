from flask import Blueprint, render_template, redirect, url_for, flash, request, Flask, current_app
from flask_login import login_user, logout_user, login_required, current_user, LoginManager
from app.models import Job, User, Certificate, db ,Application
from app.forms import LoginForm, JobForm, RegistrationForm, SettingsForm, ProfileForm, EmployerJobForm,JobSeekerProfileForm,EmployerProfileForm,ForgotPasswordForm
from werkzeug.security import generate_password_hash, check_password_hash
from werkzeug.utils import secure_filename
from app import db, login_manager,mail
from datetime import datetime, date
from PIL import Image
from flask_mail import  Message
import secrets
import os

main = Blueprint('main', __name__)
app = Flask(__name__)
app.secret_key = "your_secret_key"  # مطلوب لاستخدام flash messages

@login_manager.user_loader
def load_user(user_id):
    return User.query.get(int(user_id))

def save_picture(form_picture): #you have to check in github!!!!!#
    """حفظ صورة المستخدم في مجلد static/uploads"""
    upload_folder = os.path.join(current_app.root_path, 'static/uploads')

    if not os.path.exists(upload_folder):
        os.makedirs(upload_folder)

    random_hex = secrets.token_hex(8)
    _, f_ext = os.path.splitext(form_picture.filename)
    picture_filename = random_hex + f_ext
    picture_path = os.path.join(upload_folder, picture_filename)

    image = Image.open(form_picture)
    image.thumbnail((200, 200))
    image.save(picture_path)

    return picture_filename


@main.route('/')
def landing():
    if current_user.is_authenticated:
        if current_user.is_employer():
            return redirect(url_for('main.employer_dashboard'))
        elif current_user.is_job_seeker():
            return redirect(url_for('main.jobseeker_dashboard'))
        else:
            return redirect(url_for('main.admin_dashboard'))
    return render_template('landing.html')

@main.route('/login', methods=['GET', 'POST'])
def login():
    if current_user.is_authenticated:
        return redirect(url_for('main.home'))
    
    form = LoginForm()  # ⬅️ لازم أول شيء تعرف الفورم قبل تستخدمه

    print("🚨 فورم الدخوووول البيانات المرسلة:")
    print(request.form)
    print(f"✅ الفورم صالح؟ {form.validate_on_submit()}")
    print(form.errors)
    form = LoginForm()
    if form.validate_on_submit():
        user = User.query.filter_by(email=form.email.data).first()
        print(f"🔍 المستخدم المدخل: {form.email.data}, كلمة المرور: {form.password.data}")
        print(f"🔍 المستخدم الموجود في قاعدة البيانات: {user}")
        if current_user.is_authenticated:
            print(f"🔵 اسم الشركة الحالي عند الدخول: {current_user.username}")
        else:
            print("🔵 المستخدم غير مسجل دخول (Anonymous)")

        if user and check_password_hash(user.password, form.password.data):
            db.session.refresh(user)  # ✨✨ أضف هذا قبل تسجيل الدخول
            login_user(user, remember=True)
            flash("✅ تسجيل الدخول ناجح!", "success")
            print("✅ تسجيل الدخول ناجح!")

            if user.role == 'Admin':
                return redirect(url_for('main.admin_dashboard'))
            elif user.role == 'Employer':
                return redirect(url_for('main.employer_dashboard'))
            elif user.role == 'JobSeeker':
                return redirect(url_for('main.jobseeker_dashboard'))
            else:
                flash("⚠️ دور المستخدم غير معروف، تم إعادته إلى الصفحة الرئيسية.", "warning")
                return redirect(url_for('main.home'))
        else:
            flash("❌ البريد الإلكتروني أو كلمة المرور غير صحيحة!", "danger")
            print("❌ تسجيل الدخول فشل!")
    return render_template("login.html", form=form)


@main.route('/logout')
@login_required
def logout():
    logout_user()
    flash("🚪 تم تسجيل الخروج بنجاح!", "info")
    return redirect(url_for('main.landing'))

import uuid  # ✅ نحتاجه لتوليد اسم مستخدم عشوائي

@main.route('/register', methods=['GET', 'POST'])
def register():
    form = RegistrationForm()

    if form.validate_on_submit():
        hashed_password = generate_password_hash(form.password.data, method='pbkdf2:sha256')
        user_role = form.role.data if form.role.data in ["JobSeeker", "Employer"] else "JobSeeker"
        # company_name = form.company_name.data if user_role == "Employer" else None
        # if user_role == "Employer" and not company_name:
        #     flash("❗ يرجى إدخال اسم الشركة عند تسجيل صاحب العمل.", "danger")
        #     return redirect(url_for('main.register'))

        existing_user = User.query.filter_by(email=form.email.data).first()
        if existing_user:
            flash("❌ البريد الإلكتروني مسجل بالفعل. الرجاء استخدام بريد آخر.", "danger")
            return redirect(url_for('main.register'))

        new_user = User(
            username=form.username.data,#اسم الشركة لصاحب العمل!
            email=form.email.data,
            password=hashed_password,
            role=user_role,
            # company_name=company_name
        )
        db.session.add(new_user)
        db.session.commit()

        flash("🎉 تم إنشاء الحساب بنجاح! يمكنك الآن تسجيل الدخول.", "success")
        return redirect(url_for('main.login'))
    
    return render_template('register.html', form=form)

@main.route('/add-job', methods=['GET', 'POST'])
@login_required
def add_job():
    user = User.query.get(current_user.id)
    if current_user.role != 'Employer':
        flash("❌ لا يمكنك إضافة وظيفة! هذه الميزة متاحة فقط لأصحاب العمل.", "danger")
        return redirect(url_for('main.home'))
    db.session.refresh(current_user)
    
    form = EmployerJobForm()
    if form.validate_on_submit():
        company_name = user.username  # ← نحصل على اسم الشركة مباشرة من الحساب

        if not company_name:
            flash("❌ لا يمكن إنشاء الوظيفة بدون اسم الشركة. تأكد من إعداد ملفك الشخصي.", "danger")
            return redirect(url_for("main.profile"))

        new_job = Job(
            title=form.job_title.data,
            description=form.description.data, 
            job_type=form.job_type.data,
            industry=form.industry.data,
            skills_required=form.skills_required.data,
            qualifications=form.qualifications.data,
            experience_required=form.experience_required.data,
            salary=form.salary.data,
            location=form.location.data,
            employer_id=current_user.id,
            posted_date = datetime.today().date()  
           
        )
    
        db.session.add(new_job)
        db.session.commit()
        flash("🎉 تم إضافة الوظيفة بنجاح!", "success")
        return redirect(url_for("main.employer_dashboard"))
    else:
        print("❌ الفورم فيه أخطاء:")
        print(form.errors)
        

    return render_template('add_job.html', form=form ,user=user)

@main.route('/edit-job/<int:job_id>', methods=['GET', 'POST'])
@login_required
def edit_job(job_id):
    job = Job.query.get_or_404(job_id)

    if job.employer_id != current_user.id:
        flash("❌ لا يمكنك تعديل هذه الوظيفة!", "danger")
        return redirect(url_for('main.home'))

    form = EmployerJobForm(obj=job)
    if form.validate_on_submit():
        job.title = form.job_title.data
        job.job_type = form.job_type.data
        job.industry = form.industry.data
        job.skills_required = form.skills_required.data
        job.qualifications = form.qualifications.data
        job.experience_required = form.experience_required.data
        job.salary = form.salary.data
        job.location = form.location.data

        db.session.commit()
        flash("✅ تم تحديث الوظيفة بنجاح!", "success")
        return redirect(url_for('main.employer_dashboard'))

    return render_template('edit_job.html', form=form, job=job)

@main.route('/delete-job/<int:job_id>', methods=['POST', 'GET'])
@login_required
def delete_job(job_id):
    job = Job.query.get_or_404(job_id)

    if job.employer_id != current_user.id:
        flash("❌ لا يمكنك حذف هذه الوظيفة!", "danger")
        return redirect(url_for('main.employer_dashboard'))  # ✅ رجعه للوحة تحكم صاحب العمل

    db.session.delete(job)
    db.session.commit()
    flash("🗑️ تم حذف الوظيفة بنجاح!", "success")
    return redirect(url_for('main.employer_dashboard'))  # ✅ مو للاندنق، يرجع للوحة صاحب العمل

@main.route('/settings', methods=['GET', 'POST'])
@login_required
def settings():
    form = SettingsForm()

    if form.validate_on_submit():
        if form.new_password.data:
            current_user.password = generate_password_hash(form.new_password.data, method='pbkdf2:sha256')
        current_user.notifications_enabled = form.notifications.data == "enabled"
        current_user.theme = form.theme.data

        db.session.commit()
        flash("✅ تم تحديث الإعدادات بنجاح!", "success")
        return redirect(url_for("main.settings"))

    return render_template("settings.html", form=form)

@main.route('/profile', methods=['GET', 'POST'])
@login_required
def profile():
    if current_user.role == "Employer":
        form = EmployerProfileForm(obj=current_user)
    else:
        form = ProfileForm(obj=current_user)

    applied_jobs = Job.query.join(Job.applicants).filter(User.id == current_user.id).all()
    posted_jobs = Job.query.filter_by(employer_id=current_user.id).all()

    if form.validate_on_submit():
        print("DEBUG: contact_method =", form.contact_method.data)
        if current_user.role == "Employer":
            current_user.username = form.username.data
            current_user.email = form.email.data
            current_user.phone = form.phone.data
            current_user.address = form.address.data
            current_user.bio = form.bio.data
            current_user.contact_method = form.contact_method.data
            print("SAVED contact_method:", current_user.contact_method)

        else:
            current_user.username = form.username.data
            current_user.email = form.email.data
            current_user.phone = form.phone.data
            current_user.address = form.address.data
            current_user.bio = form.bio.data
            if form.profile_picture.data:
                picture_file = save_picture(form.profile_picture.data)
                current_user.profile_picture = picture_file

        db.session.commit()
        flash("✅ تم تحديث الملف الشخصي بنجاح!", "success")
        return redirect(url_for('main.profile'))


    return render_template('profile.html', form=form, applied_jobs=applied_jobs, posted_jobs=posted_jobs, user=current_user)

@main.route('/employer_dashboard')
@login_required
def employer_dashboard():
    if current_user.role != 'Employer':
        flash('❌ هذا القسم مخصص فقط لأصحاب العمل.', 'danger')
        return redirect(url_for('main.home'))
    
    # 🔥 هنا نجيب فقط الوظائف اللي مسويها المستخدم الحالي
    jobs = Job.query.filter_by(employer_id=current_user.id).order_by(Job.posted_date.desc()).all()
    
    return render_template('employer_dashboard.html', user=current_user, jobs=jobs)

@main.route('/jobseeker_dashboard')
@login_required
def jobseeker_dashboard():
    if current_user.role != 'JobSeeker':
        flash("❌ لا تملك صلاحية الوصول إلى هذه الصفحة!", "danger")
        return redirect(url_for('main.home'))
    
    jobs = Job.query.all()
    return render_template('jobseeker_dashboard.html', user=current_user,jobs=jobs)

@main.route('/upload_certificate', methods=['GET', 'POST'])
@login_required
def upload_certificate():
    if current_user.role != 'JobSeeker':
        flash("❌ لا يمكنك رفع شهادة، هذه الميزة متاحة فقط للباحثين عن عمل.", "danger")
        return redirect(url_for('main.home'))

    if request.method == 'POST':
        if 'certificate' not in request.files:
            flash('⚠️ لم يتم رفع أي ملف!', 'danger')
            return redirect(request.url)

        file = request.files['certificate']
        if file.filename == '':
            flash('⚠️ لم يتم اختيار ملف!', 'danger')
            return redirect(request.url)

        allowed_extensions = {'pdf', 'jpg', 'jpeg', 'png'}
        if '.' in file.filename and file.filename.rsplit('.', 1)[1].lower() not in allowed_extensions:
            flash('⚠️ نوع الملف غير مدعوم! يجب أن يكون PDF أو JPG أو PNG.', 'danger')
            return redirect(request.url)

        # حفظ الملف
        filename = secure_filename(file.filename)
        upload_path = os.path.join(current_app.root_path, 'static/uploads/certificates')
        if not os.path.exists(upload_path):
            os.makedirs(upload_path)
        file_path = os.path.join(upload_path, filename)
        file.save(file_path)

        # حفظ في قاعدة البيانات
        relative_path = f"uploads/certificates/{filename}"
        new_certificate = Certificate(user_id=current_user.id, file_path=relative_path)

        print(f"✅ تم تجهيز الشهادة للحفظ للمستخدم: {current_user.id}")
        print(f"📂 مسار الشهادة: {relative_path}")

        db.session.add(new_certificate)
        db.session.commit()

        flash('✅ تم رفع الشهادة بنجاح!', 'success')
        return redirect(url_for('main.upload_certificate'))
    certificates = Certificate.query.filter_by(user_id=current_user.id).all()
    return render_template('upload_certificate.html', certificates=certificates)
@main.route('/jobseeker-profile', methods=['GET', 'POST'])
@login_required
def jobseeker_profile():
    if current_user.role != "JobSeeker":
        flash("❌ لا يمكنك الوصول إلى هذه الصفحة!", "danger")
        return redirect(url_for("main.profile"))

    form = JobSeekerProfileForm(obj=current_user)

    if form.validate_on_submit():
        try:
            print("✅ يتم الآن حفظ البيانات في قاعدة البيانات...")

            # ✅ حفظ البيانات في قاعدة البيانات
            current_user.date_of_birth = form.date_of_birth.data
            current_user.gender = form.gender.data
            current_user.highest_education = form.highest_education.data
            current_user.university_name = form.university_name.data
            current_user.graduation_year = form.graduation_year.data
            current_user.field_of_study = form.field_of_study.data
            current_user.experience_years = form.experience_years.data
            current_user.previous_jobs = form.previous_jobs.data
            current_user.industry = form.industry.data
            current_user.certifications = form.certifications.data
            current_user.skills = form.skills.data
            current_user.technical_skills = form.technical_skills.data
            current_user.soft_skills = form.soft_skills.data
            current_user.preferred_location = form.preferred_location.data
            current_user.preferred_salary = form.preferred_salary.data
            current_user.job_type = form.job_type.data
            current_user.willing_to_relocate = True if form.willing_to_relocate.data == "yes" else False
            current_user.available_start_date = form.available_start_date.data
            current_user.languages = form.languages.data
            current_user.language_proficiency = form.language_proficiency.data

            print(f"📌 البيانات المحفوظة: {current_user}")

            # ✅ حفظ التغييرات في قاعدة البيانات
            db.session.commit()

            flash("✅ تم حفظ التعديلات بنجاح!", "success")
            return redirect(url_for("main.jobseeker_resume"))  # ✅ إعادة التوجيه لرؤية التغييرات

        except Exception as e:
            db.session.rollback()
            print(f"❌ خطأ أثناء حفظ البيانات: {e}")
            flash("❌ حدث خطأ أثناء حفظ البيانات، حاول مرة أخرى.", "danger")

    return render_template("jobseeker_profile.html", form=form)

@main.route('/update-profile', methods=['POST'])
@login_required
def update_profile():
    try:
        user = User.query.get(current_user.id)

        # 🔹 تحويل التواريخ
        date_of_birth_str = request.form.get("date_of_birth")
        if date_of_birth_str:
            user.date_of_birth = datetime.strptime(date_of_birth_str, "%Y-%m-%d").date()
        else:
            user.date_of_birth = None

        available_start_date_str = request.form.get("available_start_date")
        if available_start_date_str:
            user.available_start_date = datetime.strptime(available_start_date_str, "%Y-%m-%d").date()
        else:
            user.available_start_date = None

        # 🔹 الحقول الفردية
        user.gender = request.form.get("gender") or None
        user.highest_education = request.form.get("highest_education") or None
        user.university_name = request.form.get("university_name") or None
        user.graduation_year = request.form.get("graduation_year") or None
        user.field_of_study = request.form.get("field_of_study") or None
        user.experience_years = request.form.get("experience_years") or None
        user.previous_jobs = request.form.get("previous_jobs") or None
        user.industry = request.form.get("industry") or None
        user.certifications = request.form.get("certifications") or None
        user.preferred_location = request.form.get("preferred_location") or None
        user.preferred_salary = request.form.get("preferred_salary") or None
        user.job_type = request.form.get("job_type") or None
        user.willing_to_relocate = request.form.get("willing_to_relocate") == "yes"
        user.languages = request.form.get("languages") or None
        user.language_proficiency = request.form.get("language_proficiency") or None
       # modified! :
       # 🔹 الحقول النصية للمهارات
        user.skills = request.form.get("skills") or None
        user.technical_skills = request.form.get("technical_skills") or None
        user.soft_skills = request.form.get("soft_skills") or None

        db.session.commit()
        flash("✅ تم حفظ التغييرات بنجاح!", "success")
        return redirect(url_for('main.jobseeker_resume'))

    except Exception as e:
        db.session.rollback()
        print("❌ خطأ أثناء تحديث الملف الشخصي:", str(e))
        flash("❌ حدث خطأ أثناء حفظ البيانات، حاول مرة أخرى!", "danger")
        return redirect(url_for('main.jobseeker_profile'))
    
@main.route('/jobseeker-resume', methods=['GET'])
@login_required
def jobseeker_resume():
    return render_template('jobseeker_resume.html', user=current_user)

@main.route('/update_personal_profile', methods=['POST'])
@login_required
def update_personal_profile():
    try:
        user = User.query.get(current_user.id)

        # ✅ تحديث الحقول المشتركة
        user.username = request.form.get("username")
        user.email = request.form.get("email")
        user.phone = request.form.get("phone")
        user.address = request.form.get("address")

        # ✅ تحديث بناءً على نوع المستخدم
        if user.is_employer():
            user.bio = request.form.get("bio")
            # أصحاب العمل ما يحتاجون تعديل على الشخصية والقيم والإنجازات
        elif user.is_job_seeker():
            user.bio = request.form.get("bio")
            user.personality_type = request.form.get("personality_type")
            user.linkedin = request.form.get("linkedin")
            user.twitter = request.form.get("twitter")
            user.github = request.form.get("github")
            user.personal_values = request.form.get("values")
            user.achievement = request.form.get("achievement")

        # ✅ تحديث الصورة الشخصية إذا وجدت
        if 'profile_picture' in request.files:
            file = request.files['profile_picture']
            if file and file.filename:
                filename = secure_filename(file.filename)
                upload_path = os.path.join(current_app.root_path, 'static/profile_pics')
                if not os.path.exists(upload_path):
                    os.makedirs(upload_path)
                file_path = os.path.join(upload_path, filename)
                file.save(file_path)
                user.profile_picture = filename

        db.session.commit()
        flash('✅ تم تحديث الملف الشخصي بنجاح', 'success')
        return redirect(url_for('main.user_profile'))

    except Exception as e:
        db.session.rollback()
        print("❌ خطأ أثناء تحديث الملف الشخصي:", str(e))
        flash('❌ حدث خطأ أثناء حفظ البيانات، حاول مرة أخرى.', 'danger')
        return redirect(url_for('main.profile'))
    
@main.route('/user-profile', methods=['GET'])
@login_required
def user_profile():
    return render_template('user_profile.html', user=current_user)

# 📌 راوت ترشيح وظائف للباحث:
# داخل routes.py
from app.utils.recommender import Recommender

@main.route('/recommended_jobs')
@login_required
def recommended_jobs():
    # ✅ تحقق من اكتمال الملف الشخصي قبل عرض الوظائف الموصى بها
    if not is_profile_complete(current_user):
        flash("⚠️ يجب تعبئة جميع بيانات ملفك الشخصي أولاً قبل مشاهدة الوظائف الموصى بها.", "warning")
        return redirect(url_for('main.jobseeker_profile'))

    recommended = Recommender.recommend_jobs_for_user(current_user, limit=10)

    # ✅ ربط اسم الشركة من جدول المستخدم لو ناقصة
    for job, _ in recommended:
        if not job.employer or not getattr(job.employer, "company_name", None):
            employer = User.query.get(job.employer_id)
            job.employer = employer

    return render_template('recommended_jobs.html', recommended_jobs=recommended)



# 📌 راوت ترشيح باحثين لوظيفة:
@main.route("/job/<int:job_id>/recommended")
@login_required
def recommend_users(job_id):
    from app.utils.recommender import Recommender
    job = Job.query.get_or_404(job_id)
    users = Recommender.recommend_users_for_job(job)
    return render_template("recommended_users.html", users=users)

@main.route('/job/<int:job_id>')
@login_required
def job_detail(job_id):
    job = Job.query.get_or_404(job_id)
    return render_template('job_detail.html', job=job)

@main.route('/apply/<int:job_id>', methods=['POST'])
@login_required
def apply_job(job_id):
    job = Job.query.get_or_404(job_id)

    existing_application = Application.query.filter_by(user_id=current_user.id, job_id=job.id).first()
    if existing_application:
        message = "⚠️ لقد تقدمت بالفعل على هذه الوظيفة."
    else:
        new_application = Application(user_id=current_user.id, job_id=job.id, status="قيد المراجعة")
        db.session.add(new_application)
        db.session.commit()
        message = "✅ تم التقديم على الوظيفة بنجاح!"

        # ✉️ إشعار لصاحب العمل عبر البريد الإلكتروني
        try:
            employer = User.query.get(job.employer_id)
            if employer and employer.email:
                subject = f"📥 طلب توظيف جديد لوظيفة: {job.title}"
                body = f"""مرحباً {employer.username},

تم تقديم طلب جديد على وظيفة "{job.title}" من المستخدم: {current_user.username}.

يمكنك مراجعة الطلب من خلال لوحة التحكم.

مع تحيات فريق Yusur.
"""
                msg = Message(subject, recipients=[employer.email])
                msg.body = body
                mail.send(msg)
                print(f"✅ تم إرسال إشعار لصاحب العمل: {employer.email}")
        except Exception as e:
            print(f"❌ فشل إرسال الإيميل لصاحب العمل: {str(e)}")

    return render_template('application_success.html', message=message)




@main.route('/my-applications')
@login_required
def my_applications():
    apps = Application.query.filter_by(user_id=current_user.id).all()
    return render_template('my_applications.html', applications=apps)

@main.route('/application/<int:app_id>/status/<string:new_status>', methods=['POST'])
@login_required
def update_application_status(app_id, new_status):
    app = Application.query.get_or_404(app_id)
    job = Job.query.get(app.job_id)
    
    if job.employer_id != current_user.id:
        flash("❌ ليس لديك صلاحية تعديل هذا الطلب.", "danger")
        return redirect(url_for('main.home'))

    app.status = new_status  # ✅ يتم تغيير الحالة
    db.session.commit()

    # ✉️ إرسال بريد إلكتروني للمستخدم
    try:
        subject = ""
        body = ""

        if new_status == "مقبول":
            subject = f"قبول طلبك في وظيفة {job.title}"
            body = f"مرحباً {app.user.username},\n\nنود إبلاغك أنه تم قبولك لوظيفة '{job.title}' في شركة {current_user.username}.\n\nبالتوفيق!"
        elif new_status == "مرفوض":
            subject = f"رفض طلبك في وظيفة {job.title}"
            body = f"مرحباً {app.user.username},\n\nنأسف لإبلاغك أنه تم رفض طلبك لوظيفة '{job.title}' في شركة {current_user.username}.\n\nنتمنى لك حظًا أوفر في المرات القادمة."

        if subject and body:
            msg = Message(subject, recipients=[app.user.email])
            msg.body = body
            mail.send(msg)
            print(f"✅ تم إرسال إيميل إلى: {app.user.email}")

    except Exception as e:
        print(f"❌ فشل إرسال الإيميل: {str(e)}")

    flash(f"✅ تم تحديث حالة الطلب إلى {new_status}", "success")
    return redirect(url_for('main.view_applicants', job_id=job.id))

@main.route('/my-jobs')
@login_required
def my_jobs():
    if current_user.role != 'Employer':
        flash("❌ لا يمكنك الوصول لهذه الصفحة.", "danger")
        return redirect(url_for('main.home'))

    jobs = Job.query.filter_by(employer_id=current_user.id).all()
    return render_template('my_jobs.html', jobs=jobs)

@main.route('/employer/applicants/<int:job_id>')
@login_required
def view_applicants(job_id):
    job = Job.query.get_or_404(job_id)
    if job.employer_id != current_user.id:
        flash("❌ لا يمكنك الوصول لهذه الصفحة.", "danger")
        return redirect(url_for('main.home'))

    applicants = Application.query.filter_by(job_id=job.id).all()

    # ✅ نحسب نسبة التطابق لكل متقدم ونحفظها في app.match_percent
    for app in applicants:
        app.match_percent = Recommender.calculate_match_percent(app.user, job)

    return render_template('view_applicants.html', job=job, applicants=applicants)


@main.route('/applicant-detail/<int:app_id>')
@login_required
def view_applicant_detail(app_id):
    app = Application.query.get_or_404(app_id)
    job = Job.query.get(app.job_id)

    if job.employer_id != current_user.id:
        flash("❌ لا يمكنك الوصول لهذه الصفحة.", "danger")
        return redirect(url_for('main.home'))

    user = app.user
    return render_template('applicant_detail.html', user=user, app=app, job=job)


@main.route('/admin-dashboard')
@login_required
def admin_dashboard():
    if current_user.role != 'Admin':
        flash("❌ لا يمكنك الوصول لهذه الصفحة.", "danger")
        return redirect(url_for('main.home'))

    total_users = User.query.count()
    job_seekers = User.query.filter_by(role='JobSeeker').count()
    employers = User.query.filter_by(role='Employer').count()
    total_jobs = Job.query.count()
    total_applications = Application.query.count()
    accepted_apps = Application.query.filter_by(status='مقبول').count()
    rejected_apps = Application.query.filter_by(status='مرفوض').count()
    pending_apps = Application.query.filter((Application.status == None) | (Application.status == 'قيد المراجعة')).count()

    # احضر أحدث وظيفة وأحدث مستخدم
    latest_job = Job.query.order_by(Job.posted_date.desc()).first()
    latest_user = User.query.order_by(User.id.desc()).first()
    # احسب نسب القبول والرفض
    acceptance_rate = round((accepted_apps / total_applications) * 100, 2) if total_applications else 0
    rejection_rate = round((rejected_apps / total_applications) * 100, 2) if total_applications else 0

    return render_template('admin_dashboard.html',
                           total_users=total_users,
                           job_seekers=job_seekers,
                           employers=employers,
                           total_jobs=total_jobs,
                           total_applications=total_applications,
                           accepted_apps=accepted_apps,
                           rejected_apps=rejected_apps,
                           pending_apps=pending_apps,
                           latest_job=latest_job,
                           latest_user=latest_user,
                           acceptance_rate=acceptance_rate,
                           rejection_rate=rejection_rate)


@main.route('/create-admin-once')
def create_admin_once():
   
    existing_admin = User.query.filter_by(email='a@a.com').first()
    if not existing_admin:
        hashed_password = generate_password_hash('aaaaaa')
        admin = User(
            username='a',
            email='a@a.com',
            password=hashed_password,
            role='Admin'
        )
        db.session.add(admin)
        db.session.commit()
        return "✅ تم إنشاء حساب الأدمن: admin@example.com / admin123"
    else:
        return "⚠️ الأدمن موجود مسبقًا."
from app import db

@main.route('/jobseeker-home')
@login_required
def jobseeker_home():
    if not current_user.is_job_seeker():
        flash('❌ الوصول مخصص للباحثين عن عمل فقط.', 'danger')
        return redirect(url_for('main.landing'))

    # ✅ التحقق من اكتمال الملف الشخصي
    if not is_profile_complete(current_user):
        flash("⚠️ يجب تعبئة جميع بيانات ملفك الشخصي أولاً قبل مشاهدة الوظائف.", "warning")
        return redirect(url_for('main.jobseeker_profile'))

    db.session.expire_all()  # ⬅️ هذا يجبر SQLAlchemy يجيب بيانات جديدة

    jobs = Job.query.order_by(Job.posted_date.desc()).all()
    return render_template('jobseeker_home.html', user=current_user, jobs=jobs)


# حذف شهادة
@main.route('/delete_certificate/<int:certificate_id>', methods=['POST'])
@login_required
def delete_certificate(certificate_id):
    cert = Certificate.query.get_or_404(certificate_id)
    if cert.user_id != current_user.id:
        flash('🚫 لا يمكنك حذف هذه الشهادة.', 'danger')
        return redirect(url_for('main.jobseeker_dashboard'))

    db.session.delete(cert)
    db.session.commit()
    flash('✅ تم حذف الشهادة بنجاح.', 'success')
    return redirect(request.referrer or url_for('main.jobseeker_dashboard'))

# عرض شهادة مباشرة
@main.route('/view_certificate/<int:certificate_id>')
@login_required
def view_certificate(certificate_id):
    cert = Certificate.query.get_or_404(certificate_id)
    if cert.user_id != current_user.id:
        flash('🚫 لا يمكنك عرض هذه الشهادة.', 'danger')
        return redirect(url_for('main.jobseeker_dashboard'))
    return redirect(url_for('static', filename=cert.file_path))

#جديد!
@main.route('/contact')
def contact():
    return render_template('contact.html')

@main.route('/forgot_password', methods=['GET', 'POST'])
def forgot_password():
    form = ForgotPasswordForm()
    if form.validate_on_submit():
        user = User.query.filter_by(email=form.email.data).first()
        if user:
            try:
                # ✅ توليد رمز استعادة مؤقت (مثال بسيط)
                token = secrets.token_urlsafe(16)
                reset_link = url_for('main.reset_password', token=token, _external=True)

                subject = '🔐 استرجاع كلمة المرور - Yusur Job Portal'
                body = f'''مرحباً {user.username},

لقد طلبت استعادة كلمة المرور الخاصة بك. يرجى الضغط على الرابط التالي لإعادة تعيين كلمة المرور:

{reset_link}

⚠️ إذا لم تطلب هذا الطلب، يرجى تجاهل هذه الرسالة.

مع تحيات فريق Yusur.
'''

                msg = Message(subject, recipients=[user.email])
                msg.body = body
                mail.send(msg)
                flash('✅ تم إرسال تعليمات استرجاع كلمة المرور إلى بريدك الإلكتروني.', 'success')
            except Exception as e:
                print(f"❌ خطأ أثناء إرسال البريد الإلكتروني: {e}")
                flash('❌ حدث خطأ أثناء إرسال البريد الإلكتروني. حاول مرة أخرى لاحقًا.', 'danger')
        else:
            flash('❌ البريد الإلكتروني غير موجود في النظام.', 'danger')
        return redirect(url_for('main.login'))
    return render_template('forgot_password.html', form=form)


from flask import g
from flask_login import current_user
from app.models import User
from app import db

@main.before_app_request
def refresh_user():
    if current_user.is_authenticated:
        try:
            db.session.expire_all()
        except Exception as e:
            db.session.rollback()
            print(f"⚠️ حصل خطأ أثناء تحديث بيانات المستخدم: {e}")
            

@main.route('/admin-stats')
@login_required
def admin_stats():
    if current_user.role != 'Admin':
        return "❌ لا تملك صلاحية.", 403

    total_users = User.query.count()
    job_seekers = User.query.filter_by(role='JobSeeker').count()
    employers = User.query.filter_by(role='Employer').count()
    total_jobs = Job.query.count()
    total_applications = Application.query.count()
    accepted_apps = Application.query.filter_by(status='مقبول').count()
    rejected_apps = Application.query.filter_by(status='مرفوض').count()
    pending_apps = Application.query.filter((Application.status == None) | (Application.status == 'قيد المراجعة')).count()

    latest_job = Job.query.order_by(Job.posted_date.desc()).first()
    latest_user = User.query.order_by(User.id.desc()).first()

    return render_template('partials/admin_stats.html',
                           total_users=total_users,
                           job_seekers=job_seekers,
                           employers=employers,
                           total_jobs=total_jobs,
                           total_applications=total_applications,
                           accepted_apps=accepted_apps,
                           rejected_apps=rejected_apps,
                           pending_apps=pending_apps,
                           latest_job=latest_job,
                           latest_user=latest_user)

@main.route('/admin/users')
@login_required
def all_users():
    if current_user.role != 'Admin':
        flash("❌ لا تملك صلاحية.", "danger")
        return redirect(url_for('main.home'))

    users = User.query.all()
    return render_template('all_users.html', users=users)

@main.route('/admin/delete-user/<int:user_id>', methods=['POST'])
@login_required
def delete_user(user_id):
    if current_user.role != 'Admin':
        flash("❌ لا تملك صلاحية.", "danger")
        return redirect(url_for('main.all_users'))

    user = User.query.get_or_404(user_id)

    if user.role == 'Admin':
        flash("❌ لا يمكن حذف حساب الأدمن.", "danger")
        return redirect(url_for('main.all_users'))

    db.session.delete(user)
    db.session.commit()
    flash(f"✅ تم حذف المستخدم: {user.username}", "success")
    return redirect(url_for('main.all_users'))

@main.route('/admin-stats-json')
@login_required
def admin_stats_json():
    if current_user.role != 'Admin':
        return {"error": "Unauthorized"}, 403

    # الإحصائيات
    total_users = User.query.count()
    job_seekers = User.query.filter_by(role='JobSeeker').count()
    employers = User.query.filter_by(role='Employer').count()
    total_jobs = Job.query.count()
    total_applications = Application.query.count()
    accepted_apps = Application.query.filter_by(status='مقبول').count()
    rejected_apps = Application.query.filter_by(status='مرفوض').count()
    pending_apps = Application.query.filter((Application.status == None) | (Application.status == 'قيد المراجعة')).count()

    latest_job = Job.query.order_by(Job.posted_date.desc()).first()
    latest_user = User.query.order_by(User.id.desc()).first()

    html = render_template('partials/admin_stats.html',
                           total_users=total_users,
                           job_seekers=job_seekers,
                           employers=employers,
                           total_jobs=total_jobs,
                           total_applications=total_applications,
                           accepted_apps=accepted_apps,
                           rejected_apps=rejected_apps,
                           pending_apps=pending_apps,
                           latest_job=latest_job,
                           latest_user=latest_user)

    return {
        "html": html,
        "userStats": {
            "job_seekers": job_seekers,
            "employers": employers
        },
        "appStats": {
            "accepted": accepted_apps,
            "rejected": rejected_apps,
            "pending": pending_apps
        }
    }

# ✅ دالة التحقق من اكتمال الملف الشخصي
def is_profile_complete(user):
    required_fields = [
        user.date_of_birth,
        user.gender,
        user.highest_education,
        user.university_name,
        user.graduation_year,
        user.field_of_study,
        user.experience_years,
        user.previous_jobs,
        user.industry,
        user.certifications,
        user.skills,
        user.technical_skills,
        user.soft_skills,
        user.preferred_location,
        user.preferred_salary,
        user.job_type,
        user.willing_to_relocate,
        user.available_start_date,
        user.languages,
        user.language_proficiency,
    ]

    for field in required_fields:
        if field is None:
            return False
        if isinstance(field, str) and not field.strip():
            return False

    return True


