/**
 * tutorials.js — v35: الشروحات (فيديوهات يوتيوب من صاحبة البرنامج)
 *
 * • الفيديوهات بتتضاف من المونيتور (تبويب "الشروحات") ومعاها "مكانها" في البرنامج (الحصة، الطلاب، المكتبة...).
 * • في كل صفحة: زرار صغير "▶ شرح" تحت على الجنب — مايغطيش حاجة ومايشتغلش لوحده.
 *   الضغط عليه بيفتح مشغّل صغير (تلت الشاشة على الكمبيوتر، ونص الشاشة تحت على الموبايل) والمدرس يكمّل شغله وهو بيتفرج.
 * • أي عنصر عليه data-tutorial="books:upload" بيظهر جنبه ▶ لو فيه فيديو للجزء ده بالظبط.
 * • صفحة "الشروحات" (learn.html) فيها كل الفيديوهات مترتبة.
 * • القايمة بتتحفظ على الجهاز 6 ساعات (مابتتطلبش من السيرفر في كل صفحة).
 */
import { api } from './api.js?v=56';

const LS = 'tm_tutorials_v1';
const SEEN = 'tm_tutorials_seen_v1';
const HIDE = 'tm_tutorials_hide_v1';
const TTL = 6 * 60 * 60 * 1000;

/** أماكن الفيديوهات في البرنامج (نفس القايمة في المونيتور) */
export const PLACES = [
    ['general', 'عام / أول مرة في البرنامج'], ['dashboard', 'الرئيسية'], ['students', 'الطلاب'], ['student', 'ملف الطالب'],
    ['schedule', 'جدولي والمواعيد'], ['lesson', 'الحصة'], ['lesson:homework', 'الحصة — الواجب والتقييم'], ['lesson:board', 'الحصة — السبورة وأدوات الشرح'],
    ['group-lesson', 'حصة المجموعة'], ['groups', 'المجموعات'], ['billing', 'الدفع والحسابات'], ['books', 'المكتبة'], ['books:upload', 'المكتبة — رفع كتاب'],
    ['mushaf', 'المصحف'], ['games', 'ألعاب الحصة'], ['games:create', 'الألعاب — عمل لعبة'], ['settings', 'الإعدادات'], ['subscription', 'الاشتراك'], ['income', 'الدخل']
];
export const placeLabel = (k) => (PLACES.find((p) => p[0] === k) || [k, k])[1];
const PAGE_PLACES = { dashboard: ['dashboard', 'general'], students: ['students'], student: ['student', 'billing'], schedule: ['schedule'], lesson: ['lesson', 'lesson:homework', 'lesson:board'], 'group-lesson': ['group-lesson'], groups: ['groups'], group: ['groups'], books: ['books', 'books:upload'], games: ['games', 'games:create'], settings: ['settings'], subscription: ['subscription'], income: ['income'], mushaf: ['mushaf'] };

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const lsGet = (k, d) => { try { return JSON.parse(localStorage.getItem(k) || 'null') || d; } catch (e) { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* تجاهل */ } };

/** معرّف فيديو يوتيوب من أي شكل لينك (watch / youtu.be / shorts / embed) */
export function youtubeId(url) {
    const s = String(url || '').trim();
    if (/^[\w-]{11}$/.test(s)) return s;
    const m = s.match(/(?:youtu\.be\/|youtube(?:-nocookie)?\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/|v\/))([\w-]{11})/);
    return m ? m[1] : '';
}
export const thumb = (id) => `https://i.ytimg.com/vi/${id}/mqdefault.jpg`;

let loading = null;
/** كل الفيديوهات المفعّلة (من الكاش لو جديد، وبيتحدّث في الخلفية) */
export async function getVideos({ fresh = false } = {}) {
    const hit = lsGet(LS, null);
    const fetchNow = async () => {
        try {
            const r = await api.hub('videos', {}, { priority: 'low', timeoutMs: 15000 });
            const items = ((r && r.items) || []).filter((v) => v && youtubeId(v.youtube_id || v.url));
            lsSet(LS, { at: Date.now(), items });
            return items;
        } catch (e) {
            // السيرفر لسه مافيهوش الشروحات (أو مفيش نت): مانكررش الطلب في كل صفحة
            if (!hit) lsSet(LS, { at: Date.now() - TTL + 30 * 60 * 1000, items: [] });
            return hit ? hit.items : [];
        }
    };
    if (hit && !fresh && Date.now() - hit.at < TTL) return hit.items;
    if (!loading) loading = fetchNow().finally(() => { loading = null; });
    if (hit && !fresh) { loading.catch(() => {}); return hit.items; }
    return loading;
}

