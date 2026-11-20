/**
 * sidebar.js - السايدبار الموحّد لكل صفحات البرنامج (مطابق للثيم الجديد)
 */
import { Auth } from './auth.js?v=51';
import { icon } from './icons.js?v=51';
import { initPushNotifications, unlinkOnSignOut } from './notifications.js?v=51';
import { CONFIG } from './config.js?v=51';
import { openSuggestionModal } from './suggestions.js?v=51';
import { mountFloatingLesson } from './live-lesson.js?v=51';
import { initTracking } from './track.js?v=51';
import { askChoice } from './utils.js?v=51';
import { priceFor, subscribeMessage, waUrl, currentUserInfo, offerActive, annualAvailable } from './pricing.js?v=51';

const NAV_ITEMS = [
    { key: 'dashboard', href: 'dashboard.html', icon: 'home', label: 'الرئيسية' },
    { key: 'students', href: 'students.html', icon: 'users', label: 'الطلاب' },
    // v26: على الموبايل المجموعات من تاب جوه صفحة الطلاب (شريط التنقل مايستحملش 6 أزرار)
    { key: 'groups', href: 'groups.html', icon: 'group', label: 'المجموعات', desktopOnly: true },
    { key: 'schedule', href: 'schedule.html', icon: 'calendar', label: 'جدولي' },
    { key: 'books', href: 'books.html', icon: 'bookOpen', label: 'مكتبتي' },
    { key: 'games', href: 'games.html', icon: 'gamepad', label: 'ألعاب الحصة', desktopOnly: true },
    { key: 'settings', href: 'settings.html', icon: 'gear', label: 'الإعدادات' }
];

/**
 * تخزين مؤقّت لنتيجة /check-subscription لتقليل الضغط على n8n:
 * - يمنع استدعاء check-subscription مرتين في نفس الصفحة (كان يحدث في لوحة التحكم:
 *   مرة من enforceSubscriptionLock ومرة من renderTrialBanner).
 * - يُخزَّن في sessionStorage لمدة 3 دقائق فقط، فلا يُعاد الاستعلام مع كل تنقل بين الصفحات.
 * حالة الاشتراك لا تتغيّر لحظيًا في الاستخدام العادي، فهذا التخزين آمن ولا يؤثر على دقة القفل.
 */
const SUB_CACHE_KEY = 'tm_sub_cache_v1';
const SUB_CACHE_TTL_MS = 3 * 60 * 1000;
// v29.4: لحد 30 دقيقة بنعرض آخر حالة محفوظة على طول ونحدّثها في الخلفية (بدل ما الصفحة تستنى n8n)
const SUB_CACHE_STALE_MS = 30 * 60 * 1000;
let subFetchPromise = null;

function fetchSubscriptionNow() {
    if (subFetchPromise) return subFetchPromise;
    subFetchPromise = (async () => {
        const { api } = await import('./api.js?v=51');
        const data = await api.checkSubscription();
        try {
            sessionStorage.setItem(SUB_CACHE_KEY, JSON.stringify({ ts: Date.now(), data }));
        } catch (e) { /* تجاهل لو التخزين ممتلئ */ }
        return data;
    })();
    subFetchPromise.then(() => { subFetchPromise = null; }, () => { subFetchPromise = null; });
    return subFetchPromise;
}

// v29.6: الحالة القديمة بتتعرض على طول بس لو مش "مقفول" (عشان مدرس اشترك من شوية مايشوفش رسالة القفل)
const usableStale = (data) => { try { return !!data && !computeSubscriptionState(data).locked; } catch (e) { return false; } };

