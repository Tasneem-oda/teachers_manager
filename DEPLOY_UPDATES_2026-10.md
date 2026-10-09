# تحديث أكتوبر 2026 — دليل التطبيق والاختبار

الملف ده بيشرح كل التعديلات اللي اتعملت، وترتيب تطبيقها، وكل كود SQL و n8n مكتوب كامل هنا كمان (نفس الموجود جوه ملفات مجلد `n8n/`).

> **أمان البيانات:** كل ملفات SQL هنا مفيهاش أي `DELETE` ولا `DROP TABLE` ولا `TRUNCATE`. ملف الفترة المجانية بيعمل نسخة احتياطية من جدول الاشتراكات قبل أي تعديل. كل الملفات تتنفذ أكتر من مرة بأمان.

---

## 1) ترتيب التطبيق (مهم)

1. **قاعدة البيانات (Supabase ← SQL Editor)** بالترتيب:
   1. `n8n/FREE_PERIOD_MIGRATION.sql`
   2. `n8n/MONTHLY_INCOME_DB_MIGRATION.sql`
   3. `n8n/SUGGESTIONS_DB_MIGRATION.sql`
2. **n8n:**
   - استيراد workflow جديد: `n8n/monthly-income.json` (اختاري اتصال Postgres بتاعك في عقدة Monthly Income) ثم تفعيله.
   - استيراد workflow جديد: `n8n/submit-suggestion.json` (نفس الكلام لعقدة Save Suggestion) ثم تفعيله.
   - تحديث workflow `get-today-lessons`: استبدلي استعلام عقدة **Get Today Lessons** بالاستعلام في القسم 4.
   - تحديث workflow `send-daily-lesson-notifications`: استبدلي كود عقدة **Build Notification Text** بالكود في القسم 5 (الوقت بقى 12 ساعة).
3. **الموقع:** ارفعي كل ملفات الواجهة (الملفات اتغير رقم نسختها لـ `?v=15` عشان المتصفحات تجيب الجديد).
4. **اختبار:** القسم 8.

> لو استوردتي workflow فوق نسخة موجودة على السيرفر، اتأكدي إن النسخة اللي في المشروع هي نفس اللي شغالة (بعض workflows على السيرفر ممكن تكون أحدث من الموجود في المشروع). عشان كده في `get-today-lessons` و `send-daily-lesson-notifications` الأسلم إنك تبدلي **العقدة بس** مش الـ workflow كله.

---

## 2) ملخص التعديلات

