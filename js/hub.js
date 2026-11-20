/**
 * hub.js — v33: إشعاراتك من المونيتور جوه التطبيق + الرسايل التلقائية حسب اللي المدرس عمله + زرار التواصل
 *
 * - طلب واحد بس في الجلسة (app-hub ← hello): رحلة المدرس + الإشعارات + أرقام سريعة
 * - الإشعار بيظهر نافذة أول ما المدرس يفتح التطبيق (صور، فيديو يوتيوب، لينكات، زرار) + شريط في الرئيسية + الجرس
 * - رسالة تلقائية واحدة بالكتير في الجلسة (زي: انضم لمجموعة المدرسين بعد أول حصة)
 * - مابيظهرش أي حاجة في صفحة الحصة (المدرس بيشرح)
 */
import { CONFIG } from './config.js?v=45';
import { api } from './api.js?v=45';

const SS_KEY = 'tm_hub_hello_v1';
const LS_SHOWN = 'tm_journey_local_v1';
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const COLORS = { violet: ['#5B3F7A', '#8C6FA3'], green: ['#1F6B4F', '#3E9A73'], red: ['#A12A2A', '#D9534F'], orange: ['#B5651D', '#E08E3C'], blue: ['#1F5AA6', '#4C8BD9'], gold: ['#8C6A12', '#D4A62A'], pink: ['#B23A67', '#E77A9B'], teal: ['#0F6E6A', '#2FA79F'] };
const page = () => (location.pathname.split('/').pop() || 'dashboard').replace(/\.html$/, '') || 'dashboard';
const onLesson = () => /^(lesson|group-lesson)$/.test(page());
const track = (n, p = {}) => { try { window.tmTrack && window.tmTrack(n, p); } catch (e) { /* تجاهل */ } };

let css = false;
function ensureCss() {
    if (css) return; css = true;
    const s = document.createElement('style');
    s.textContent = `
.an-modal .modal-content{max-width:520px;padding:0;overflow:hidden;border-radius:20px}
.an-head{padding:1.1rem 1.2rem 1rem;color:#fff;background:linear-gradient(135deg,var(--a1),var(--a2));position:relative}
.an-head .em{font-size:2rem;display:block;margin-bottom:.2rem}
.an-head h2{margin:0;color:#fff;font-size:1.2rem;line-height:1.6}
.an-head small{opacity:.85;font-size:.75rem}
.an-x{position:absolute;top:10px;left:10px;width:36px;height:36px;border-radius:50%;border:0;background:rgba(255,255,255,.2);color:#fff;font-size:1.1rem;cursor:pointer}
.an-body{padding:1rem 1.2rem 1.2rem;max-height:62vh;overflow:auto}
.an-text{white-space:pre-wrap;line-height:1.9;font-size:.95rem;color:var(--text-primary);margin:0 0 .8rem}
.an-text a{color:var(--primary);font-weight:700;word-break:break-all}
.an-media{display:flex;flex-direction:column;gap:.6rem;margin-bottom:.8rem}
.an-media img,.an-media video{width:100%;border-radius:12px;display:block;background:#eee}
.an-yt{position:relative;width:100%;aspect-ratio:16/9;border-radius:12px;overflow:hidden;background:#000;border:0;cursor:pointer;padding:0;display:block}
.an-yt img{width:100%;height:100%;object-fit:cover;opacity:.85}
.an-yt span{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:3rem}
.an-yt iframe{position:absolute;inset:0;width:100%;height:100%;border:0}
.an-link{display:flex;align-items:center;gap:.6rem;padding:.65rem .8rem;border:1px solid var(--border);border-radius:12px;text-decoration:none;color:var(--text-primary);font-weight:600;font-size:.9rem;background:var(--bg-secondary)}
.an-link .ic{font-size:1.2rem}
.an-btns{display:flex;gap:.5rem;flex-wrap:wrap}
.an-btns .btn{margin:0;min-height:46px;flex:1;display:inline-flex;align-items:center;justify-content:center}
.an-cta{background:linear-gradient(135deg,var(--a1),var(--a2))!important;color:#fff!important;border:0!important}
.an-banner{display:flex;align-items:center;gap:.7rem;padding:.75rem .9rem;border-radius:14px;color:#fff;background:linear-gradient(135deg,var(--a1),var(--a2));margin-bottom:1rem;cursor:pointer;box-shadow:0 6px 18px rgba(41,37,45,.12)}
.an-banner .em{font-size:1.5rem}.an-banner b{display:block;font-size:.95rem}.an-banner small{opacity:.9;font-size:.78rem;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:60vw}
.an-banner .t{flex:1;min-width:0}.an-banner button{border:0;background:rgba(255,255,255,.2);color:#fff;width:32px;height:32px;border-radius:50%;cursor:pointer;flex-shrink:0}
.jn-card{position:fixed;z-index:8500;inset-inline-end:16px;bottom:calc(16px + env(safe-area-inset-bottom,0px));width:min(360px,calc(100vw - 32px));background:var(--card-bg,#fff);border:1px solid var(--border);border-radius:18px;box-shadow:0 18px 50px rgba(20,14,26,.25);padding:1rem;display:flex;flex-direction:column;gap:.5rem;animation:jnIn .25s ease}
.jn-card .hd{display:flex;gap:.6rem;align-items:flex-start}.jn-card .em{font-size:1.8rem;line-height:1}
.jn-card b{font-size:.98rem;color:var(--text-primary)}.jn-card p{margin:.2rem 0 0;font-size:.85rem;line-height:1.75;color:var(--text-secondary)}
.jn-card .ac{display:flex;gap:.4rem}.jn-card .ac .btn{margin:0;flex:1;min-height:42px}
.jn-card .x{margin-inline-start:auto;border:0;background:transparent;font-size:1.1rem;cursor:pointer;color:var(--text-light);width:32px;height:32px;border-radius:8px}
@media (max-width:900px){.jn-card{bottom:calc(84px + env(safe-area-inset-bottom,0px))}}
@keyframes jnIn{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}
.ct-list{display:flex;flex-direction:column;gap:.5rem}
.ct-item{display:flex;align-items:center;gap:.8rem;padding:.8rem .9rem;border:1px solid var(--border);border-radius:14px;text-decoration:none;color:var(--text-primary);background:var(--card-bg);font:inherit;cursor:pointer;text-align:start;width:100%}
.ct-item:hover{border-color:var(--primary)}
.ct-item .ic{width:42px;height:42px;border-radius:12px;display:inline-flex;align-items:center;justify-content:center;font-size:1.3rem;flex-shrink:0}
.ct-item b{display:block;font-size:.95rem}.ct-item small{color:var(--text-secondary);font-size:.78rem}
@media (prefers-reduced-motion:reduce){.jn-card{animation:none}}`;
    document.head.appendChild(s);
}

