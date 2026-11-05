/**
 * net-status.js — v29.5: المدرس يعرف حالة النت، وإيه اللي مستني يتبعت
 * - "📴 مفيش نت": الصفحات بتعرض آخر بيانات اتحمّلت، والحصص/الغياب بيتحفظوا على الجهاز
 * - "⏳ 2 هيتبعتوا أول ما النت يرجع": عدد العمليات المستنية في الطابور (js/api.js → Outbox)
 * - "✓ رجع النت": بيختفي لوحده
 */
import { Outbox } from './api.js?v=37';

const STYLE = `
.tm-net { position: fixed; z-index: 3200; inset-inline: 0; margin: 0 auto; width: fit-content; max-width: calc(100vw - 24px);
  bottom: 16px; display: flex; align-items: center; gap: 0.45rem; padding: 0.5rem 0.95rem; border-radius: 999px;
  font-size: 0.86rem; font-weight: 600; line-height: 1.4; box-shadow: 0 6px 20px rgba(0,0,0,0.18); pointer-events: none;
  transition: opacity .2s ease, transform .2s ease; }
.tm-net[hidden] { display: none; }
.tm-net.off { background: #3A3340; color: #fff; }
.tm-net.wait { background: #FCF1DA; color: #7A5413; border: 1px solid #EBD5A6; }
.tm-net.ok { background: #E6F3EA; color: #1F5C3A; border: 1px solid #BFE0CB; }
@media (max-width: 768px) { .tm-net { bottom: calc(76px + env(safe-area-inset-bottom, 0px)); font-size: 0.82rem; } }
`;

let el = null;
let okTimer = null;
let fromCache = false;

function ensure() {
    if (el) return el;
    if (!document.getElementById('tm-net-style')) {
        const st = document.createElement('style');
        st.id = 'tm-net-style';
        st.textContent = STYLE;
        document.head.appendChild(st);
    }
    el = document.createElement('div');
    el.className = 'tm-net';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    el.hidden = true;
    document.body.appendChild(el);
    return el;
}

function render() {
    const box = ensure();
    const offline = navigator.onLine === false || window.__tmNetDown === true;
    const n = Outbox.count();
    clearTimeout(okTimer);
    if (offline) {
        box.className = 'tm-net off';
        box.textContent = n
            ? `📴 مفيش نت · ${n === 1 ? 'حاجة محفوظة' : `${n} حاجات محفوظة`} وهتتبعت لما يرجع`
            : (fromCache ? '📴 مفيش نت · بتشوف آخر بيانات اتحمّلت' : '📴 مفيش نت · اللي هتسجّله هيتحفظ على جهازك');
        box.hidden = false;
        return;
    }
    if (n) {
        box.className = 'tm-net wait';
        box.textContent = `⏳ ${n === 1 ? 'حاجة واحدة بتتبعت' : `${n} حاجات بتتبعت`}…`;
        box.hidden = false;
        return;
    }
    box.hidden = true;
}

function showBackOnline() {
    const box = ensure();
    box.className = 'tm-net ok';
    box.textContent = '✓ رجع النت';
    box.hidden = false;
    clearTimeout(okTimer);
    okTimer = setTimeout(() => { if (!Outbox.count()) box.hidden = true; }, 2500);
}

export function initNetStatus() {
    if (window.__tmNetStatus) return;
    window.__tmNetStatus = true;
    window.addEventListener('offline', () => { window.__tmNetDown = true; render(); });
    window.addEventListener('online', () => { window.__tmNetDown = false; fromCache = false; showBackOnline(); });
    // api.js بيقول لو طلب فشل بسبب النت (حتى لو المتصفح فاكر إن النت شغال) أو رجع يشتغل
    window.addEventListener('tm:net', (e) => {
        const d = (e && e.detail) || {};
        const was = window.__tmNetDown === true;
        window.__tmNetDown = d.online === false;
        if (d.fromCache) fromCache = true;
        if (d.online && was) { fromCache = false; showBackOnline(); } else render();
    });
    window.addEventListener('tm:outbox', render);
    window.addEventListener('storage', (e) => { if (e.key === 'tm_outbox_v1') render(); });
    if (navigator.onLine === false) window.__tmNetDown = true;
    render();
}
