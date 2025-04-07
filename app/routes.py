from flask import Blueprint, render_template, redirect, url_for, flash, request, Flask, current_app
from flask_login import login_user, logout_user, login_required, current_user
from app.models import Job, User, Certificate, db
from app import db, login_manager
from app.forms import LoginForm, JobForm, RegistrationForm, SettingsForm, ProfileForm, JobSeekerProfileForm
from werkzeug.utils import secure_filename
from datetime import datetime
import os


main = Blueprint('main', __name__)  # ✅ تعريف `Blueprint` مرة واحدة فقط
app = Flask(__name__)
app.secret_key = "your_secret_key"  # مطلوب لاستخدام flash messages

@login_manager.user_loader
def load_user(user_id):
    return User.query.get(int(user_id))

@main.route('/')
def home():
    jobs = Job.query.all()
    return render_template('home.html', jobs=jobs)

@main.route('/login', methods=['GET', 'POST'])
def login():
    if current_user.is_authenticated:
        return redirect(url_for('main.home'))  # إذا كان المستخدم مسجل دخول بالفعل

    form = LoginForm()
    if form.validate_on_submit():
        user = User.query.filter_by(email=form.email.data).first()
        if user and user.password == form.password.data:  # ملاحظة: يجب تشفير كلمة المرور لاحقًا
            login_user(user)
            flash("✅ تسجيل الدخول ناجح!", "success")

            # توجيه المستخدم بناءً على دوره
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

    return render_template("login.html", form=form)



#@main.route('/user-dashboard')
#@login_required
#def user_dashboard():
    if current_user.role != 'user':
        flash("❌ لا يمكنك الوصول إلى هذه الصفحة!", "danger")
        return redirect(url_for('main.home'))

    jobs = Job.query.all()  # عرض الوظائف فقط للمستخدم العادي
    return render_template('user_dashboard.html', user=current_user, jobs=jobs)


@main.route('/add-job', methods=['GET', 'POST'])
@login_required
def add_job():
    if current_user.role != 'Employer':  # السماح فقط لصاحب العمل بإضافة وظيفة
        flash("❌ لا يمكنك إضافة وظيفة! هذه الميزة متاحة فقط لأصحاب العمل.", "danger")
        return redirect(url_for('main.home'))

    form = JobForm()
    if form.validate_on_submit():
        new_job = Job(
            title=form.title.data,
            description=form.description.data,
            company=form.company.data,
            employer_id=current_user.id  # تعيين صاحب العمل للوظيفة
        )
        db.session.add(new_job)
        db.session.commit()
        flash("🎉 تم إضافة الوظيفة بنجاح!", "success")
        return redirect(url_for("main.employer_dashboard"))  # توجيه صاحب العمل إلى صفحته

    return render_template('add_job.html', form=form)

@main.route('/edit-job/<int:job_id>', methods=['GET', 'POST'])
@login_required
def edit_job(job_id):
    job = Job.query.get_or_404(job_id)

    if job.employer_id != current_user.id:
        flash("❌ لا يمكنك تعديل هذه الوظيفة!", "danger")
        return redirect(url_for('main.home'))

    form = JobForm(obj=job)
    if form.validate_on_submit():
        job.title = form.title.data
        job.description = form.description.data
        job.company = form.company.data
        db.session.commit()
        flash("✅ تم تحديث الوظيفة بنجاح!", "success")
        return redirect(url_for('main.home'))

    return render_template('edit_job.html', form=form, job=job)

@main.route('/delete-job/<int:job_id>', methods=['POST', 'GET'])
@login_required
def delete_job(job_id):
    job = Job.query.get_or_404(job_id)

    if job.employer_id != current_user.id:
        flash("❌ لا يمكنك حذف هذه الوظيفة!", "danger")
        return redirect(url_for('main.home'))

    db.session.delete(job)
    db.session.commit()
    flash("🗑️ تم حذف الوظيفة بنجاح!", "success")
    return redirect(url_for('main.home'))

@main.route('/logout')
@login_required
def logout():
    logout_user()
    flash("🚪 تم تسجيل الخروج بنجاح!", "info")
    return redirect(url_for('main.home'))