// ------------------------------------------------------------------ نافذة عامة
function modal(inner, { cls = '', label = '' } = {}) {
    ensureCss();
    const m = document.createElement('div');
    m.className = `modal active ${cls}`;
    m.innerHTML = `<div class="modal-content" role="dialog" aria-modal="true" aria-label="${esc(label)}">${inner}</div>`;
    const close = () => { m.remove(); document.removeEventListener('keydown', onKey); };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    m.addEventListener('mousedown', (e) => { if (e.target === m) close(); });
    document.addEventListener('keydown', onKey);
    document.body.appendChild(m);
    return { m, close };
}

// ------------------------------------------------------------------ نص فيه لينكات بتتفتح
function linkify(text) {
    return esc(text).replace(/(https?:\/\/[^\s<]+)/g, (u) => `<a href="${u}" target="_blank" rel="noopener">${u}</a>`);
}
function ytId(url) {
    const m = /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|shorts\/|embed\/|live\/))([\w-]{6,15})/.exec(String(url || ''));
    return m ? m[1] : null;
}
const safeUrl = (u) => (/^(https?:|mailto:|tel:)/i.test(String(u || '')) || /^[a-z0-9-]+\.html/i.test(String(u || '')) ? String(u) : '#');
function mediaHtml(media) {
    return (media || []).map((x) => {
        const url = safeUrl(x.url);
        const label = esc(x.label || '');
        if (x.type === 'image') return `<img src="${esc(url)}" alt="${label}" loading="lazy">`;
        if (x.type === 'youtube') { const id = ytId(url); return id ? `<button type="button" class="an-yt" data-yt="${id}" aria-label="شغّل الفيديو"><img src="https://i.ytimg.com/vi/${id}/hqdefault.jpg" alt="" loading="lazy"><span>▶️</span></button>` : ''; }
        if (x.type === 'video') return `<video src="${esc(url)}" controls preload="none" playsinline></video>`;
        const ic = x.type === 'whatsapp' ? '💬' : x.type === 'file' ? '📎' : '🔗';
        return `<a class="an-link" href="${esc(url)}" target="_blank" rel="noopener" data-click><span class="ic">${ic}</span><span>${label || esc(url.replace(/^https?:\/\//, '').slice(0, 60))}</span></a>`;
    }).join('');
}