export async function getSubscriptionCached() {
    try {
        const raw = sessionStorage.getItem(SUB_CACHE_KEY);
        if (raw) {
            const cached = JSON.parse(raw);
            const age = cached ? Date.now() - cached.ts : Infinity;
            if (age < SUB_CACHE_TTL_MS) return cached.data;
            if (age < SUB_CACHE_STALE_MS && usableStale(cached.data)) { refreshSubscription(); return cached.data; }
        }
    } catch (e) { /* تجاهل تخزين تالف */ }
    // آخر حالة رجعت مع بيانات المدرس (bootstrap-session) من فتحة فاتت
    try {
        const prof = JSON.parse(localStorage.getItem('user_profile') || 'null');
        if (prof && prof.subscription && usableStale(prof.subscription)) { refreshSubscription(); return prof.subscription; }
    } catch (e) { /* تجاهل */ }
    // مفيش حالة محفوظة: bootstrap-session (اللي الصفحة محتاجاه كده كده) بيرجّع الاشتراك، فنستنى رده بدل طلب تاني
    try {
        const session = await Auth.getSession();
        if (session) {
            const prof = await (Auth._bootPromise || Auth.bootstrapSession());
            if (prof && prof.subscription) return prof.subscription;
        }
    } catch (e) { /* نكمّل بالطريقة العادية */ }
    return fetchSubscriptionNow();
}

/** تحديث في الخلفية: من bootstrap-session (اللي بيرجّع الاشتراك) ولو مارجّعوش من check-subscription */
let subRefreshAt = 0;
function refreshSubscription() {
    if (Date.now() - subRefreshAt < 60 * 1000) return;
    subRefreshAt = Date.now();
    Promise.resolve(Auth.bootstrapSession()).then((prof) => {
        if (!(prof && prof.subscription)) fetchSubscriptionNow().catch(() => { /* تجاهل */ });
    }).catch(() => { /* تجاهل */ });
}

// ------------------------------------------------------------------ v29.5: الشريط والهيدر يظهروا فورًا
// آخر شكل للشريط (ولهيدر كل صفحة) بيتحفظ على الجهاز، وسطر صغير جوه كل صفحة بيرسمه قبل ما ملفات البرنامج تتحمّل
const SHELL_KEY = 'tm_shell_v1';
const pageKey = () => (location.pathname.split('/').pop() || 'dashboard').replace(/\.html$/, '') || 'dashboard';
function readShell() { try { return JSON.parse(localStorage.getItem(SHELL_KEY) || 'null') || {}; } catch (e) { return {}; } }
function writeShell(c) { try { localStorage.setItem(SHELL_KEY, JSON.stringify(c)); } catch (e) { /* التخزين مليان: تجاهل */ } }
function saveShellNav(root, activeKey) {
    try {
        const clone = root.cloneNode(true);
        clone.querySelectorAll('.active, .active-mobile').forEach((el) => el.classList.remove('active', 'active-mobile'));
        clone.querySelectorAll('[hidden]').forEach((el) => { if (el.id !== 'sidebar-install') el.removeAttribute('hidden'); });
        const c = readShell();
        c.nav = clone.innerHTML;
        c.active = c.active || {};
        if (activeKey) c.active[pageKey()] = activeKey;
        writeShell(c);
    } catch (e) { /* تجاهل */ }
}
export function saveShellHeader() {
    try {
        const root = document.getElementById('top-header-root');
        if (!root || !root.firstElementChild) return;
        const c = readShell();
        c.header = c.header || {};
        c.header[pageKey()] = root.innerHTML;
        writeShell(c);
    } catch (e) { /* تجاهل */ }
}
export function clearShell() { try { localStorage.removeItem(SHELL_KEY); } catch (e) { /* تجاهل */ } }

