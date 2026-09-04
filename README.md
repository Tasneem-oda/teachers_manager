# Teachers Manager 🎓

برنامج SaaS متعدد المستأجرين لإدارة المعلمين والطلاب والدروس والجداول الزمنية.

## 📋 نظرة عامة

Teachers Manager هو حل شامل لمعلمي القرآن والمتخصصين الآخرين لإدارة:
- **الطلاب**: إضافة وتعديل وحذف وتتبع تقدم الطلاب
- **الجداول الزمنية**: تنظيم وإدارة الحصص الأسبوعية
- **سجل الدروس**: تسجيل ملخص كل حصة (حفظ، تلاوة، أداء)
- **الملاحظات**: إضافة ملاحظات شخصية وتطبيقية لكل طالب
- **أنماط التدريس**: توثيق نمط التدريس والتفضيلات
- **الاشتراكات**: إدارة الدورات المحاسبية والاشتراكات

## 🏗️ البنية المعمارية

```
┌─────────────────────────────────────────┐
│         Frontend (Vanilla JS)           │
│  - HTML/CSS/JavaScript (No Framework)   │
│  - Responsive Design (RTL Ready)        │
└────────────┬────────────────────────────┘
             │ API Calls (JSON)
             ▼
┌─────────────────────────────────────────┐
│    Backend (n8n Workflows)              │
│  - Business Logic                       │
│  - Authorization & Validation           │
│  - Data Processing                      │
└────────────┬────────────────────────────┘
             │ Database Queries
             ▼
┌─────────────────────────────────────────┐
│  Supabase (PostgreSQL + Auth)           │
│  - Database Storage                     │
│  - User Authentication                  │
│  - Row Level Security (RLS)             │
└─────────────────────────────────────────┘
```

## 📁 هيكل المشروع

```
teachers_manager/
├── index.html              # صفحة الهبوط
├── login.html              # تسجيل الدخول
├── signup.html             # التسجيل الجديد
├── reset-password.html     # استعادة كلمة المرور
├── dashboard.html          # لوحة التحكم الرئيسية
├── students.html           # قائمة الطلاب
├── student.html            # ملف الطالب الفردي
├── lesson.html             # تسجيل الحصة
├── subscription.html       # إدارة الاشتراك
├── settings.html           # الإعدادات
├── admin.html              # لوحة التحكم الإدارية
│
├── css/
│   └── style.css           # نظام التصميم والأنماط
│
├── js/
│   ├── config.js           # الإعدادات المركزية (API Endpoints)
│   ├── auth.js             # فئة المصادقة
│   ├── api.js              # طبقة API الموحدة
│   └── utils.js            # أدوات مساعدة مشتركة
│
└── README.md               # هذا الملف
```

## 🚀 البدء السريع

### المتطلبات
- Node.js 14+ (للتطوير المحلي)
- حساب Supabase
- حساب n8n
- متصفح حديث

### التثبيت

1. **استنساخ المستودع**
```bash
git clone https://github.com/tasneem-oda/teachers_manager.git
cd teachers_manager
```

2. **إعداد متغيرات البيئة**

أنشئ ملف `.env` في الجذر:
```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_N8N_BASE_URL=https://your-n8n-instance.com
VITE_N8N_AUTH_TOKEN=your-auth-token
```

3. **إطلاق التطبيق**

للتطوير المحلي:
```bash
# باستخدام Python
python -m http.server 3000

# أو باستخدام Node.js
npx http-server -p 3000
```

ثم توجه إلى `http://localhost:3000`

### النشر على Cloudflare Pages

```bash
# بناء الموقع (إن أمكن)
npm run build

# دفع إلى GitHub
git push origin main

# سيتم النشر تلقائياً على Cloudflare Pages
```

## 🔐 المصادقة والأمان

### تدفق المصادقة

```
المستخدم → signup.html → Auth.signUp() → Supabase Auth
              ↓
          n8n Webhook
              ↓
          إنشاء الملف الشخصي
          إنشاء الاشتراك (Trial)
              ↓
          الملف الشخصي → localStorage
              ↓
          إعادة توجيه → dashboard.html
```

### مميزات الأمان

