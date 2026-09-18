-- ============================================================
-- migration مطلوبة لدعم ميزة "إلغاء حصة اليوم يدويًا" من الداشبورد
-- (workflow: n8n/cancel-lesson.json + n8n/get-today-lessons.json)
-- نفّذي هذا الكود مرة واحدة في محرر SQL في Supabase قبل استخدام الميزة.
-- ============================================================

-- عمود status في جدول lessons كان بيسمح بقيمتين بس: 'in_progress' و
-- 'completed' (حسب n8n/START_LESSON_DB_NOTE.sql). عايزين نضيف قيمة
-- ثالثة: 'cancelled' لتمييز الحصص اللي اتلغت يدويًا قبل ما تتعمل.
ALTER TABLE teachers_manager.lessons
    DROP CONSTRAINT IF EXISTS lessons_status_check;
ALTER TABLE teachers_manager.lessons
    ADD CONSTRAINT lessons_status_check
    CHECK (status IN ('in_progress', 'completed', 'cancelled'));

-- ============================================================
-- ملاحظة: لو عمود status نفسه مش موجود أصلاً في جدولك (يعني لسه ما
-- نفّذتيش n8n/START_LESSON_DB_NOTE.sql من قبل)، نفّذي الكود ده الأول:
--
-- ALTER TABLE teachers_manager.lessons
--     ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'completed';
--
-- وبعدها نفّذي القيد (CONSTRAINT) اللي فوق.
-- ============================================================
--
-- طريقة عمل ميزة "إلغاء الحصة": بدل ما نضيف جدول جديد، أي حصة "اتلغت"
-- بيتسجل ليها صف جديد في نفس جدول lessons بـ status = 'cancelled'
-- (بنفس طريقة start-lesson اللي بيسجل صف بـ status = 'in_progress').
-- بكده صفحة الداشبورد تقدر تفرّق بسهولة (عن طريق get-today-lessons)
-- بين: (1) حصة لسه ماعملهاش/فاتت من غير أي صف مسجّل، (2) حصة قيد
-- التنفيذ 'in_progress'، (3) حصة 'completed'، (4) حصة 'cancelled'.
-- ============================================================
