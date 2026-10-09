# تحديث مساعد الحصة (الذكاء الاصطناعي) — دليل التطبيق

## ترتيب التطبيق
1. **n8n:** استوردي `ai-chat-assistant.json`. الملف مبني على آخر نسخة بعتيها، والتوصيلات والـ credentials زي ما هي. اللي اتغير 7 عقد بس:
   - **Decode JWT & Config:** بيستقبل «الحصة الجارية الآن» وبداية الجلسة، والحد العام بين الطلبات بقى ثانيتين بدل 4، والذاكرة 8 رسائل من الجلسة الحالية بس.
   - **Load Context & Reserve:** الذاكرة من الجلسة الحالية بس (أو آخر 3 ساعات)، و4 حصص بدل 5، و6 ملاحظات بدل 10.
   - **Build Prompt:** التعليمات الجديدة لمساعد الحصة.
   - **AI Agent:** من غير إعادة محاولة، فلو فشل بينقل للاحتياطي على طول.
   - **AI Agent (Backup):** محاولتين، بينهم 0.8 ثانية.
   - **Google Gemini Chat Model:** `gemini-3.8-flash`، حرارة 0.4، وأقصى طول للرد 700.
   - **Backup Gemini Model:** `gemini-3.5-flash-lite`، حرارة 0.4، وأقصى طول للرد 700.
2. **الموقع:** ارفعي ملفات الواجهة (v17). الملفات اللي اتغيرت: `lesson.html` و `js/api.js` و `js/icons.js`.
3. **مفيش أي تعديل في قاعدة البيانات.**

> لو حساب Gemini لسه على الخطة المجانية وظهرت رسالة «الخدمة مزدحمة» كتير، رجّعي `minIntervalSeconds` لـ 4 في عقدة Decode JWT & Config.
> لو حسّيتي إن أول كلمة في الرد بقت بتتأخر مع 3.8 Flash، بدّلي اسمي الموديلين بين العقدتين (Flash-Lite يبقى الأساسي).

## الكود الكامل للعقد

### Decode JWT & Config
```javascript
const headers = $input.first().json.headers || {};
const authHeader = headers.authorization || headers.Authorization;
if (!authHeader || typeof authHeader !== 'string') { throw new Error('Unauthorized'); }
const parts = authHeader.split(' ');
if (parts.length < 2 || !parts[1]) { throw new Error('Unauthorized'); }
const tokenParts = parts[1].split('.');
if (tokenParts.length < 2) { throw new Error('Unauthorized'); }
const base64 = tokenParts[1].replace(/-/g, '+').replace(/_/g, '/');
const jwt = JSON.parse(Buffer.from(base64, 'base64').toString('utf8'));
if (!jwt.sub) { throw new Error('Unauthorized'); }

const body = $input.first().json.body || {};
const rawMessage = (body.message || '').toString().trim();

// ================= إعدادات قابلة للتعديل =================
// عدد الطلبات المسموح بها لكل معلم في اليوم
const dailyLimit = 40;
// أقل عدد ثوانٍ بين طلبين على مستوى النظام كله.
// 2 ثانية مناسبة لو حساب Gemini مدفوع (Paid tier). لو لسه على الخطة المجانية وظهرت رسائل "الخدمة مزدحمة" كتير، رجّعيها 4.
const minIntervalSeconds = 2;
const maxMessageLength = 600;
// عدد آخر الرسائل اللي المساعد بيفتكرها — من الجلسة الحالية بس (مش محادثات أيام قديمة)
const memoryLimit = 8;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
let validationError = null;
if (!body.student_id || !UUID_RE.test(String(body.student_id))) validationError = 'رقم الطالب مطلوب';
else if (!rawMessage) validationError = 'من فضلك اكتب رسالة';
else if (rawMessage.length > maxMessageLength) validationError = `الرسالة طويلة جدًا (الحد الأقصى ${maxMessageLength} حرف)`;

// ---- الحصة الجارية الآن (الواجهة بتبعتها مع كل رسالة) — بنقبل حقول معروفة بس وبطول محدود
const lc = (body.lesson_context && typeof body.lesson_context === 'object') ? body.lesson_context : {};
const s = (v, n) => (v == null ? '' : String(v)).slice(0, n);
const MODES = ['live', 'manual', 'ready'];
const lessonContext = {
  mode: MODES.includes(lc.mode) ? lc.mode : null,
  elapsed_min: Number.isFinite(Number(lc.elapsed_min)) && lc.elapsed_min !== null && lc.elapsed_min !== '' ? Math.max(0, Math.min(600, Math.round(Number(lc.elapsed_min)))) : null,
  lesson_content: s(lc.lesson_content, 600),
  memorization: s(lc.memorization, 30),
  recitation: s(lc.recitation, 30),
  revision: s(lc.revision, 30),
  homework_status: s(lc.homework_status, 30),
  prev_homework: s(lc.prev_homework, 300),
  homework: s(lc.homework, 300),
  next_assignment: s(lc.next_assignment, 300),
  performance: s(lc.performance, 400),
  notes: s(lc.notes, 400),
};

// ---- بداية الجلسة: الذاكرة بتتحمّل من الوقت ده بس (بداية الحصة أو "محادثة جديدة")
let since = null;
if (body.session_since) {
  const t = Date.parse(body.session_since);
  if (Number.isFinite(t)) since = new Date(Math.min(t, Date.now())).toISOString();
}

return [{ json: {
  isValid: validationError === null,
  validationError,
  teacherId: jwt.sub,
  studentId: body.student_id || null,
  message: rawMessage,
  dailyLimit,
  lessonContext,
  // كل مدخلات الاستعلام في باراميتر JSON واحد (آمن مع أي فواصل أو رموز في النص)
  payload: JSON.stringify({ teacher_id: jwt.sub, student_id: body.student_id, daily_limit: dailyLimit, min_interval: minIntervalSeconds, memory_limit: memoryLimit, since })
} }];
```