| # | التعديل | الملفات |
|---|---|---|
| 1 | المواعيد: اختيار أكتر من يوم مرة واحدة، بدون تحويل تلقائي في دليل البداية، وزرار "خلصت المواعيد — سجّل أول حصة" | `js/student-appointments.js`, `schedule.html`, `students.html`, `js/onboarding.js`, `js/form-widgets.js` (جديد) |
| 2 | الوقت بنظام 12 ساعة في كل البرنامج (اختيار الوقت + العرض + إشعار الصبح) | `js/form-widgets.js`, `js/utils.js`, `lesson.html`, `n8n/send-daily-lesson-notifications.json` |
| 3 | بعد حفظ الحصة: الخطوة الجاية (تفعيل حساب الفلوس، أو إرسال تقرير ولي الأمر بعد 4 حصص) | `lesson.html`, `student.html` |
| 4 | إعداد الدفع لكل الطلاب مرة واحدة | `js/billing.js` |
| 5 | رسائل المطوّر اتشالت من قدام المدرس، والأخطاء الإنجليزي بقت رسالة عربي واضحة | `js/utils.js`, `js/billing.js`, `js/attendance.js`, `lesson.html`, `js/books-page.js`, `js/book-processor.js`, `js/auth.js` |
| 6 | التسجيل: أخطاء عربي، "الإيميل مسجّل قبل كده"، 3 محاولات لإعداد الحساب، وإكمال الإعداد تلقائيًا لو فشل، وشاشة "أكّد إيميلك" | `js/auth.js`, `signup.html` |
| 7 | الصفحة الرئيسية للموقع اتكتبت من جديد حوالين الفلوس والتقرير و"مجاني لحد 31 ديسمبر" | `index.html` |
| 8 | بانر تثبيت التطبيق: مش بيظهر في التسجيل/الدخول، بيظهر بعد أول حصة، والإغلاق بيتفتكر 7 أيام | `js/pwa-install.js` |
| 9 | الإعدادات: شيل الخيارات الوهمية، زرار تفعيل التنبيهات الحقيقي، "طلب حذف الحساب" على واتساب، والخروج من كل الأجهزة بقى حقيقي | `settings.html` |
| 10 | الفترة المجانية لحد 31 ديسمبر + الباقتين 99 و150 + "عرض المسجلين بدري" | `js/config.js`, `subscription.html`, `js/sidebar.js`, `n8n/FREE_PERIOD_MIGRATION.sql` |
| 11 | بعد نهاية المجانية: وضع "قراءة فقط" بدل قفل الشاشة (المدرس يشوف بياناته، والحفظ محتاج اشتراك) | `js/sidebar.js`, `js/api.js`, `css/style.css` |
| 12 | **ميزة جديدة: فلوس الشهر** — كام طالب دفع وجمعت كام، الشهر ده/اللي فات/قبلها، مع نسخ الملخص | `js/income.js` (جديد), `dashboard.html`, `n8n/monthly-income.json`, `n8n/MONTHLY_INCOME_DB_MIGRATION.sql` |
| 13 | زرار "عندك اقتراح؟" (في الهيدر والقائمة) + جدول الاقتراحات + أساس داشبورد المساهمين | `js/suggestions.js` (جديد), `js/sidebar.js`, `n8n/submit-suggestion.json`, `n8n/SUGGESTIONS_DB_MIGRATION.sql` |
| 14 | سطر التقرير لولي الأمر فيه رابط الموقع بكود المدرس (`?ref=`) + حفظ مصدر التسجيل | `js/report.js`, `index.html`, `signup.html`, `js/auth.js` |
| 15 | السرعة: بيانات الجلسة بتتخزن 5 دقايق بدل طلب n8n في كل صفحة، وطلبات الرئيسية بقت مع بعض | `js/auth.js`, `js/sidebar.js`, `dashboard.html`, `js/api.js` |
| 16 | أكتر من 100 طالب بيظهروا كلهم | `js/api.js`, `students.html`, `schedule.html` |
| 17 | طالب عنده حصتين في نفس اليوم: كل حصة بحالتها | `dashboard.html`, `n8n/get-today-lessons.json` |
| 18 | مهلة 30 ثانية لكل طلب + زرار "حاول تاني" لما التحميل يفشل | `js/api.js`, `dashboard.html`, `students.html`, `lesson.html` |
| 19 | قياس جديد في Google Tag Manager | انظر القسم 7 |
| 20 | حذف ملفات قديمة مش مستخدمة | `js/dashboard.js`, `js/students.js`, `js/student.js` |

---

## 3) كود SQL الكامل

### 3.1 الفترة المجانية — `n8n/FREE_PERIOD_MIGRATION.sql`

