-- ============================================================
-- ملاحظة تخص workflow الجديد: start-lesson.json
-- ============================================================
-- الـ workflow يفترض أن جدول teachers_manager.lessons يحتوي على عمود
-- "status" (نص) لتمييز الحصة الجارية "in_progress" عن الحصة المكتملة.
-- لو هذا العمود غير موجود بالفعل، نفّذي الكود التالي مرة واحدة في
-- محرر SQL بـ Supabase:

ALTER TABLE teachers_manager.lessons
    ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'completed';

-- (اختياري) قيد يضمن أن القيمة دائمًا واحدة من الحالتين المعروفتين
ALTER TABLE teachers_manager.lessons
    DROP CONSTRAINT IF EXISTS lessons_status_check;
ALTER TABLE teachers_manager.lessons
    ADD CONSTRAINT lessons_status_check
    CHECK (status IN ('in_progress', 'completed'));

-- ============================================================
-- ملاحظة مهمة:
-- يُفضّل أن يقوم workflow "/finalize-lesson" (غير مرفق معي في هذه
-- الجلسة) بتحديث نفس هذا الصف (UPDATE بدل INSERT جديد) وتغيير حالته
-- إلى 'completed' عند إنهاء الحصة، باستخدام lesson_id القادم من
-- start-lesson. لو أردت، أرسلي لي ملف "/finalize-lesson" الحالي
-- وسأعدّله ليتوافق مع هذا التدفق بدقة.
-- ============================================================