// ------------------------------------------------------------------ v34: تنقل أسرع
// - الصفحة لسه "بتتجهز في الخلفية" (prerender): مانشغّلش التتبع والإشعارات إلا لما المدرس يفتحها فعلًا
export function whenActive(fn) {
    if (document.prerendering) document.addEventListener('prerenderingchange', () => fn(), { once: true });
    else fn();
}
const samePage = (a) => { try { const u = new URL(a.href, location.href); return u.origin === location.origin && u.pathname.replace(/\.html$/, '') === location.pathname.replace(/\.html$/, '') && !u.search; } catch (e) { return false; } };
let navGuard = false;
function installNavGuard() {
    if (navGuard) return; navGuard = true;
    // الضغط على الصفحة اللي انت فيها: مفيش إعادة تحميل (بنطلع لأول الصفحة بس)
    document.addEventListener('click', (e) => {
        const a = e.target.closest && e.target.closest('.sidebar-nav a[href], .sidebar-logo');
        if (!a || e.ctrlKey || e.metaKey || e.shiftKey || e.button > 0) return;
        if (a.matches('a[href]') && samePage(a) && !location.search) {
            e.preventDefault();
            try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch (er) { window.scrollTo(0, 0); }
        }
    }, true);
    // الصفحات الرئيسية بتتجهز في الخلفية أول ما المدرس يقرّب منها (لمس/ماوس) فالفتح يبقى فوري
    try {
        if (HTMLScriptElement.supports && HTMLScriptElement.supports('speculationrules') && !document.querySelector('script[data-tm-spec]')) {
            const conn = navigator.connection || {};
            if (!conn.saveData && !/2g/.test(conn.effectiveType || '')) {
                const urls = NAV_ITEMS.map((i) => i.href).filter((h) => !location.pathname.endsWith(h));
                const sc = document.createElement('script');
                sc.type = 'speculationrules';
                sc.dataset.tmSpec = '1';
                sc.textContent = JSON.stringify({
                    prerender: [{ source: 'list', urls, eagerness: 'moderate' }],
                    prefetch: [{ source: 'list', urls, eagerness: 'conservative' }]
                });
                document.head.appendChild(sc);
            }
        }
    } catch (e) { /* متصفح قديم */ }
}
const cleanNav = (html) => { const t = document.createElement('div'); t.innerHTML = html; t.querySelectorAll('.active, .active-mobile').forEach((el) => el.classList.remove('active', 'active-mobile')); return t.innerHTML.replace(/\s+/g, ' ').trim(); };

