/**
 * live-lesson.js - الحصة الجارية في نافذة عائمة صغيرة
 *
 * - صفحة الحصة بتسجّل الحصة الجارية هنا (publish) وبتمسحها لما تخلص (clear).
 * - أي صفحة فيها السايدبار بتعرض "نافذة عائمة" فيها اسم الطالب والعداد والوقت الفاضل،
 *   والضغط عليها بيرجّع المدرس للحصة. المدرس يقدر يسحبها لأي مكان، ويصغّرها لدايرة.
 * - الحصة نفسها محفوظة على السيرفر (in_progress) والمكتوب محفوظ على الجهاز،
 *   فالتنقل بين الصفحات مابيقفلش الحصة ولا بيضيّع حاجة.
 */

const KEY = 'tm_live_lessons';
const POS_KEY = 'tm_live_float_pos';
const MIN_KEY = 'tm_live_float_min';
const HINT_KEY = 'tm_live_float_hint';
const MAX_AGE_MS = 8 * 60 * 60 * 1000;   // حصة شغالة أكتر من 8 ساعات = اتقفلت من جهاز تاني غالبًا

const pad = (n) => String(n).padStart(2, '0');
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function readAll() {
    try {
        const all = JSON.parse(localStorage.getItem(KEY) || '{}') || {};
        const now = Date.now();
        let changed = false;
        Object.keys(all).forEach((id) => {
            const l = all[id];
            if (!l || !l.startedAt || now - l.startedAt > MAX_AGE_MS) { delete all[id]; changed = true; }
        });
        if (changed) localStorage.setItem(KEY, JSON.stringify(all));
        return all;
    } catch (e) { return {}; }
}

export const LiveLesson = {
    /** { studentId, name, lessonId, startedAt, plannedMin, link } */
    publish(info) {
        if (!info || !info.studentId || !info.startedAt) return;
        try {
            const all = readAll();
            all[info.studentId] = { ...all[info.studentId], ...info, updatedAt: Date.now() };
            localStorage.setItem(KEY, JSON.stringify(all));
        } catch (e) { /* تجاهل */ }
    },
    clear(studentId) {
        try {
            const all = readAll();
            if (all[studentId]) { delete all[studentId]; localStorage.setItem(KEY, JSON.stringify(all)); }
        } catch (e) { /* تجاهل */ }
    },
    get(studentId) { return readAll()[studentId] || null; },
    /** كل الحصص الجارية، الأحدث الأول */
    list() { return Object.values(readAll()).sort((a, b) => b.startedAt - a.startedAt); }
};

