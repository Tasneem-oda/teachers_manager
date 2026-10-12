# إصلاح سرعة وجودة مساعد الحصة — دليل التطبيق

## سبب الـ 4 دقايق
- **Gemini 3.8 Flash بيفكّر قبل ما يرد بشكل افتراضي (مستوى medium)، وتوكنز التفكير بتتحسب من حد طول الرد.** الحد كان 700، فالتفكير غالبًا كان بياكله كله، والرد بيطلع فاضي أو مقطوع ([توثيق Google](https://ai.google.dev/gemini-api/docs/generate-content/thinking)).
- بعد كده عقدة LangChain جوه n8n بتعيد المحاولة لوحدها في الخلفية، وبعدين بتنقل للموديل الاحتياطي ويعيد هو كمان. والعقدة دي مش بتسمح نتحكم في مستوى التفكير ولا في مهلة الانتظار.
- عشان تتأكدي: افتحي Executions في n8n على التنفيذ ده، وشوفي وقت كل عقدة.

## الحل في الملف الجديد
1. **اتصال مباشر بـ Gemini** من عقدة HTTP Request، بنفس الـ credential الموجود (Google Gemini(PaLM) Api account 2). ده بيسمح بـ:
   - مستوى تفكير محدد: `minimal` للطلبات السريعة، و`low` للشرح.
   - مهلة انتظار: 30 ثانية للأساسي، و20 للاحتياطي.
   - من غير إعادة محاولات في الخلفية. أسوأ حالة حوالي 50 ثانية، والطبيعي ثواني.
2. **الموديل بيتختار حسب نوع الطلب:**
   - طلب سريع (غلط، زهق، اسأله، واجب، أسهل…) ← `gemini-3.5-flash-lite`، والرد بياخد ثواني.
   - طلب شرح أو معرفة (تفسير، اشرح، معنى، قاعدة، حضّر…) ← `gemini-3.8-flash` بتفكير منخفض، وحد طول 2500 عشان التفكير مايقطعش الرد.
   - الاحتياطي في الحالتين: `gemini-3.5-flash-lite`.
3. **شكل الرد بقى حسب نوع الطلب:**
   - التفسير بقى آية آية (رقم الآية وأول كلماتها، والمعنى من التفاسير المعتمدة)، وبعدها «الرسالة للطالب»، و«إزاي تشرحها»، وسؤالين للتأكد.
   - علامات 🗣️ ❓ بقت للطلبات السريعة بس.
   - الطالب بيتكلم بصيغة المفرد، والمعاني بتلتزم بالتفاسير المعتمدة من غير تفاصيل زيادة.
4. **المحادثة بتتبعت للموديل كأدوار حقيقية** (المدرس / المساعد) بدل نص جوه التعليمات، فبيربط «أسهل» و«كمّل» بآخر رد بشكل أدق. ولو آخر رد كان شرح طويل، طلب المتابعة بيفضل على الموديل الأقوى.
5. **الرد بيوصل مرة واحدة** بدل البث كلمة بكلمة. الواجهة بتبيّن «بيجهّز الشرح…»، وبتوقف لوحدها بعد 75 ثانية برسالة واضحة.

## التطبيق
- استوردي `ai-chat-assistant.json` مكان الـ workflow الحالي. الملف مبني على آخر نسخة بعتيها.
- اتشالت 4 عقد (AI Agent، Google Gemini Chat Model، AI Agent (Backup)، Backup Gemini Model)، واتضافت 4 بدلهم: Gemini (Main)، Read Reply، Gemini (Fallback)، Read Fallback Reply.
- اتغيرت كمان عقدة Build Prompt، وعقدة Webhook بقت ترد عادي بدل البث.
- باقي العقد زي ما هي: التحقق، والحد اليومي، والحفظ، وتصنيف الأخطاء.
- لو n8n طلب الـ credential في عقدتي HTTP، اختاري **Google Gemini(PaLM) Api account 2**.
- ارفعي `lesson.html` من المشروع (v18).
- لتغيير الموديلات: أول جزء في كود Build Prompt (`MODELS`).

## كود Build Prompt
```javascript
// =====================================================================
// Build Prompt — مساعد الحصة (Lesson Copilot) — نسخة 2
// 1) بيحدد نوع الطلب: "سريع" أثناء الحصة (غلط/زهق/اسأله...) ولا "شرح ومحتوى" (تفسير/اشرح/حضّر...)
// 2) بيختار الموديل حسب النوع: السريع → Flash-Lite (ثواني)، الشرح → 3.8 Flash بتفكير منخفض
// 3) بيبعت المحادثة كأدوار حقيقية (مش نص جوه التعليمات) عشان يربط الكلام ببعضه
// =====================================================================
const cfg = $('Decode JWT & Config').first().json;
const ctx = $input.first().json;
const student = ctx.student || {};
const lessons = Array.isArray(ctx.recent_lessons) ? ctx.recent_lessons : [];
const notes = Array.isArray(ctx.notes) ? ctx.notes : [];
const memory = Array.isArray(ctx.memory) ? ctx.memory : [];
const profile = ctx.profile || {};
const live = cfg.lessonContext || {};
const msg = String(cfg.message || '');

// ================= إعدادات الموديلات (تتغير من هنا بس) =================
const MODELS = {
  quick: { model: 'gemini-3.5-flash-lite', thinkingLevel: 'minimal', maxOutputTokens: 700,  temperature: 0.4 },
  deep:  { model: 'gemini-3.8-flash',      thinkingLevel: 'low',     maxOutputTokens: 2500, temperature: 0.3 },
  // الاحتياطي لو الأساسي فشل أو اتأخر
  fallback: { model: 'gemini-3.5-flash-lite', thinkingLevel: 'minimal', maxOutputTokens: 900, temperature: 0.3 },
};

const RATING = { excellent: 'ممتاز', very_good: 'جيد جدًا', good: 'جيد', fair: 'مقبول', poor: 'ضعيف', weak: 'ضعيف' };
const r = (v) => RATING[v] || v;
const HWS = { done: 'عمله', partial: 'عمله جزئيًا', not_done: 'ماعملهوش' };
const cut = (s, n) => { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n) + '…' : s; };

const SUBJECTS = { quran: 'القرآن الكريم (تحفيظ وتجويد)', english: 'اللغة الإنجليزية', arabic: 'اللغة العربية', math: 'الرياضيات', science: 'العلوم', programming: 'البرمجة' };
const subjectKey = String(student.subject || '').toLowerCase();
const subjectName = SUBJECTS[subjectKey] || student.subject || 'غير محددة';
const isQuran = subjectKey === 'quran';
const firstName = String(student.name || 'الطالب').trim().split(/\s+/)[0];

// ---------------- نوع الطلب
const DEEP_RE = /تفسير|فسّ?ر|معن[ىي]|معاني|اشرح|شرح|وضّ?ح|بالتفصيل|إعراب|اعراب|قاعد[ةه]|قواعد|أحكام|احكام|حكم |تجويد|ليه |لماذا|إزاي|ازاي|كيف|حضّ?ر|خطة|خطه|الحصة الجاية|درس|قصة|قصه|سبب نزول|فضل |فوائد|دروس مستفادة|grammar|explain|translate|ترجم/i;
const QUICK_RE = /^(كمّ?ل|تاني|غيره|أقصر|اقصر|اختصر|أسهل|اسهل|أبسط|ابسط|أصعب|اصعب|زهق|زهقان|ملّ|مش مركز|تعبان|اسأله|اختبره|كويز|واجب|لخّ?ص|[0-9٠-٩]+)(\s|$)/;
let kind = 'quick';
if (DEEP_RE.test(msg) && !QUICK_RE.test(msg.trim())) kind = 'deep';
if (msg.length > 140) kind = 'deep';
// متابعة قصيرة ("أسهل"، "كمّل"، "تاني") على رد شرح طويل → تفضل بنفس جودة الشرح
const lastReply = [...memory].reverse().find((m) => m.role === 'assistant');
if (kind === 'quick' && lastReply && String(lastReply.content || '').length > 600 && msg.length < 40) kind = 'deep';
const inLesson = live.mode === 'live';

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
].filter(Boolean).join('\n') || 'مش متسجّل (لو مش عارف سنه، افترض إنه طفل وخلي الكلام بسيط).';

// ---------------- الحصة الجارية الآن (جاية من الواجهة)
const MODE = { live: 'الحصة شغالة دلوقتي', manual: 'المدرس بيسجّل حصة خلصت', ready: 'قبل الحصة (تحضير)' };
const liveLines = [`الحالة: ${MODE[live.mode] || 'تحضير أو متابعة'}`];
if (live.elapsed_min != null) liveLines.push(`عدّى من الحصة: ${live.elapsed_min} دقيقة`);
if (live.prev_homework) liveLines.push(`الواجب اللي كان عليه: ${cut(live.prev_homework, 160)}${live.homework_status ? ` — ${HWS[live.homework_status] || live.homework_status}` : ''}`);
if (live.lesson_content) liveLines.push(`اللي اتعمل لحد دلوقتي: ${cut(live.lesson_content, 300)}`);
const liveLv = [live.memorization && `حفظ/استيعاب ${r(live.memorization)}`, live.recitation && `أداء ${r(live.recitation)}`, live.revision && `مراجعة ${r(live.revision)}`].filter(Boolean);
if (liveLv.length) liveLines.push(`تقييم النهارده: ${liveLv.join('، ')}`);
if (live.performance) liveLines.push(`ملاحظات الأداء النهارده: ${cut(live.performance, 200)}`);
if (live.notes) liveLines.push(`ملاحظات النهارده: ${cut(live.notes, 200)}`);
if (live.homework) liveLines.push(`الواجب الجديد اللي اتكتب: ${cut(live.homework, 160)}`);
if (live.next_assignment) liveLines.push(`المخطط للحصة الجاية: ${cut(live.next_assignment, 160)}`);

const quranRules = isQuran ? `
== القرآن (إلزامي) ==
- الدقة أهم من أي حاجة: المعاني والتفسير من التفاسير المعتمدة (زي التفسير الميسر والسعدي وابن كثير) بالمعنى، من غير آراء غريبة ومن غير ما تزوّد تفاصيل مش في الآية.
- ماتكتبش نص آية كاملة من ذاكرتك. لما تحتاج تشير لآية: رقمها + أول كلمتين أو تلاتة منها بس كعلامة.
- لو مش متأكد من رقم آية أو معلومة: قول "راجع المصحف/التفسير" بدل التخمين.
- أحكام التجويد: اسم الحكم + إزاي يتنطق + مثال واحد من السورة اللي الطالب فيها لو تعرفه بدقة.` : '';

const formatQuick = `== شكل الرد (طلب سريع${inLesson ? ' والحصة شغالة' : ''}) ==
- قصير جدًا: من ٢ لـ ٦ سطور. المدرس هيبص عليه ثانيتين.
- كل سطر يبدأ بعلامته حسب نوعه: "🗣️ يتقال:" (جملة يقولها المدرس للطالب) أو "❓ سؤال:" (وإجابته بين قوسين) أو "✍️ تمرين:" أو "💡 فكرة:".`;

const formatDeep = `== شكل الرد (طلب شرح/محتوى) ==
- ده طلب معرفة: جاوب على السؤال نفسه كويس ومنظم، مش "جمل للطالب".
- ابدأ بعنوان سطر واحد عريض، وبعده المحتوى في نقاط أو خطوات مرقّمة. ما يزيدش عن ٢٠ سطر.
${isQuran ? `- التفسير يكون آية آية: "**الآية (رقمها) «أول كلماتها…»:** المعنى المبسط في سطر أو اتنين".
- بعد الآيات: "**الرسالة للطالب:**" فكرة أو اتنين يفهمهم ويطبقهم.` : '- لو فيه قاعدة: القاعدة في سطر، وبعدها مثالين، وبعدها غلطة شائعة.'}
- في الآخر: "**إزاي تشرحها لـ${firstName}:**" سطرين بطريقة تناسبه، و"**سؤالين للتأكد:**" (بالإجابة).`;

const systemText = `أنت "مساعد الحصة" في برنامج Teachers Manager: زميل خبير بيساعد المدرس${inLesson ? ' والحصة شغالة دلوقتي' : ''} مع الطالب "${student.name || ''}". المدرس بيكتب بسرعة، فافهم نيّته مش كلامه الحرفي. ردك موجّه للمدرس نفسه.

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

== فهم الرسائل السريعة ==
- الرسالة القصيرة متعلقة بآخر رد ليك في المحادثة أو باللي بيحصل في الحصة. "ده/دي/هو" = آخر حاجة اتكلمنا فيها.
- "كمّل/الجاي/التالي" = كمّل من حيث وقفت أو من موضع الطالب. "تاني/غيره" = بديل مختلف. "أسهل/مش فاهم" = نفس الفكرة بخطوات أصغر ومثال من حياته. "أصعب" = مستوى أعلى. "أقصر" = نفس الرد في سطرين.
- "اسأله/اختبره" = ٣ أسئلة شفهية بالإجابات، من الأسهل للأصعب.
- "غلط في …" = سبب الغلطة + جملة تصحيح يقولها المدرس + تمرين دقيقة.
- "زهق/مش مركز" = نشاط دقيقتين يرجّع تركيزه من غير أدوات.
- "واجب" = واجب واحد محدد مبني على النهارده ومستواه. "لخّص" = ملخص ٢-٤ سطور جاهز لخانة "اللي اتعمل". "ولي الأمر" = رسالة واتساب قصيرة ومحترمة.
- رقم لوحده = عدد العناصر في آخر طلب. لو الطلب مش مفهوم فعلًا: سؤال توضيح واحد قصير.

${kind === 'deep' ? formatDeep : formatQuick}

== قواعد عامة ==
- من غير مقدمات ("بالتأكيد"، "سؤال رائع") ومن غير تكرار للطلب ومن غير خاتمة.
- نفس لهجة المدرس (عامية مصرية لو كتب بالعامية)، والكلام اللي يتقال للطالب بسيط ومناسب لسنه. كلّم الطالب بصيغة المفرد.
- المدرس ممكن يكون راجل أو ست: ماتخاطبوش بصيغة مذكر أو مؤنث.
- اربط بالسجل والحصة الحالية لما يكون مفيد، وماتخترعش معلومات عن الطالب.
${quranRules}`;

// ---------------- المحادثة كأدوار حقيقية (user/model) + الرسالة الحالية
const contents = [];
const push = (role, text) => {
  text = String(text || '').trim();
  if (!text) return;
  const last = contents[contents.length - 1];
  if (last && last.role === role) last.parts[0].text += '\n' + text;   // Gemini بيفضّل الأدوار تتبادل
  else contents.push({ role, parts: [{ text }] });
};
memory.forEach((m) => push(m.role === 'assistant' ? 'model' : 'user', cut(m.content, m.role === 'assistant' ? 1200 : 400)));
while (contents.length && contents[0].role !== 'user') contents.shift();   // لازم تبدأ بالمدرس
push('user', msg);

const body = (m) => JSON.stringify({
  systemInstruction: { parts: [{ text: systemText }] },
  contents,
  generationConfig: {
    temperature: m.temperature,
    maxOutputTokens: m.maxOutputTokens,
    thinkingConfig: { thinkingLevel: m.thinkingLevel },
  },
  safetySettings: [
    { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_ONLY_HIGH' },
    { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_ONLY_HIGH' },
  ],
});
const main = MODELS[kind];

return [{ json: {
  kind,
  model: main.model,
  requestBody: body(main),
  fallbackModel: MODELS.fallback.model,
  fallbackBody: body(MODELS.fallback),
  // للتوافق مع باقي العقد
  systemPrompt: systemText,
  userMessage: msg,
  teacherId: cfg.teacherId,
  studentId: cfg.studentId,
  remaining: cfg.dailyLimit - (ctx.request_count || 0)
} }];
```

## كود Read Reply (نفس الكود في Read Fallback Reply)
```javascript
// قراءة رد Gemini: بنجمع نص الإجابة بس (من غير أجزاء التفكير). لو الرد فاضي أو اتقطع قبل ما يبدأ → خطأ (يروح للاحتياطي)
const res = $input.first().json || {};
const cand = (res.candidates || [])[0] || {};
const parts = (cand.content && cand.content.parts) || [];
const text = parts.filter((p) => p && typeof p.text === 'string' && !p.thought).map((p) => p.text).join('').trim();
if (!text) {
  const reason = cand.finishReason || (res.promptFeedback && res.promptFeedback.blockReason) || 'EMPTY';
  throw new Error(`EMPTY_REPLY:${reason}`);
}
return [{ json: { output: text, finishReason: cand.finishReason || null, usage: res.usageMetadata || null } }];
```

## اختبري بالأسئلة دي
- «تفسير سورة القدر» ← آية آية، والطبيعي يوصل خلال 5 لـ 15 ثانية.
- بعدها «أسهل» ← نفس التفسير بأسلوب أبسط.
- أثناء حصة شغالة: «غلط في المد» ← رد قصير خلال ثواني.
- لو حصل تأخير تاني: ابعتيلي لقطة من Executions في n8n فيها وقت كل عقدة.
