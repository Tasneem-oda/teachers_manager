/**
 * push-health.js — v32: التأكد إن الإشعارات "واصلة فعلًا" للجهاز، مش بس إن الإذن متاح
 *
 * اللي حصل قبل كده: الإذن كان "مسموح" فالبرنامج كان بيقول "✓ التنبيهات مفعّلة"، بس OneSignal كان شايف
 * الجهاز "Not Subscribed" (الاشتراك اتمسح: مسح بيانات المتصفح، إعادة تثبيت البرنامج، تحديث كروم، Service
 * Worker قديم، مانع إعلانات...). فالإشعار كان بيتسجل في الجرس بس ومش بيوصل للموبايل.
 *
 * دلوقتي مع كل فتحة للبرنامج:
 *  1) بنعرف الحالة الحقيقية للجهاز (subscribed / not-subscribed / blocked / sw-broken / denied / ...).
 *  2) بنصلّح لوحدنا اللي ينفع يتصلّح من غير المدرس (الاشتراك الواقع، Service Worker ناقص).
 *  3) لو ماتصلحش: شريط واضح "الإشعارات واقفة على الجهاز ده" + زرار يصلّحها + خطوات حسب الموبايل.
 *  4) بنبلّغ السيرفر بالحالة (مرة كل يوم أو لما تتغير) ← تقدري تشوفي مين الإشعارات مش واصلاله
 *     من teachers_manager.push_problems قبل ما يشتكي.
 */
import { api } from './api.js?v=41';

const REPORT_KEY = 'tm_push_report_v1';
const BANNER_KEY = 'tm_push_fix_off';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const lsGet = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* تجاهل */ } };

// ------------------------------------------------------------------ الجهاز والمتصفح
export function devicePlatform() {
    const ua = navigator.userAgent || '';
    const os = /iPhone|iPad|iPod/i.test(ua) ? 'ios' : /Android/i.test(ua) ? 'android' : /Windows/i.test(ua) ? 'windows' : /Mac/i.test(ua) ? 'mac' : 'other';
    const br = /SamsungBrowser/i.test(ua) ? 'samsung-internet' : /EdgA?\//i.test(ua) ? 'edge' : /OPR\/|Opera/i.test(ua) ? 'opera'
        : /Firefox|FxiOS/i.test(ua) ? 'firefox' : /CriOS|Chrome/i.test(ua) ? 'chrome' : /Safari/i.test(ua) ? 'safari' : 'other';
    const brand = /SM-|SAMSUNG|Galaxy/i.test(ua) ? 'samsung' : /Xiaomi|Redmi|POCO|\bMI\s/i.test(ua) ? 'xiaomi'
        : /HUAWEI|HONOR/i.test(ua) ? 'huawei' : /OPPO|CPH\d|RMX\d|realme|vivo|Infinix|TECNO/i.test(ua) ? 'oppo-like' : '';
    let standalone = false;
    try { standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true; } catch (e) { standalone = false; }
    return { os, br, brand, standalone, label: [os, br, brand, standalone ? 'app' : 'browser'].filter(Boolean).join('/') };
}

function oneSignal() {
    const O = window.OneSignal;
    return O && O.User && O.User.PushSubscription ? O : null;
}

/** الـ Service Worker فيه كود OneSignal؟ (null = مش عارفين) */
function swStatus() {
    if (!('serviceWorker' in navigator) || !navigator.serviceWorker.controller) return Promise.resolve({ onesignal: null });
    return new Promise((resolve) => {
        let done = false;
        const fin = (v) => { if (!done) { done = true; resolve(v); } };
        setTimeout(() => fin({ onesignal: null }), 1500);
        try {
            const ch = new MessageChannel();
            ch.port1.onmessage = (e) => fin(e.data || { onesignal: null });
            navigator.serviceWorker.controller.postMessage({ type: 'tm:sw-status' }, [ch.port2]);
        } catch (e) { fin({ onesignal: null }); }
    });
}

/**
 * الحالة الحقيقية للإشعارات على الجهاز ده
 * @param {{waitSdkMs?: number}} [o] نستنى مكتبة OneSignal قد إيه قبل ما نحكم إنها "محجوبة"
 * @returns {Promise<{state: string, p: object, subId?: string}>}
 */
