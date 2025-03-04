from flask import Blueprint, render_template, redirect, url_for, flash, request, Flask
from flask_login import login_user, logout_user, login_required, current_user
from app.models import Job, User, Certificate, db
from app import db, login_manager
from app.forms import LoginForm, JobForm, RegistrationForm, SettingsForm, ProfileForm
from werkzeug.utils import secure_filename
import os


main = Blueprint('main', __name__)

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