const forPlaces = (items, places) => items.filter((v) => (v.places || []).some((p) => places.includes(p))).sort((a, b) => (a.sort || 0) - (b.sort || 0));

// ------------------------------------------------------------------ المشغّل الصغير
let css = false;
function ensureCss() {
    if (css) return; css = true;
    const st = document.createElement('style');
    st.textContent = `
.tt-fab{position:fixed;z-index:880;left:14px;bottom:calc(16px + env(safe-area-inset-bottom));display:inline-flex;align-items:center;gap:.4rem;height:40px;padding:0 .9rem 0 .75rem;border:1px solid #E1D6EA;border-radius:999px;background:#fff;color:#4B3A5A;font:700 .84rem 'IBM Plex Sans Arabic',Tahoma,sans-serif;cursor:pointer;box-shadow:0 6px 18px rgba(40,25,60,.14);opacity:.92;transition:opacity .15s,transform .15s}
.tt-fab:hover{opacity:1;transform:translateY(-1px)}
.tt-fab .dot{width:22px;height:22px;border-radius:50%;background:#E53935;color:#fff;display:inline-flex;align-items:center;justify-content:center;font-size:.7rem}
.tt-fab .x{margin-inline-start:.2rem;color:#9A93A0;font-weight:400;padding:0 .2rem}
@media (max-width:768px){.tt-fab{bottom:calc(76px + env(safe-area-inset-bottom));height:36px;font-size:.78rem}body:has(#tm-install-banner:not([hidden])) .tt-fab{bottom:calc(var(--tt-ib,150px) + env(safe-area-inset-bottom))}}
body:has(#tm-install-banner:not([hidden])) .tt-fab{z-index:9100}
.tt-mini{position:fixed;z-index:9300;left:14px;bottom:calc(14px + env(safe-area-inset-bottom));width:min(440px,34vw);min-width:320px;background:#1E1726;color:#fff;border-radius:16px;overflow:hidden;box-shadow:0 18px 50px rgba(0,0,0,.35);display:flex;flex-direction:column;font-family:'IBM Plex Sans Arabic',Tahoma,sans-serif}
.tt-mini.min .tt-v,.tt-mini.min .tt-list{display:none}
.tt-head{display:flex;align-items:center;gap:.4rem;padding:.45rem .6rem;background:#2A2133}
.tt-head b{flex:1;font-size:.84rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tt-head button{width:30px;height:30px;border:0;border-radius:8px;background:rgba(255,255,255,.1);color:#fff;cursor:pointer;font:inherit}
.tt-v{position:relative;aspect-ratio:16/9;background:#000}
.tt-v iframe{position:absolute;inset:0;width:100%;height:100%;border:0}
.tt-list{max-height:30vh;overflow:auto;display:flex;flex-direction:column}
.tt-it{display:flex;gap:.55rem;align-items:center;padding:.45rem .6rem;border:0;background:transparent;color:#fff;font:inherit;font-size:.8rem;text-align:start;cursor:pointer;border-top:1px solid rgba(255,255,255,.06)}
.tt-it:hover,.tt-it.on{background:rgba(255,255,255,.08)}
.tt-it img{width:74px;aspect-ratio:16/9;object-fit:cover;border-radius:6px;flex-shrink:0;background:#333}
.tt-it small{display:block;color:#B9AEC4;font-size:.72rem;margin-top:2px}
.tt-it .seen{color:#8BC34A;font-size:.7rem}
.tt-foot{display:flex;justify-content:space-between;padding:.4rem .6rem;font-size:.74rem;background:#2A2133}
.tt-foot a{color:#E9D49A}
@media (max-width:768px){.tt-mini{left:8px;right:8px;width:auto;min-width:0;bottom:calc(70px + env(safe-area-inset-bottom))}.tt-list{max-height:22vh}}
.tt-chip{display:inline-flex;align-items:center;gap:.25rem;margin-inline-start:.4rem;padding:.1rem .5rem;border:1px solid #F3C9C9;border-radius:999px;background:#FFF5F5;color:#C62828;font:700 .72rem 'IBM Plex Sans Arabic',Tahoma,sans-serif;cursor:pointer;vertical-align:middle}
.tt-chip:hover{background:#FFEBEE}`;
    document.head.appendChild(st);
}