```sql
-- ============================================================================
-- FREE_PERIOD_MIGRATION.sql
-- سياسة "مجاني بالكامل لحد 31 ديسمبر 2026" + تجهيز الباقتين (99 و150)
--
-- الأمان على البيانات (مهم):
--   * مفيش أي DELETE ولا DROP TABLE ولا TRUNCATE.
--   * أول خطوة: نسخة احتياطية كاملة من جدول الاشتراكات قبل أي تعديل.
--   * التعديل الوحيد: تمديد trial_ends_at للي في الفترة التجريبية، ورجوع
--     التجربة للي تجربتهم خلصت ومادفعوش. أي حد دافع (paid_until) مش بيتلمس.
--   * ممكن يتنفذ أكتر من مرة بأمان.
--
-- نفّذيه مرة واحدة في Supabase ← SQL Editor.
-- لتغيير تاريخ نهاية المجانية بعدين: سطر واحد (آخر الملف) من غير ما تلمسي n8n.
-- ============================================================================

BEGIN;

-- 1) نسخة احتياطية (بتتعمل مرة واحدة بس؛ لو موجودة مش بتتكتب فوقها)
CREATE TABLE IF NOT EXISTS teachers_manager.subscriptions_backup_20261009 AS
    SELECT * FROM teachers_manager.subscriptions;

-- 2) جدول إعدادات بسيط للبرنامج
CREATE TABLE IF NOT EXISTS teachers_manager.app_settings (
    key        text PRIMARY KEY,
    value      text NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE teachers_manager.app_settings ENABLE ROW LEVEL SECURITY;   -- مقروء من n8n بس

INSERT INTO teachers_manager.app_settings (key, value)
VALUES ('free_until', '2026-12-31 23:59:59')   -- بتوقيت القاهرة
ON CONFLICT (key) DO NOTHING;

-- دالة بترجّع نهاية الفترة المجانية كتوقيت كامل
CREATE OR REPLACE FUNCTION teachers_manager.free_until()
RETURNS timestamptz
LANGUAGE sql
STABLE
AS $$
    SELECT (value::timestamp AT TIME ZONE 'Africa/Cairo')
    FROM teachers_manager.app_settings
    WHERE key = 'free_until';
$$;

-- 3) عمود الباقة (فاضي = لسه مااختارش). مش بيأثر على أي حاجة دلوقتي.
ALTER TABLE teachers_manager.subscriptions
    ADD COLUMN IF NOT EXISTS plan text;

-- 4) كل اللي في الفترة التجريبية: التجربة تمتد لحد نهاية المجانية
UPDATE teachers_manager.subscriptions
SET trial_ends_at = teachers_manager.free_until(),
    updated_at    = now()
WHERE status = 'trial'
  AND (trial_ends_at IS NULL OR trial_ends_at < teachers_manager.free_until());

-- 5) اللي تجربتهم (الـ 7 أيام القديمة) خلصت ومادفعوش: يرجعوا مجاني
UPDATE teachers_manager.subscriptions
SET status        = 'trial',
    trial_ends_at = teachers_manager.free_until(),
    updated_at    = now()
WHERE status = 'expired'
  AND paid_until IS NULL;

-- 6) أي مدرس جديد يسجّل: التجربة تلقائيًا لحد نهاية المجانية
--    (حتى لو workflow التسجيل initialize-teacher لسه بيحط 7 أيام)
CREATE OR REPLACE FUNCTION teachers_manager.apply_free_period()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    v_until timestamptz := teachers_manager.free_until();
BEGIN
    IF NEW.status = 'trial'
       AND v_until IS NOT NULL
       AND v_until > now()
       AND (NEW.trial_ends_at IS NULL OR NEW.trial_ends_at < v_until) THEN
        NEW.trial_ends_at := v_until;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_apply_free_period ON teachers_manager.subscriptions;   -- الـ trigger بس، مش جدول
CREATE TRIGGER trg_apply_free_period
    BEFORE INSERT ON teachers_manager.subscriptions
    FOR EACH ROW
    EXECUTE FUNCTION teachers_manager.apply_free_period();

COMMIT;

-- ============================================================================
-- للتأكد بعد التنفيذ:
--   SELECT status, COUNT(*), MIN(trial_ends_at), MAX(trial_ends_at)
--   FROM teachers_manager.subscriptions GROUP BY status;
--
-- لتغيير نهاية المجانية بعدين (مثلًا لـ 15 يناير):
--   UPDATE teachers_manager.app_settings SET value = '2027-01-15 23:59:59', updated_at = now() WHERE key = 'free_until';
--   UPDATE teachers_manager.subscriptions SET trial_ends_at = teachers_manager.free_until(), updated_at = now()
--   WHERE status = 'trial' AND trial_ends_at < teachers_manager.free_until();
--   وغيّري FREE_UNTIL في js/config.js لنفس التاريخ.
-- ============================================================================
```

### 3.2 فلوس الشهر — `n8n/MONTHLY_INCOME_DB_MIGRATION.sql`

