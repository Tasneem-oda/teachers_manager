/**
 * resume.js — v35: الرجوع للبرنامج بعد ما يكون "نايم"
 *
 * اللي كان بيحصل (من سجلات البرنامج نفسه، آخر 3 أسابيع):
 *  - المدرس يسيب التاب مفتوحة ساعة، والموبايل/اللابتوب ينام أو المتصفح يجمّد التاب.
 *  - الطلبات اللي كانت شغالة ساعتها بتتقتل ("تعذّر الاتصال بالخادم") أو بتفضل متعلّقة،
 *    ومؤقّت المهلة بيضرب أول ما الجهاز يصحى ("استغرق الطلب وقتًا أطول") — مدة الطلب في السجل كانت 20 دقيقة!
 *  - وأول طلبات بعد الصحيان بتطلع قبل ما النت يرجع فعلًا، وبتوكن منتهي.
 *
 * الملف ده بيعرف إمتى الجهاز "صحي" (رجوع من الخلفية / نوم الجهاز والتاب ظاهرة / رجوع النت / تاب متجمّدة)،
 * و api.js بيستخدمه عشان:
 *  1) يستنى ثانية لحد ما النت يرجع ويجدّد الجلسة مرة واحدة قبل أول طلب بعد الصحيان.
 *  2) يعيد الطلب لوحده مرة لو اتقطع بسبب النوم، بدل ما يطلّع رسالة خطأ للمدرس.
 * خفيف ومابيستوردش حاجة.
 */

const WINDOW_MS = 15000;      // الفترة بعد الصحيان اللي بنعتبر فيها أي قطع "بسبب النوم"
const BEAT_MS = 5000;

export const Resume = { at: 0, count: 0, kind: '' };

let started = false;
let hiddenAt = 0;
let lastBeat = Date.now();

export function markResume(kind) {
    Resume.at = Date.now();
    Resume.count += 1;
    Resume.kind = kind || 'resume';
    try { window.dispatchEvent(new CustomEvent('tm:resume', { detail: { kind: Resume.kind } })); } catch (e) { /* تجاهل */ }
}

/** الجهاز صحي من شوية؟ */
export function justResumed(ms = WINDOW_MS) {
    return !!Resume.at && Date.now() - Resume.at < ms;
}

/**
 * الطلب ده اتأثر بنوم الجهاز؟ (حصل صحيان بعد ما بدأ، أو مدته الحقيقية أطول بكتير من المهلة، أو لسه صاحي حالًا)
 * @param {number} t0 وقت بداية الطلب
 * @param {number} count قيمة Resume.count وقت البداية
 * @param {number} timeoutMs مهلة الطلب
 */
export function affectedBySleep(t0, count, timeoutMs = 30000) {
    if (Resume.count !== count) return true;
    if (timeoutMs && Date.now() - t0 > timeoutMs + 10000) return true;
    return justResumed();
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let gate = null;
let gateFor = -1;

/**
 * قبل أي طلب: لو الجهاز صاحي حالًا نستنى النت يرجع (لحد 6 ثواني) ونجهّز جلسة صالحة مرة واحدة لكل الطلبات.
 * @param {() => Promise<any>} [warm] دالة تجهيز الجلسة (getFreshSession)
 */
export function waitAfterResume(warm) {
    if (!justResumed()) return Promise.resolve();
    if (gate && gateFor === Resume.count) return gate;
    gateFor = Resume.count;
    gate = (async () => {
        const t = Date.now();
        while (typeof navigator !== 'undefined' && navigator.onLine === false && Date.now() - t < 6000) await sleep(300);
        // بعد نوم حقيقي للجهاز: الواي فاي/الداتا بتاخد لحظة ترجع حتى لو المتصفح قال "متصل"
        if (Resume.kind === 'sleep' || Resume.kind === 'frozen') {
            const wait = 1200 - (Date.now() - Resume.at);
            if (wait > 0) await sleep(wait);
        }
        if (typeof warm === 'function') {
            try { await Promise.race([warm(), sleep(8000)]); } catch (e) { /* الطلب نفسه هيتعامل */ }
        }
    })();
    return gate;
}

export function initResume() {
    if (started || typeof window === 'undefined') return;
    started = true;
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') { hiddenAt = Date.now(); return; }
        const away = hiddenAt ? Date.now() - hiddenAt : 0;
        hiddenAt = 0;
        lastBeat = Date.now();
        if (away >= 60 * 1000) markResume('hidden');
    });
    // التاب ظاهرة بس الجهاز نام (قفل اللابتوب / شاشة الموبايل): المؤقّتات بتقف، فبنلاحظ القفزة في الوقت
    setInterval(() => {
        const now = Date.now();
        const gap = now - lastBeat;
        lastBeat = now;
        if (gap > 25000 && document.visibilityState === 'visible') markResume('sleep');
    }, BEAT_MS);
    // كروم بيجمّد التابات المتسابة (Page Lifecycle)
    document.addEventListener('resume', () => { lastBeat = Date.now(); markResume('frozen'); });
    window.addEventListener('pageshow', (e) => { if (e.persisted) { lastBeat = Date.now(); markResume('back'); } });
    window.addEventListener('online', () => markResume('online'));
}

initResume();
