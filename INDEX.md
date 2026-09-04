# فهرس المشروع - Teachers Manager 📑

## 📋 محتويات المستودع

### صفحات الويب (11 صفحة HTML)

#### صفحات المصادقة
- **[index.html](index.html)** - صفحة الهبوط والترحيب
  - Hero section مع CTA
  - عرض الميزات الرئيسية
  - الفوتر
  - إعادة توجيه تلقائية للمستخدمين المسجلين

- **[login.html](login.html)** - تسجيل الدخول
  - نموذج بسيط (email + password)
  - رابط نسيان كلمة المرور
  - رابط التسجيل الجديد
  - معالجة الأخطاء

- **[signup.html](signup.html)** - التسجيل الجديد
  - نموذج شامل (7 حقول)
  - تحقق من جانب العميل
  - تكامل مع Supabase Auth
  - إنشاء ملف شخصي تلقائي

- **[reset-password.html](reset-password.html)** - استعادة كلمة المرور
  - 4 خطوات: طلب، تحقق، تعيين، تأكيد
  - التحقق من الرمز
  - تحديث كلمة المرور الآمن

#### صفحات لوحة التحكم
- **[dashboard.html](dashboard.html)** - لوحة التحكم الرئيسية
  - إحصائيات سريعة (4 بطاقات)
  - عرض الحصة القادمة
  - قائمة الحصص اليومية
  - تقويم أسبوعي
  - شارة حالة الاشتراك

#### صفحات إدارة الطلاب
- **[students.html](students.html)** - قائمة الطلاب
  - عرض شبكي للطلاب
  - بحث وتصفية
  - إضافة طالب جديد (modal)
  - تعديل وحذف
  - روابط سريعة لملفات الطلاب

- **[student.html](student.html)** - ملف الطالب الفردي
  - 4 tabs: معلومات، نمط التدريس، سجل الحصص، ملاحظات
  - المعلومات الأساسية
  - تحديث نمط التدريس
  - عرض سجل الحصص
  - إدارة الملاحظات

#### صفحات التعليم
- **[lesson.html](lesson.html)** - تسجيل الحصة
  - رأس الحصة (اسم الطالب، الوقت)
  - 5 أقسام: ما تم تدريسه، الأداء، الواجب، الملاحظات، المساعد الذكي
  - تقييم الأداء
  - طلب ملخص من المساعد الذكي
  - حفظ الحصة نهائياً

#### صفحات الإعدادات
- **[subscription.html](subscription.html)** - إدارة الاشتراك
  - 3 خطط تسعير (Trial, Professional, Annual)
  - قائمة الميزات لكل خطة
  - FAQ
  - عرض حالة الاشتراك الحالية

- **[settings.html](settings.html)** - الإعدادات الشخصية
  - تحديث الملف الشخصي
  - تغيير كلمة المرور
  - إدارة الإشعارات
  - حذف الحساب
  - تسجيل الخروج

#### صفحات الإدارة
- **[admin.html](admin.html)** - لوحة التحكم الإدارية
  - 4 tabs: النظرة العامة، المستخدمون، الاشتراكات، إعدادات النظام
  - إحصائيات النظام
  - جداول إدارة المستخدمين
  - إدارة الاشتراكات
  - إعدادات النظام

---

### الملفات السكريبتية (7 ملفات JavaScript)

#### طبقة الإعدادات والتكوين
- **[js/config.js](js/config.js)** - الإعدادات المركزية
  - Supabase URLs و Keys
  - n8n Webhook Base URL
  - جميع API endpoints (منظمة حسب الميزة)
  - إعدادات التطبيق (الاسم، الإصدار، الحدود)
  - أنماط التحقق (Regex patterns)
  - **الحجم: 85 سطر**

#### نظام المصادقة
- **[js/auth.js](js/auth.js)** - فئة المصادقة
  - signUp: تسجيل معلم جديد
  - signIn: تسجيل دخول آمن
  - signOut: تسجيل خروج
  - getSession: الحصول على جلسة حالية
  - getCurrentUser: الحصول على بيانات المستخدم
  - bootstrapSession: تحميل جلسة عند البدء
  - refreshSession: تحديث التوكن
  - updatePassword: تغيير كلمة المرور
  - resetPassword: استعادة كلمة المرور
  - requireAuth: حماية الصفحات
  - redirectIfAuthenticated: إعادة توجيه إذا مسجل دخول
  - **الحجم: 300 سطر**

#### طبقة API الموحدة
- **[js/api.js](js/api.js)** - كائن API المركزي
  - apiCall: دالة أساسية للطلبات
  - Dashboard methods: getDashboard
  - Student methods: createStudent, getStudents, getStudent, updateStudent, deleteStudent
  - Schedule methods: createSchedule, updateSchedule, deleteSchedule, checkScheduleConflict
  - Lesson methods: startLesson, finalizeLesson, getLesson, getLessons, getLessonHistory
  - Notes methods: createNote, getNotes, getStudentNotes
  - Teaching Profile methods: getTeachingProfile, updateTeachingProfile, createOrUpdateTeachingProfile
  - Subscription methods: checkSubscription
  - AI methods: getAIAssistance, generateLessonSummary
  - **الحجم: 240 سطر**