export async function checkPushHealth({ waitSdkMs = 0 } = {}) {
    const p = devicePlatform();
    if (p.os === 'ios' && !p.standalone) return { state: 'ios-browser', p };
    if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) return { state: 'unsupported', p };
    const perm = Notification.permission;
    if (perm === 'denied') return { state: 'denied', p };
    if (perm === 'default') return { state: 'default', p };
    let O = oneSignal();
    const t0 = Date.now();
    while (!O && Date.now() - t0 < waitSdkMs) { await sleep(400); O = oneSignal(); }
    if (!O) return { state: 'blocked', p };
    const sw = await swStatus();
    if (sw.onesignal === false) return { state: 'sw-broken', p };
    const ps = O.User.PushSubscription;
    if (!ps.optedIn || !ps.id || !ps.token) return { state: 'not-subscribed', p };
    return { state: 'subscribed', p, subId: ps.id };
}

/** إصلاح من غير المدرس (لو ينفع). بيرجّع الحالة بعد المحاولة */
export async function autoRepair(h) {
    try {
        if (h.state === 'not-subscribed') {
            const O = oneSignal();
            if (O && typeof O.User.PushSubscription.optIn === 'function') {
                await O.User.PushSubscription.optIn();
                // الاشتراك بياخد ثواني لحد ما OneSignal يسجّله
                for (let i = 0; i < 8; i++) {
                    await sleep(750);
                    const again = await checkPushHealth();
                    if (again.state !== 'not-subscribed') return again;
                }
            }
        } else if (h.state === 'sw-broken') {
            const reg = await navigator.serviceWorker.getRegistration();
            if (reg) await reg.update();
            await sleep(3000);
            return await checkPushHealth();
        }
    } catch (e) { /* هنعرض الشريط */ }
    return await checkPushHealth();
}

/** نبلّغ السيرفر (لما الحالة تتغير أو مرة كل 20 ساعة) — مابيأخرش أي حاجة ولو فشل مفيش مشكلة */
export async function reportPushStatus(h) {
    if (!h || !h.state) return;
    let last = null;
    try { last = JSON.parse(lsGet(REPORT_KEY) || 'null'); } catch (e) { last = null; }
    const now = Date.now();
    if (last && last.s === h.state && now - last.at < 20 * 3600 * 1000) return;
    try {
        await api.reportPushStatus({ status: h.state, platform: h.p ? h.p.label : '', sub_id: h.subId || '' });
        lsSet(REPORT_KEY, JSON.stringify({ s: h.state, at: now }));
    } catch (e) { /* المرة الجاية */ }
}

// ------------------------------------------------------------------ الكلام اللي بيظهر للمدرس
export function healthText(h) {
    const p = (h && h.p) || devicePlatform();
    const samsungBrowser = p.br === 'samsung-internet';
    switch (h && h.state) {
        case 'subscribed': return { ok: true, title: '✓ الإشعارات شغالة على الجهاز ده', desc: '' };
        case 'default': return { title: 'الإشعارات لسه مش مفعّلة على الجهاز ده', desc: 'فعّلها عشان يوصلك تذكير الحصص.', action: 'enable', label: 'فعّل الإشعارات' };
        case 'not-subscribed': return { title: 'الإشعارات واقفة على الجهاز ده', desc: 'الإذن متاح بس الجهاز مش متسجل لاستقبال التذكيرات، فهي بتظهر جوه البرنامج بس.', action: 'enable', label: 'صلّحها دلوقتي' };
        case 'blocked': return { title: 'حاجة بتمنع خدمة الإشعارات', desc: samsungBrowser ? 'متصفح سامسونج أو مانع الإعلانات بيمنعها. افتح البرنامج من كروم.' : 'مانع إعلانات أو "DNS خاص" بيمنع خدمة الإشعارات.', action: 'guide', label: 'إزاي أصلّحها' };
        case 'sw-broken': return { title: 'الإشعارات محتاجة تحديث للبرنامج', desc: 'جزء الإشعارات ماتحمّلش كامل. حدّث الصفحة والنت شغال.', action: 'reload', label: 'حدّث دلوقتي' };
        case 'denied': return { title: 'الإشعارات مقفولة من المتصفح', desc: 'لازم تسمح بيها من إعدادات الموقع (مرة واحدة).', action: 'guide', label: 'إزاي أفتحها' };
        case 'ios-browser': return { title: 'على الآيفون الإشعارات محتاجة البرنامج مثبّت', desc: 'من Safari: مشاركة ← إضافة إلى الشاشة الرئيسية، وافتحه من الأيقونة.', action: 'guide', label: 'إزاي' };
        default: return { title: 'المتصفح ده مابيدعمش الإشعارات', desc: 'افتح البرنامج من Chrome.', action: 'guide', label: 'إزاي' };
    }
}