let mini = null;
export function openPlayer(list, startId, { title = 'شرح' } = {}) {
    ensureCss();
    if (mini) mini.remove();
    if (!list || !list.length) return;
    const seen = new Set(lsGet(SEEN, []));
    let cur = list.find((v) => (v.id || youtubeId(v.youtube_id || v.url)) === startId) || list[0];
    mini = document.createElement('div');
    mini.className = 'tt-mini';
    mini.setAttribute('role', 'dialog');
    mini.setAttribute('aria-label', 'فيديو شرح');
    const draw = () => {
        const id = youtubeId(cur.youtube_id || cur.url);
        mini.innerHTML = `<div class="tt-head"><b>▶ ${esc(cur.title || title)}</b>
                <button type="button" data-tt="min" aria-label="تصغير" title="تصغير">–</button><button type="button" data-tt="close" aria-label="قفل" title="قفل">✕</button></div>
            <div class="tt-v"><iframe src="https://www.youtube-nocookie.com/embed/${id}?rel=0&modestbranding=1&playsinline=1&autoplay=1" title="${esc(cur.title || '')}" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen loading="lazy"></iframe></div>
            ${list.length > 1 ? `<div class="tt-list">${list.map((v) => { const vid = youtubeId(v.youtube_id || v.url); return `<button type="button" class="tt-it ${v === cur ? 'on' : ''}" data-v="${esc(v.id || vid)}"><img src="${thumb(vid)}" alt="" loading="lazy"><span>${esc(v.title)}${v.duration ? `<small>${esc(v.duration)}</small>` : ''}${seen.has(v.id || vid) ? '<small class="seen">✓ اتفرجت</small>' : ''}</span></button>`; }).join('')}</div>` : ''}
            <div class="tt-foot"><span>${cur.description ? esc(String(cur.description).slice(0, 80)) : ''}</span><a href="learn.html">كل الشروحات ←</a></div>`;
        const key = cur.id || id;
        seen.add(key); lsSet(SEEN, [...seen].slice(-300));
        api.hub('video_seen', { id: cur.id }, { priority: 'low' }).catch(() => {});
        try { window.tmTrack && window.tmTrack('tutorial_played', { place: (cur.places || [])[0] || '' }); } catch (e) { /* تجاهل */ }
    };
    draw();
    mini.addEventListener('click', (e) => {
        const b = e.target.closest('[data-tt]');
        if (b && b.dataset.tt === 'close') { mini.remove(); mini = null; return; }
        if (b && b.dataset.tt === 'min') { mini.classList.toggle('min'); b.textContent = mini.classList.contains('min') ? '▢' : '–'; return; }
        const it = e.target.closest('[data-v]');
        if (it) { cur = list.find((v) => (v.id || youtubeId(v.youtube_id || v.url)) === it.dataset.v) || cur; draw(); }
    });
    document.addEventListener('keydown', function onEsc(e) { if (e.key === 'Escape' && mini) { mini.remove(); mini = null; document.removeEventListener('keydown', onEsc); } });
    document.body.appendChild(mini);
}

/** الزرار الصغير في الصفحة + أزرار ▶ جنب العناصر اللي عليها data-tutorial */
export async function initTutorials(pageKey) {
    if (typeof document === 'undefined') return;
    const places = PAGE_PLACES[pageKey] || [pageKey];
    const items = await getVideos();
    if (!items.length) return;
    ensureCss();
    const here = forPlaces(items, places);
    const hidden = lsGet(HIDE, {});
    if (here.length && !(hidden[pageKey] && hidden[pageKey] >= here.length)) {
        const seen = new Set(lsGet(SEEN, []));
        const fresh = here.filter((v) => !seen.has(v.id || youtubeId(v.youtube_id || v.url))).length;
        const fab = document.createElement('button');
        fab.type = 'button';
        fab.className = 'tt-fab';
        fab.setAttribute('aria-label', `فيديوهات شرح للصفحة دي (${here.length})`);
        fab.innerHTML = `<span class="dot">▶</span> شرح${here.length > 1 ? ` (${here.length})` : ''}${fresh ? '' : ''}<span class="x" data-hide title="إخفاء" aria-label="إخفاء الزرار">✕</span>`;
        fab.addEventListener('click', (e) => {
            if (e.target.closest('[data-hide]')) { e.stopPropagation(); const h = lsGet(HIDE, {}); h[pageKey] = here.length; lsSet(HIDE, h); fab.remove(); return; }
            openPlayer(here);
        });
        document.body.appendChild(fab);
    }
    const attach = () => document.querySelectorAll('[data-tutorial]:not([data-tt-done])').forEach((el) => {
        el.setAttribute('data-tt-done', '1');
        const list = forPlaces(items, [el.getAttribute('data-tutorial')]);
        if (!list.length) return;
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'tt-chip';
        chip.textContent = '▶ شرح';
        chip.setAttribute('aria-label', `فيديو شرح: ${list[0].title}`);
        chip.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); openPlayer(list); });
        el.appendChild(chip);
    });
    attach();
    let t = null;
    new MutationObserver(() => { clearTimeout(t); t = setTimeout(attach, 400); }).observe(document.body, { childList: true, subtree: true });
}