- ✅ **Supabase Auth**: إدارة المستخدمين والجلسات بشكل آمن
- ✅ **JWT Tokens**: توثيق الطلبات بين Frontend و Backend
- ✅ **RLS Policies**: سياسات الأمان على مستوى الصفوف في قاعدة البيانات
- ✅ **Multi-tenant Isolation**: عزل البيانات بين المعلمين
- ✅ **Role-based Access**: التحكم في الوصول بناءً على الأدوار

## 📊 قاعدة البيانات

### الجداول الرئيسية

#### `profiles` - الملفات الشخصية
```sql
- id (UUID): معرف فريد مربوط بـ auth.users
- username (TEXT): اسم المستخدم الفريد
- name (TEXT): الاسم الكامل
- email (TEXT): البريد الإلكتروني
- phone (TEXT): رقم الهاتف
- role (TEXT): الدور (teacher, admin)
- teaching_type (TEXT): نوع التدريس
- subject (TEXT): المادة أو المجال
```

#### `students` - الطلاب
```sql
- id (UUID): معرف فريد
- teacher_id (UUID): معرف المعلم
- name (TEXT): اسم الطالب
- phone (TEXT): رقم الهاتف
- lesson_link (TEXT): رابط الحصة (Zoom, Google Meet, etc)
- current_surah (TEXT): السورة الحالية (للقرآن)
- current_from_ayah (INTEGER): رقم الآية من
- current_to_ayah (INTEGER): رقم الآية إلى
- created_at / updated_at (TIMESTAMP)
```

#### `schedules` - الجداول الزمنية
```sql
- id (UUID): معرف فريد
- student_id (UUID): معرف الطالب
- teacher_id (UUID): معرف المعلم
- day_of_week (INTEGER): يوم الأسبوع (0-6)
- start_time (TIME): وقت البداية
- duration_minutes (INTEGER): المدة بالدقائق
- created_at / updated_at (TIMESTAMP)
```

#### `lessons` - سجل الحصص
```sql
- id (UUID): معرف فريد
- student_id (UUID): معرف الطالب
- teacher_id (UUID): معرف المعلم
- lesson_date (TIMESTAMP): تاريخ الحصة
- memorization (TEXT): ملخص الحفظ
- recitation (TEXT): ملخص التلاوة
- performance (TEXT): تقييم الأداء
- revision (TEXT): المراجعة
- notes (TEXT): ملاحظات عامة
- next_assignment (TEXT): الواجب التالي
- created_at / updated_at (TIMESTAMP)
```

#### `student_notes` - الملاحظات الشخصية
```sql
- id (UUID): معرف فريد
- teacher_id (UUID): معرف المعلم
- student_id (UUID): معرف الطالب
- note (TEXT): نص الملاحظة
- created_at (TIMESTAMP)
```

#### `teaching_profiles` - أنماط التدريس
```sql
- id (UUID): معرف فريد
- teacher_id (UUID): معرف المعلم
- student_id (UUID): معرف الطالب
- teaching_style (TEXT): وصف نمط التدريس
- student_preferences (TEXT): تفضيلات الطالب
- ai_context (TEXT): السياق للمساعد الذكي
- updated_at (TIMESTAMP)
```

#### `subscriptions` - الاشتراكات
```sql
- id (UUID): معرف فريد
- user_id (UUID): معرف المستخدم
- status (TEXT): trial, active, expired
- trial_ends_at (TIMESTAMP): تاريخ انتهاء النسخة التجريبية
- paid_until (TIMESTAMP): مدفوع حتى
- created_at / updated_at (TIMESTAMP)
```

## 🔌 تكامل n8n

### Webhooks الرئيسية

#### 1. **Teacher Signup Webhook**
**عند**: تسجيل معلم جديد
**العمل**:
- إنشاء ملف شخصي جديد
- إنشاء اشتراك trial (7 أيام)
- إرسال رسالة ترحيب

```
POST /webhook/teacher-signup
{
  "email": "teacher@example.com",
  "username": "teacher_username",
  "name": "أحمد محمد",
  "phone": "0123456789",
  "teaching_type": "quran",
  "subject": "Quranic Studies"
}
```