// ------------------------------------------------------------------ نصوص الوقت
export function clockText(ms) {
    const t = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(t / 3600);
    const m = Math.floor((t % 3600) / 60);
    const s = t % 60;
    return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

/** حالة الوقت مقارنة بمدة الحصة المحددة في الجدول */
export function timeState(startedAt, plannedMin, now = Date.now()) {
    const elapsed = Math.max(0, now - startedAt);
    if (!plannedMin) return { elapsed, planned: null, left: null, phase: 'free', text: '', progress: null };
    const planned = plannedMin * 60000;
    const left = planned - elapsed;
    const leftMin = Math.ceil(left / 60000);
    const overMin = Math.floor(-left / 60000);
    let phase = 'ok';
    let text;
    if (left <= 0) { phase = 'over'; text = overMin < 1 ? 'خلص الوقت' : `زيادة ${overMin} د`; }
    else if (left <= 5 * 60000) { phase = 'soon'; text = `فاضل ${leftMin} د`; }
    else text = `فاضل ${leftMin} د`;
    return { elapsed, planned, left, phase, text, progress: Math.min(1, elapsed / planned) };
}

// ------------------------------------------------------------------ النافذة العائمة
const STYLE = `
.tm-float{position:fixed;z-index:950;left:16px;bottom:24px;display:flex;align-items:center;gap:.55rem;
  background:#2E2140;color:#fff;border-radius:18px;padding:.5rem .55rem .5rem .8rem;box-shadow:0 10px 30px rgba(28,20,40,.35);
  font-family:inherit;cursor:pointer;user-select:none;-webkit-user-select:none;touch-action:none;max-width:calc(100vw - 32px);
  border:1px solid rgba(255,255,255,.08);transition:box-shadow .2s, transform .15s}
.tm-float:hover{box-shadow:0 14px 36px rgba(28,20,40,.45)}
.tm-float.dragging{transition:none;transform:scale(1.03);cursor:grabbing}
.tm-float-dot{width:10px;height:10px;border-radius:50%;background:#3DDC84;flex-shrink:0;animation:tmFloatPulse 1.3s infinite}
@keyframes tmFloatPulse{0%{box-shadow:0 0 0 0 rgba(61,220,132,.55)}70%{box-shadow:0 0 0 8px rgba(61,220,132,0)}100%{box-shadow:0 0 0 0 rgba(61,220,132,0)}}
.tm-float-body{display:flex;flex-direction:column;min-width:0;line-height:1.25}
.tm-float-name{font-size:.8rem;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:150px;opacity:.92}
.tm-float-row{display:flex;align-items:baseline;gap:.45rem}
.tm-float-time{font-size:1.05rem;font-weight:800;font-variant-numeric:tabular-nums;direction:ltr;unicode-bidi:isolate}
.tm-float-left{font-size:.72rem;font-weight:700;color:#CFC3DD;white-space:nowrap}
.tm-float.ph-soon .tm-float-left{color:#F4D58A}
.tm-float.ph-over .tm-float-left{color:#FFB4B4}
.tm-float.ph-over .tm-float-dot{background:#FF8A8A;animation:none}
.tm-float-go{background:#C59A4A;color:#2E2140;border:0;border-radius:12px;padding:.45rem .7rem;font:inherit;font-size:.8rem;font-weight:800;cursor:pointer;white-space:nowrap}
.tm-float-min{background:rgba(255,255,255,.12);color:#fff;border:0;border-radius:9px;width:28px;height:28px;display:flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0;font-size:1rem;line-height:1}
.tm-float-more{position:absolute;top:-8px;right:-6px;background:#C59A4A;color:#2E2140;border-radius:999px;font-size:.68rem;font-weight:800;padding:.05rem .4rem}
.tm-float-bar{position:absolute;left:12px;right:12px;bottom:3px;height:2px;border-radius:2px;background:rgba(255,255,255,.12);overflow:hidden}
.tm-float-bar span{display:block;height:100%;background:#3DDC84;width:0}
.tm-float.ph-soon .tm-float-bar span{background:#F4D58A}
.tm-float.ph-over .tm-float-bar span{background:#FF8A8A}
.tm-float.is-min{padding:.45rem .6rem;gap:.4rem;border-radius:999px}
.tm-float.is-min .tm-float-name,.tm-float.is-min .tm-float-go,.tm-float.is-min .tm-float-left,.tm-float.is-min .tm-float-bar{display:none}
.tm-float.is-min .tm-float-time{font-size:.92rem}
.tm-float-hint{position:fixed;z-index:951;background:#fff;color:#29252D;border:1px solid #E7E1E8;border-radius:12px;padding:.6rem .8rem;font-size:.82rem;
  box-shadow:0 8px 24px rgba(41,37,45,.18);max-width:240px;line-height:1.6}
.tm-float-hint b{color:#4B3A5A}
.tm-float-hint button{display:block;margin-top:.35rem;background:none;border:0;color:#4B3A5A;font:inherit;font-weight:700;cursor:pointer;padding:0}
@media (max-width:900px){.tm-float{left:auto;right:16px;bottom:calc(80px + env(safe-area-inset-bottom,0px))}}
/* فوق عارض الكتاب (المدرس ممكن يفتح كتاب وهو في الحصة) */
body:has(.bv) .tm-float{z-index:9050}
@media print{.tm-float,.tm-float-hint{display:none!important}}
`;

let mounted = false;

/**
 * بتتنادى من السايدبار في كل الصفحات.
 * exceptStudentId: الطالب اللي صفحة حصته مفتوحة دلوقتي (مالوش لازمة نعرضه عائم فوق نفسه)
 */
export function mountFloatingLesson({ exceptStudentId = null } = {}) {
    if (mounted || typeof document === 'undefined') return;
    mounted = true;
    let el = null;
    let timer = null;
    let current = null;
    let exceptId = exceptStudentId;

    const style = document.createElement('style');
    style.textContent = STYLE;
    document.head.appendChild(style);

    const pick = () => LiveLesson.list().filter((l) => String(l.studentId) !== String(exceptId));

    function savedPos() {
        try { return JSON.parse(localStorage.getItem(POS_KEY) || 'null'); } catch (e) { return null; }
    }
    function applyPos() {
        const p = savedPos();
        if (!el || !p) return;
        const r = el.getBoundingClientRect();
        const x = Math.min(Math.max(8, p.x), window.innerWidth - r.width - 8);
        const y = Math.min(Math.max(8, p.y), window.innerHeight - r.height - 8);
        el.style.left = x + 'px';
        el.style.top = y + 'px';
        el.style.bottom = 'auto';
    }

    function render() {
        const list = pick();
        if (!list.length) { remove(); return; }
        current = list[0];
        if (!el) build();
        el.querySelector('.tm-float-name').textContent = current.name || 'حصة جارية';
        const more = el.querySelector('.tm-float-more');
        more.hidden = list.length < 2;
        more.textContent = `+${list.length - 1}`;
        el.setAttribute('aria-label', `الحصة الجارية مع ${current.name || 'الطالب'} — اضغط للرجوع للحصة`);
        tick();
    }

    function tick() {
        if (!el || !current) return;
        const st = timeState(current.startedAt, current.plannedMin);
        el.querySelector('.tm-float-time').textContent = clockText(st.elapsed);
        el.querySelector('.tm-float-left').textContent = st.text;
        el.querySelector('.tm-float-bar').hidden = st.progress == null;
        el.querySelector('.tm-float-bar span').style.width = st.progress == null ? '0' : `${Math.round(st.progress * 100)}%`;
        el.classList.toggle('ph-soon', st.phase === 'soon');
        el.classList.toggle('ph-over', st.phase === 'over');
    }

    function go() {
        if (!current) return;
        window.location.href = `lesson.html?student_id=${encodeURIComponent(current.studentId)}`;
    }

    function build() {
        el = document.createElement('div');
        el.className = 'tm-float';
        el.setAttribute('role', 'button');
        el.tabIndex = 0;
        el.innerHTML = `<span class="tm-float-dot" aria-hidden="true"></span>
            <span class="tm-float-body">
                <span class="tm-float-name"></span>
                <span class="tm-float-row"><span class="tm-float-time">00:00</span><span class="tm-float-left"></span></span>
            </span>
            <button type="button" class="tm-float-go" tabindex="-1">ارجع للحصة</button>
            <button type="button" class="tm-float-min" title="تصغير" aria-label="تصغير">–</button>
            <span class="tm-float-more" hidden></span>
            <span class="tm-float-bar" hidden><span></span></span>`;
        document.body.appendChild(el);
        let isMin = false;
        try { isMin = localStorage.getItem(MIN_KEY) === '1'; } catch (e) { /* تجاهل */ }
        setMin(isMin);
        applyPos();

        // سحب + ضغط (الضغط من غير سحب = رجوع للحصة)
        let start = null;
        let moved = false;
        el.addEventListener('pointerdown', (e) => {
            if (e.button !== 0 && e.pointerType === 'mouse') return;
            if (e.target.closest('.tm-float-min')) return;
            const r = el.getBoundingClientRect();
            start = { x: e.clientX, y: e.clientY, left: r.left, top: r.top };
            moved = false;
            try { el.setPointerCapture(e.pointerId); } catch (err) { /* تجاهل */ }
        });
        el.addEventListener('pointermove', (e) => {
            if (!start) return;
            const dx = e.clientX - start.x;
            const dy = e.clientY - start.y;
            if (!moved && Math.hypot(dx, dy) < 8) return;
            moved = true;
            el.classList.add('dragging');
            const r = el.getBoundingClientRect();
            const x = Math.min(Math.max(8, start.left + dx), window.innerWidth - r.width - 8);
            const y = Math.min(Math.max(8, start.top + dy), window.innerHeight - r.height - 8);
            el.style.left = x + 'px';
            el.style.top = y + 'px';
            el.style.bottom = 'auto';
        });
        const end = () => {
            if (!start) return;
            el.classList.remove('dragging');
            if (moved) {
                const r = el.getBoundingClientRect();
                try { localStorage.setItem(POS_KEY, JSON.stringify({ x: Math.round(r.left), y: Math.round(r.top) })); } catch (e) { /* تجاهل */ }
            }
            start = null;
        };
        el.addEventListener('pointerup', end);
        el.addEventListener('pointercancel', () => { start = null; moved = false; el.classList.remove('dragging'); });
        el.addEventListener('click', (e) => {
            if (e.target.closest('.tm-float-min')) {
                setMin(!el.classList.contains('is-min'));
                return;
            }
            if (moved) { moved = false; return; }
            go();
        });
        el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
        timer = setInterval(tick, 1000);
        showHintOnce();
    }

    function setMin(on) {
        el.classList.toggle('is-min', on);
        const b = el.querySelector('.tm-float-min');
        b.textContent = on ? '+' : '–';
        b.title = on ? 'تكبير' : 'تصغير';
        b.setAttribute('aria-label', b.title);
        try { localStorage.setItem(MIN_KEY, on ? '1' : '0'); } catch (e) { /* تجاهل */ }
        requestAnimationFrame(applyPos);
    }

    function showHintOnce() {
        try { if (localStorage.getItem(HINT_KEY)) return; localStorage.setItem(HINT_KEY, '1'); } catch (e) { return; }
        const h = document.createElement('div');
        h.className = 'tm-float-hint';
        h.innerHTML = `<b>الحصة لسه شغالة ✓</b><br>اتنقّل في البرنامج براحتك، والحصة والمكتوب محفوظين. اضغط هنا وقت ما تحب ترجع لها، وتقدر تسحبها لأي مكان.<button type="button">فهمت</button>`;
        document.body.appendChild(h);
        const place = () => {
            if (!el) return;
            const r = el.getBoundingClientRect();
            h.style.left = Math.max(8, Math.min(r.left, window.innerWidth - 256)) + 'px';
            h.style.top = Math.max(8, r.top - h.offsetHeight - 10) + 'px';
        };
        requestAnimationFrame(place);
        const close = () => h.remove();
        h.querySelector('button').addEventListener('click', close);
        setTimeout(close, 9000);
    }

    function remove() {
        if (timer) clearInterval(timer);
        timer = null;
        if (el) el.remove();
        el = null;
        current = null;
    }

    window.addEventListener('storage', (e) => { if (e.key === KEY) render(); });
    window.addEventListener('resize', () => applyPos());
    window.addEventListener('tm:live-lesson-changed', render);
    // صفحة الحصة بتغيّر الطالب المستثنى (مثلًا لو المدرس فتح حصة طالب تاني)
    window.addEventListener('tm:live-lesson-except', (e) => { exceptId = e.detail || null; render(); });
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', render);
    else render();
}

/** صفحة الحصة بتنادي دي بعد أي تغيير عشان النافذة في نفس الصفحة تتحدّث */
export function notifyLiveLessonChanged() {
    try { window.dispatchEvent(new Event('tm:live-lesson-changed')); } catch (e) { /* تجاهل */ }
}
