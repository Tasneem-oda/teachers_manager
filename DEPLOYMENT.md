# دليل النشر والإطلاق 🚀

## نشر على Cloudflare Pages

### المتطلبات الأولية
- حساب GitHub (لـ Git و GitHub Actions)
- حساب Cloudflare
- حساب Supabase
- حساب n8n (أو نسخة مستضافة ذاتية)

### الخطوات المفصلة

#### 1. إعداد المستودع على GitHub

```bash
# استنساخ المستودع محلياً
git clone https://github.com/your-username/teachers_manager.git
cd teachers_manager

# إضافة الملفات
git add .
git commit -m "Initial commit: Teachers Manager MVP"
git push origin main
```

#### 2. إعداد Supabase

##### أ) إنشاء مشروع Supabase
1. توجه إلى [supabase.com](https://supabase.com)
2. انقر على "Create new project"
3. أدخل اسم المشروع واختر المنطقة القريبة منك
4. انقر "Create new project"

##### ب) إعداد قاعدة البيانات
في لوحة Supabase، اتبع هذه الخطوات:

1. **إعدادات المصادقة**:
   - اذهب إلى Authentication > Providers
   - فعّل "Email Provider"
   - انسخ Auth Key من Settings > API

2. **إنشاء الجداول**:
   ```sql
   -- تشغيل الاستعلامات التالية في SQL Editor
   
   CREATE SCHEMA teachers_manager;
   
   CREATE TABLE teachers_manager.profiles (
     id uuid NOT NULL,
     username text NOT NULL UNIQUE,
     name text NOT NULL,
     phone text,
     email text,
     role text NOT NULL DEFAULT 'teacher'::text,
     teaching_type text,
     subject text,
     created_at timestamp with time zone DEFAULT now(),
     updated_at timestamp with time zone DEFAULT now(),
     CONSTRAINT profiles_pkey PRIMARY KEY (id),
     CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id)
   );
   
   CREATE TABLE teachers_manager.students (
     id uuid NOT NULL DEFAULT uuid_generate_v4(),
     teacher_id uuid NOT NULL,
     name text NOT NULL,
     lesson_link text,
     phone text,
     subject text,
     current_surah text,
     current_from_ayah integer,
     current_to_ayah integer,
     created_at timestamp with time zone DEFAULT now(),
     updated_at timestamp with time zone DEFAULT now(),
     CONSTRAINT students_pkey PRIMARY KEY (id),
     CONSTRAINT students_teacher_id_fkey FOREIGN KEY (teacher_id) REFERENCES teachers_manager.profiles(id)
   );
   
   CREATE TABLE teachers_manager.schedules (
     id uuid NOT NULL DEFAULT uuid_generate_v4(),
     student_id uuid NOT NULL,
     day_of_week integer NOT NULL,
     start_time time without time zone NOT NULL,
     teacher_id uuid NOT NULL,
     duration_minutes integer NOT NULL DEFAULT 45,
     created_at timestamp with time zone DEFAULT now(),
     updated_at timestamp with time zone DEFAULT now(),
     CONSTRAINT schedules_pkey PRIMARY KEY (id),
     CONSTRAINT schedules_student_id_fkey FOREIGN KEY (student_id) REFERENCES teachers_manager.students(id),
     CONSTRAINT schedules_teacher_id_fkey FOREIGN KEY (teacher_id) REFERENCES teachers_manager.profiles(id)
   );
   
   CREATE TABLE teachers_manager.lessons (
     id uuid NOT NULL DEFAULT uuid_generate_v4(),
     student_id uuid NOT NULL,
     revision text,
     lesson_date timestamp with time zone NOT NULL DEFAULT now(),
     teacher_id uuid NOT NULL,
     memorization text,
     recitation text,
     performance text,
     notes text,
     next_assignment text,
     created_at timestamp with time zone DEFAULT now(),
     updated_at timestamp with time zone DEFAULT now(),
     CONSTRAINT lessons_pkey PRIMARY KEY (id),
     CONSTRAINT lessons_student_id_fkey FOREIGN KEY (student_id) REFERENCES teachers_manager.students(id),
     CONSTRAINT lessons_teacher_id_fkey FOREIGN KEY (teacher_id) REFERENCES teachers_manager.profiles(id)
   );
   
   CREATE TABLE teachers_manager.student_notes (
     id uuid NOT NULL DEFAULT uuid_generate_v4(),
     teacher_id uuid NOT NULL,
     student_id uuid NOT NULL,
     note text NOT NULL,
     created_at timestamp with time zone DEFAULT now(),
     CONSTRAINT student_notes_pkey PRIMARY KEY (id),
     CONSTRAINT student_notes_teacher_id_fkey FOREIGN KEY (teacher_id) REFERENCES teachers_manager.profiles(id),
     CONSTRAINT student_notes_student_id_fkey FOREIGN KEY (student_id) REFERENCES teachers_manager.students(id)
   );
   
   CREATE TABLE teachers_manager.teaching_profiles (
     id uuid NOT NULL DEFAULT uuid_generate_v4(),
     teacher_id uuid NOT NULL,
     student_id uuid NOT NULL UNIQUE,
     teaching_style text,
     student_preferences text,
     ai_context text,
     updated_at timestamp with time zone DEFAULT now(),
     CONSTRAINT teaching_profiles_pkey PRIMARY KEY (id),
     CONSTRAINT teaching_profiles_teacher_id_fkey FOREIGN KEY (teacher_id) REFERENCES teachers_manager.profiles(id),
     CONSTRAINT teaching_profiles_student_id_fkey FOREIGN KEY (student_id) REFERENCES teachers_manager.students(id)
   );
   
   CREATE TABLE teachers_manager.subscriptions (
     id uuid NOT NULL DEFAULT uuid_generate_v4(),
     user_id uuid NOT NULL UNIQUE,
     status text NOT NULL,
     trial_ends_at timestamp with time zone,
     paid_until timestamp with time zone,
     created_at timestamp with time zone DEFAULT now(),
     updated_at timestamp with time zone DEFAULT now(),
     CONSTRAINT subscriptions_pkey PRIMARY KEY (id),
     CONSTRAINT subscriptions_teacher_id_fkey FOREIGN KEY (user_id) REFERENCES teachers_manager.profiles(id)
   );
   ```

3. **تفعيل Row Level Security (RLS)**:
   ```sql
   -- Enable RLS on all tables
   ALTER TABLE teachers_manager.profiles ENABLE ROW LEVEL SECURITY;
   ALTER TABLE teachers_manager.students ENABLE ROW LEVEL SECURITY;
   ALTER TABLE teachers_manager.schedules ENABLE ROW LEVEL SECURITY;
   ALTER TABLE teachers_manager.lessons ENABLE ROW LEVEL SECURITY;
   ALTER TABLE teachers_manager.student_notes ENABLE ROW LEVEL SECURITY;
   ALTER TABLE teachers_manager.teaching_profiles ENABLE ROW LEVEL SECURITY;
   ALTER TABLE teachers_manager.subscriptions ENABLE ROW LEVEL SECURITY;
   
   -- Create policies
   -- Profile policies
   CREATE POLICY "Users can view their own profile"
     ON teachers_manager.profiles
     FOR SELECT
     USING (auth.uid() = id);
   
   CREATE POLICY "Users can update their own profile"
     ON teachers_manager.profiles
     FOR UPDATE
     USING (auth.uid() = id);
   
   -- Student policies
   CREATE POLICY "Teachers can view their own students"
     ON teachers_manager.students
     FOR SELECT
     USING (auth.uid() = teacher_id);
   
   -- Add similar policies for other tables
   ```

#### 3. إعداد n8n

##### أ) تثبيت n8n (اختياري للتطوير المحلي)
```bash
npm install -g n8n
n8n start
```

##### ب) إنشاء Webhooks
في واجهة n8n:
1. إنشاء workflow جديد
2. أضف عقدة "Webhook" كمشغل
3. أضف عقدات Supabase للقراءة/الكتابة
4. انسخ رابط الwebhook

#### 4. إعداد Cloudflare Pages

##### أ) الربط مع GitHub
1. توجه إلى [dash.cloudflare.com](https://dash.cloudflare.com)
2. اختر "Pages" من القائمة الجانبية
3. انقر "Create a project"
4. اختر "Connect to Git"
5. وثّق حسابك على GitHub واختر المستودع

##### ب) إعدادات البناء
في إعدادات النشر:

**Build command**:
```bash
# بدون خطوة بناء (Vanilla JS)
echo "No build required"
```

**Build output directory**:
```
/
```

**Root directory**:
```
/
```

##### ج) متغيرات البيئة
1. اذهب إلى Settings > Environment variables
2. أضف المتغيرات:
   - `VITE_SUPABASE_URL`: رابط Supabase
   - `VITE_SUPABASE_ANON_KEY`: Anon Key من Supabase
   - `VITE_N8N_BASE_URL`: رابط n8n
   - `VITE_N8N_AUTH_TOKEN`: Auth token من n8n

#### 5. تحديث config.js

حدّث `js/config.js` بالقيم الفعلية:

```javascript
export const CONFIG = {
    SUPABASE_URL: 'https://your-project.supabase.co',
    SUPABASE_ANON_KEY: 'your-actual-key-here',
    N8N_WEBHOOK_BASE: 'https://your-n8n-instance.com/webhook',
    // ...
};
```

#### 6. النشر

دفع التغييرات إلى GitHub ستشغّل النشر تلقائياً:

```bash
git add .
git commit -m "Update configuration for production"
git push origin main
```

Cloudflare Pages سينشر التطبيق تلقائياً!

## التحقق من النشر

### 1. التحقق من الوصول
زور رابط التطبيق من لوحة Cloudflare Pages (عادة يكون شيء مثل `your-project.pages.dev`)

### 2. اختبار المصادقة
```bash
# 1. جرب التسجيل بحساب جديد
# 2. تحقق من بريدك الإلكتروني للتحقق
# 3. قم بتسجيل الدخول
# 4. تحقق من أن الملف الشخصي موجود في Supabase
```

### 3. اختبار n8n webhooks
```bash
# تشغيل curl لاختبار webhook
curl -X POST https://your-n8n-instance.com/webhook/create-student \
  -H "Content-Type: application/json" \
  -d '{
    "teacher_id": "test-id",
    "name": "تجربة",
    "phone": "0123456789"
  }'
```

## استكشاف الأخطاء

### الخطأ: "CORS error"
**الحل**:
- في Supabase Settings > API، تحقق من CORS configuration
- أضف نطاق Cloudflare Pages إلى قائمة السماح

### الخطأ: "Webhook failed"
**الحل**:
- تحقق من حالة n8n
- راجع سجلات n8n للتفاصيل
- تأكد من صحة رابط webhook

### الخطأ: "Database error"
**الحل**:
- تحقق من RLS policies
- تأكد من أن الجداول موجودة
- راجع سجلات الأخطاء في Supabase

## التحديثات المستقبلية

### للتطوير المحلي:
```bash
# شغّل خادم محلي
python -m http.server 3000

# أو
npx http-server -p 3000
```

### للإنتاج:
1. دفع التغييرات إلى GitHub
2. Cloudflare Pages ستنشر تلقائياً

## الأمان في الإنتاج

### ✅ Checklist الأمان

- [ ] لا تحفظ مفاتيح API في الكود
- [ ] استخدم متغيرات البيئة فقط
- [ ] فعّل HTTPS (Cloudflare يفعل هذا تلقائياً)
- [ ] اختبر RLS policies بحسابات مختلفة
- [ ] فعّل إعادة التوجيه من HTTP إلى HTTPS
- [ ] اختبر حدود المعدل على n8n
- [ ] اختبر المصادقة متعددة المراحل (اختياري)
- [ ] راقب السجلات وترجمات الأخطاء

## المراجع

- [Cloudflare Pages Docs](https://developers.cloudflare.com/pages/)
- [Supabase Deployment](https://supabase.com/docs/guides/hosting/platform/deploying)
- [n8n Webhooks](https://docs.n8n.io/nodes/n8n-nodes-base.webhook/)

---

نشر سعيد! 🎉