### Load Context & Reserve
```sql
WITH p AS (SELECT $1::jsonb AS j),
st AS (
  SELECT s.* FROM teachers_manager.students s, p
  WHERE s.id = (p.j->>'student_id')::uuid AND s.teacher_id = (p.j->>'teacher_id')::uuid
),
slot AS (
  UPDATE teachers_manager.ai_rate_limiter
  SET last_request_at = now()
  WHERE id = 1
    AND EXISTS (SELECT 1 FROM st)
    AND (last_request_at IS NULL
         OR now() - last_request_at >= make_interval(secs => (SELECT (j->>'min_interval')::int FROM p)))
  RETURNING 1 AS ok
),
quota AS (
  INSERT INTO teachers_manager.ai_usage_daily (teacher_id, usage_date, request_count)
  SELECT (p.j->>'teacher_id')::uuid, CURRENT_DATE, 1
  FROM p
  WHERE EXISTS (SELECT 1 FROM slot)
  ON CONFLICT (teacher_id, usage_date)
  DO UPDATE SET request_count = teachers_manager.ai_usage_daily.request_count + 1
  WHERE teachers_manager.ai_usage_daily.request_count < (SELECT (j->>'daily_limit')::int FROM p)
  RETURNING request_count
)
SELECT
  EXISTS (SELECT 1 FROM st)   AS found,
  EXISTS (SELECT 1 FROM slot) AS slot_ok,
  (SELECT request_count FROM quota) AS request_count,
  (SELECT row_to_json(x) FROM (
     SELECT name, subject, current_topic, current_surah, current_from_ayah, current_to_ayah FROM st) x) AS student,
  (SELECT json_agg(x) FROM (
     SELECT l.lesson_date, l.lesson_content, l.memorization, l.recitation, l.revision, l.homework_status, l.performance, l.notes, l.next_assignment, l.homework
     FROM teachers_manager.lessons l JOIN st ON l.student_id = st.id AND l.teacher_id = st.teacher_id
     WHERE l.status = 'completed'
     ORDER BY l.lesson_date DESC, l.created_at DESC
     LIMIT 4) x) AS recent_lessons,
  (SELECT json_agg(x) FROM (
     SELECT n.note FROM teachers_manager.student_notes n JOIN st ON n.student_id = st.id AND n.teacher_id = st.teacher_id
     ORDER BY n.created_at DESC LIMIT 6) x) AS notes,
  (SELECT row_to_json(x) FROM (
     SELECT tp.teaching_style, tp.student_preferences, tp.ai_context
     FROM teachers_manager.teaching_profiles tp JOIN st ON tp.student_id = st.id AND tp.teacher_id = st.teacher_id
     LIMIT 1) x) AS profile,
  (SELECT json_agg(x ORDER BY x.created_at) FROM (
     SELECT m.role, m.content, m.created_at
     FROM teachers_manager.ai_chat_messages m JOIN st ON m.student_id = st.id AND m.teacher_id = st.teacher_id
     WHERE m.created_at >= COALESCE((SELECT NULLIF(j->>'since', '')::timestamptz FROM p), now() - interval '3 hours')
     ORDER BY m.created_at DESC
     LIMIT (SELECT (j->>'memory_limit')::int FROM p)) x) AS memory;
```

