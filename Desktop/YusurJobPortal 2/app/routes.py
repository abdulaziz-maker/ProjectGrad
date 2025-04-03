from flask import Blueprint, render_template, redirect, url_for, flash, request, Flask, current_app
from flask_login import login_user, logout_user, login_required, current_user, LoginManager
from app.models import Job, User, Certificate, db
from app.forms import LoginForm, JobForm, RegistrationForm, SettingsForm, ProfileForm, EmployerJobForm
from werkzeug.security import generate_password_hash, check_password_hash
from werkzeug.utils import secure_filename
from app import db, login_manager
from datetime import datetime,date
from PIL import Image
import secrets
import os

main = Blueprint('main', __name__)

@login_manager.user_loader
def load_user(user_id):
    return User.query.get(int(user_id))

def save_picture(form_picture):
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
def home():
    with current_app.app_context():  # ✅ تأكد أن الجملة تعمل داخل `app_context`
        today_date = date.today()  # ✅ استخدم `date.today()`
        jobs = Job.query.all() #jobs = Job.query.filter(Job.posted_date >= today_date).all()#jobs = Job.query.filter(Job.posted_date != None).order_by(Job.posted_date.desc()).all()
    return render_template('home.html', jobs=jobs, today_date=today_date)

@main.route('/login', methods=['GET', 'POST'])
def login():
    if current_user.is_authenticated:
        return redirect(url_for('main.home'))  # ✅ المستخدم مسجل دخول بالفعل

    form = LoginForm()
    if form.validate_on_submit():
        user = User.query.filter_by(email=form.email.data).first()
        print(f"🔍 المستخدم المدخل: {form.email.data}, كلمة المرور: {form.password.data}")
        print(f"🔍 المستخدم الموجود في قاعدة البيانات: {user}")

        # ✅ التحقق من صحة كلمة المرور
        if user and check_password_hash(user.password, form.password.data):  
            login_user(user, remember=True)
            flash("✅ تسجيل الدخول ناجح!", "success")
            print("✅ تسجيل الدخول ناجح!")

            # ✅ توجيه المستخدم بناءً على دوره بعد تسجيل الدخول
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
    return redirect(url_for('main.home'))

@main.route('/register', methods=['GET', 'POST'])
def register():
    form = RegistrationForm()

    if form.validate_on_submit():
        hashed_password = generate_password_hash(form.password.data, method='pbkdf2:sha256')
        user_role = form.role.data if form.role.data in ["JobSeeker", "Employer"] else "JobSeeker"
        company_name = form.company_name.data if user_role == "Employer" else None
        if user_role == "Employer" and not company_name:
            flash("❗ يرجى إدخال اسم الشركة عند تسجيل صاحب العمل.", "danger")
            return redirect(url_for('main.register'))

        existing_user = User.query.filter_by(email=form.email.data).first()
        if existing_user:
            flash("❌ البريد الإلكتروني مسجل بالفعل. الرجاء استخدام بريد آخر.", "danger")
            return redirect(url_for('main.register'))

        new_user = User(
            username=form.username.data,
            email=form.email.data,
            password=hashed_password,
            role=user_role,
            company_name=company_name
        )
        db.session.add(new_user)
        db.session.commit()

        flash("🎉 تم إنشاء الحساب بنجاح! يمكنك الآن تسجيل الدخول.", "success")
        return redirect(url_for('main.login'))
    
    return render_template('register.html', form=form)

@main.route('/add-job', methods=['GET', 'POST'])
@login_required
def add_job():
    print("🚨 دخلنا دالة add_job")  # ✅ اختبار

    if current_user.role != 'Employer':
        flash("❌ لا يمكنك إضافة وظيفة! هذه الميزة متاحة فقط لأصحاب العمل.", "danger")
        return redirect(url_for('main.home'))
    form = EmployerJobForm()
    if form.validate_on_submit():
        company_name = current_user.company_name  # ← نحصل على اسم الشركة مباشرة من الحساب

        if not company_name:
            flash("❌ لا يمكن إنشاء الوظيفة بدون اسم الشركة. تأكد من إعداد ملفك الشخصي.", "danger")
            return redirect(url_for("main.profile"))

        print("✅ الفورم صالح وتم الإرسال")  # ✅ اختبار
        print("📛 اسم الشركة الحالي:", current_user.company_name)
        new_job = Job(
            title=form.job_title.data,
            description=form.description.data, 
            company=company_name,  # ← نرسلها هنا
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
        print("✅ تم حفظ الوظيفة في قاعدة البيانات")  # ✅ اختبار
        flash("🎉 تم إضافة الوظيفة بنجاح!", "success")
        print("📛 اسم الشركة تم أضافتها بنجاح: ", current_user.company_name)
        return redirect(url_for("main.employer_dashboard"))
    else:
        print("❌ الفورم فيه أخطاء:")
        print(form.errors)
        
    return render_template('add_job.html', form=form)

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
        return redirect(url_for('main.home'))

    db.session.delete(job)
    db.session.commit()
    flash("🗑️ تم حذف الوظيفة بنجاح!", "success")
    return redirect(url_for('main.home'))

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
    form = ProfileForm(obj=current_user)

    if form.validate_on_submit():
        current_user.username = form.username.data
        current_user.email = form.email.data
        current_user.phone = form.phone.data
        current_user.address = form.address.data
        current_user.bio = form.bio.data

        if form.profile_picture.data:
            picture_file = save_picture(form.profile_picture.data)
            current_user.profile_picture = picture_file

        db.session.commit()
        flash("✅ تم تحديث ملفك الشخصي بنجاح!", "success")
        return redirect(url_for('main.profile'))

    return render_template('profile.html', form=form)
@main.route('/employer_dashboard')
@login_required
def employer_dashboard():
    if current_user.role != 'Employer':
        flash("❌ لا تملك صلاحية الوصول إلى هذه الصفحة!", "danger")
        return redirect(url_for('main.home'))
    
    user = User.query.get(current_user.id)  # ✅ ربط المستخدم مع الوظائف الخاصة به
    jobs = Job.query.filter_by(employer_id=current_user.id).all()
    return render_template('employer_dashboard.html', user=current_user,jobs=jobs)
  

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
    if current_user.role != 'JobSeeker':  # ✅ فقط الباحث عن عمل يمكنه رفع الشهادات
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
        return redirect(url_for('main.jobseeker_dashboard'))  # ✅ توجيه الباحث عن عمل إلى صفحته

    return render_template('upload_certificate.html')
