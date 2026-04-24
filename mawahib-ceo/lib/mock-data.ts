import type { Batch, Supervisor, Teacher, Student, AttendanceRecord, QuranProgress, Program, Meeting, BudgetRecord, FeeRecord, Alert } from './types'

export const BATCHES: Batch[] = [
  { id: 48, name: 'دفعة 48', grade_levels: 'خامس + سادس ابتدائي', manager_id: 's1', manager_name: 'عبدالله التويم', student_count: 15, completion_percentage: 72 },
  { id: 46, name: 'دفعة 46', grade_levels: 'أول + ثاني متوسط', manager_id: 's2', manager_name: 'فيصل الحربي', student_count: 25, completion_percentage: 85 },
  { id: 44, name: 'دفعة 44', grade_levels: 'ثالث متوسط + أول ثانوي', manager_id: 's3', manager_name: 'أسامة السحيباني', student_count: 17, completion_percentage: 91 },
  { id: 42, name: 'دفعة 42', grade_levels: 'ثاني + ثالث ثانوي', manager_id: 's4', manager_name: 'رياض', student_count: 16, completion_percentage: 96 },
]

export const SUPERVISORS: Supervisor[] = [
  { id: 'sup1', name: 'محمد العمري', age: 32, specialty: 'حفظ القرآن الكريم', experience_years: 5, strengths: 'دقيق في المتابعة، منظم', weaknesses: 'يحتاج تطوير في التقارير', rating: 4, student_count: 5, last_report_date: '2026-03-30', avg_student_progress: 78, notes: 'ممتاز في التواصل مع أولياء الأمور' },
  { id: 'sup2', name: 'خالد السالم', age: 28, specialty: 'التربية الإسلامية', experience_years: 3, strengths: 'محفز للطلاب، إيجابي', weaknesses: 'يتأخر أحياناً في الرفع', rating: 3, student_count: 5, last_report_date: '2026-03-25', avg_student_progress: 65, notes: '' },
  { id: 'sup3', name: 'عمر الفهد', age: 35, specialty: 'علوم شرعية', experience_years: 8, strengths: 'خبرة عالية، متمكن علمياً', weaknesses: 'صارم أحياناً مع الطلاب', rating: 5, student_count: 5, last_report_date: '2026-04-01', avg_student_progress: 92, notes: 'من أفضل المشرفين أداءً' },
  { id: 'sup4', name: 'أحمد الراشد', age: 30, specialty: 'حفظ القرآن الكريم', experience_years: 4, strengths: 'صبور، يتابع بشكل منتظم', weaknesses: 'يحتاج تطوير في أسلوب التحفيز', rating: 4, student_count: 5, last_report_date: '2026-03-28', avg_student_progress: 81, notes: '' },
  { id: 'sup5', name: 'فهد المطيري', age: 27, specialty: 'تربية إسلامية', experience_years: 2, strengths: 'شاب متحمس، يتعلم بسرعة', weaknesses: 'يحتاج خبرة أكثر', rating: 3, student_count: 5, last_report_date: '2026-03-20', avg_student_progress: 70, notes: 'يحتاج توجيهاً أكثر' },
  { id: 'sup6', name: 'سلطان العتيبي', age: 33, specialty: 'علوم شرعية', experience_years: 6, strengths: 'متمكن في العلوم الشرعية', weaknesses: 'التواصل مع الطلاب الأصغر سناً', rating: 4, student_count: 5, last_report_date: '2026-04-02', avg_student_progress: 88, notes: '' },
  { id: 'sup7', name: 'ناصر القحطاني', age: 31, specialty: 'حفظ القرآن الكريم', experience_years: 5, strengths: 'دقيق في الاختبارات، عادل', weaknesses: 'يحتاج تطوير في البرامج التربوية', rating: 4, student_count: 4, last_report_date: '2026-03-29', avg_student_progress: 75, notes: '' },
]

const STUDENT_NAMES_46 = [
  'أحمد الزنيدي', 'أسامة الصقير', 'أسامة رجب', 'أنس عفاص', 'إلياس الدويش',
  'حارث الجربا', 'خالد ذيبان', 'عاصم القحطاني', 'عامر أحمد', 'عبدالله آل سلطان',
  'عبدالله السقا', 'عبدالله المشحم', 'عبدالله النجار', 'عبدالعزيز خلبوص', 'عبدالعزيز القاسم',
  'عبدالملك التويجري', 'عبدالملك الحربي', 'عبدالملك القحطاني', 'عبدالملك فهاد', 'عزام التويجري',
  'فراس الدهيشي', 'مالك مندو', 'محمد العسيري', 'محمد المقحم', 'موسى الحراسي',
]