### Build Prompt
```javascript
// =====================================================================
// Build Prompt — مساعد الحصة (Lesson Copilot)
// بيبني تعليمات الموديل من: بيانات الطالب + الحصة الجارية الآن (من الواجهة)
// + آخر الحصص + ملاحظات المدرس + محادثة الجلسة دي بس.
// =====================================================================
const cfg = $('Decode JWT & Config').first().json;
const ctx = $input.first().json;
const student = ctx.student || {};
const lessons = Array.isArray(ctx.recent_lessons) ? ctx.recent_lessons : [];
const notes = Array.isArray(ctx.notes) ? ctx.notes : [];
const memory = Array.isArray(ctx.memory) ? ctx.memory : [];
const profile = ctx.profile || {};
const live = cfg.lessonContext || {};

const RATING = { excellent: 'ممتاز', very_good: 'جيد جدًا', good: 'جيد', fair: 'مقبول', poor: 'ضعيف', weak: 'ضعيف' };
const r = (v) => RATING[v] || v;
const HWS = { done: 'عمله', partial: 'عمله جزئيًا', not_done: 'ماعملهوش' };
const cut = (s, n) => { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n) + '…' : s; };

const SUBJECTS = { quran: 'القرآن الكريم (تحفيظ وتجويد)', english: 'اللغة الإنجليزية', arabic: 'اللغة العربية', math: 'الرياضيات', science: 'العلوم', programming: 'البرمجة' };
const subjectKey = String(student.subject || '').toLowerCase();
const subjectName = SUBJECTS[subjectKey] || student.subject || 'غير محددة';
const isQuran = subjectKey === 'quran';
const firstName = String(student.name || 'الطالب').trim().split(/\s+/)[0];

// ---------------- موضع الطالب
const position = [
  student.current_surah ? `السورة الحالية: ${student.current_surah}` : null,
  (student.current_from_ayah && student.current_to_ayah) ? `آخر مقطع: من آية ${student.current_from_ayah} إلى آية ${student.current_to_ayah}` : null,
  student.current_topic ? `الموضوع الحالي: ${student.current_topic}` : null,
].filter(Boolean).join('\n') || 'مش متسجّل.';

// ---------------- آخر الحصص (مختصرة)
const lessonsText = lessons.length
  ? lessons.map((l, i) => {
      const date = (l.lesson_date || '').toString().substring(0, 10);
      const p = [];
      if (l.lesson_content) p.push(`اتعمل: ${cut(l.lesson_content, 160)}`);
      const lv = [l.memorization && `حفظ/استيعاب ${r(l.memorization)}`, l.recitation && `أداء ${r(l.recitation)}`, l.revision && `مراجعة ${r(l.revision)}`].filter(Boolean);
      if (lv.length) p.push(lv.join('، '));
      if (l.homework_status) p.push(`الواجب اللي قبله: ${HWS[l.homework_status] || l.homework_status}`);
      if (l.performance) p.push(`أداء: ${cut(l.performance, 120)}`);
      if (l.notes) p.push(`ملاحظات: ${cut(l.notes, 120)}`);
      if (l.homework) p.push(`الواجب: ${cut(l.homework, 120)}`);
      if (l.next_assignment) p.push(`المخطط للجاية: ${cut(l.next_assignment, 120)}`);
      return `${i === 0 ? '(آخر حصة) ' : ''}[${date}] ${p.join(' | ') || 'من غير تفاصيل'}`;
    }).join('\n')
  : 'مفيش حصص متسجلة قبل كده.';

const notesText = notes.length ? notes.map((n) => `- ${cut(n.note, 160)}`).join('\n') : 'مفيش.';
const profileText = [
  profile.teaching_style ? `طريقة الشرح اللي بتنفع معاه: ${cut(profile.teaching_style, 200)}` : null,
  profile.student_preferences ? `اهتماماته: ${cut(profile.student_preferences, 200)}` : null,
  profile.ai_context ? `معلومات إضافية: ${cut(profile.ai_context, 300)}` : null,
].filter(Boolean).join('\n') || 'مش متسجّل.';

// ---------------- الحصة الجارية الآن (جاية من الواجهة)
const MODE = { live: 'الحصة شغالة دلوقتي', manual: 'المدرس بيسجّل حصة خلصت', ready: 'قبل بداية الحصة (تحضير)' };
const liveLines = [];
liveLines.push(`الحالة: ${MODE[live.mode] || 'مش في حصة دلوقتي (تحضير أو متابعة)'}`);
if (live.elapsed_min != null) liveLines.push(`عدّى من الحصة: ${live.elapsed_min} دقيقة`);
if (live.prev_homework) liveLines.push(`الواجب اللي كان عليه: ${cut(live.prev_homework, 160)}${live.homework_status ? ` — ${HWS[live.homework_status] || live.homework_status}` : ''}`);
if (live.lesson_content) liveLines.push(`اللي اتعمل لحد دلوقتي: ${cut(live.lesson_content, 300)}`);
const liveLv = [live.memorization && `حفظ/استيعاب ${r(live.memorization)}`, live.recitation && `أداء ${r(live.recitation)}`, live.revision && `مراجعة ${r(live.revision)}`].filter(Boolean);
if (liveLv.length) liveLines.push(`تقييم النهارده: ${liveLv.join('، ')}`);
if (live.performance) liveLines.push(`ملاحظات الأداء النهارده: ${cut(live.performance, 200)}`);
if (live.notes) liveLines.push(`ملاحظات النهارده: ${cut(live.notes, 200)}`);
if (live.homework) liveLines.push(`الواجب الجديد اللي اتكتب: ${cut(live.homework, 160)}`);
if (live.next_assignment) liveLines.push(`المخطط للحصة الجاية: ${cut(live.next_assignment, 160)}`);
const inLesson = live.mode === 'live';

// ---------------- محادثة الجلسة دي (الأحدث في الآخر)
const historyText = memory.length
  ? memory.map((m) => `${m.role === 'assistant' ? 'أنت' : 'المدرس'}: ${cut(m.content, m.role === 'assistant' ? 700 : 300)}`).join('\n')
  : 'لسه مفيش — دي أول رسالة في الجلسة.';

const quranRules = isQuran ? `
== قواعد القرآن (إلزامية) ==
- ممنوع تكتب نص آيات من ذاكرتك. اكتب المرجع بس: (اسم السورة: من آية كذا لآية كذا) وسيب التلاوة للمدرس.
- استثناء: كلمة أو كلمتين بس لتوضيح حكم تجويد، ولازم تكون متأكد منهم 100%.
- لو مش متأكد من رقم آية أو حدود مقطع، قول "اتأكد من المصحف" بدل ما تخمّن.
- أحكام التجويد اشرحها بمثال عملي وبطريقة تناسب سن الطالب.` : '';

const systemPrompt = `أنت "مساعد الحصة" في برنامج Teachers Manager: زميل خبير قاعد جنب المدرس${inLesson ? ' والحصة شغالة دلوقتي' : ''} مع الطالب "${student.name || ''}". المدرس بيكتبلك بسرعة وهو بيدرّس، فاقرأ نيّته مش كلامه الحرفي.

