/**
 * server-time.js — v29.7: الوقت الصح حتى لو ساعة الجهاز غلط
 *
 * بنقارن ساعة الجهاز بساعة السيرفر (هيدر Date اللي Cloudflare بيبعته مع أي ملف) ونحفظ الفرق على الجهاز.
 * كده التذكيرات وتاريخ/وقت الحصة اللي بيتسجل بيمشوا على الوقت الحقيقي بتوقيت مصر،
 * حتى لو ساعة الموبايل متأخرة أو متقدمة أو المنطقة الزمنية بتاعته غلط، وحتى من غير نت (بآخر فرق اتحسب).
 * الملف ده مابيستوردش أي حاجة، فأي ملف تاني يقدر يستخدمه من غير ما يتقل.
 */
const KEY = 'tm_clock_v1';
const SYNC_EVERY_MS = 10 * 60 * 1000;
export const APP_TZ = 'Africa/Cairo';

function readState() { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { return null; } }
let state = readState();

/** الفرق بالملّي ثانية: (الوقت الحقيقي - ساعة الجهاز) */
export function clockOffset() { return state && Number.isFinite(state.offset) ? state.offset : 0; }
/** الوقت الحقيقي بالملّي ثانية */
export function nowMs() { return Date.now() + clockOffset(); }
/** الوقت الحقيقي كـ Date (استخدميه للحساب بالملّي ثانية؛ للساعة واليوم استخدمي appParts) */
export function nowDate() { return new Date(nowMs()); }

const fmt = (() => {
    try {
        return new Intl.DateTimeFormat('en-CA', { timeZone: APP_TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23', weekday: 'short' });
    } catch (e) { return null; }
})();
const DOW = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/**
 * اليوم والساعة بتوقيت مصر (نفس توقيت السيرفر والتذكيرات اللي بتيجي من n8n)
 * @param {number} [ms] وقت حقيقي بالملّي ثانية (الافتراضي: دلوقتي)
 * @returns {{ ymd: string, dow: number, day: number, h: number, m: number, s: number, minutes: number }}
 */
export function appParts(ms = nowMs()) {
    if (fmt) {
        const p = {};
        fmt.formatToParts(new Date(ms)).forEach((x) => { p[x.type] = x.value; });
        const h = Number(p.hour) % 24; const m = Number(p.minute); const s = Number(p.second);
        return { ymd: `${p.year}-${p.month}-${p.day}`, dow: DOW[p.weekday] != null ? DOW[p.weekday] : new Date(ms).getDay(), day: Number(p.day), h, m, s, minutes: h * 60 + m + s / 60 };
    }
    const d = new Date(ms); const pad = (n) => String(n).padStart(2, '0');
    return { ymd: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, dow: d.getDay(), day: d.getDate(), h: d.getHours(), m: d.getMinutes(), s: d.getSeconds(), minutes: d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60 };
}
/** تاريخ النهارده الحقيقي YYYY-MM-DD بتوقيت مصر */
export const todayISO = () => appParts().ymd;
/** الساعة دلوقتي الحقيقية HH:MM:SS بتوقيت مصر */
export function timeISO() { const p = appParts(); const pad = (n) => String(n).padStart(2, '0'); return `${pad(p.h)}:${pad(p.m)}:${pad(p.s)}`; }

let syncing = null;
/** بنسأل السيرفر عن الوقت (طلب صغير جدًا لملف من الموقع نفسه) */
export function syncClock(force = false) {
    if (syncing) return syncing;
    if (!force && state && Date.now() - (state.at || 0) < SYNC_EVERY_MS && Math.abs(Date.now() - (state.at || 0)) < 864e5) return Promise.resolve(clockOffset());
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return Promise.resolve(clockOffset());
    syncing = (async () => {
        try {
            const t0 = Date.now();
            const res = await fetch(`manifest.json?clock=${t0}`, { method: 'HEAD', cache: 'no-store', credentials: 'same-origin' });
            const t1 = Date.now();
            const hdr = res.headers.get('date');
            const server = hdr ? Date.parse(hdr) : NaN;
            if (!Number.isFinite(server) || t1 - t0 > 5000) return clockOffset();
            // هيدر Date بالثانية: نص ثانية في المتوسط + نص زمن الرحلة
            const offset = Math.round(server + 500 - (t0 + t1) / 2);
            // فرق أقل من ثانيتين = الساعة مظبوطة (مانغيرش حاجة عشان دقة الهيدر)
            state = { offset: Math.abs(offset) < 2000 ? 0 : offset, at: t1, rtt: t1 - t0 };
            try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* تجاهل */ }
            try { window.dispatchEvent(new CustomEvent('tm:clock', { detail: { offset: state.offset } })); } catch (e) { /* تجاهل */ }
            return state.offset;
        } catch (e) { return clockOffset(); } finally { syncing = null; }
    })();
    return syncing;
}

/** تنبيه صغير مرة في اليوم لو ساعة الجهاز فرقها كبير (البرنامج نفسه بيمشي على الوقت الصح في كل الأحوال) */
function maybeWarn() {
    const off = clockOffset();
    if (Math.abs(off) < 3 * 60 * 1000) return;
    try {
        const k = 'tm_clock_warned';
        if (localStorage.getItem(k) === todayISO()) return;
        localStorage.setItem(k, todayISO());
    } catch (e) { /* تجاهل */ }
    const mins = Math.round(Math.abs(off) / 60000);
    const hrs = Math.round(mins / 60);
    const label = mins >= 90 ? (hrs === 2 ? 'ساعتين' : hrs <= 10 ? `${hrs} ساعات` : `${hrs} ساعة`) : mins >= 50 ? 'ساعة' : `${mins} دقيقة`;
    const box = document.createElement('div');
    box.setAttribute('role', 'status');
    box.style.cssText = 'position:fixed;z-index:3250;bottom:calc(' + (window.matchMedia('(max-width: 768px)').matches ? '124px' : '64px') + ' + env(safe-area-inset-bottom,0px));inset-inline:0;margin:0 auto;width:min(460px,calc(100vw - 20px));background:#FCF1DA;color:#7A5413;border:1px solid #EBD5A6;border-radius:12px;padding:.7rem .9rem;font-size:.86rem;line-height:1.6;box-shadow:0 8px 24px rgba(0,0,0,.12)';
    box.innerHTML = `🕒 ساعة جهازك ${off > 0 ? 'متأخرة' : 'متقدمة'} حوالي <b>${label}</b>. البرنامج بيمشي على الوقت الصح لوحده (التذكيرات وتاريخ الحصص)، بس يفضّل تفعّل "الوقت التلقائي" من إعدادات الموبايل. <button type="button" style="border:0;background:#7A5413;color:#fff;border-radius:8px;padding:.25rem .7rem;font:inherit;font-weight:700;margin-inline-start:.4rem;cursor:pointer">تمام</button>`;
    box.querySelector('button').addEventListener('click', () => box.remove());
    document.body.appendChild(box);
    setTimeout(() => { if (box.isConnected) box.remove(); }, 20000);
}

export function initServerTime() {
    if (window.__tmClock) return;
    window.__tmClock = { nowMs, appParts, offset: clockOffset };
    syncClock().then(maybeWarn).catch(() => { /* تجاهل */ });
    window.addEventListener('online', () => { syncClock(true).then(maybeWarn).catch(() => { /* تجاهل */ }); });
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') syncClock().catch(() => { /* تجاهل */ }); });
}