const STUDENT_NAMES_48 = [
  'إبراهيم بن أحمد المخلافي', 'حسام بن عبدالرزاق ذيبان', 'خالد بن فؤاد النجار', 'صالح بن علي محمود', 'عبدالرحمن بن سلطان الحمدان',
  'عبدالرحمن بن فراس الأسود', 'عبدالرحمن بن يوسف ياسين', 'عبدالعزيز بن خالد السعيد', 'عبدالله بن محمد شوقي', 'عمر بن محمد المهيزع',
  'عمر بن عبدالعزيز العلوان', 'محمد بن إبراهيم الشعيبي', 'محمد بن عبدالرحمن المهيدب', 'محمد بن ناصر القحطاني', 'همام بن أحمد الأطرم',
]

export const STUDENTS: Student[] = [
  ...STUDENT_NAMES_46.map((name, i) => ({
    id: `s46_${i + 1}`,
    name,
    batch_id: 46 as const,
    supervisor_id: SUPERVISORS[i % 4].id,
    supervisor_name: SUPERVISORS[i % 4].name,
    enrollment_date: '2023-09-01',
    status: i === 3 ? 'suspended' as const : 'active' as const,
    notes: i === 3 ? 'تراجع في الحفظ الأخير' : '',
    juz_completed: Math.floor(Math.random() * 15) + 8,
    completion_percentage: Math.floor(Math.random() * 40) + 55,
    last_followup: '2026-04-01',
  })),
  ...STUDENT_NAMES_48.map((name, i) => ({
    id: `s48_${i + 1}`,
    name,
    batch_id: 48 as const,
    supervisor_id: SUPERVISORS[(i % 3) + 4].id,
    supervisor_name: SUPERVISORS[(i % 3) + 4].name,
    enrollment_date: '2024-09-01',
    status: i === 2 ? 'suspended' as const : 'active' as const,
    notes: '',
    juz_completed: Math.floor(Math.random() * 8) + 2,
    completion_percentage: Math.floor(Math.random() * 30) + 45,
    last_followup: '2026-04-02',
  })),
]

export const QURAN_PROGRESS: QuranProgress[] = STUDENTS.flatMap(student => {
  return Array.from({ length: 30 }, (_, i) => {
    const juzNum = i + 1
    let status: QuranProgress['status'] = 'not_started'
    if (juzNum <= student.juz_completed - 2) status = 'memorized'
    else if (juzNum <= student.juz_completed) status = 'in_progress'
    else if (juzNum === student.juz_completed + 1 && student.status === 'suspended') status = 'failed'
    return {
      id: `qp_${student.id}_${juzNum}`,
      student_id: student.id,
      juz_number: juzNum,
      status,
      exam_date: status === 'memorized' ? '2025-12-01' : null,
      exam_score: status === 'memorized' ? Math.floor(Math.random() * 20) + 78 : null,
      review_score: status === 'memorized' ? Math.floor(Math.random() * 10) + 20 : null,
      examiner_name: status === 'memorized' ? 'عمر الفهد' : null,
    }
  })
})

export const PROGRAMS: Program[] = [
  { id: 'p1', name: 'رحلة الإيمان', batch_id: 46, type: 'long', start_date: '2026-04-15', end_date: '2026-04-18', location: 'مخيم الهدا - الطائف', budget: 12000, objectives: 'تعزيز الانتماء والروح التربوية', report: null, status: 'upcoming' },
  { id: 'p2', name: 'نادي القرآن الأسبوعي', batch_id: 48, type: 'club', start_date: '2026-04-10', end_date: '2026-04-10', location: 'مقر البرنامج', budget: 800, objectives: 'تحفيز الحفظ الأسبوعي', report: null, status: 'upcoming' },
  { id: 'p3', name: 'ملتقى القيادة', batch_id: 44, type: 'short', start_date: '2026-03-20', end_date: '2026-03-21', location: 'فندق قصر الإمارات', budget: 5000, objectives: 'تنمية مهارات القيادة والإلقاء', report: 'ناجح جداً، شارك 17 طالباً بفاعلية كاملة', status: 'completed' },
  { id: 'p4', name: 'برنامج التخرج دفعة 42', batch_id: 42, type: 'long', start_date: '2026-05-20', end_date: '2026-05-23', location: 'قاعة الملك عبدالعزيز', budget: 25000, objectives: 'احتفال التخرج والتكريم', report: null, status: 'upcoming' },
]

