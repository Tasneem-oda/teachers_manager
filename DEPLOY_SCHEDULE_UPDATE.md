# تحديث الجدول والمواعيد الشخصية — دليل التطبيق

## ترتيب التطبيق

1. **Supabase ← SQL Editor:** نفّذي `PERSONAL_EVENTS_DB_MIGRATION.sql` (جدول جديد + دوال، ومفيش أي تعديل أو حذف في الجداول الموجودة).
2. **n8n:**
   - استيراد workflow جديد `get-personal-events.json`، واختيار اتصال Postgres في عقدة **Get Events**، وبعدين تفعيله.
   - استيراد workflow جديد `save-personal-event.json`، واختيار اتصال Postgres في عقدة **Save Event**، وبعدين تفعيله.
   - تحديث `send-daily-lesson-notifications`: الملف مبني على آخر نسخة بعتيها، وفيه تعديل عقدتين بس (**Get Today Schedules Per Teacher** و **Build Notification Text**). تقدري تستورديه كله، أو تنسخي العقدتين من تحت.
   - ⚠️ لازم خطوة 1 تتنفذ قبل تحديث إشعار الصبح، لأن الاستعلام الجديد بيقرأ من جدول المواعيد الشخصية.
3. **الموقع:** ارفعي ملفات الواجهة (رقم النسخة بقى `?v=16`).

## اللي اتغيّر في الواجهة

| التعديل | الملفات |
|---|---|
| صفحة الجدول اتكتبت من جديد: عرض «اليوم» (قائمة مرتبة بالوقت) وعرض «الأسبوع» (جدول)، أسابيع بتواريخ حقيقية، زرار النهارده، خط «دلوقتي» | `schedule.html` |
| الأسبوع من السبت للجمعة في الجدول واختيار الأيام وقائمة مواعيد الطالب | `schedule.html`, `js/form-widgets.js`, `js/student-appointments.js`, `js/calendar-utils.js` (جديد) |
| صف الأيام ثابت وانتي بتسكرولي: شريط الأيام في عرض اليوم، وصف الأيام وعمود الساعات في عرض الأسبوع | `schedule.html` |
| المواعيد الشخصية: إضافة/تعديل/حذف، مرة واحدة أو كل أسبوع أو كل يوم أو كل شهر، لون وملاحظة، أسماء جاهزة (دكتور، اجتماع...) | `schedule.html`, `js/api.js`, `js/config.js` |
| تنبيه لو الموعد بيتعارض مع حصة أو موعد تاني قبل الحفظ | `js/calendar-utils.js`, `schedule.html` |
| الرئيسية: «مواعيدك التانية النهارده» تحت حصص اليوم + رابط سريع «موعد شخصي» | `dashboard.html` |
| إشعار الصبح بقى فيه المواعيد الشخصية (📌) | `send-daily-lesson-notifications.json` |
| على الموبايل: زرار إضافة عائم فوق شريط التنقل | `schedule.html` |
| إصلاحات: عناصر كانت المفروض مخفية وبتظهر (خاصية hidden)، وشكل «عندك اقتراح؟» و«تسجيل الخروج» في القائمة الجانبية | `css/style.css` |
| اسم الصفحة في القائمة بقى «جدولي» | `js/sidebar.js` |

> تصحيح جانبي: المواعيد اللي «مرة واحدة» أو «كل شهر» كانت بتظهر في الجدول القديم كل أسبوع. دلوقتي بتظهر في تاريخها بس.

## كود SQL الكامل — `PERSONAL_EVENTS_DB_MIGRATION.sql`