#### 2. **Create Student Webhook**
**عند**: إضافة طالب جديد
**العمل**:
- حفظ بيانات الطالب
- إنشاء ملف تعليم جديد
- تسجيل الحدث

```
POST /webhook/create-student
{
  "teacher_id": "uuid",
  "name": "محمد علي",
  "phone": "0123456789",
  "subject": "quran",
  "lesson_link": "https://zoom.us/..."
}
```

#### 3. **Create Lesson Webhook**
**عند**: تسجيل حصة جديدة
**العمل**:
- حفظ بيانات الحصة
- تحديث حالة الطالب
- توليد ملخص بالمساعد الذكي (اختياري)

```
POST /webhook/create-lesson
{
  "student_id": "uuid",
  "teacher_id": "uuid",
  "memorization": "سورة الفاتحة كاملة",
  "recitation": "ممتاز",
  "performance": "90%",
  "next_assignment": "سورة البقرة 1-10"
}
```

#### 4. **Dashboard Data Webhook**
**عند**: تحميل لوحة التحكم
**العمل**:
- جلب إحصائيات المعلم
- جلب الحصص القادمة
- جلب الطلاب الحالية

```
GET /webhook/dashboard-data
Headers: { "teacher_id": "uuid" }

Response:
{
  "success": true,
  "data": {
    "stats": {
      "total_students": 15,
      "lessons_this_week": 8,
      "active_schedule": 10
    },
    "next_lesson": { ... },
    "today_lessons": [ ... ],
    "students": [ ... ]
  }
}
```

## 🎨 نظام التصميم

### الألوان

```css
--primary: #4B3A5A      /* البنفسجي الرئيسي */
--bg: #FAF9F6           /* الخلفية الفاتحة */
--card: #FFFFFF         /* بطاقات */
--text: #29252D         /* نص داكن */
--border: #E7E1E8       /* حدود */
--success: #6F8F72      /* أخضر */
--danger: #B85C5C       /* أحمر */
```

### المكونات

- **Buttons**: أزرار بأحجام مختلفة
- **Forms**: نماذج مع التحقق
- **Cards**: بطاقات للمعلومات
- **Grid**: شبكة متجاوبة
- **Modals**: نوافذ منبثقة

## 📱 التجاوب والدعم

### الأجهزة المدعومة
- ✅ سطح المكتب (1920px+)
- ✅ التابليت (768px - 1024px)
- ✅ الهاتف المحمول (320px - 767px)

### اتجاه النص
- ✅ من اليمين إلى اليسار (RTL) - العربية
- ✅ من اليسار إلى اليمين (LTR) - الإنجليزية

## 📑 الصفحات الرئيسية

### 1. **index.html** - صفحة الهبوط
صفحة ترحيبية لزوار جدد مع:
- عرض للميزات الرئيسية
- استدعاء للعمل (CTA)
- إعادة توجيه تلقائية للمستخدمين المسجلين

### 2. **signup.html** - التسجيل
نموذج تسجيل شامل:
- الاسم والبريد والهاتف
- اسم المستخدم وكلمة المرور
- نوع التدريس والمادة

### 3. **login.html** - تسجيل الدخول
تسجيل دخول بسيط مع:
- البريد الإلكتروني أو رقم الهاتف
- كلمة المرور
- رابط استعادة كلمة المرور

### 4. **reset-password.html** - استعادة كلمة المرور
عملية استعادة 4 خطوات:
1. إدخال البريد الإلكتروني
2. التحقق من الرمز
3. إدخال كلمة المرور الجديدة
4. تأكيد النجاح

### 5. **dashboard.html** - لوحة التحكم
المركز الرئيسي للمعلم:
- إحصائيات سريعة
- الحصة القادمة
- حصص اليوم
- التقويم الأسبوعي

### 6. **students.html** - قائمة الطلاب
إدارة الطلاب:
- عرض قائمة الطلاب
- البحث والتصفية
- إضافة طالب جديد
- تعديل أو حذف

### 7. **student.html** - ملف الطالب
ملف فردي لكل طالب:
- المعلومات الأساسية
- نمط التدريس
- سجل الحصص
- الملاحظات الشخصية

