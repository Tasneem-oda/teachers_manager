/**
 * tips.js - تلميحات قصيرة بتظهر مرة واحدة بس لكل شاشة
 *
 * - تلميح واحد على الأكثر في المرة (أول تلميح لسه ماتشافش من القائمة)
 * - بيظهر كفقاعة ثابتة تحت الشاشة + تمييز العنصر المقصود (مفيش حسابات أماكن ممكن تبوظ على الموبايل)
 * - "فهمت" بيقفله للأبد، وكل التلميحات بتتقفل مرة واحدة من "إخفاء كل التلميحات"
 */

const KEY = 'tm_tips_seen';
const OFF = 'tm_tips_off';

function seen() {
    try { return new Set(JSON.parse(localStorage.getItem(KEY) || '[]')); } catch (e) { return new Set(); }
}
function markSeen(id) {
    try { const s = seen(); s.add(id); localStorage.setItem(KEY, JSON.stringify([...s])); } catch (e) { /* تجاهل */ }
}
function tipsOff() {
    try { return localStorage.getItem(OFF) === '1'; } catch (e) { return false; }
}

let current = null;

function close() {
    if (!current) return;
    if (current.cleanup) current.cleanup();
    current.bubble.remove();
    if (current.target) current.target.classList.remove('tip-target');
    current = null;
}

/**
 * @param {Array<{id:string, target:string, text:string, title?:string}>} tips
 * @param {{delay?:number}} opts
 */
export function showTips(tips, opts = {}) {
    if (tipsOff() || current) return;
    // الاختيار بيتم بعد التأخير عشان العناصر تكون ظهرت فعلًا (مثلًا بعد ما شاشة التحميل تختفي)
    setTimeout(() => {
        if (current || tipsOff()) return;
        const done = seen();
        const tip = tips.find((t) => !done.has(t.id) && isVisible(document.querySelector(t.target)));
        if (!tip) return;
        const target = document.querySelector(tip.target);
        const bubble = document.createElement('div');
        bubble.className = 'tip-bubble';
        bubble.setAttribute('role', 'status');
        bubble.innerHTML = `
            <div class="tip-text">${tip.title ? `<strong>${escapeHtml(tip.title)}</strong>` : ''}<span>${escapeHtml(tip.text)}</span></div>
            <div class="tip-actions">
                <button type="button" class="tip-ok">فهمت</button>
                <button type="button" class="tip-off">إخفاء كل التلميحات</button>
            </div>`;
        document.body.appendChild(bubble);
        target.classList.add('tip-target');
        try { target.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } catch (e) { /* تجاهل */ }
        // أي ضغطة برّه التلميح = المستخدم شافه وكمّل شغله: نقفله ومايظهرش تاني
        const onOutside = (e) => {
            if (!current || bubble.contains(e.target)) return;
            markSeen(tip.id); close();
        };
        document.addEventListener('pointerdown', onOutside, true);
        current = { bubble, target, cleanup: () => document.removeEventListener('pointerdown', onOutside, true) };
        bubble.querySelector('.tip-ok').addEventListener('click', () => { markSeen(tip.id); close(); });
        bubble.querySelector('.tip-off').addEventListener('click', () => {
            try { localStorage.setItem(OFF, '1'); } catch (e) { /* تجاهل */ }
            markSeen(tip.id); close();
        });
    }, opts.delay == null ? 900 : opts.delay);
}

// لو الصفحة غيّرت حالتها (مثلًا بدأت الحصة) نقفل التلميح الحالي من غير ما نعلّمه كمتشاف
export function dismissTip() { close(); }

function isVisible(el) {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
}

function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