export function renderSidebar(activeKey) {
    whenActive(() => { try { initTracking(); } catch (e) { /* التتبع إضافي: لو فشل الصفحة تكمّل عادي */ } });
    // v35: فيديوهات الشرح للصفحة دي (زرار صغير "▶ شرح" لو فيه فيديو مكانه هنا)
    whenActive(() => { if (CONFIG.TUTORIALS && CONFIG.TUTORIALS.ENABLED === false) return; setTimeout(() => import('./tutorials.js?v=51').then((m) => m.initTutorials(pageKey())).catch(() => { /* إضافي */ }), 1800); });
    installNavGuard();
    const root = document.getElementById('sidebar-root');
    if (!root) return;

    const navHtml = NAV_ITEMS.map(item => `
        <a href="${item.href}" data-key="${item.key}" class="${[item.key === activeKey ? 'active' : '', item.desktopOnly ? 'nav-desktop-only' : '', (item.key === 'students' && activeKey === 'groups') || (item.key === 'books' && activeKey === 'games') ? 'active-mobile' : ''].filter(Boolean).join(' ')}">
            <span class="icon">${icon(item.icon, { size: 19 })}</span>
            <span class="label">${item.label}</span>
        </a>
    `).join('');

    const html = `
        <aside class="sidebar">
            <div class="sidebar-logo">
                <div class="logo-icon">${icon('graduationCap', { size: 22 })}</div>
                <div>
                    <h1>Teachers Manager</h1>
                    <p>منصّة إدارة التدريس</p>
                </div>
            </div>
            <nav class="sidebar-nav">${navHtml}</nav>
            <div class="sidebar-footer">
                <a href="#" id="sidebar-install" class="tm-install-entry" hidden>
                    <span class="icon">${icon('download', { size: 19 })}</span>
                    <span class="label">ثبّت التطبيق</span>
                </a>
                <a href="#" id="sidebar-contact" class="sidebar-contact">
                    <span class="icon">${icon('headset', { size: 19 })}</span>
                    <span class="label">تواصل مع المطوّر</span>
                </a>
                <a href="learn.html" id="sidebar-learn" data-key="learn" class="${activeKey === 'learn' ? 'active' : ''}">
                    <span class="icon">${icon('play', { size: 19 })}</span>
                    <span class="label">الشروحات</span>
                </a>
                <a href="#" id="sidebar-suggest">
                    <span class="icon">${icon('lightbulb', { size: 19 })}</span>
                    <span class="label">عندك اقتراح؟</span>
                </a>
                <a href="#" id="sidebar-logout">
                    <span class="icon">${icon('logout', { size: 19 })}</span>
                    <span class="label">تسجيل الخروج</span>
                </a>
            </div>
        </aside>
    `;
    // v34: الشريط اترسم من النسخة المحفوظة ونفس الشكل؟ نسيبه زي ما هو (مفيش وميض ولا إعادة رسم) ونغيّر الصفحة المختارة بس
    const shellOk = root.dataset.shell === '1' && root.querySelector('.sidebar') && cleanNav(root.innerHTML) === cleanNav(html);
    if (shellOk) {
        root.querySelectorAll('.sidebar-nav a[data-key]').forEach((a) => {
            const k = a.dataset.key;
            a.classList.toggle('active', k === activeKey);
            a.classList.toggle('active-mobile', (k === 'students' && activeKey === 'groups') || (k === 'books' && activeKey === 'games'));
        });
        const inst = document.getElementById('sidebar-install'); if (inst) inst.hidden = true;
    } else {
        root.innerHTML = html;
    }
    root.removeAttribute('data-shell');

    saveShellNav(root, activeKey);

    document.getElementById('sidebar-install').addEventListener('click', (e) => {
        e.preventDefault();
        openInstall();
    });
    syncInstallEntries();

    document.getElementById('sidebar-suggest').addEventListener('click', (e) => {
        e.preventDefault();
        openSuggestionModal();
    });
    document.getElementById('sidebar-contact').addEventListener('click', (e) => {
        e.preventDefault();
        import('./hub.js?v=51').then((m) => m.openContact()).catch(() => { window.open(`https://wa.me/${CONFIG.SUPPORT_WHATSAPP}`, '_blank', 'noopener'); });
    });
    // v33: إشعاراتك من المونيتور + الرسايل التلقائية (بعد ما الصفحة تخلص تحميل، من غير ما تأخرها)
    whenActive(() => { try {
        const startHub = () => import('./hub.js?v=51').then((m) => m.initHub()).catch(() => { /* تجاهل */ });
        if ('requestIdleCallback' in window) requestIdleCallback(() => setTimeout(startHub, 600), { timeout: 3000 });
        else setTimeout(startHub, 1500);
    } catch (e) { /* تجاهل */ } });

    document.getElementById('sidebar-logout').addEventListener('click', async (e) => {
        e.preventDefault();
        // v25: تأكيد قبل الخروج (ضغطة غلط = دخول بالإيميل وكلمة السر من الأول)
        const ok = await askChoice({ title: 'تسجيل الخروج', message: 'تخرج من البرنامج على الجهاز ده؟ بياناتك محفوظة.', choices: [{ label: 'اخرج', value: 'yes' }] });
        if (!ok) return;
        await unlinkOnSignOut(); // فك ربط الجهاز عن هوية المعلم قبل الخروج (إشعارات Push)
        await Auth.signOut();
        window.location.href = 'login.html';
    });

    // بوابة الاشتراك: قفل الصفحة إذا انتهت التجربة/الاشتراك فعليًا (لا تُطبَّق على صفحة الاشتراك نفسها)
    enforceSubscriptionLock();

    // الحصة الجارية في نافذة عائمة: المدرس يتنقّل في البرنامج والحصة شغالة ويرجع لها بضغطة
    try {
        const onLessonPage = /\/lesson(\.html)?\/?$/.test(location.pathname);
        // v27: صفحة حصة المجموعة مابتعرضش النافذة العائمة لنفس المجموعة
        const onGroupLesson = /\/group-lesson(\.html)?\/?$/.test(location.pathname);
        const qs = new URLSearchParams(location.search);
        mountFloatingLesson({ exceptStudentId: onLessonPage ? qs.get('student_id') : (onGroupLesson ? `group:${qs.get('group_id')}` : null) });
    } catch (e) { /* النافذة إضافية: لو فشلت الصفحة تكمّل عادي */ }
}

/**
 * صيغة عدد الأيام بالعربية الفصحى الصحيحة نحويًا
 */
export function daysLabel(n) {
    if (n <= 0) return '0 يوم';
    if (n === 1) return 'يوم واحد';
    if (n === 2) return 'يومان';
    if (n <= 10) return `${n} أيام`;
    return `${n} يومًا`;
}