/** خطوات الإصلاح حسب الموبايل والمتصفح */
export function guideSteps(h) {
    const p = (h && h.p) || devicePlatform();
    const steps = [];
    if (h.state === 'ios-browser') {
        steps.push('افتح الموقع من Safari.', 'اضغط زرار المشاركة (المربع والسهم) ← "إضافة إلى الشاشة الرئيسية".', 'افتح البرنامج من الأيقونة الجديدة، وادخل الإعدادات ← فعّل الإشعارات.');
        return steps;
    }
    if (p.br === 'samsung-internet') steps.push('<b>الأفضل:</b> افتح teachers-manager.online من <b>Chrome</b> وثبّته من هناك (متصفح سامسونج إشعاراته أضعف ومانع الإعلانات فيه بيقفلها).');
    if (h.state === 'denied') {
        steps.push('اضغط علامة القفل 🔒 جنب رابط الموقع (أو ⋮ ← معلومات الموقع).', 'الإشعارات ← <b>سماح</b>.', 'ارجع للبرنامج وحدّث الصفحة.');
    }
    if (h.state === 'blocked') {
        steps.push('لو عندك مانع إعلانات (AdBlock / AdGuard / مانع إعلانات سامسونج): ضيف teachers-manager.online في الاستثناءات.');
        if (p.os === 'android') steps.push('الإعدادات ← الاتصالات ← إعدادات اتصال أخرى ← <b>DNS خاص</b> ← اختار "تلقائي" (بعض الـ DNS زي AdGuard بيمنع الإشعارات).');
        steps.push('بعدها افتح البرنامج تاني واضغط "فعّل الإشعارات".');
    }
    if (p.os === 'android' && (p.brand === 'samsung' || p.brand === 'xiaomi' || p.brand === 'oppo-like' || p.brand === 'huawei')) {
        steps.push(p.brand === 'samsung'
            ? 'سامسونج: الإعدادات ← العناية بالجهاز ← البطارية ← حدود استخدام الخلفية ← اقفل "وضع التطبيقات غير المستخدمة في السكون"، وضيف Chrome في "التطبيقات التي لا تنام أبدًا".'
            : 'الإعدادات ← التطبيقات ← Chrome ← البطارية ← "بدون قيود" (عشان الموبايل مايقفلش الإشعارات في الخلفية).');
    }
    if (p.os === 'android') steps.push('الإعدادات ← التطبيقات ← Chrome ← الإشعارات: اتأكد إنها مفتوحة وإن teachers-manager.online مش "صامت".');
    if (!steps.length) steps.push('حدّث الصفحة، وادخل الإعدادات ← فعّل الإشعارات.');
    return steps;
}

// ------------------------------------------------------------------ واجهة
function ensureCss() {
    if (document.getElementById('tm-ph-css')) return;
    const st = document.createElement('style');
    st.id = 'tm-ph-css';
    st.textContent = `
    #tm-push-fix{position:fixed;inset-inline:0;bottom:0;z-index:898;display:flex;align-items:center;gap:.7rem;background:#FFF7E6;border-top:1.5px solid #F0C36D;
      padding:.75rem 1rem calc(.75rem + env(safe-area-inset-bottom,0px));font-family:'IBM Plex Sans Arabic',Tahoma,Arial,sans-serif;direction:rtl;box-shadow:0 -4px 16px rgba(0,0,0,.08)}
    @media (max-width:900px){body:has(.sidebar) #tm-push-fix{bottom:calc(62px + env(safe-area-inset-bottom,0px));padding-bottom:.75rem}}
    body:has(#tm-install-banner) #tm-push-fix, body:has(#tm-notif-banner) #tm-push-fix{display:none}
    #tm-push-fix .ph-ic{font-size:1.4rem;flex-shrink:0}
    #tm-push-fix .ph-tx{flex:1;min-width:0}
    #tm-push-fix .ph-t{font-weight:700;font-size:.9rem;color:#5C3D00;margin:0}
    #tm-push-fix .ph-d{font-size:.78rem;color:#7A5A1E;margin:.1rem 0 0;line-height:1.5}
    #tm-push-fix .ph-go{background:#4B3A5A;color:#fff;border:0;border-radius:9px;padding:.5rem .85rem;font:inherit;font-size:.82rem;font-weight:700;cursor:pointer;white-space:nowrap;min-height:40px}
    #tm-push-fix .ph-x{background:none;border:0;color:#7A5A1E;font-size:1.1rem;cursor:pointer;min-width:36px;min-height:36px}
    .tm-ph-modal .modal-content{max-width:520px;position:relative}
    .tm-ph-modal ol{padding-inline-start:1.3rem;line-height:1.9;font-size:.92rem;margin:.6rem 0 1rem}
    .tm-ph-modal .ph-close{position:absolute;inset-inline-end:.8rem;top:.8rem;border:0;background:none;font-size:1.3rem;cursor:pointer;color:#716A74}`;
    document.head.appendChild(st);
}

