-- ============================================================
-- migration مطلوبة لميزة "مركز الإشعارات" (نافذة زر الجرس 🔔: مقروءة / غير
-- مقروءة). نفّذي هذا الكود مرة واحدة في محرر SQL في Supabase قبل استيراد
-- وتفعيل n8n/get-notifications.json و n8n/mark-notifications-read.json،
-- وقبل تفعيل النسخة المُحدَّثة من n8n/send-daily-lesson-notifications.json.
-- ============================================================

CREATE TABLE IF NOT EXISTS teachers_manager.notifications (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    teacher_id uuid NOT NULL,
    title text NOT NULL,
    body text NOT NULL,
    -- الصفحة اللي هتتفتح عند الضغط على الإشعار داخل التطبيق (مسار نسبي،
    -- مثلاً 'schedule.html') - ممكن تكون فاضية لإشعارات بدون رابط
    url text,
    is_read boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    -- وقت التحديد كمقروء - بيُستخدم لحساب الـ 30 يوم قبل الحذف التلقائي
    read_at timestamptz,
    CONSTRAINT notifications_pkey PRIMARY KEY (id),
    CONSTRAINT notifications_teacher_id_fkey FOREIGN KEY (teacher_id)
        REFERENCES teachers_manager.profiles (id) ON DELETE CASCADE
);

-- فهرس لتسريع "هات كل إشعارات المعلم ده مرتبة بالأحدث" (get-notifications)
CREATE INDEX IF NOT EXISTS idx_notifications_teacher_created
    ON teachers_manager.notifications (teacher_id, created_at DESC);

-- فهرس لتسريع مهمة التنظيف اليومية (حذف المقروءة اللي عدى عليها 30 يوم)
CREATE INDEX IF NOT EXISTS idx_notifications_cleanup
    ON teachers_manager.notifications (is_read, read_at);

-- ============================================================
-- ملاحظات مهمة:
-- 1) الحذف التلقائي للإشعارات المقروءة بعد 30 يوم بيتم عن طريق فرع إضافي
--    (Cleanup Old Read Notifications) مضاف لنفس الـ workflow المجدول
--    الموجود بالفعل (n8n/send-daily-lesson-notifications.json)، بيشتغل
--    كل يوم الساعة 7 صباحًا مع إرسال التذكير اليومي - مفيش داعي لأي
--    cron إضافي أو جدولة منفصلة.
-- 2) لو حبيتي تمسحي الميزة دي بالكامل لاحقًا، تقدري تشيلي الجدول ده بأمان:
--    DROP TABLE IF EXISTS teachers_manager.notifications;
-- ============================================================