// ------------------------------------------------------------------ الإشعار
// v34: الإشعار اللي المدرس قفله (✕ / تمام / بعدين) أو داس على زراره مايظهرش تاني خالص:
// بيتسجل على الجهاز فورًا (حتى لو النت بطيء) وبيتشال من الكاش، والسيرفر بيتبلغ إنه اتقفل
const LS_DONE = 'tm_ann_done_v1';
const doneSet = () => { try { return new Set(JSON.parse(localStorage.getItem(LS_DONE) || '[]')); } catch (e) { return new Set(); } };
export function isAnnDone(id) { return doneSet().has(id); }
function markAnnDone(id) {
    if (!id) return;
    const s = doneSet(); s.add(id);
    try { localStorage.setItem(LS_DONE, JSON.stringify([...s].slice(-80))); } catch (e) { /* تجاهل */ }
    try {
        const c = JSON.parse(sessionStorage.getItem(SS_KEY) || 'null');
        if (c && c.data && Array.isArray(c.data.announcements)) {
            c.data.announcements = c.data.announcements.filter((a) => a && a.id !== id);
            sessionStorage.setItem(SS_KEY, JSON.stringify(c));
        }
    } catch (e) { /* تجاهل */ }
    document.querySelectorAll(`[data-ann-id="${id}"]`).forEach((el) => el.remove());
    api.hub('ann_dismiss', { id }).catch(() => {});
}

export function showAnnouncement(a, { onClose } = {}) {
    const [c1, c2] = COLORS[a.color] || COLORS.violet;
    const btnUrl = a.button_url ? safeUrl(a.button_url) : '';
    const internal = btnUrl && !/^https?:/i.test(btnUrl);
    const { m, close } = modal(`
        <div class="an-head" style="--a1:${c1};--a2:${c2}">
            <button type="button" class="an-x" aria-label="إغلاق">✕</button>
            ${a.emoji ? `<span class="em" aria-hidden="true">${esc(a.emoji)}</span>` : ''}
            <h2>${esc(a.title)}</h2><small>من فريق Teachers Manager</small>
        </div>
        <div class="an-body">
            ${a.body ? `<p class="an-text">${linkify(a.body)}</p>` : ''}
            ${(a.media || []).length ? `<div class="an-media">${mediaHtml(a.media)}</div>` : ''}
            <div class="an-btns" style="--a1:${c1};--a2:${c2}">
                ${btnUrl ? `<a class="btn an-cta" href="${esc(btnUrl)}" ${internal ? '' : 'target="_blank" rel="noopener"'} data-click>${esc(a.button_label || 'افتح')}</a>` : ''}
                <button type="button" class="btn btn-ghost" data-ok>${btnUrl ? 'بعدين' : 'تمام 👍'}</button>
            </div>
        </div>`, { cls: 'an-modal', label: a.title });
    let finished = false;
    const finish = () => { if (finished) return; finished = true; markAnnDone(a.id); if (onClose) onClose(); };
    const done = () => { close(); finish(); };
    // قفل النافذة بأي طريقة (✕، تمام، الضغط برّه، Esc) = خلاص اتشاف ومايرجعش
    new MutationObserver((_, ob) => { if (!m.isConnected) { ob.disconnect(); finish(); } }).observe(document.body, { childList: true });
    m.querySelector('.an-x').addEventListener('click', done);
    m.querySelector('[data-ok]').addEventListener('click', done);
    m.querySelectorAll('[data-click]').forEach((el) => el.addEventListener('click', () => {
        api.hub('ann_click', { id: a.id }).catch(() => {}); track('announcement_click', {});
        if (el.classList.contains('an-cta')) { markAnnDone(a.id); setTimeout(close, 200); }
    }));
    m.querySelectorAll('[data-yt]').forEach((b) => b.addEventListener('click', () => {
        b.innerHTML = `<iframe src="https://www.youtube-nocookie.com/embed/${b.dataset.yt}?autoplay=1&rel=0" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen title="فيديو"></iframe>`;
        api.hub('ann_click', { id: a.id }).catch(() => {});
    }, { once: true }));
    if (!a.seen) { a.seen = true; api.hub('ann_seen', { id: a.id }).catch(() => {}); track('announcement_seen', {}); }
    return close;
}