export function openGuide(h) {
    ensureCss();
    const t = healthText(h);
    const m = document.createElement('div');
    m.className = 'modal active tm-ph-modal';
    m.innerHTML = `<div class="modal-content" role="dialog" aria-modal="true" aria-label="تشغيل الإشعارات">
        <button type="button" class="ph-close" aria-label="إغلاق">✕</button>
        <h2 style="margin:0 0 .3rem;font-size:1.15rem">🔔 ${t.title}</h2>
        <p style="margin:0;color:var(--text-secondary);font-size:.88rem;line-height:1.7">${t.desc}</p>
        <ol>${guideSteps(h).map((s) => `<li>${s}</li>`).join('')}</ol>
        <button type="button" class="btn" data-recheck style="width:100%;min-height:46px">خلصت — اتأكد تاني</button></div>`;
    document.body.appendChild(m);
    const close = () => m.remove();
    m.querySelector('.ph-close').addEventListener('click', close);
    m.addEventListener('mousedown', (e) => { if (e.target === m) close(); });
    m.querySelector('[data-recheck]').addEventListener('click', () => { close(); location.reload(); });
}

/**
 * زرار "صلّح" (لازم يتنادى من ضغطة المدرس عشان طلب الإذن يشتغل على كل الموبايلات)
 * @param {Function} requestPermission من js/notifications.js
 */
export async function fixNow(h, requestPermission) {
    const t = healthText(h);
    if (t.action === 'reload') { location.reload(); return h; }
    if (t.action === 'guide') { openGuide(h); return h; }
    try { if (requestPermission) await requestPermission(); } catch (e) { /* تجاهل */ }
    let after = await checkPushHealth({ waitSdkMs: 6000 });
    if (after.state === 'not-subscribed') after = await autoRepair(after);
    reportPushStatus(after);
    if (after.state !== 'subscribed' && after.state !== 'default') openGuide(after);
    return after;
}

function showFixBanner(h, requestPermission) {
    if (document.getElementById('tm-push-fix')) return;
    const page = (location.pathname.split('/').pop() || '').replace(/\.html$/, '');
    if (/^(lesson|group-lesson|login|signup|reset-password|index|subscription)$/.test(page)) return;
    // المقفول من المتصفح والآيفون من غير تثبيت: مرة كل 3 أيام بس لو قفله (مانضايقش)، والباقي مرة في اليوم
    const off = Number(lsGet(BANNER_KEY) || 0);
    const wait = ['denied', 'ios-browser', 'unsupported'].includes(h.state) ? 3 * 86400000 : 86400000;
    if (off && Date.now() - off < wait) return;
    ensureCss();
    const t = healthText(h);
    const b = document.createElement('div');
    b.id = 'tm-push-fix';
    b.setAttribute('role', 'status');
    b.innerHTML = `<span class="ph-ic">🔕</span><div class="ph-tx"><p class="ph-t">${t.title}</p><p class="ph-d">${t.desc}</p></div>
        <button type="button" class="ph-go">${t.label}</button><button type="button" class="ph-x" aria-label="بعدين">✕</button>`;
    document.body.appendChild(b);
    b.querySelector('.ph-x').addEventListener('click', () => { lsSet(BANNER_KEY, String(Date.now())); b.remove(); });
    b.querySelector('.ph-go').addEventListener('click', async (e) => {
        const btn = e.currentTarget;
        btn.disabled = true;
        btn.textContent = 'لحظة...';
        const after = await fixNow(h, requestPermission);
        if (after.state === 'subscribed') {
            b.innerHTML = '<span class="ph-ic">✅</span><div class="ph-tx"><p class="ph-t">تمام! الإشعارات رجعت تشتغل على الجهاز ده</p></div>';
            setTimeout(() => b.remove(), 3500);
        } else { btn.disabled = false; btn.textContent = healthText(after).label || 'إزاي أصلّحها'; }
    });
}

/**
 * الفحص الكامل (بيتنادى من js/notifications.js بعد ما OneSignal يشتغل):
 * فحص ← إصلاح تلقائي ← تبليغ السيرفر ← شريط لو لسه فيه مشكلة
 */
export async function runPushHealth({ requestPermission } = {}) {
    let h = await checkPushHealth({ waitSdkMs: 12000 });
    if (h.state === 'not-subscribed' || h.state === 'sw-broken') h = await autoRepair(h);
    reportPushStatus(h);
    window.__tmPushHealth = h;
    // "default" ليه بانر التفعيل العادي (js/notifications.js) — هنا بس الحالات اللي الإشعارات فيها واقفة
    if (!['subscribed', 'default'].includes(h.state)) showFixBanner(h, requestPermission);
    return h;
}