```sql
-- ============================================================================
-- PERSONAL_EVENTS_DB_MIGRATION.sql
-- "مواعيد شخصية" في الجدول: أي موعد مش حصة (دكتور، مشوار، اجتماع، جيم...)
-- يُستخدم من:
--   n8n/get-personal-events.json   (GET  /webhook/get-personal-events)
--   n8n/save-personal-event.json   (POST /webhook/save-personal-event)
--   n8n/send-daily-lesson-notifications.json (إشعار الصبح بقى بيشمل المواعيد الشخصية)
--
-- الأمان على البيانات:
--   * جدول جديد + دوال بس. مفيش أي تعديل أو حذف في الجداول الموجودة.
--   * ممكن يتنفذ أكتر من مرة بأمان (IF NOT EXISTS / CREATE OR REPLACE).
--   * الحذف الوحيد اللي ممكن يحصل هو لما المدرس نفسه يحذف موعد شخصي من البرنامج،
--     وبيتم فقط على مواعيده هو (teacher_id).
--
-- مهم: نفّذي الملف ده قبل تحديث workflow إشعار الصبح.
-- ============================================================================

CREATE TABLE IF NOT EXISTS teachers_manager.personal_events (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    teacher_id          uuid NOT NULL REFERENCES teachers_manager.profiles(id) ON DELETE CASCADE,
    title               text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 120),
    note                text CHECK (note IS NULL OR char_length(note) <= 1000),
    color               text NOT NULL DEFAULT 'gold'
                        CHECK (color IN ('gold', 'green', 'blue', 'rose', 'gray')),
    -- نفس منطق جدول schedules بالظبط (0 = الأحد ... 6 = السبت)
    day_of_week         integer NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
    start_time          time NOT NULL,
    duration_minutes    integer NOT NULL DEFAULT 60 CHECK (duration_minutes BETWEEN 5 AND 720),
    recurrence_type     text NOT NULL DEFAULT 'weekly'
                        CHECK (recurrence_type IN ('weekly', 'daily', 'monthly', 'none')),
    start_date          date,
    recurrence_group_id uuid,          -- المواعيد اللي اتعملت مع بعض لأكتر من يوم
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT personal_events_date_required
        CHECK (recurrence_type IN ('weekly', 'daily') OR start_date IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS personal_events_teacher_idx ON teachers_manager.personal_events (teacher_id, day_of_week);
CREATE INDEX IF NOT EXISTS personal_events_group_idx   ON teachers_manager.personal_events (recurrence_group_id);

-- محدش يقرأ أو يكتب من المتصفح مباشرة؛ الوصول من n8n بس
ALTER TABLE teachers_manager.personal_events ENABLE ROW LEVEL SECURITY;


-- ----------------------------------------------------------------------------
-- قراءة مواعيد المدرس
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION teachers_manager.get_personal_events(p_teacher_id uuid)
RETURNS json
LANGUAGE sql
STABLE
AS $$
    SELECT json_build_object(
        'success', true,
        'data', json_build_object(
            'events', COALESCE((
                SELECT json_agg(json_build_object(
                    'id', e.id,
                    'title', e.title,
                    'note', e.note,
                    'color', e.color,
                    'day_of_week', e.day_of_week,
                    'start_time', to_char(e.start_time, 'HH24:MI:SS'),
                    'duration_minutes', e.duration_minutes,
                    'recurrence_type', e.recurrence_type,
                    'start_date', e.start_date,
                    'recurrence_group_id', e.recurrence_group_id
                ) ORDER BY e.day_of_week, e.start_time)
                FROM teachers_manager.personal_events e
                WHERE e.teacher_id = p_teacher_id
            ), '[]'::json)
        )
    );
$$;


-- ----------------------------------------------------------------------------
-- إضافة / تعديل / حذف — دالة واحدة بتتحقق من كل حاجة وبترجع رد جاهز للواجهة
-- p_payload:
--   { "action": "create", "title", "note", "color", "days": [0..6], "start_time": "17:30",
--     "duration_minutes": 60, "recurrence_type": "weekly|daily|monthly|none", "start_date": "2026-10-15" }
--   { "action": "update", "id", ...نفس الحقول (day_of_week بدل days) }
--   { "action": "delete", "id", "scope": "one|group" }
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION teachers_manager.save_personal_event(p_teacher_id uuid, p_payload jsonb)
RETURNS json
LANGUAGE plpgsql
AS $$
DECLARE
    v_action   text := lower(COALESCE(p_payload->>'action', 'create'));
    v_title    text := btrim(COALESCE(p_payload->>'title', ''));
    v_note     text := NULLIF(btrim(COALESCE(p_payload->>'note', '')), '');
    v_color    text := COALESCE(NULLIF(p_payload->>'color', ''), 'gold');
    v_rec      text := COALESCE(NULLIF(p_payload->>'recurrence_type', ''), 'weekly');
    v_time     time;
    v_dur      integer;
    v_date     date;
    v_days     integer[];
    v_group    uuid;
    v_id       uuid;
    v_count    integer;
    v_ids      json;
BEGIN
    IF p_teacher_id IS NULL THEN
        RETURN json_build_object('success', false, 'error', json_build_object('code', 'UNAUTHORIZED', 'message', 'انتهت الجلسة. ادخل تاني.'));
    END IF;

    -- ------------------------------------------------------------ حذف
    IF v_action = 'delete' THEN
        BEGIN
            v_id := (p_payload->>'id')::uuid;
        EXCEPTION WHEN others THEN
            v_id := NULL;
        END;
        IF v_id IS NULL THEN
            RETURN json_build_object('success', false, 'error', json_build_object('code', 'INVALID', 'message', 'الموعد مش موجود.'));
        END IF;

        IF COALESCE(p_payload->>'scope', 'one') = 'group' THEN
            SELECT recurrence_group_id INTO v_group
            FROM teachers_manager.personal_events WHERE id = v_id AND teacher_id = p_teacher_id;
        END IF;

        IF v_group IS NOT NULL THEN
            DELETE FROM teachers_manager.personal_events
            WHERE teacher_id = p_teacher_id AND recurrence_group_id = v_group;
        ELSE
            DELETE FROM teachers_manager.personal_events
            WHERE teacher_id = p_teacher_id AND id = v_id;
        END IF;
        GET DIAGNOSTICS v_count = ROW_COUNT;

        IF v_count = 0 THEN
            RETURN json_build_object('success', false, 'error', json_build_object('code', 'NOT_FOUND', 'message', 'الموعد مش موجود أو اتحذف قبل كده.'));
        END IF;
        RETURN json_build_object('success', true, 'data', json_build_object('deleted', v_count));
    END IF;

    -- ------------------------------------------------------------ التحقق المشترك (إضافة/تعديل)
    IF char_length(v_title) < 1 THEN
        RETURN json_build_object('success', false, 'error', json_build_object('code', 'INVALID', 'message', 'اكتب اسم الموعد.'));
    END IF;
    v_title := left(v_title, 120);
    v_note := left(v_note, 1000);
    IF v_color NOT IN ('gold', 'green', 'blue', 'rose', 'gray') THEN v_color := 'gold'; END IF;
    IF v_rec NOT IN ('weekly', 'daily', 'monthly', 'none') THEN v_rec := 'weekly'; END IF;

    BEGIN
        v_time := (p_payload->>'start_time')::time;
    EXCEPTION WHEN others THEN
        v_time := NULL;
    END;
    IF v_time IS NULL THEN
        RETURN json_build_object('success', false, 'error', json_build_object('code', 'INVALID', 'message', 'اختار وقت الموعد.'));
    END IF;

    v_dur := CASE WHEN (p_payload->>'duration_minutes') ~ '^[0-9]{1,4}$' THEN (p_payload->>'duration_minutes')::integer ELSE 60 END;
    IF v_dur < 5 OR v_dur > 720 THEN v_dur := 60; END IF;

    IF v_rec IN ('monthly', 'none') THEN
        BEGIN
            v_date := (p_payload->>'start_date')::date;
        EXCEPTION WHEN others THEN
            v_date := NULL;
        END;
        IF v_date IS NULL THEN
            RETURN json_build_object('success', false, 'error', json_build_object('code', 'INVALID', 'message', 'اختار تاريخ الموعد.'));
        END IF;
    END IF;

    -- ------------------------------------------------------------ تعديل
    IF v_action = 'update' THEN
        BEGIN
            v_id := (p_payload->>'id')::uuid;
        EXCEPTION WHEN others THEN
            v_id := NULL;
        END;
        UPDATE teachers_manager.personal_events
        SET title = v_title,
            note = v_note,
            color = v_color,
            start_time = v_time,
            duration_minutes = v_dur,
            recurrence_type = v_rec,
            start_date = CASE WHEN v_rec IN ('monthly', 'none') THEN v_date ELSE NULL END,
            day_of_week = CASE
                WHEN v_rec IN ('monthly', 'none') THEN EXTRACT(DOW FROM v_date)::int
                ELSE CASE WHEN (p_payload->>'day_of_week') ~ '^[0-6]$' THEN (p_payload->>'day_of_week')::int ELSE day_of_week END
            END,
            updated_at = now()
        WHERE id = v_id AND teacher_id = p_teacher_id;
        GET DIAGNOSTICS v_count = ROW_COUNT;
        IF v_count = 0 THEN
            RETURN json_build_object('success', false, 'error', json_build_object('code', 'NOT_FOUND', 'message', 'الموعد مش موجود.'));
        END IF;
        RETURN json_build_object('success', true, 'data', json_build_object('id', v_id));
    END IF;

    -- ------------------------------------------------------------ إضافة
    IF v_rec = 'daily' THEN
        v_days := ARRAY[0, 1, 2, 3, 4, 5, 6];
    ELSIF v_rec IN ('monthly', 'none') THEN
        v_days := ARRAY[EXTRACT(DOW FROM v_date)::int];
    ELSE
        SELECT array_agg(DISTINCT d::int) INTO v_days
        FROM jsonb_array_elements_text(COALESCE(p_payload->'days', '[]'::jsonb)) AS d
        WHERE d ~ '^[0-6]$';
        IF v_days IS NULL AND (p_payload->>'day_of_week') ~ '^[0-6]$' THEN
            v_days := ARRAY[(p_payload->>'day_of_week')::int];
        END IF;
        IF v_days IS NULL OR array_length(v_days, 1) IS NULL THEN
            RETURN json_build_object('success', false, 'error', json_build_object('code', 'INVALID', 'message', 'اختار يوم واحد على الأقل.'));
        END IF;
    END IF;

    v_group := CASE WHEN array_length(v_days, 1) > 1 THEN gen_random_uuid() ELSE NULL END;

    WITH ins AS (
        INSERT INTO teachers_manager.personal_events
            (teacher_id, title, note, color, day_of_week, start_time, duration_minutes, recurrence_type, start_date, recurrence_group_id)
        SELECT p_teacher_id, v_title, v_note, v_color, d, v_time, v_dur, v_rec,
               CASE WHEN v_rec IN ('monthly', 'none') THEN v_date ELSE NULL END,
               v_group
        FROM unnest(v_days) AS d
        RETURNING id
    )
    SELECT json_agg(id), COUNT(*) INTO v_ids, v_count FROM ins;

    RETURN json_build_object('success', true, 'data', json_build_object('ids', v_ids, 'created', v_count));
END;
$$;

-- ============================================================================
-- للتجربة من SQL Editor:
--   SELECT teachers_manager.save_personal_event('<teacher uuid>'::uuid,
--     '{"action":"create","title":"دكتور الأسنان","days":[1],"start_time":"18:00","duration_minutes":60,"recurrence_type":"none","start_date":"2026-10-12"}');
--   SELECT teachers_manager.get_personal_events('<teacher uuid>'::uuid);
-- ============================================================================
```