```sql
-- ============================================================================
-- MONTHLY_INCOME_DB_MIGRATION.sql
-- ميزة "فلوس الشهر": كام طالب دفع خلال الشهر، وإجمالي المبلغ اللي اتحصّل
-- (تُستخدم من n8n/monthly-income.json ومن كارت "فلوس الشهر" في الرئيسية)
--
-- الأمان على البيانات:
--   * الملف ده بيعمل دالة (FUNCTION) بتقرأ بس. مفيش أي DELETE ولا UPDATE ولا
--     DROP TABLE ولا تغيير في أي جدول موجود.
--   * ممكن يتنفذ أكتر من مرة بأمان (CREATE OR REPLACE).
--
-- ليه الدالة بتدوّر على جدول الدفعات بنفسها؟
--   جدول الدفعات اتعمل مع workflows الدفع (student-billing) ومش موجود في ملفات
--   المشروع، فبدل ما نخمّن اسمه، الدالة بتلاقي الجدول اللي في schema
--   teachers_manager وفيه الأعمدة: student_id و lessons_count و amount و created_at.
--   لو حابة تتأكدي بنفسك قبل التنفيذ، شغّلي الاستعلام ده:
--
--   SELECT table_name FROM information_schema.columns
--   WHERE table_schema = 'teachers_manager'
--     AND column_name IN ('student_id','lessons_count','amount','created_at')
--   GROUP BY table_name HAVING COUNT(DISTINCT column_name) = 4;
-- ============================================================================

CREATE OR REPLACE FUNCTION teachers_manager.monthly_income(
    p_teacher_id uuid,
    p_month date DEFAULT date_trunc('month', (now() AT TIME ZONE 'Africa/Cairo'))::date
)
RETURNS json
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    v_table      text;
    v_has_teacher boolean;
    v_kind_col   text;
    v_note_col   boolean;
    v_from       timestamptz;
    v_to         timestamptz;
    v_filter     text;
    v_sql        text;
    v_result     json;
BEGIN
    -- حدود الشهر بتوقيت القاهرة
    v_from := (date_trunc('month', p_month)::timestamp) AT TIME ZONE 'Africa/Cairo';
    v_to   := ((date_trunc('month', p_month) + interval '1 month')::timestamp) AT TIME ZONE 'Africa/Cairo';

    -- 1) إيجاد جدول الدفعات
    SELECT c.table_name INTO v_table
    FROM information_schema.columns c
    JOIN information_schema.tables t
      ON t.table_schema = c.table_schema AND t.table_name = c.table_name AND t.table_type = 'BASE TABLE'
    WHERE c.table_schema = 'teachers_manager'
      AND c.column_name IN ('student_id', 'lessons_count', 'amount', 'created_at')
    GROUP BY c.table_name
    HAVING COUNT(DISTINCT c.column_name) = 4
    ORDER BY (c.table_name ILIKE '%payment%') DESC, c.table_name
    LIMIT 1;

    IF v_table IS NULL THEN
        RETURN json_build_object(
            'available', false,
            'month', to_char(p_month, 'YYYY-MM'),
            'paid_students', 0, 'total_amount', 0, 'payments_count', 0, 'lessons_paid', 0,
            'students', '[]'::json
        );
    END IF;

    -- 2) الأعمدة الاختيارية
    SELECT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema = 'teachers_manager' AND table_name = v_table AND column_name = 'teacher_id')
      INTO v_has_teacher;

    SELECT column_name INTO v_kind_col
    FROM information_schema.columns
    WHERE table_schema = 'teachers_manager' AND table_name = v_table
      AND column_name IN ('kind', 'type', 'entry_type', 'payment_type', 'action')
    LIMIT 1;

    SELECT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema = 'teachers_manager' AND table_name = v_table AND column_name = 'note')
      INTO v_note_col;

    -- 3) إيه اللي يتحسب "دفعة": مش التعديلات اليدوية ولا رصيد البداية
    IF v_kind_col IS NOT NULL THEN
        v_filter := format('lower(p.%I::text) IN (''payment'', ''pay'', ''add_payment'', ''paid'')', v_kind_col);
    ELSE
        v_filter := '(COALESCE(p.amount, 0) > 0 OR (p.lessons_count > 0'
                 || CASE WHEN v_note_col
                         THEN ' AND COALESCE(p.note, '''') NOT LIKE ''إضافة يدوية%'' AND COALESCE(p.note, '''') NOT LIKE ''خصم%'' AND COALESCE(p.note, '''') NOT LIKE ''%بداية%'''
                         ELSE '' END
                 || '))';
    END IF;

    v_sql := format($q$
        WITH pays AS (
            SELECT p.student_id,
                   COALESCE(p.amount, 0)::numeric       AS amount,
                   COALESCE(p.lessons_count, 0)::int    AS lessons,
                   p.created_at
            FROM teachers_manager.%I p
            JOIN teachers_manager.students s ON s.id = p.student_id
            WHERE s.teacher_id = $1
              %s
              AND p.created_at >= $2 AND p.created_at < $3
              AND %s
        ),
        per_student AS (
            SELECT pays.student_id,
                   st.name,
                   SUM(pays.amount)   AS amount,
                   SUM(pays.lessons)  AS lessons,
                   COUNT(*)           AS payments,
                   MAX(pays.created_at) AS last_paid_at
            FROM pays
            JOIN teachers_manager.students st ON st.id = pays.student_id
            GROUP BY pays.student_id, st.name
        )
        SELECT json_build_object(
            'available', true,
            'month', to_char($2 AT TIME ZONE 'Africa/Cairo', 'YYYY-MM'),
            'paid_students', (SELECT COUNT(*) FROM per_student),
            'total_amount', COALESCE((SELECT SUM(amount) FROM per_student), 0),
            'payments_count', COALESCE((SELECT SUM(payments) FROM per_student), 0),
            'lessons_paid', COALESCE((SELECT SUM(lessons) FROM per_student), 0),
            'students', COALESCE((SELECT json_agg(json_build_object(
                    'student_id', student_id, 'name', name, 'amount', amount,
                    'lessons', lessons, 'payments', payments, 'last_paid_at', last_paid_at)
                    ORDER BY amount DESC, name) FROM per_student), '[]'::json)
        )
    $q$,
        v_table,
        CASE WHEN v_has_teacher THEN 'AND p.teacher_id = $1' ELSE '' END,
        v_filter
    );

    EXECUTE v_sql INTO v_result USING p_teacher_id, v_from, v_to;
    RETURN v_result;
END;
$$;

-- ملحوظة: الدالة بتتنادى من n8n باتصال Postgres (نفس اتصال باقي الـ workflows)،
-- فمش محتاجة صلاحيات إضافية. لو حبيتي تجربيها من محرر SQL:
-- SELECT teachers_manager.monthly_income('<teacher uuid>'::uuid, '2026-10-01'::date);
```