/**
 * تحويل صف الاشتراك الخام (من /check-subscription) إلى حالة واضحة قابلة للاستخدام:
 * - يحسب الأيام المتبقية فعليًا من التاريخ (وليس فقط نص status)
 * - أي حالة نصية غير trial/active/none (مثل expired أو أي قيمة تُضبط يدويًا) تُعتبر مقفلة تلقائيًا
 */
export function computeSubscriptionState(sub) {
    const now = new Date();
    if (!sub || sub.status === 'none') {
        return { kind: 'none', locked: false, daysLeft: null };
    }
    if (sub.status === 'trial') {
        if (sub.trial_ends_at) {
            const daysLeft = Math.ceil((new Date(sub.trial_ends_at) - now) / 86400000);
            if (daysLeft > 0) return { kind: 'trial', locked: false, daysLeft };
            return { kind: 'trial', locked: true, daysLeft: 0, reason: 'trial_expired' };
        }
        return { kind: 'trial', locked: false, daysLeft: null };
    }
    if (sub.status === 'active') {
        if (sub.paid_until) {
            const daysLeft = Math.ceil((new Date(sub.paid_until) - now) / 86400000);
            if (daysLeft > 0) return { kind: 'active', locked: false, daysLeft };
            return { kind: 'active', locked: true, daysLeft: 0, reason: 'payment_expired' };
        }
        return { kind: 'active', locked: false, daysLeft: null };
    }
    // أي حالة أخرى (expired, cancelled, ...) تُقفَل افتراضيًا
    return { kind: sub.status, locked: true, daysLeft: 0, reason: 'inactive' };
}

const WHATSAPP_NUMBER = CONFIG.SUPPORT_WHATSAPP;