## الـ workflows الجديدة

### `get-personal-events` (GET `/webhook/get-personal-events`)
Webhook ← Verify User ← Authorized? ← Get Events (Postgres) ← Success Response

استعلام **Get Events** (القيم: `{{ [$json.teacherId] }}`):
```sql
SELECT teachers_manager.get_personal_events($1::uuid) AS result;
```

### `save-personal-event` (POST `/webhook/save-personal-event`)
Webhook ← Verify User ← Authorized? ← Save Event (Postgres) ← Success Response

كود **Verify User**:
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
// كل التحقق من البيانات بيتعمل جوه دالة SQL (save_personal_event)
const payload = {
  action: String(body.action || 'create'),
  id: body.id || null,
  scope: body.scope || 'one',
  title: body.title != null ? String(body.title).slice(0, 200) : '',
  note: body.note != null ? String(body.note).slice(0, 1200) : '',
  color: body.color || 'gold',
  days: Array.isArray(body.days) ? body.days : [],
  day_of_week: body.day_of_week,
  start_time: body.start_time || '',
  duration_minutes: body.duration_minutes,
  recurrence_type: body.recurrence_type || 'weekly',
  start_date: body.start_date || null,
};
return [{ json: { ok: true, teacherId: user.id, payload: JSON.stringify(payload) } }];
```
استعلام **Save Event** (القيم: `{{ [$json.teacherId, $json.payload] }}`):
```sql
SELECT teachers_manager.save_personal_event($1::uuid, $2::jsonb) AS result;
```
عقدة الرد: `{{ JSON.stringify($json.result) }}` (الدالة بترجع الرد جاهز: نجاح أو رسالة خطأ عربي).

## تحديث إشعار الصبح

### عقدة Get Today Schedules Per Teacher
```sql
-- حصص النهارده + المواعيد الشخصية (جدول personal_events)
WITH today_schedules AS (
  SELECT s.teacher_id, s.start_time, st.name AS item_name, 'lesson'::text AS kind
  FROM teachers_manager.schedules s
  JOIN teachers_manager.students st ON st.id = s.student_id
  WHERE
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
),
today_events AS (
  SELECT e.teacher_id, e.start_time, e.title AS item_name, 'event'::text AS kind
  FROM teachers_manager.personal_events e
  WHERE
    (
      e.recurrence_type IN ('weekly','daily')
      AND e.day_of_week = EXTRACT(DOW FROM CURRENT_DATE)::int
      AND (e.start_date IS NULL OR e.start_date <= CURRENT_DATE)
    )
    OR (
      e.recurrence_type = 'monthly'
      AND e.start_date IS NOT NULL
      AND e.start_date <= CURRENT_DATE
      AND EXTRACT(DAY FROM e.start_date) = EXTRACT(DAY FROM CURRENT_DATE)
    )
    OR (
      e.recurrence_type = 'none'
      AND e.start_date = CURRENT_DATE
    )
),
all_items AS (
  SELECT * FROM today_schedules
  UNION ALL
  SELECT * FROM today_events
)
SELECT teacher_id,
       COUNT(*) FILTER (WHERE kind = 'lesson')::int AS lesson_count,
       COUNT(*) FILTER (WHERE kind = 'event')::int AS event_count,
       json_agg(json_build_object('student_name', item_name, 'start_time', start_time, 'kind', kind) ORDER BY start_time) AS lessons