### 3.3 الاقتراحات — `n8n/SUGGESTIONS_DB_MIGRATION.sql`

```sql
-- ============================================================================
-- SUGGESTIONS_DB_MIGRATION.sql
-- زرار "عندك اقتراح؟" جوه البرنامج + أساس داشبورد المساهمين (بعدين)
-- (يُستخدم من n8n/submit-suggestion.json)
--
-- الأمان على البيانات: جدول جديد بس. مفيش أي تعديل أو حذف في الجداول الموجودة.
-- ممكن يتنفذ أكتر من مرة بأمان.
-- ============================================================================

CREATE TABLE IF NOT EXISTS teachers_manager.feature_suggestions (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    teacher_id  uuid REFERENCES teachers_manager.profiles(id) ON DELETE SET NULL,
    suggestion  text NOT NULL CHECK (char_length(suggestion) BETWEEN 3 AND 2000),
    allow_name  boolean NOT NULL DEFAULT false,      -- موافق إن اسمه يظهر لما الميزة تتنفذ
    page        text,                                -- الصفحة اللي اتبعت منها الاقتراح
    status      text NOT NULL DEFAULT 'new'
                CHECK (status IN ('new', 'planned', 'in_progress', 'released', 'declined', 'duplicate')),
    votes       integer NOT NULL DEFAULT 1,          -- كام مدرس طلب نفس الحاجة (بتتزود يدويًا)
    admin_note  text,
    released_at timestamptz,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS feature_suggestions_status_idx  ON teachers_manager.feature_suggestions (status, created_at DESC);
CREATE INDEX IF NOT EXISTS feature_suggestions_teacher_idx ON teachers_manager.feature_suggestions (teacher_id);

-- محدش يقدر يقرأ أو يكتب من المتصفح مباشرة؛ الوصول من n8n بس
ALTER TABLE teachers_manager.feature_suggestions ENABLE ROW LEVEL SECURITY;

-- جاهز لداشبورد المساهمين بعدين: الاقتراحات اللي اتنفذت وأصحابها وافقوا على ظهور أسمائهم
CREATE OR REPLACE VIEW teachers_manager.suggestion_contributors AS
SELECT p.id   AS teacher_id,
       p.name AS teacher_name,
       COUNT(*) FILTER (WHERE s.status = 'released') AS released_count,
       COUNT(*)                                     AS total_count,
       MAX(s.released_at)                           AS last_released_at
FROM teachers_manager.feature_suggestions s
JOIN teachers_manager.profiles p ON p.id = s.teacher_id
WHERE s.allow_name
GROUP BY p.id, p.name;

-- ============================================================================
-- متابعة الاقتراحات (من SQL Editor):
--   SELECT s.created_at, p.name, s.suggestion, s.status, s.votes
--   FROM teachers_manager.feature_suggestions s
--   LEFT JOIN teachers_manager.profiles p ON p.id = s.teacher_id
--   ORDER BY s.created_at DESC;
--
-- لما تنفذي اقتراح:
--   UPDATE teachers_manager.feature_suggestions
--   SET status = 'released', released_at = now(), updated_at = now()
--   WHERE id = '<id>';
-- ============================================================================
```

---

## 4) استعلام `get-today-lessons` الجديد (عقدة Get Today Lessons)