#### أدوات مساعدة مشتركة
- **[js/utils.js](js/utils.js)** - دوال المساعدة
  - Validators: email, phone, username, password, url, name, isRequired, minLength, maxLength, isNumber, isPositiveNumber, isInteger, strongPassword
  - Formatters: formatDate, formatTime, formatDateTime, formatPhone, capitalizeWords, truncate, escapeHtml
  - Storage: set, get, remove, clear (LocalStorage wrapper)
  - ErrorHandler: getErrorMessage, getErrorCode, showError, showSuccess
  - TimeUtils: getCurrentDayOfWeek, getDayName, getTimeFromString, checkTimeOverlap, addMinutesToTime
  - APIUtils: buildHeaders, buildUrl, handleResponse
  - **الحجم: 350 سطر**

#### ملفات منطق الصفحات
- **[js/dashboard.js](js/dashboard.js)** - منطق لوحة التحكم
  - تحميل الإحصائيات
  - عرض الحصة القادمة
  - قائمة الحصص اليومية
  - تقويم أسبوعي
  - **الحجم: 3583 سطر**

- **[js/students.js](js/students.js)** - منطق قائمة الطلاب
  - تحميل الطلاب
  - البحث والتصفية
  - إضافة/تعديل/حذف
  - **الحجم: 2072 سطر**

- **[js/student.js](js/student.js)** - منطق ملف الطالب
  - تبديل الـ Tabs
  - عرض ملف الطالب
  - إدارة نمط التدريس
  - عرض سجل الحصص
  - إدارة الملاحظات
  - **الحجم: 4253 سطر**

---

### الملفات الأسلوبية (1 ملف CSS)

- **[css/style.css](css/style.css)** - نظام التصميم الموحد
  - متغيرات CSS (Colors, Spacing, Typography)
  - الدعم الكامل لـ RTL (العربية)
  - أنماط الأزرار والنماذج
  - البطاقات والشبكات
  - الأدوات والمساعدات
  - التأثيرات والرسوم المتحركة
  - التصميم المتجاوب (Responsive)
  - **الحجم: 350 سطر**

---

### ملفات التوثيق (6 ملفات Markdown)

#### الملفات الرئيسية
- **[README.md](README.md)** - دليل البدء السريع
  - نظرة عامة على المشروع
  - البنية المعمارية
  - هيكل المشروع
  - تعليمات البدء
  - قاعدة البيانات والجداول
  - أمثلة الاستخدام
  - التوافقية والأداء

- **[PROJECT_SUMMARY.md](PROJECT_SUMMARY.md)** - ملخص المشروع
  - الحالة الحالية
  - الملفات المنشأة
  - الإحصائيات
  - قائمة المراجعة
  - المسارات الرئيسية
  - الخطوات التالية

#### الملفات التقنية
- **[ARCHITECTURE.md](ARCHITECTURE.md)** - البنية المعمارية
  - نظرة عامة على النظام
  - الطبقة الأمامية (Frontend)
  - طبقة المصادقة (Authentication)
  - طبقة API (n8n Webhooks)
  - قاعدة البيانات (Supabase)
  - تدفقات البيانات
  - الأمان والعزل
  - معالجة الأخطاء

- **[DEPLOYMENT.md](DEPLOYMENT.md)** - دليل النشر
  - إعداد GitHub
  - إعداد Supabase (الجداول، RLS، السياسات)
  - إعداد n8n (الـ Webhooks)
  - إعداد Cloudflare Pages
  - متغيرات البيئة
  - التحقق من النشر
  - استكشاف الأخطاء

- **[API_EXAMPLES.md](API_EXAMPLES.md)** - أمثلة استخدام API
  - أمثلة cURL و JavaScript لكل endpoint
  - التسجيل والمصادقة
  - إدارة الطلاب
  - تسجيل الحصص
  - الملاحظات
  - أنماط التدريس
  - الاشتراكات
  - المساعد الذكي

- **[FEATURES.md](FEATURES.md)** - قائمة الميزات
  - الميزات الأساسية (12 فئة)
  - الميزات المتقدمة
  - خطة التطوير المستقبلية
  - مقارنة الخطط
  - التوافقية والأداء
  - قنوات الدعم

---

### ملفات الإعدادات (2 ملف)

- **[.env.example](.env.example)** - متغيرات البيئة
  - Supabase Configuration
  - n8n Configuration
  - Application Settings

- **[.gitignore](.gitignore)** - ملفات المشروع المستثناة
  - متغيرات البيئة (.env)
  - IDE files
  - Node modules
  - Build artifacts
  - Logs