FROM all_items
GROUP BY teacher_id;
```

### عقدة Build Notification Text
```javascript
// بناء نص عنوان ومحتوى الإشعار لكل معلّم عنده حصة أو موعد واحد على الأقل اليوم
const items = $input.all();
const results = [];

// الوقت بنظام 12 ساعة (مثال: 4:30 م) بدل 16:30
const fmt = (value) => {
    const raw = (value || '').toString().substring(0, 5);
    const [hh, mm] = raw.split(':').map((x) => parseInt(x, 10));
    return Number.isFinite(hh)
        ? `${(hh % 12) || 12}:${String(Number.isFinite(mm) ? mm : 0).padStart(2, '0')} ${hh >= 12 ? 'م' : 'ص'}`
        : raw;
};
const lessonsWord = (n) => n === 1 ? 'حصة واحدة' : n === 2 ? 'حصتين' : `${n} حصص`;
const eventsWord = (n) => n === 1 ? 'موعد واحد' : n === 2 ? 'موعدين' : `${n} مواعيد`;

for (const item of items) {
    const row = item.json;
    if (!row.teacher_id) continue;

    const all = Array.isArray(row.lessons) ? row.lessons : [];
    const lessonCount = Number(row.lesson_count) || all.filter((l) => l.kind !== 'event').length;
    const eventCount = Number(row.event_count) || all.filter((l) => l.kind === 'event').length;
    if (lessonCount + eventCount === 0) continue; // لا نرسل إشعار لمعلم ماعندوش حاجة اليوم

    // أول 5 حاجات بالتفصيل (الاسم + الوقت)، والمواعيد الشخصية قبلها 📌، والباقي بنلخصه برقم
    const detailed = all.slice(0, 5).map((l) => {
        const name = l.student_name || (l.kind === 'event' ? 'موعد' : 'طالب');
        return `${l.kind === 'event' ? '📌 ' : ''}${name} (${fmt(l.start_time)})`;
    }).join('، ');

    const extraCount = all.length > 5 ? all.length - 5 : 0;
    const extraText = extraCount > 0 ? ` و${extraCount} ${extraCount === 1 ? 'حاجة تانية' : 'حاجات تانية'}` : '';

    let title;
    if (lessonCount && eventCount) title = `عندك ${lessonsWord(lessonCount)} و${eventsWord(eventCount)} النهارده`;
    else if (lessonCount) title = lessonCount === 1 ? 'عندك حصة واحدة اليوم' : `عندك ${lessonsWord(lessonCount)} اليوم`;
    else title = `عندك ${eventsWord(eventCount)} النهارده`;
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

## قائمة الاختبار

- [ ] الجدول على الموبايل بيفتح على «اليوم»، وشريط الأيام بيبدأ بالسبت وبيفضل ثابت فوق وانتي بتسكرولي.
- [ ] «الأسبوع»: صف الأيام وعمود الساعات ثابتين وانتي بتسكرولي في الاتجاهين.
- [ ] زرار + ← موعد شخصي ← «دكتور» ← مرة واحدة ← حفظ ← يظهر بلونه في يومه بس.
- [ ] موعد شخصي «كل أسبوع» على يومين ← يظهر في اليومين ← «حذف من كل الأيام» يمسح الاتنين.
- [ ] موعد في نفس وقت حصة ← يظهر تنبيه التعارض.
- [ ] الضغط على مكان فاضي في عرض الأسبوع ← يفتح الإضافة على اليوم والساعة دول.
- [ ] الرئيسية: «مواعيدك التانية النهارده».
- [ ] إشعار الصبح التالي فيه المواعيد بعلامة 📌.