### 8. **lesson.html** - تسجيل الحصة
واجهة تسجيل الحصة أثناء أو بعد الحصة:
- ما تم تدريسه
- تقييم الأداء
- الواجب المنزلي
- ملاحظات إضافية
- اقتراحات المساعد الذكي

### 9. **subscription.html** - إدارة الاشتراك
صفحة الاشتراك:
- خطط التسعير (Trial, Professional, Annual)
- حالة الاشتراك الحالية
- الترقية أو التنزيل
- FAQ

### 10. **settings.html** - الإعدادات
إعدادات المستخدم:
- تحديث الملف الشخصي
- تغيير كلمة المرور
- تفضيلات الإشعارات
- حذف الحساب

### 11. **admin.html** - لوحة التحكم الإدارية
إدارة النظام (للمسؤولين فقط):
- إحصائيات عامة
- إدارة المستخدمين
- إدارة الاشتراكات
- إعدادات النظام

## 🛠️ الأدوات والمكتبات

### Frontend
- **Vanilla JavaScript**: بدون أطر عمل
- **Supabase JS SDK**: للمصادقة وقاعدة البيانات
- **CSS3**: أنماط حديثة وتخطيط Flexbox/Grid

### Backend
- **n8n**: أتمتة سير العمل
- **Supabase**: قاعدة البيانات والمصادقة
- **PostgreSQL**: نظام إدارة قاعدة البيانات

### النشر
- **Cloudflare Pages**: استضافة Frontend

## 📖 تدفقات رئيسية

### تدفق التسجيل
```
1. المستخدم يملأ نموذج signup.html
2. التحقق من الجانب العميل
3. استدعاء Auth.signUp()
4. Supabase ينشئ حساب المستخدم
5. n8n Webhook ينشئ الملف الشخصي والاشتراك
6. تسجيل دخول تلقائي
7. إعادة توجيه إلى dashboard.html
```

### تدفق إضافة طالب
```
1. المستخدم يفتح students.html
2. ينقر على "طالب جديد"
3. يملأ نموذج الطالب
4. التحقق من الجانب العميل
5. استدعاء api.createStudent()
6. n8n Webhook ينشئ الطالب والملف التعليمي
7. إعادة تحميل القائمة
```

### تدفق تسجيل الحصة
```
1. المعلم ينقر "حصة جديدة" أثناء/بعد الحصة
2. يملأ نموذج lesson.html
3. يمكنه طلب ملخص من المساعد الذكي
4. يرسل البيانات
5. n8n Webhook يحفظ الحصة
6. يحدّث حالة الطالب
7. إرسال تنبيه (اختياري)
8. العودة إلى student.html
```

## 🐛 استكشاف الأخطاء

### المشكلة: "خطأ في المصادقة"
**الحل**:
- تحقق من VITE_SUPABASE_URL و VITE_SUPABASE_ANON_KEY
- تأكد من صحة رابط Supabase
- امسح الكاش والـ Cookies

### المشكلة: "لا يمكن الاتصال بـ n8n"
**الحل**:
- تحقق من VITE_N8N_BASE_URL
- تأكد من أن webhook n8n يعمل
- تحقق من حالة الشبكة

### المشكلة: "البيانات لا تحفظ"
**الحل**:
- تحقق من RLS Policies في Supabase
- تأكد من أن المستخدم الحالي لديه صلاحيات
- راجع console.log للأخطاء

## 📚 مراجع إضافية

- [Supabase Docs](https://supabase.com/docs)
- [n8n Documentation](https://docs.n8n.io)
- [JavaScript MDN](https://developer.mozilla.org/en-US/docs/Web/JavaScript)
- [CSS Grid & Flexbox](https://developer.mozilla.org/en-US/docs/Web/CSS)

## 👥 الدعم والمساهمة

للإبلاغ عن الأخطاء أو اقتراح ميزات:
- افتح Issue على GitHub
- أرسل Pull Request
- تواصل عبر البريد الإلكتروني

## 📄 الترخيص

هذا المشروع مرخص تحت MIT License.

---

**آخر تحديث**: مارس 2024
**الإصدار**: 1.0.0
**الحالة**: MVP جاهز للإنتاج