---

## 🗂️ هيكل المشروع الكامل

```
teachers_manager/
├── 📄 ملفات HTML (11 ملف)
│   ├── index.html              (صفحة الهبوط)
│   ├── login.html              (تسجيل الدخول)
│   ├── signup.html             (التسجيل الجديد)
│   ├── reset-password.html     (استعادة كلمة المرور)
│   ├── dashboard.html          (لوحة التحكم)
│   ├── students.html           (قائمة الطلاب)
│   ├── student.html            (ملف الطالب)
│   ├── lesson.html             (تسجيل الحصة)
│   ├── subscription.html       (إدارة الاشتراك)
│   ├── settings.html           (الإعدادات)
│   └── admin.html              (لوحة الإدارة)
│
├── 📂 css/
│   └── style.css               (نظام التصميم)
│
├── 📂 js/
│   ├── config.js               (الإعدادات المركزية)
│   ├── auth.js                 (نظام المصادقة)
│   ├── api.js                  (طبقة API)
│   ├── utils.js                (دوال مساعدة)
│   ├── dashboard.js            (منطق لوحة التحكم)
│   ├── students.js             (منطق قائمة الطلاب)
│   └── student.js              (منطق ملف الطالب)
│
├── 📄 ملفات توثيق (6 ملف)
│   ├── README.md               (دليل البدء)
│   ├── PROJECT_SUMMARY.md      (ملخص المشروع)
│   ├── ARCHITECTURE.md         (البنية المعمارية)
│   ├── DEPLOYMENT.md           (دليل النشر)
│   ├── FEATURES.md             (قائمة الميزات)
│   └── API_EXAMPLES.md         (أمثلة API)
│
├── .env.example                (متغيرات البيئة)
├── .gitignore                  (الملفات المستثناة)
└── INDEX.md                    (هذا الملف)
```

---

## 📊 الإحصائيات

| الفئة | العدد | الملاحظة |
|-------|-------|---------|
| ملفات HTML | 11 | صفحات مختلفة |
| ملفات JS | 7 | Core + Logic |
| ملفات CSS | 1 | موحد و RTL |
| ملفات MD | 7 | توثيق شامل |
| ملفات Config | 2 | .env + .gitignore |
| **المجموع** | **28** | **ملف** |

---

## 🚀 كيف تبدأ

### 1. استنساخ المشروع
```bash
git clone https://github.com/tasneem-oda/teachers_manager.git
cd teachers_manager
```

### 2. اقرأ التوثيق
- ابدأ بـ [README.md](README.md) للبدء السريع
- ثم [ARCHITECTURE.md](ARCHITECTURE.md) لفهم البنية
- و [DEPLOYMENT.md](DEPLOYMENT.md) للنشر

### 3. إعداد البيئة
```bash
cp .env.example .env
# ثم ملء المتغيرات الفعلية
```

### 4. شغّل المشروع محلياً
```bash
python -m http.server 3000
# ثم توجه إلى http://localhost:3000
```

### 5. ادفع إلى GitHub
```bash
git add .
git commit -m "Initial commit"
git push origin main
```

### 6. انشر على Cloudflare Pages
- اتبع [DEPLOYMENT.md](DEPLOYMENT.md)

---

## 📚 المراجع السريعة

### للمطورين
| الموضوع | الملف |
|--------|------|
| البدء السريع | [README.md](README.md) |
| البنية المعمارية | [ARCHITECTURE.md](ARCHITECTURE.md) |
| أمثلة API | [API_EXAMPLES.md](API_EXAMPLES.md) |
| النشر والإطلاق | [DEPLOYMENT.md](DEPLOYMENT.md) |

### للمستخدمين
| الموضوع | الملف |
|--------|------|
| الميزات المتاحة | [FEATURES.md](FEATURES.md) |
| خطط التسعير | [FEATURES.md](FEATURES.md#مقارنة-الخطط) |
| الإجابات الشائعة | [FEATURES.md](FEATURES.md#faq) |

---

## ✅ قائمة التحقق السريعة

- [ ] استنساخ المشروع
- [ ] قراءة README.md
- [ ] فهم البنية المعمارية
- [ ] إعداد Supabase
- [ ] إعداد n8n
- [ ] إعداد متغيرات البيئة
- [ ] اختبار محلياً
- [ ] النشر على Cloudflare Pages

---

## 🆘 الدعم

### للأسئلة والمشاكل
1. ابحث في الملفات المرتبطة
2. راجع أمثلة API
3. تواصل عبر البريد الإلكتروني

### للمساهمة
1. Fork المستودع
2. أنشئ فرع للميزة الجديدة
3. اُرسل PR

---

**الملف الأخير:** INDEX.md  
**آخر تحديث:** مارس 2024  
**الحالة:** ✅ اكتمل
