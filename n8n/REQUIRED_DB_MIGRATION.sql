-- ============================================================
-- migration مطلوبة لدعم ميزة "تكرار الموعد" (يوميًا/أسبوعيًا/شهريًا/بدون تكرار)
-- نفّذي هذا الكود مرة واحدة في محرر SQL في Supabase قبل استخدام الميزة الجديدة.
-- ============================================================

ALTER TABLE teachers_manager.schedules
    ADD COLUMN IF NOT EXISTS recurrence_type text NOT NULL DEFAULT 'weekly',
    ADD COLUMN IF NOT EXISTS start_date date,
    ADD COLUMN IF NOT EXISTS recurrence_group_id uuid;

-- (اختياري لكن يُنصح به) قيد يضمن أن القيمة دائمًا واحدة من القيم المعروفة
ALTER TABLE teachers_manager.schedules
    DROP CONSTRAINT IF EXISTS schedules_recurrence_type_check;
ALTER TABLE teachers_manager.schedules
    ADD CONSTRAINT schedules_recurrence_type_check
    CHECK (recurrence_type IN ('weekly', 'daily', 'monthly', 'none'));

-- ============================================================
-- ملاحظة مهمة:
-- بعد تنفيذ هذا الـ migration، يجب أيضًا تعديل استعلام SELECT في
-- workflow الخاص بـ "/get-schedules" في n8n بحيث يعيد الأعمدة الثلاثة
-- الجديدة (recurrence_type, start_date, recurrence_group_id) ضمن كل صف،
-- حتى تظهر شارة التكرار (يوميًا/شهريًا/مرة واحدة) في تقويم الجدول،
-- ويعمل زر "حذف كل أيام التكرار" بشكل صحيح.
-- لم يتم إرفاق ملف هذا الـ workflow في هذه الجلسة، لذلك لم يُعدَّل تلقائيًا.
--
-- ملف n8n/create-schedule.json المرفق تم تعديله بالفعل ليحفظ هذه
-- الأعمدة الثلاثة عند إنشاء موعد جديد.
-- ============================================================