// شريط صغير في الرئيسية للإشعارات اللي لسه ماتفتحتش (لو كان فيه أكتر من اتنين في نفس اليوم)
function mountBanner(list) {
    if (page() !== 'dashboard') return;
    const a = list.find((x) => x && x.title && !isAnnDone(x.id));
    const host = document.querySelector('.page-body');
    if (!a || !host || document.getElementById('an-banner')) return;
    ensureCss();
    const [c1, c2] = COLORS[a.color] || COLORS.violet;
    const el = document.createElement('div');
    el.id = 'an-banner';
    el.dataset.annId = a.id;
    el.className = 'an-banner';
    el.style.setProperty('--a1', c1); el.style.setProperty('--a2', c2);
    el.setAttribute('role', 'button'); el.tabIndex = 0;
    el.innerHTML = `<span class="em" aria-hidden="true">${esc(a.emoji || '📣')}</span><div class="t"><b>${esc(a.title)}</b><small>${esc(String(a.body || '').split('\n')[0])}</small></div><button type="button" aria-label="إخفاء">✕</button>`;
    host.insertBefore(el, host.firstChild);
    const open = () => { el.remove(); showAnnouncement(a); };
    el.addEventListener('click', (e) => {
        if (e.target.closest('button')) { e.stopPropagation(); markAnnDone(a.id); return; }
        open();
    });
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter') open(); });
}