/** تاريخ نهاية الفترة المجانية للعرض (مثلًا: 31 ديسمبر 2026) */
export function trialEndLabel(sub) {
    try {
        if (sub && sub.trial_ends_at) {
            return new Date(sub.trial_ends_at).toLocaleDateString('ar-EG-u-nu-latn', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Africa/Cairo' });
        }
    } catch (e) { /* تجاهل */ }
    return CONFIG.PRICING.FREE_UNTIL_LABEL;
}

async function enforceSubscriptionLock() {
    // لا نقفل صفحة الاشتراك نفسها حتى يستطيع المستخدم الاشتراك دائمًا
    if (/\/subscription(\.html)?\/?$/.test(window.location.pathname)) return;

    try {
        const sub = await getSubscriptionCached();
        const state = computeSubscriptionState(sub);
        if (!state.locked) { window.__tmReadOnly = false; return; }

        // وضع "قراءة فقط": المدرس يشوف كل طلابه وحصصه، والحفظ الجديد بيحتاج اشتراك
        // (js/api.js بيمنع طلبات الحفظ ويفتح نافذة الاشتراك). بقى أقل تهديدًا من قفل الشاشة كلها.
        window.__tmReadOnly = true;
        window.__tmReadOnlyReason = state.reason;
        showReadOnlyBar(state);
        // نافذة الاشتراك مرة واحدة في الجلسة
        let shown = false;
        try { shown = sessionStorage.getItem('tm_ro_prompt') === '1'; sessionStorage.setItem('tm_ro_prompt', '1'); } catch (e) { /* تجاهل */ }
        if (!shown) openSubscribePrompt(state.reason);
    } catch (e) {
        // فشل التحقق ليس سببًا لقفل التطبيق على المستخدم — تجاهل بصمت
    }
}

function showReadOnlyBar(state) {
    if (document.getElementById('tm-readonly-bar')) return;
    const bar = document.createElement('div');
    bar.id = 'tm-readonly-bar';
    bar.setAttribute('role', 'status');
    bar.innerHTML = `${icon('lock', { size: 15 })}
        <span>${state.reason === 'trial_expired' ? 'الفترة المجانية خلصت' : 'اشتراكك خلص'} — بياناتك كلها محفوظة وتقدر تشوفها، والتسجيل الجديد محتاج اشتراك.</span>
        <a href="subscription.html">الباقات</a>`;
    document.body.prepend(bar);
}

/** نافذة الاشتراك (بتتفتح كمان من js/api.js لما المدرس يحاول يحفظ وهو في وضع القراءة فقط) */
export function openSubscribePrompt(reason) {
    if (document.getElementById('sub-lock-overlay')) return;
    const heading = reason === 'trial_expired' ? 'الفترة المجانية خلصت' : 'اشتراكك خلص';
    // v29.3: نفس أسعار صفحة الاشتراك (بالعرض لو شغال) + إيميل الحساب في الرسالة
    const options = [];
    CONFIG.PRICING.PLANS.forEach((p) => options.push({ planId: p.id, period: 'monthly', name: p.name, desc: p.desc }));
    if (annualAvailable()) { const pro = CONFIG.PRICING.PLANS.find((p) => p.id === 'pro'); if (pro) options.push({ planId: 'pro', period: 'annual', name: pro.name, desc: 'بتدفع مرة واحدة للسنة' }); }
    const plans = options.map((o) => {
        const pr = priceFor(o.planId, o.period);
        return `<a href="${waUrl(subscribeMessage({ planId: o.planId, period: o.period }))}" data-sub-plan="${o.planId}" data-sub-period="${o.period}" target="_blank" rel="noopener" class="btn sub-lock-whatsapp">
            <span>${icon('messageCircle', { size: 16 })} ${o.name}${o.period === 'annual' ? ' سنوي' : ''} · ${pr.price} جنيه ${o.period === 'annual' ? 'للسنة' : 'في الشهر'}${pr.offer ? ' 🎁' : ''}</span><small>${pr.offer && pr.note ? pr.note : o.desc}</small></a>`;
    }).join('');
    const overlay = document.createElement('div');
    overlay.id = 'sub-lock-overlay';
    overlay.innerHTML = `
        <div class="sub-lock-card" role="dialog" aria-modal="true" aria-label="${heading}">
            <div class="sub-lock-icon">${icon('lock', { size: 26 })}</div>
            <h2>${heading}</h2>
            <p class="sub-lock-reassure">${icon('checkCircle', { size: 15 })} كل طلابك وحصصك محفوظة، ومفيش حاجة اتمسحت.</p>
            <p class="sub-lock-desc">اختار باقتك عشان تكمّل تسجيل الحصص ومتابعة الفلوس. بتدفع بإنستاباي أو فودافون كاش وحسابك بيتفعّل على طول.</p>
            <div class="sub-lock-plans">${plans}</div>
            <button type="button" class="sub-lock-link" id="sub-lock-view">أتفرج على بياناتي الأول</button>
        </div>`;
    document.body.appendChild(overlay);
    currentUserInfo().then((u) => {
        overlay.querySelectorAll('[data-sub-plan]').forEach((a) => { a.href = waUrl(subscribeMessage({ planId: a.dataset.subPlan, period: a.dataset.subPeriod, email: u.email, name: u.name })); });
    }).catch(() => { /* تجاهل */ });
    const close = () => { overlay.remove(); document.body.style.overflow = ''; };
    document.getElementById('sub-lock-view').addEventListener('click', close);
    overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) close(); });
}
window.tmOpenSubscribePrompt = openSubscribePrompt;

/**
 * بانر حالة الاشتراك/التجربة المجانية — مكان ثابت في بداية البرنامج (أعلى لوحة التحكم)
 * بدلاً من ظهوره داخل السايدبار (كان يختفي على الموبايل ويسبب مشاكل تصميم).
 * يُستدعى مرة واحدة من dashboard.html فقط.
 */
