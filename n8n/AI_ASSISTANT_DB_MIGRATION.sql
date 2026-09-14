-- ============================================================================
-- Migration: مساعد الذكاء الاصطناعي (شات) للمعلم أثناء/قبل الحصة
-- شغّلي الملف ده مرة واحدة على قاعدة البيانات (Supabase SQL Editor) قبل
-- استيراد وتفعيل n8n/ai-chat-assistant.json
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0) إصلاح إضافي مهم (وُجد أثناء تحليل الكود):
-- عمود current_surah متوقّع فعليًا في الكود الحالي (js/students.js لما بتحفظي
-- بيانات الطالب، js/student.js لما بتعرضيها، js/dashboard.js في الملخص
-- اليومي) لكنه مش موجود في قاعدة البيانات الفعلية حسب الـ schema اللي بعتيها.
-- ده معناه إن قيمة "السورة الحالية" كانت بتتكتب في الفورم لكن بتتجاهل بصمت
-- عند الحفظ (العمود مش موجود أصلًا)، وكانت دايمًا بتظهر "غير محدد" في صفحة
-- الطالب. إضافته هنا بتصلح المشكلة دي تلقائيًا من غير أي تعديل على أي كود
-- موجود، وكمان بتدي المساعد الذكي معلومة أساسية محتاجها (السورة الحالية).
ALTER TABLE teachers_manager.students ADD COLUMN IF NOT EXISTS current_surah text;

-- ----------------------------------------------------------------------------
-- 1) سجل رسائل الشات - ده اللي بيدّي المساعد "الذاكرة" الخاصة بكل طالب
-- (آخر عدد معيّن من الرسائل بيتجاب من هنا مع كل طلب جديد، راجعي الشرح
-- في n8n/AI_ASSISTANT_SETUP.md)
CREATE TABLE IF NOT EXISTS teachers_manager.ai_chat_messages (
    id uuid NOT NULL DEFAULT uuid_generate_v4(),
    teacher_id uuid NOT NULL,
    student_id uuid NOT NULL,
    role text NOT NULL CHECK (role = ANY (ARRAY['user'::text, 'assistant'::text])),
    content text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT ai_chat_messages_pkey PRIMARY KEY (id),
    CONSTRAINT ai_chat_messages_teacher_id_fkey FOREIGN KEY (teacher_id) REFERENCES teachers_manager.profiles(id),
    CONSTRAINT ai_chat_messages_student_id_fkey FOREIGN KEY (student_id) REFERENCES teachers_manager.students(id)
);
CREATE INDEX IF NOT EXISTS idx_ai_chat_messages_student ON teachers_manager.ai_chat_messages (student_id, created_at DESC);

-- ----------------------------------------------------------------------------
-- 2) عداد الاستخدام اليومي لكل معلّم - بيحمي حصة Gemini المجانية المشتركة
-- من إن معلّم واحد يستهلكها كلها ويمنع باقي المعلمين
CREATE TABLE IF NOT EXISTS teachers_manager.ai_usage_daily (
    id uuid NOT NULL DEFAULT uuid_generate_v4(),
    teacher_id uuid NOT NULL,
    usage_date date NOT NULL DEFAULT CURRENT_DATE,
    request_count integer NOT NULL DEFAULT 0,
    CONSTRAINT ai_usage_daily_pkey PRIMARY KEY (id),
    CONSTRAINT ai_usage_daily_teacher_id_fkey FOREIGN KEY (teacher_id) REFERENCES teachers_manager.profiles(id),
    CONSTRAINT ai_usage_daily_unique UNIQUE (teacher_id, usage_date)
);

-- ----------------------------------------------------------------------------
-- 3) قفل معدّل الطلبات العام (صف واحد ثابت فقط) - بيحمي حصة الاستخدام
-- المجانية المشتركة بين كل المعلمين من تجاوز حد الطلبات بالدقيقة (RPM)
-- عند Google
CREATE TABLE IF NOT EXISTS teachers_manager.ai_rate_limiter (
    id integer PRIMARY KEY CHECK (id = 1),
    last_request_at timestamp with time zone
);
INSERT INTO teachers_manager.ai_rate_limiter (id, last_request_at)
VALUES (1, NULL)
ON CONFLICT (id) DO NOTHING;