export const MEETINGS: Meeting[] = [
  { id: 'm1', type: 'executive', date: '2026-04-07', attendees: ['المدير التنفيذي', 'عبدالله التويم', 'فيصل الحربي', 'أسامة السحيباني', 'رياض'], agenda: 'مراجعة أداء الدفعات - متابعة الطلاب المتعثرين - التحضير لبرامج الفصل الثاني', decisions: null, attachments: [] },
  { id: 'm2', type: 'general_management', date: '2026-04-05', attendees: ['المدير التنفيذي', 'جميع مدراء الدفعات', 'مشرف التطوير'], agenda: 'تقرير الفصل الأول - خطة الفصل الثاني - ميزانية البرامج', decisions: 'اعتماد خطة الفصل الثاني - زيادة ميزانية البرنامج التربوي لدفعة 42', attachments: ['خطة_الفصل_الثاني.pdf'] },
  { id: 'm3', type: 'quarterly_teachers', date: '2026-03-15', attendees: ['المدير التنفيذي', '40 معلم', '3 إداريين'], agenda: 'تقييم أداء المعلمين - مناقشة نتائج اختبارات الأجزاء', decisions: 'رفع معيار الاختبار لدفعة 42 - توحيد نظام التقييم', attachments: [] },
]

export const BUDGET_RECORDS: BudgetRecord[] = [
  { id: 'b1', batch_id: 46, month: 3, year: 2026, allocated: 8000, spent: 6200, status: 'closed', notes: 'تم إغلاق العهدة في الموعد المحدد' },
  { id: 'b2', batch_id: 48, month: 3, year: 2026, allocated: 6000, spent: 4800, status: 'closed', notes: '' },
  { id: 'b3', batch_id: 46, month: 4, year: 2026, allocated: 8000, spent: 1500, status: 'open', notes: 'العهدة مفتوحة - يُغلق في 1 مايو' },
  { id: 'b4', batch_id: 48, month: 4, year: 2026, allocated: 6000, spent: 900, status: 'open', notes: '' },
  { id: 'b5', batch_id: 44, month: 4, year: 2026, allocated: 7000, spent: 2100, status: 'open', notes: '' },
  { id: 'b6', batch_id: 42, month: 4, year: 2026, allocated: 10000, spent: 3400, status: 'open', notes: 'ميزانية التخرج مضافة' },
]

export const ALERTS: Alert[] = [
  { id: 'a1', type: 'danger', title: 'طلاب مرشحون للاستبعاد', description: '3 طلاب تراجع إنجازهم تحت 60% - مراجعة عاجلة مطلوبة', link: '/students?status=suspended' },
  { id: 'a2', type: 'warning', title: 'تقارير أسبوعية متأخرة', description: 'المشرف خالد السالم لم يرفع تقريره منذ 12 يوماً', link: '/supervisors' },
  { id: 'a3', type: 'info', title: 'اجتماع تنفيذي غداً', description: 'اجتماع الإدارة التنفيذية - الأحد 7 أبريل 2026', link: '/meetings' },
  { id: 'a4', type: 'info', title: 'برنامج قادم الأسبوع القادم', description: 'رحلة الإيمان - دفعة 46 - 15 أبريل 2026', link: '/programs' },
  { id: 'a5', type: 'warning', title: '5 طلاب لم يسددوا الرسوم', description: 'يجب متابعة التسديد قبل نهاية الشهر', link: '/budget' },
]

export const FEE_RECORDS: FeeRecord[] = STUDENTS.slice(0, 20).map((student, i) => ({
  id: `fee_${student.id}`,
  student_id: student.id,
  student_name: student.name,
  year: 2026,
  amount: 15800,
  paid_amount: i < 14 ? 15800 : i < 17 ? 8000 : 0,
  status: i < 14 ? 'paid' : i < 17 ? 'partial' : i === 17 ? 'exempt' : 'pending',
  payment_dates: i < 14 ? ['2025-09-15'] : i < 17 ? ['2025-09-15'] : [],
}))

export const MONTHLY_STATS = {
  totalStudents: 74,
  attendanceToday: 91,
  strugglingStudents: 8,
  juzsTestedThisMonth: 47,
}

export const PERFORMANCE_DATA = [
  { month: 'سبتمبر', d42: 88, d44: 72, d46: 61, d48: 45 },
  { month: 'أكتوبر', d42: 90, d44: 76, d46: 66, d48: 50 },
  { month: 'نوفمبر', d42: 92, d44: 80, d46: 70, d48: 55 },
  { month: 'ديسمبر', d42: 93, d44: 83, d46: 74, d48: 58 },
  { month: 'يناير', d42: 94, d44: 86, d46: 78, d48: 62 },
  { month: 'فبراير', d42: 95, d44: 89, d46: 82, d48: 66 },
  { month: 'مارس', d42: 96, d44: 91, d46: 85, d48: 72 },
]