export async function renderTrialBanner(containerId = 'trial-banner-root', { progress = '' } = {}) {
    const root = document.getElementById(containerId);
    if (!root) return;
    try {
        const sub = await getSubscriptionCached();
        const state = computeSubscriptionState(sub);

        // وضع "قراءة فقط" (enforceSubscriptionLock) بيعرض شريطه الخاص فوق الصفحة
        if (state.locked) { root.innerHTML = ''; return; }

        if (state.kind === 'trial' && state.daysLeft !== null) {
            // v35.3: لحد آخر 7 أيام البانر سطر صغير (كان بياخد ربع الشاشة على الموبايل)
            root.innerHTML = `
                <div class="trial-banner ${state.daysLeft > 7 ? 'compact' : ''}">
                    <div class="trial-banner-icon">${icon('sparkles', { size: 20 })}</div>
                    <div class="trial-banner-text">
                        <strong>${progress ? escapeBannerText(progress) : 'البرنامج مجاني ليك دلوقتي'}</strong>
                        <span>${state.daysLeft > 14
                            ? `مجاني بالكامل لحد ${escapeBannerText(trialEndLabel(sub))} — كمّل وخلي كل متابعاتك في مكان واحد.`
                            : `فاضل ${daysLabel(state.daysLeft)} على نهاية الفترة المجانية. احجز سعرك دلوقتي.`}</span>
                    </div>
                    <a href="subscription.html" class="btn trial-banner-btn">${state.daysLeft > 14 ? 'الباقات' : 'احجز سعرك'}</a>
                </div>
            `;
        } else if (state.kind === 'active' && state.daysLeft !== null && state.daysLeft <= 5) {
            // تذكير بقرب انتهاء الاشتراك المدفوع (5 أيام أو أقل)
            root.innerHTML = `
                <div class="trial-banner">
                    <div class="trial-banner-icon">${icon('clock', { size: 20 })}</div>
                    <div class="trial-banner-text">
                        <strong>اشتراكك على وشك الانتهاء</strong>
                        <span>متبقٍ ${daysLabel(state.daysLeft)} على نهاية اشتراكك الحالي.</span>
                    </div>
                    <a href="subscription.html" class="btn trial-banner-btn">تجديد الاشتراك</a>
                </div>
            `;
        } else {
            root.innerHTML = '';
        }
    } catch (e) {
        root.innerHTML = '';
    }
}

// ------------------------------------------------------------------ v27: زرار "ثبّت التطبيق" (js/pwa-install.js)
function appInstalled() {
    try {
        return window.matchMedia('(display-mode: standalone)').matches || window.matchMedia('(display-mode: minimal-ui)').matches
            || window.navigator.standalone === true;
    } catch (e) { return false; }
}
function syncInstallEntries() {
    const installed = (window.tmInstall && window.tmInstall.isInstalled) ? window.tmInstall.isInstalled() : appInstalled();
    document.querySelectorAll('.tm-install-entry').forEach((el) => { el.hidden = installed; });
}
function openInstall() {
    if (window.tmInstall) window.tmInstall.open();
    else window.addEventListener('tm:install-state', () => window.tmInstall && window.tmInstall.open(), { once: true });
}
window.addEventListener('tm:install-state', syncInstallEntries);

function escapeBannerText(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/**
 * الهيدر العلوي الموحّد (ترحيب + بحث + إشعارات + صورة المستخدم)
 */
export function renderTopHeader({ title = '', subtitle = '', showSearch = true } = {}) {
    const root = document.getElementById('top-header-root');
    if (!root) return;

    root.innerHTML = `
        <header class="top-header">
            <div class="greeting">
                <h2>${title}</h2>
                <p>${subtitle}</p>
            </div>
            <div class="top-header-right">
                ${showSearch ? `
                <div class="search-box">
                    <span class="icon">${icon('search', { size: 16 })}</span>
                    <input type="text" id="global-search" placeholder="ابحث عن طالب...">
                </div>` : ''}
                <button type="button" class="bell-btn header-install tm-install-entry" id="header-install" title="ثبّت التطبيق" aria-label="ثبّت التطبيق" hidden>
                    ${icon('download', { size: 17 })}<span>ثبّت</span>
                </button>
                <button type="button" class="bell-btn header-contact" id="header-contact" title="تواصل مع المطوّر" aria-label="تواصل مع المطوّر">
                    ${icon('headset', { size: 18 })}<span>تواصل</span>
                </button>
                <button type="button" class="bell-btn" id="header-bell" title="الإشعارات" aria-label="الإشعارات">
                    ${icon('bell', { size: 18 })}
                </button>
                <button type="button" class="bell-btn mobile-only-flex" id="header-logout-mobile" title="تسجيل الخروج">
                    ${icon('logout', { size: 18 })}
                </button>
                <a class="bell-btn header-help" href="learn.html" title="الشروحات" aria-label="فيديوهات الشرح">${icon('play', { size: 16 })}</a>
                <a class="header-avatar" href="settings.html" title="حسابك والإعدادات" aria-label="حسابك والإعدادات">
                    <div class="avatar-fallback" id="header-avatar-fallback">؟</div>
                    <div>
                        <p class="name" id="header-user-name">...</p>
                        <p class="role">معلم</p>
                    </div>
                </a>
            </div>
        </header>
    `;

    document.getElementById('header-contact').addEventListener('click', () => {
        import('./hub.js?v=51').then((m) => m.openContact()).catch(() => { window.open(`https://wa.me/${CONFIG.SUPPORT_WHATSAPP}`, '_blank', 'noopener'); });
    });
    document.getElementById('header-install').addEventListener('click', () => openInstall());
    syncInstallEntries();

    document.getElementById('header-logout-mobile').addEventListener('click', async () => {
        const ok = await askChoice({ title: 'تسجيل الخروج', message: 'تخرج من البرنامج على الجهاز ده؟ بياناتك محفوظة.', choices: [{ label: 'اخرج', value: 'yes' }] });
        if (!ok) return;
        await unlinkOnSignOut();
        await Auth.signOut();
        window.location.href = 'login.html';
    });

    if (showSearch) {
        const searchInput = document.getElementById('global-search');
        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && searchInput.value.trim()) {
                window.location.href = `students.html?search=${encodeURIComponent(searchInput.value.trim())}`;
            }
        });
    }

    loadHeaderProfile();

    // v29.5: حالة النت + تذكير الحصص من على الجهاز (بيشتغل من غير نت)
    whenActive(startBackground);
}