```sql
WITH today_schedules AS (
  SELECT s.id AS schedule_id, s.student_id, s.start_time, s.duration_minutes, st.name AS student_name
  FROM teachers_manager.schedules s
  JOIN teachers_manager.students st ON st.id = s.student_id
  WHERE s.teacher_id = $1::uuid
    AND (
      (
        s.recurrence_type IN ('weekly','daily')
        AND s.day_of_week = EXTRACT(DOW FROM CURRENT_DATE)::int
        AND (s.start_date IS NULL OR s.start_date <= CURRENT_DATE)
      )
      OR (
        s.recurrence_type = 'monthly'
        AND s.start_date IS NOT NULL
        AND s.start_date <= CURRENT_DATE
        AND EXTRACT(DAY FROM s.start_date) = EXTRACT(DAY FROM CURRENT_DATE)
      )
      OR (
        s.recurrence_type = 'none'
        AND s.start_date = CURRENT_DATE
      )
    )
),
-- لو الطالب عنده أكتر من حصة النهارده: أول حصة اتسجلت تتربط بأول موعد، والتانية بالتاني...
-- (قبل كده كل مواعيد الطالب كانت بتاخد حالة آخر حصة بس)
ranked_schedules AS (
  SELECT ts.*, ROW_NUMBER() OVER (PARTITION BY ts.student_id ORDER BY ts.start_time) AS rn
  FROM today_schedules ts
),
ranked_lessons AS (
  SELECT l.id, l.status, l.student_id,
         (to_jsonb(l) ->> 'attendance') AS attendance,   -- آمن حتى لو العمود مش موجود
         ROW_NUMBER() OVER (PARTITION BY l.student_id ORDER BY l.created_at) AS rn
  FROM teachers_manager.lessons l
  WHERE l.teacher_id = $1::uuid
    AND l.lesson_date::date = CURRENT_DATE
    AND l.student_id IN (SELECT student_id FROM today_schedules)
),
today_with_status AS (
  SELECT
    rs.schedule_id,
    rs.student_id,
    rs.student_name,
    rs.start_time,
    rs.duration_minutes,
    rl.id AS lesson_id,
    rl.status AS lesson_status,
    rl.attendance
  FROM ranked_schedules rs
  LEFT JOIN ranked_lessons rl ON rl.student_id = rs.student_id AND rl.rn = rs.rn
)
SELECT COALESCE(json_agg(row_to_json(today_with_status) ORDER BY start_time), '[]'::json) AS lessons
FROM today_with_status;
```

## 5) كود إشعار الصبح بنظام 12 ساعة (عقدة Build Notification Text في send-daily-lesson-notifications)

```javascript
// بناء نص عنوان ومحتوى الإشعار لكل معلّم عنده حصة واحدة على الأقل اليوم
const items = $input.all();
const results = [];

for (const item of items) {
    const row = item.json;
    if (!row.teacher_id) continue;

    const lessons = Array.isArray(row.lessons) ? row.lessons : [];
    const count = row.lesson_count || lessons.length;
    if (count === 0) continue; // لا نرسل إشعار لمعلم بدون حصص اليوم

    // نعرض أول 5 حصص بالتفصيل (اسم الطالب + الوقت)، وأي حصص زيادة بنلخصها برقم
    const detailed = lessons.slice(0, 5).map((l) => {
        // الوقت بنظام 12 ساعة (مثال: 4:30 م) بدل 16:30
        const raw = (l.start_time || '').toString().substring(0, 5);
        const [hh, mm] = raw.split(':').map((x) => parseInt(x, 10));
        const time = Number.isFinite(hh)
            ? `${(hh % 12) || 12}:${String(Number.isFinite(mm) ? mm : 0).padStart(2, '0')} ${hh >= 12 ? 'م' : 'ص'}`
            : raw;
        return `${l.student_name || 'طالب'} (${time})`;
    }).join('، ');

    const extraCount = lessons.length > 5 ? lessons.length - 5 : 0;
    const extraText = extraCount > 0 ? ` و${extraCount} ${extraCount === 1 ? 'حصة أخرى' : 'حصص أخرى'}` : '';

    const title = count === 1 ? 'عندك حصة واحدة اليوم' : `عندك ${count} حصص اليوم`;
    const body = detailed + extraText;

    results.push({
        json: {
            teacher_id: row.teacher_id,
            title,
            body
        }
    });
}

return results;
```

## 6) الـ workflows الجديدة

### 6.1 `monthly-income` (GET `/webhook/monthly-income?month=YYYY-MM`)
Webhook ← Verify User ← Authorized? ← Monthly Income (Postgres) ← Success Response.