== الطالب ==
الاسم: ${student.name || ''} (اسمه الأول: ${firstName}) — استخدم ضمير مناسب لاسمه (ولد أو بنت)
المادة: ${subjectName}
${position}

== أسلوب تعلّمه ==
${profileText}

== الحصة الجارية الآن ==
${liveLines.join('\n')}

== آخر الحصص (الأحدث أولًا) ==
${lessonsText}

== ملاحظات المدرس عن الطالب ==
${notesText}

== المحادثة في الجلسة دي (الأحدث في الآخر) ==
${historyText}

== إزاي تفهم الرسائل السريعة ==
- الرسالة القصيرة دايمًا متعلقة بآخر رد ليك أو باللي بيحصل في الحصة دلوقتي. "ده/دي/هو/الجزء ده" = آخر حاجة اتكلمنا فيها.
- "كمّل/وبعدين/الجاي/التالي" = كمّل من حيث وقفت، أو من موضع الطالب أو المخطط في آخر حصة.
- "تاني/غيره/مثال تاني" = بديل مختلف لنفس الطلب. "أسهل/أبسط/مش فاهم" = نفس الفكرة بخطوات أصغر ومثال من حياته. "أصعب/تحدي" = مستوى أعلى.
- "أقصر/اختصر/في سطر" = نفس الرد في سطر أو اتنين. "بالتفصيل/وضّح" = أطول شوية.
- "اسأله/اختبره/أسئلة/كويز" = ٣ أسئلة شفهية سريعة، وجنب كل سؤال إجابته بين قوسين، من الأسهل للأصعب.
- "غلط في …/بيغلط/بيلخبط في …" = (١) سبب الغلطة غالبًا (٢) جملة تقولها له تصحح بيها (٣) تمرين دقيقة يثبّت الصح.
- "زهق/مش مركز/تعبان/ملّ" = نشاط دقيقتين يرجّع تركيزه، مناسب لسنه، من غير أدوات.
- "واجب" = واجب واحد محدد وقصير مبني على اللي اتعمل النهارده وعلى مستواه.
- "لخّص/اكتب الحصة/سجّل" = ملخص للحصة جاهز يتنسخ في خانة "اللي اتعمل" (٢-٤ سطور).
- "ولي الأمر/رسالة لأهله" = رسالة واتساب قصيرة ومحترمة لولي الأمر.
- "حضّر/الحصة الجاية" = خطة قصيرة: هدف، مراجعة، جديد، تمرين، واجب.
- رقم لوحده (زي "٣" أو "5") = عدد العناصر المطلوبة في آخر طلب.
- لو الطلب فعلًا مش مفهوم: اسأل سؤال توضيح واحد قصير جدًا، واقترح أقرب تفسير.