// v34: المهام اللي في الخلفية بتبدأ واحدة ورا التانية بعد ما الصفحة تترسم (مش كلها في نفس اللحظة):
// على الموبايلات الضعيفة ده كان بيعلّق التطبيق أول ما يفتح
function idle(fn, t) { if ('requestIdleCallback' in window) requestIdleCallback(() => fn(), { timeout: t }); else setTimeout(fn, Math.min(t, 1500)); }
function startBackground() {
    import('./net-status.js?v=51').then((m) => m.initNetStatus()).catch(() => { /* تجاهل */ });
    idle(() => {
    // v29.7: الوقت الصح من السيرفر (لو ساعة الجهاز غلط التذكيرات وتاريخ الحصص بيمشوا على الوقت الحقيقي)
    import('./server-time.js?v=51').then((m) => m.initServerTime()).catch(() => { /* تجاهل */ });
    // v30: مزامنة لحظية بين أجهزة نفس المدرس (حصة اتسجلت على اللابتوب ← الموبايل يتحدّث فورًا)
    }, 1500);
    idle(() => import('./realtime-sync.js?v=51').then((m) => m.initRealtimeSync()).catch(() => { /* تجاهل */ }), 2500);
    const startReminders = () => import('./local-reminders.js?v=51').then((m) => m.initLocalReminders()).catch(() => { /* تجاهل */ });
    idle(startReminders, 3500);

    // تفعيل إشعارات Push (تذكير الحصص اليومي) - مرة واحدة بعد رسم الهيدر
    // عشان زرار الجرس (header-bell) يكون موجود في الصفحة قبل ما نربطه بالحدث
    initPushNotifications();
}

async function loadHeaderProfile() {
    try {
        const session = await Auth.getSession();
        if (!session) return;
        // من الذاكرة المؤقتة لو موجودة (بدل طلب n8n تاني في كل صفحة)
        const profile = Auth.cachedProfile(session.user && session.user.id) || await Auth.bootstrapSession();
        // v28: الحساب مجدول للحذف؟ نعرض "رجّع حسابي" قبل أي حاجة
        if (profile && profile.deletion_scheduled_for) {
            try { const m = await import('./account-delete.js?v=51'); m.showDeletionScheduledGate(profile); } catch (e) { /* تجاهل */ }
        }
        const nameEl = document.getElementById('header-user-name');
        const avatarEl = document.getElementById('header-avatar-fallback');
        if (profile && nameEl) {
            nameEl.textContent = profile.name || 'معلم';
            avatarEl.textContent = (profile.name || '؟').trim().charAt(0);
        }
        saveShellHeader();
    } catch (e) {
        // تجاهل بصمت - الهيدر يظل بقيمة افتراضية
    }
}