كود عقدة **Verify User**:
```javascript
// التحقق من هوية المدرس عن طريق Supabase نفسه (مش مجرد فك التوكن):
// التوكن المزوّر أو المنتهي بيترفض هنا قبل ما نلمس قاعدة البيانات.
const SUPABASE_URL = 'https://qdpnupgqvjxlrmwwgmij.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFkcG51cGdxdmp4bHJtd3dnbWlqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk5NjczMjUsImV4cCI6MjA4NTU0MzMyNX0.gaWPEgrhIQJzZLVoo7x1hnS-63ZJPZN96Xb3WpqApik';
const req = $input.first().json;
const headers = req.headers || {};
const authHeader = headers.authorization || headers.Authorization || '';
const token = String(authHeader).replace(/^Bearer\s+/i, '').trim();
if (!token || token.split('.').length < 3) {
  return [{ json: { ok: false, code: 'UNAUTHORIZED' } }];
}
let user = null;
try {
  user = await this.helpers.httpRequest({
    method: 'GET',
    url: SUPABASE_URL + '/auth/v1/user',
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + token },
    json: true,
  });
} catch (e) {
  return [{ json: { ok: false, code: 'UNAUTHORIZED' } }];
}
if (!user || !user.id) return [{ json: { ok: false, code: 'UNAUTHORIZED' } }];

// الشهر المطلوب: ?month=YYYY-MM (لو مش موجود = الشهر الحالي بتوقيت القاهرة)
const q = req.query || {};
let month = String(q.month || '').trim();
if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Africa/Cairo' }));
  month = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
}
return [{ json: { ok: true, teacherId: user.id, monthStart: month + '-01' } }];
```
استعلام عقدة **Monthly Income**:
```sql
SELECT teachers_manager.monthly_income($1::uuid, $2::date) AS result;
```
(قيم الاستعلام: `{{ [$json.teacherId, $json.monthStart] }}`)

### 6.2 `submit-suggestion` (POST `/webhook/submit-suggestion`)
Webhook ← Verify User ← Authorized? ← Save Suggestion (Postgres) ← Build Owner Message ← Success Response.

كود عقدة **Verify User**:
```javascript
// التحقق من هوية المدرس عن طريق Supabase نفسه (مش مجرد فك التوكن):
// التوكن المزوّر أو المنتهي بيترفض هنا قبل ما نلمس قاعدة البيانات.
const SUPABASE_URL = 'https://qdpnupgqvjxlrmwwgmij.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFkcG51cGdxdmp4bHJtd3dnbWlqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk5NjczMjUsImV4cCI6MjA4NTU0MzMyNX0.gaWPEgrhIQJzZLVoo7x1hnS-63ZJPZN96Xb3WpqApik';
const req = $input.first().json;
const headers = req.headers || {};
const authHeader = headers.authorization || headers.Authorization || '';
const token = String(authHeader).replace(/^Bearer\s+/i, '').trim();
if (!token || token.split('.').length < 3) {
  return [{ json: { ok: false, code: 'UNAUTHORIZED' } }];
}
let user = null;
try {
  user = await this.helpers.httpRequest({
    method: 'GET',
    url: SUPABASE_URL + '/auth/v1/user',
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + token },
    json: true,
  });
} catch (e) {
  return [{ json: { ok: false, code: 'UNAUTHORIZED' } }];
}
if (!user || !user.id) return [{ json: { ok: false, code: 'UNAUTHORIZED' } }];

const body = req.body || {};
const text = String(body.suggestion || '').trim().slice(0, 2000);
if (text.length < 3) return [{ json: { ok: false, code: 'INVALID' } }];
const allowName = body.allow_name === true || body.allow_name === 'true';
const page = String(body.page || '').slice(0, 120);
return [{ json: { ok: true, teacherId: user.id, email: user.email || '', text, allowName, page } }];
```
استعلام عقدة **Save Suggestion**:
```sql
INSERT INTO teachers_manager.feature_suggestions (teacher_id, suggestion, allow_name, page)
VALUES ($1::uuid, $2, $3::boolean, NULLIF($4, ''))
RETURNING id, created_at,
  (SELECT name FROM teachers_manager.profiles WHERE id = $1::uuid) AS teacher_name;
```
كود عقدة **Build Owner Message** (لو حابة يوصلك كل اقتراح على واتساب، وصّلي بعدها عقدة الإرسال اللي بتستخدميها في باقي الـ workflows واستخدمي `{{$json.message}}`):
```javascript
// رسالة جاهزة لصاحبة البرنامج على واتساب (عقدة الإرسال اختيارية - شوفي الملاحظة في README_N8N_UPDATES.md)
const s = $json;
const v = $('Verify User').item.json;
return [{ json: {
  id: s.id,
  message: `💡 اقتراح جديد من ${s.teacher_name || v.email}${v.allowName ? '' : ' (مش عايز اسمه يظهر)'}:\n${v.text}${v.page ? '\nمن صفحة: ' + v.page : ''}`
} }];
```

### 6.3 (اختياري) حفظ مصدر التسجيل وكود الترشيح
الواجهة بقت بتبعت `signup_source` (فيه `ref` و `utm_source`...) مع طلب `initialize-teacher`. عشان يتحفظ:
```sql
ALTER TABLE teachers_manager.profiles ADD COLUMN IF NOT EXISTS signup_source jsonb;
```
وفي workflow `initialize-teacher` ضيفي العمود ده في جملة الإدخال بقيمة `{{ JSON.stringify($json.body.signup_source || null) }}`. لو ماعملتيش ده، التسجيل شغال عادي والقيمة بتتجاهل.

