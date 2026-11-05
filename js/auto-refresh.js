/**
 * auto-refresh.js — v29.8: البيانات تتحدّث لوحدها لما المدرس يرجع للبرنامج
 *
 * المشكلة: الصفحة بتجيب البيانات مرة واحدة لما تتفتح. فلو المدرس سجّل حصة على اللابتوب والموبايل
 * كان مفتوح على الجدول في الخلفية، الموبايل كان بيفضل يعرض الجدول القديم لحد ما الصفحة تتحمّل تاني.
 *
 * دلوقتي الصفحة بتجيب آخر بيانات لوحدها لما:
 *  - المدرس يرجع للبرنامج بعد ما كان في تطبيق تاني (واتساب، Meet…) 20 ثانية أو أكتر
 *  - المدرس يرجع للصفحة بزرار "رجوع" (المتصفح بيرجّعها من الذاكرة بالبيانات القديمة)
 *  - النت يرجع بعد ما كان مقطوع
 *  - كل دقيقتين طول ما الصفحة قدامه والنت شغال (عشان التغيير من جهاز تاني يظهر)
 *  - تابة تانية على نفس الجهاز غيّرت حاجة (فورًا)
 * ومابيحدّثش وفيه نافذة مفتوحة أو المدرس بيكتب، عشان مايضيّعش اللي بيعمله.
 */
const CHANNEL = 'tm-data-changed';
let bc = null;
try { bc = 'BroadcastChannel' in window ? new BroadcastChannel(CHANNEL) : null; } catch (e) { bc = null; }

/** صفحة غيّرت بيانات (حفظ حصة/موعد/طالب): التابات التانية على نفس الجهاز تتحدّث على طول */
export function announceChange(kind = 'data') {
    const msg = { kind, at: Date.now() };
    try { if (bc) bc.postMessage(msg); } catch (e) { /* تجاهل */ }
    try { localStorage.setItem('tm_data_changed', JSON.stringify(msg)); } catch (e) { /* تجاهل */ }
}

function busy() {
    const a = document.activeElement;
    if (a && (a.tagName === 'TEXTAREA' || (a.tagName === 'INPUT' && !/^(button|checkbox|radio|submit)$/i.test(a.type || '')) || a.isContentEditable)) return true;
    return !!document.querySelector('.modal.active, .modal.show, .tm-choice, .ink-confirm, .wb, .bv, [aria-modal="true"]:not([hidden])');
}

/**
 * @param {() => Promise<any>|any} refresh  الدالة اللي بتجيب البيانات وترسمها (من غير شاشة تحميل)
 * @param {{ minHiddenMs?: number, everyMs?: number }} [opts]
 */
export function onAppResume(refresh, { minHiddenMs = 20000, everyMs = 120000 } = {}) {
    let running = false;
    let pending = false;
    let last = Date.now();
    let hiddenAt = document.visibilityState === 'hidden' ? Date.now() : 0;

    const run = async (why) => {
        if (navigator.onLine === false) return;
        if (document.visibilityState !== 'visible') { pending = true; return; }
        if (busy()) { pending = true; return; }
        if (running) { pending = true; return; }
        running = true; pending = false; last = Date.now();
        try { await refresh(why); } catch (e) { /* الصفحة بتتعامل مع الخطأ؛ هنجرب تاني المرة الجاية */ } finally { running = false; }
    };

    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') { hiddenAt = Date.now(); return; }
        const away = hiddenAt ? Date.now() - hiddenAt : 0;
        hiddenAt = 0;
        if (pending || away >= minHiddenMs) run('resume');
    });
    // الرجوع بزرار "رجوع": الصفحة راجعة من ذاكرة المتصفح بالبيانات القديمة
    window.addEventListener('pageshow', (e) => { if (e.persisted) run('back'); });
    window.addEventListener('online', () => setTimeout(() => run('online'), 1500));
    // تغيير من تابة تانية على نفس الجهاز
    if (bc) bc.addEventListener('message', () => run('other-tab'));
    window.addEventListener('storage', (e) => { if (e.key === 'tm_data_changed') run('other-tab'); });
    // تغيير من جهاز تاني: كل دقيقتين طول ما الصفحة ظاهرة
    setInterval(() => {
        if (document.visibilityState !== 'visible') return;
        if (pending || Date.now() - last >= everyMs) run('interval');
    }, 15000);
    // لو كان مستني عشان نافذة مفتوحة/كتابة: أول ما يخلص
    document.addEventListener('focusout', () => { if (pending) setTimeout(() => run('pending'), 400); });
    document.addEventListener('click', () => { if (pending) setTimeout(() => run('pending'), 600); }, true);
}