== شكل الرد ==
${inLesson
  ? '- الحصة شغالة: الرد قصير جدًا (من ٢ لـ ٦ سطور). المدرس هيبص عليه ثانيتين بس.\n- ابدأ باللي يتقال أو يتعمل على طول، وكل سطر يبدأ بعلامته: "🗣️ يتقال: …" أو "❓ سؤال: …" أو "✍️ تمرين: …" أو "💡 فكرة: …".'
  : '- الرد مركّز وعملي، وما يزيدش عن ١٢ سطر إلا لو المدرس طلب تفصيل.'}
- من غير مقدمات ولا "بالتأكيد" ولا "سؤال رائع" ولا تكرار لطلب المدرس، ومن غير خاتمة.
- اكتب بنفس لهجة المدرس (عامية مصرية لو كتب بالعامية)، والكلام اللي يتقال للطالب يكون بسيط ومناسب لسنه.
- المدرس ممكن يكون راجل أو ست: ماتخاطبوش بصيغة مذكر أو مؤنث، استخدم العلامات اللي فوق بدل "قول/قولي".
- نقاط قصيرة بدل الفقرات. استخدم **عريض** للكلمة المهمة بس.
- اربط بالسجل: لو الطالب كان ضعيف في حاجة قبل كده أو ماعملش الواجب، خد ده في اعتبارك من غير ما تقوله إلا لو مفيد.
- ماتخترعش معلومات عن الطالب مش موجودة فوق.
${quranRules}`;

return [{ json: {
  systemPrompt,
  userMessage: cfg.message,
  teacherId: cfg.teacherId,
  studentId: cfg.studentId,
  remaining: cfg.dailyLimit - (ctx.request_count || 0)
} }];
```

## قائمة الاختبار
- [ ] أثناء حصة شغالة: «غلط في المد» ← رد قصير بعلامات 🗣️ ❓ ✍️، ومن غير نص آيات.
- [ ] بعدها «أسهل» ثم «كمّل» ← بيكمّل على نفس الموضوع من غير ما تعيدي السؤال.
- [ ] اكتبي في «ماذا تم في الحصة» حاجة، واسألي «لخّص الحصة» ← الملخص بيستخدم اللي كتبتيه.
- [ ] زرار «➕ للواجب» بيضيف الرد لخانة الواجب.
- [ ] زرار «محادثة جديدة» ← المساعد مابقاش فاكر الكلام اللي قبله.
- [ ] على الكمبيوتر: المساعد لوحة جانبية والحصة ظاهرة جنبها. على الموبايل: ورقة من تحت.
- [ ] زرار المايك (على كروم/أندرويد): اتكلمي، والرسالة تتبعت لوحدها.