@main.route('/register', methods=['GET', 'POST'])
def register():
    form = RegistrationForm()
    
    if request.method == "POST":
        print("📌 استلمنا طلب POST")  # تتبع العملية

    if form.validate_on_submit():
        print("✅ الفورم تم التحقق منه بنجاح!")  # تأكيد التحقق من الفورم
        
        # التأكد من أن الدور إما "JobSeeker" أو "Employer"
        user_role = form.role.data if form.role.data in ["JobSeeker", "Employer"] else "JobSeeker"

        # البحث عن المستخدم إذا كان البريد الإلكتروني مستخدمًا مسبقًا
        existing_user = User.query.filter_by(email=form.email.data).first()
        if existing_user:
            flash("❌ البريد الإلكتروني مسجل بالفعل. الرجاء استخدام بريد آخر.", "danger")
            print("⚠️ البريد الإلكتروني مستخدم مسبقًا.")  # تتبع العملية
            return redirect(url_for('main.register'))

        # إنشاء المستخدم الجديد
        new_user = User(
            name=form.name.data,
            email=form.email.data,
            password=form.password.data,  # ملاحظة: يجب تشفير كلمة المرور لاحقًا
            role=user_role
        )
        db.session.add(new_user)
        db.session.commit()
        
        print(f"🎉 تم إنشاء المستخدم {new_user.email} بنجاح!")
        flash("🎉 تم إنشاء الحساب بنجاح! يمكنك الآن تسجيل الدخول.", "success")
        
        return redirect(url_for('main.login'))

    if form.errors:
        print("❌ هناك أخطاء في الفورم:", form.errors)  # تتبع الأخطاء
    
    return render_template('register.html', form=form)




@main.route('/upload_certificate', methods=['GET', 'POST'])
@login_required
def upload_certificate():
    if current_user.role != 'JobSeeker':  # فقط الباحث عن عمل يمكنه رفع الشهادات
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

        allowed_extensions = {'pdf', 'jpg', 'png'}
        if '.' in file.filename and file.filename.rsplit('.', 1)[1].lower() not in allowed_extensions:
            flash('⚠️ نوع الملف غير مدعوم! يجب أن يكون PDF أو JPG أو PNG.', 'danger')
            return redirect(request.url)

        filename = secure_filename(file.filename)
        filepath = os.path.join('uploads/certificates', filename)
        file.save(filepath)

        new_certificate = Certificate(user_id=current_user.id, file_path=filepath)
        db.session.add(new_certificate)
        db.session.commit()

        flash('✅ تم رفع الشهادة بنجاح!', 'success')
        return redirect(url_for('main.jobseeker_dashboard'))  # توجيه الباحث عن عمل إلى صفحته

    return render_template('upload_certificate.html')




@main.route('/admin-dashboard')
@login_required
def admin_dashboard():
    if current_user.role != 'admin':
        flash("❌ لا يمكنك الوصول إلى هذه الصفحة!", "danger")
        return redirect(url_for('main.home'))

    return render_template('admin_dashboard.html', user=current_user)

@main.route('/employer_dashboard')
@login_required
def employer_dashboard():
    if current_user.role != 'Employer':
        flash("❌ لا تملك صلاحية الوصول إلى هذه الصفحة!", "danger")
        return redirect(url_for('main.home'))
    return render_template('employer_dashboard.html', user=current_user)

@main.route('/jobseeker_dashboard')
@login_required
def jobseeker_dashboard():
    if current_user.role != 'JobSeeker':
        flash("❌ لا تملك صلاحية الوصول إلى هذه الصفحة!", "danger")
        return redirect(url_for('main.home'))
    return render_template('jobseeker_dashboard.html', user=current_user)


@main.route("/settings", methods=["GET", "POST"])
@login_required
def settings():
    form = SettingsForm()

    if form.validate_on_submit():
        if form.new_password.data:
            current_user.password = form.new_password.data  # ملاحظة: تأكد من استخدام التشفير لاحقًا
        current_user.notifications_enabled = form.notifications.data == "enabled"
        current_user.theme = form.theme.data

        db.session.commit()
        flash("✅ تم تحديث الإعدادات بنجاح!", "success")
        return redirect(url_for("main.settings"))

    return render_template("settings.html", form=form)

@main.route('/logout_all')
@login_required
def logout_all():
    logout_user()
    flash("🚪 تم تسجيل الخروج من جميع الجلسات!", "info")
    return redirect(url_for('main.home'))