// ------------------------------------------------------------------ الرسايل التلقائية (رحلة المدرس)
const NUDGES = [
    {
        key: 'community', when: (c, v) => c.lessons >= 1 && v >= 2, modal: true,
        em: '🤝', title: 'انضم لمجموعة المدرسين على واتساب',
        text: 'ما شاء الله، بدأت تسجّل حصصك 👏 في المجموعة بنشارك أفكار للحصص، وبنرد على أي سؤال بسرعة، وبتعرف التحديثات الجديدة قبل أي حد.',
        cta: 'انضم للمجموعة', url: () => CONFIG.COMMUNITY_URL, external: true
    },
    { key: 'first_student', when: (c, v) => c.students === 0 && v >= 2, em: '👤', title: 'ابدأ بأول طالب', text: 'ضيف طالب واحد بس (الاسم كفاية) وجرّب البرنامج معاه. بتاخد أقل من دقيقة.', cta: 'ضيف طالب', url: () => 'students.html' },
    { key: 'first_schedule', when: (c, v) => c.students > 0 && c.schedules === 0 && v >= 2, em: '🗓️', title: 'حدد مواعيد طلابك', text: 'لما تحدد المواعيد، هيوصلك تذكير قبل كل حصة، وحصص النهارده هتظهرلك في الرئيسية.', cta: 'حدد المواعيد', url: () => 'students.html' },
    { key: 'first_lesson', when: (c, v) => c.schedules > 0 && c.lessons === 0 && v >= 3, em: '▶️', title: 'سجّل أول حصة', text: 'من الرئيسية دوس "ابدأ الحصة" جنب اسم الطالب. هتسجّل اللي أخدتوه والواجب في ثواني، وتبعت تقرير لولي الأمر.', cta: 'روح للرئيسية', url: () => 'dashboard.html' },
    { key: 'try_games', when: (c, v) => c.lessons >= 3 && c.games === 0 && v >= 3, em: '🎮', title: 'جديد: ألعاب للطلاب في الحصة', text: 'العب مع طلابك "أكمل الآية" و"رتّب الكلمات" من أي سورة، أو ألعاب حروف ونحو جاهزة. الأطفال بيحبوها جدًا.', cta: 'جرّب الألعاب', url: () => 'games.html' },
    { key: 'try_books', when: (c, v) => c.lessons >= 2 && c.books === 0 && v >= 4, em: '📚', title: 'افتح كتابك جوه الحصة', text: 'ارفع المصحف أو نور البيان أو أي مذكرة، واشرح عليها بالقلم والهايلايتر وانت مشارك الشاشة.', cta: 'افتح مكتبتي', url: () => 'books.html' }
];
const localShown = () => { try { return JSON.parse(localStorage.getItem(LS_SHOWN) || '{}') || {}; } catch (e) { return {}; } };
function markLocal(key, patch) {
    const all = localShown();
    all[key] = { ...(all[key] || {}), ...patch };
    try { localStorage.setItem(LS_SHOWN, JSON.stringify(all)); } catch (e) { /* تجاهل */ }
}
function pickNudge(data) {
    const c = data.counts || {};
    const visits = (data.journey && data.journey.visits) || 1;
    const server = (data.journey && data.journey.shown) || {};
    const local = localShown();
    const now = Date.now();
    for (const n of NUDGES) {
        const s = { ...(server[n.key] || {}), ...(local[n.key] || {}) };
        if (s.done) continue;
        if ((Number(s.n) || 0) >= 3) continue;
        if (s.snooze_until && Date.parse(s.snooze_until) > now) continue;
        if (s.at && now - Date.parse(s.at) < 20 * 3600 * 1000) continue;
        try { if (n.when(c, visits)) return n; } catch (e) { /* تجاهل */ }
    }
    return null;
}
function mark(n, state) {
    const patch = state === 'shown' ? { at: new Date().toISOString(), n: ((localShown()[n.key] || {}).n || 0) + 1 } : state === 'snooze' ? { snooze_until: new Date(Date.now() + 3 * 86400000).toISOString() } : { done: state };
    markLocal(n.key, patch);
    api.hub('journey_mark', { key: n.key, state }).catch(() => {});
    track('journey_nudge', { key: n.key, state });
}
function showNudge(n) {
    ensureCss();
    mark(n, 'shown');
    const url = n.url();
    if (n.modal) {
        const { m, close } = modal(`
            <div class="an-head" style="--a1:#1F6B4F;--a2:#25D366"><button type="button" class="an-x" aria-label="إغلاق">✕</button><span class="em">${n.em}</span><h2>${esc(n.title)}</h2></div>
            <div class="an-body"><p class="an-text">${esc(n.text)}</p>
            <div class="an-btns" style="--a1:#1F6B4F;--a2:#25D366"><a class="btn an-cta" href="${esc(url)}" target="_blank" rel="noopener" data-go>${esc(n.cta)}</a><button type="button" class="btn btn-ghost" data-later>بعدين</button></div>
            <p style="margin:.7rem 0 0;text-align:center"><button type="button" data-never style="border:0;background:none;color:var(--text-light);font:inherit;font-size:.78rem;cursor:pointer;text-decoration:underline">أنا في المجموعة بالفعل</button></p></div>`, { cls: 'an-modal', label: n.title });
        m.querySelector('[data-go]').addEventListener('click', () => { mark(n, 'done'); setTimeout(close, 300); });
        m.querySelector('[data-later]').addEventListener('click', () => { mark(n, 'snooze'); close(); });
        m.querySelector('.an-x').addEventListener('click', () => { mark(n, 'snooze'); close(); });
        m.querySelector('[data-never]').addEventListener('click', () => { mark(n, 'never'); close(); });
        return;
    }
    const el = document.createElement('div');
    el.className = 'jn-card';
    el.setAttribute('role', 'status');
    el.innerHTML = `<div class="hd"><span class="em" aria-hidden="true">${n.em}</span><div><b>${esc(n.title)}</b><p>${esc(n.text)}</p></div><button type="button" class="x" aria-label="إخفاء">✕</button></div>
        <div class="ac"><a class="btn btn-primary" href="${esc(url)}" ${n.external ? 'target="_blank" rel="noopener"' : ''}>${esc(n.cta)}</a><button type="button" class="btn btn-ghost" data-later>بعدين</button></div>`;
    document.body.appendChild(el);
    el.querySelector('a').addEventListener('click', () => mark(n, 'done'));
    el.querySelector('[data-later]').addEventListener('click', () => { mark(n, 'snooze'); el.remove(); });
    el.querySelector('.x').addEventListener('click', () => { mark(n, 'snooze'); el.remove(); });
}