> ملحوظة: تمديد التجربة للمسجلين الجداد بيتعمل تلقائيًا من قاعدة البيانات (trigger)، فمش لازم تعدّلي مدة التجربة في `initialize-teacher`.

---

## 7) القياس الجديد في Google Tag Manager

| الحدث | بيتبعت إمتى |
|---|---|
| `sign_up` (ومعاه `subject` و `utm_source` و `ref` لو موجودين) | بعد التسجيل |
| `landing_cta` | ضغطة "ابدأ مجانًا" في الصفحة الرئيسية |
| `student_added` (`students_count`, `method`) | إضافة طالب أو أكتر |
| `schedule_saved` (`days_count`) | حفظ مواعيد |
| `billing_enabled` | تفعيل متابعة الدفع |
| `payment_reminder_sent` | فتح رسالة التذكير على واتساب |
| `ai_request` | سؤال للمساعد الذكي |
| `pwa_installed` | تثبيت التطبيق |
| `income_viewed` | فتح فلوس الشهر |
| `suggestion_sent` | إرسال اقتراح |
| `plan_click` | ضغطة على باقة |

لازم تعملي Trigger من نوع Custom Event لكل حدث جوه GTM عشان يظهر في التقارير.

---

## 8) قائمة الاختبار قبل النشر

- [ ] تسجيل جديد ← يظهر "مجاني لحد 31 ديسمبر" ← يدخل الرئيسية.
- [ ] تسجيل بإيميل مسجّل قبل كده ← رسالة عربي تحت خانة الإيميل ورابط الدخول.
- [ ] دليل البداية: إضافة طالب ← نافذة المواعيد تفتح على النموذج ← اختيار يومين ← حفظ ← زرار "خلصت المواعيد" ← صفحة تسجيل الحصة.
- [ ] الوقت في نموذج الموعد ساعة/دقيقة/صباحًا-مساءً، وفي القائمة "5:30 م".
- [ ] حفظ حصة لطالب مالوش متابعة دفع ← كارت "عايز البرنامج يحسبلك…".
- [ ] تفعيل الدفع مع "طبّق على باقي الطلاب" ← كل الطلاب اتفعّلوا.
- [ ] تسجيل دفعة ← كارت "فلوس الشهر" في الرئيسية يتحدث (بعد ما الـ workflow يتفعل) ← التفاصيل.
- [ ] زرار 💡 في الهيدر ← إرسال اقتراح ← يظهر في جدول feature_suggestions.
- [ ] صفحة الاشتراك: الباقتين وزراير واتساب.
- [ ] تجربة وضع القراءة فقط: غيّري trial_ends_at لحساب تجربة لتاريخ قديم ← البرنامج يفتح والبيانات ظاهرة ← محاولة إضافة طالب تفتح نافذة الاشتراك. (رجّعي التاريخ بعدها.)
- [ ] تقرير ولي الأمر فيه رابط الموقع بكود المدرس.
- [ ] الصبح: الإشعار فيه الوقت بنظام 12 ساعة.

---

## 9) حاجات مهمة قبل ما الأعداد تكبر (مش متطبقة في التحديث ده)

1. **التحقق من هوية المدرس في الـ workflows القديمة:** معظم الـ workflows الحالية بتفك التوكن (Decode JWT) من غير ما تتأكد إنه حقيقي، يعني ممكن حد يزوّر توكن. الـ workflows الجديدة (monthly-income و submit-suggestion) بتتأكد من Supabase نفسه. الأفضل تنقلي كود عقدة **Verify User** (القسم 6.1) مكان Decode JWT في باقي الـ workflows، workflow ورا التاني، وتختبري كل واحد بعد التغيير.
2. **حماية الاشتراك من السيرفر:** وضع "القراءة فقط" بيتطبق من الواجهة. قبل يناير، ضيفي شرط في workflows الحفظ (create-student و save-lesson…) يرفض الطلب لو `trial_ends_at` و `paid_until` الاتنين فاتوا.
3. **حدود باقة البداية (10 طلاب):** تتعمل في ديسمبر لما الدفع يبدأ (شرط في create-student على عمود `plan` اللي اتضاف في جدول الاشتراكات).
4. **RLS:** اتأكدي إن حماية الصفوف مفعّلة على كل جداول `teachers_manager` (الجداول الجديدة مفعّل عليها).