@main.route('/profile', methods=['GET', 'POST'])
@login_required
def profile():
    form = ProfileForm(obj=current_user)

    # جلب قائمة الوظائف التي تقدم لها المستخدم
    applied_jobs = Job.query.join(Job.applicants).filter(User.id == current_user.id).all()

    # جلب قائمة الوظائف التي نشرها صاحب العمل
    posted_jobs = Job.query.filter_by(employer_id=current_user.id).all()

    if form.validate_on_submit():
        current_user.username = form.username.data
        current_user.email = form.email.data
        current_user.phone = form.phone.data
        current_user.address = form.address.data
        current_user.bio = form.bio.data

        # حفظ الصورة الشخصية إذا تم تحميل صورة جديدة
        if form.profile_picture.data:
            picture_file = save_picture(form.profile_picture.data)
            current_user.profile_picture = picture_file

        db.session.commit()
        flash("✅ تم تحديث ملفك الشخصي بنجاح!", "success")
        return redirect(url_for('main.profile'))

    return render_template('profile.html', form=form, applied_jobs=applied_jobs, posted_jobs=posted_jobs,user=current_user)

def save_picture(form_picture):
    # تحديد مسار مجلد الصور داخل `static/profile_pics/`
    picture_folder = os.path.join(current_app.root_path, 'static/profile_pics')

    # 🔹 إذا لم يكن المجلد موجودًا، قم بإنشائه
    if not os.path.exists(picture_folder):
        os.makedirs(picture_folder)

    # حفظ الصورة بعد التأكد من أن المجلد موجود
    picture_filename = secure_filename(form_picture.filename)
    picture_path = os.path.join(picture_folder, picture_filename)
    form_picture.save(picture_path)

    return picture_filename  # إرجاع اسم الملف للحفظ في قاعدة البيانات

@main.route('/notifications')
@login_required
def notifications():
    return render_template('notifications.html', user=current_user)

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
        print("✅ البيانات المستلمة:", request.form)  # تتبع

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

        # 🔹 الحقول النصية والاختيارات
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

        # 🔹 القوائم المتعددة (المهارات)
        user.skills = ', '.join(request.form.getlist("skills[]"))
        user.technical_skills = ', '.join(request.form.getlist("technical_skills[]"))
        user.soft_skills = ', '.join(request.form.getlist("soft_skills[]"))

        # 🔹 المهارات الأخرى إذا تم اختيار "أخرى"
        if request.form.get("other_skill"):
            user.skills += f", {request.form.get('other_skill')}"
        if request.form.get("other_technical_skill"):
            user.technical_skills += f", {request.form.get('other_technical_skill')}"
        if request.form.get("other_soft_skill"):
            user.soft_skills += f", {request.form.get('other_soft_skill')}"

        # 🔹 حفظ التعديلات
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

@main.route('/update-personal-profile', methods=['POST'])
@login_required
def update_personal_profile():
    try:
        user = User.query.get(current_user.id)

        user.name = request.form.get("name")
        user.bio = request.form.get("bio")
        user.phone = request.form.get("phone")
        user.address = request.form.get("address")
        user.personality_type = request.form.get("personality_type")
        user.linkedin = request.form.get("linkedin")
        user.twitter = request.form.get("twitter")
        user.github = request.form.get("github")
        user.values = request.form.get("values")
        user.achievement = request.form.get("achievement")

        # ✅ حفظ الصورة الشخصية
        if 'profile_picture' in request.files:
            file = request.files['profile_picture']
            if file.filename != '':
                filename = secure_filename(file.filename)
                file_path = os.path.join('static/profile_pics', filename)
                file.save(file_path)
                user.profile_picture = filename

        db.session.commit()
        flash("✅ تم حفظ التغييرات بنجاح!", "success")
        return redirect(url_for('main.user_profile'))  # 🔹 توجيه المستخدم إلى الملف الشخصي العام

    except Exception as e:
        db.session.rollback()
        print("❌ خطأ أثناء تحديث الملف الشخصي:", str(e))
        flash("❌ حدث خطأ أثناء الحفظ، حاول مرة أخرى!", "danger")
        return redirect(url_for('main.profile'))

@main.route('/user-profile', methods=['GET'])
@login_required
def user_profile():
    return render_template('user_profile.html', user=current_user)