// ------------------------------------------------------------------ التواصل مع المطوّر
export function openContact() {
    const phone = CONFIG.SUPPORT_WHATSAPP;
    let name = '';
    try { name = (JSON.parse(localStorage.getItem('user_profile') || '{}') || {}).name || ''; } catch (e) { /* تجاهل */ }
    const ua = navigator.userAgent;
    const dev = /iPhone|iPad/.test(ua) ? 'آيفون' : /Android/.test(ua) ? (/SamsungBrowser/.test(ua) ? 'أندرويد (متصفح سامسونج)' : 'أندرويد') : 'كمبيوتر';
    const wa = (t) => `https://wa.me/${phone}?text=${encodeURIComponent(t)}`;
    const hello = wa(`السلام عليكم، أنا ${name || 'مدرس'} من مستخدمي Teachers Manager 👋\n`);
    const problem = wa(`السلام عليكم، عندي مشكلة في Teachers Manager 🙏\nالصفحة: ${page()}\nالجهاز: ${dev}\nالمشكلة: `);
    const { m, close } = modal(`
        <span class="close-modal" role="button" tabindex="0" aria-label="إغلاق">&times;</span>
        <h2 style="margin-top:0">💬 تواصل معانا</h2>
        <p style="margin:-.3rem 0 .9rem;color:var(--text-secondary);font-size:.88rem;line-height:1.7">إحنا هنا لأي سؤال أو مشكلة أو فكرة. بنرد على واتساب في أسرع وقت.</p>
        <div class="ct-list">
            <a class="ct-item" href="${hello}" target="_blank" rel="noopener" data-ct="whatsapp"><span class="ic" style="background:#E3F7EA">💬</span><span><b>كلّم المطوّر على واتساب</b><small>سؤال، مساعدة، أو أي حاجة</small></span></a>
            <a class="ct-item" href="${problem}" target="_blank" rel="noopener" data-ct="problem"><span class="ic" style="background:#FDECEC">🛠️</span><span><b>عندي مشكلة</b><small>بنبعت معاها الصفحة ونوع جهازك عشان نحلها أسرع</small></span></a>
            <button type="button" class="ct-item" data-ct="suggest"><span class="ic" style="background:#FFF4D6">💡</span><span><b>عندي اقتراح أو فكرة</b><small>اقتراحاتكم بتتعمل فعلًا</small></span></button>
            <a class="ct-item" href="${esc(CONFIG.COMMUNITY_URL)}" target="_blank" rel="noopener" data-ct="community"><span class="ic" style="background:#E2EDF9">🤝</span><span><b>مجموعة المدرسين</b><small>أفكار وتجارب وتحديثات</small></span></a>
        </div>`, { label: 'تواصل معانا' });
    m.querySelector('.close-modal').addEventListener('click', close);
    m.addEventListener('click', (e) => {
        const it = e.target.closest('[data-ct]');
        if (!it) return;
        track('contact_click', { kind: it.dataset.ct });
        if (it.dataset.ct === 'suggest') { close(); import('./suggestions.js?v=45').then((s) => s.openSuggestionModal && s.openSuggestionModal()).catch(() => {}); return; }
        if (it.dataset.ct === 'community') markLocal('community', { done: 'done' });
        setTimeout(close, 300);
    });
}

// ------------------------------------------------------------------ البداية
let started = false;
export async function initHub() {
    if (started) return; started = true;
    const qs = new URLSearchParams(location.search);
    const forceAnn = qs.get('ann');
    let data = null;
    try {
        const cached = JSON.parse(sessionStorage.getItem(SS_KEY) || 'null');
        if (cached && Date.now() - cached.at < 30 * 60 * 1000 && !forceAnn) data = cached.data;
    } catch (e) { /* تجاهل */ }
    if (!data) {
        try {
            data = await api.hub('hello');
            try { sessionStorage.setItem(SS_KEY, JSON.stringify({ at: Date.now(), data })); } catch (e) { /* تجاهل */ }
        } catch (e) { return; }   // workflow app-hub لسه ماتفعّلش: مفيش حاجة تظهر
    }
    if (!data) return;
    const anns = (data.announcements || []).filter((a) => a && a.id && !isAnnDone(a.id));
    // جاي من الجرس أو إشعار الموبايل: نفتح الإشعار ده بالذات (حتى لو اتقفل قبل كده)
    if (forceAnn) {
        const a = (data.announcements || []).find((x) => x && x.id === forceAnn);
        if (a) { showAnnouncement(a); try { history.replaceState(null, '', location.pathname); } catch (e) { /* تجاهل */ } return; }
    }
    if (onLesson()) return;
    const fresh = anns.filter((a) => !a.seen && a.show_in_app !== false);
    if (fresh.length) {
        let i = 0;
        const next = () => {
            if (i < fresh.length && i < 2 && !document.querySelector('.modal.active')) showAnnouncement(fresh[i++], { onClose: () => setTimeout(next, 400) });
            else if (i < fresh.length) mountBanner(fresh.slice(i));
        };
        setTimeout(next, 900);
        return;   // رسالة واحدة في المرة: الإشعار أولى من الرسالة التلقائية
    }
    if (sessionStorage.getItem('tm_nudge_done')) return;
    const n = pickNudge(data);
    if (n) {
        try { sessionStorage.setItem('tm_nudge_done', '1'); } catch (e) { /* تجاهل */ }
        setTimeout(() => { if (!document.querySelector('.modal.active')) showNudge(n); }, 2500);
    }
}
