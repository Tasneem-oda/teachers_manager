/**
 * sidebar.js - السايدبار الموحّد لكل صفحات البرنامج (مطابق للثيم الجديد)
 */
import { Auth } from './auth.js?v=17';
import { icon } from './icons.js?v=17';
import { initPushNotifications, unlinkOnSignOut } from './notifications.js?v=17';
import { CONFIG } from './config.js?v=17';
import { openSuggestionModal } from './suggestions.js?v=17';

const NAV_ITEMS = [
    { key: 'dashboard', href: 'dashboard.html', icon: 'home', label: 'الرئيسية' },
    { key: 'students', href: 'students.html', icon: 'users', label: 'الطلاب' },
    { key: 'schedule', href: 'schedule.html', icon: 'calendar', label: 'جدولي' },
    { key: 'books', href: 'books.html', icon: 'bookOpen', label: 'مكتبتي' },
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
let subFetchPromise = null;

export async function getSubscriptionCached() {
    try {
        const raw = sessionStorage.getItem(SUB_CACHE_KEY);
        if (raw) {
            const cached = JSON.parse(raw);
            if (cached && (Date.now() - cached.ts) < SUB_CACHE_TTL_MS) {
                return cached.data;
            }
        }
    } catch (e) { /* تجاهل تخزين تالف */ }

    // لو فيه طلب شبكة قيد التنفيذ بالفعل في نفس اللحظة (مثلاً استدعاءان في نفس تحميل الصفحة)
    // نشترك في نفس الطلب بدل ما نبعت طلب مكرر لـ n8n
    if (subFetchPromise) return subFetchPromise;

    subFetchPromise = (async () => {
        const { api } = await import('./api.js?v=17');
        const data = await api.checkSubscription();
        try {
            sessionStorage.setItem(SUB_CACHE_KEY, JSON.stringify({ ts: Date.now(), data }));
        } catch (e) { /* تجاهل لو التخزين ممتلئ */ }
        return data;
    })();

    try {
        return await subFetchPromise;
    } finally {
        subFetchPromise = null;
    }
}

export function renderSidebar(activeKey) {
    const root = document.getElementById('sidebar-root');
    if (!root) return;

    const navHtml = NAV_ITEMS.map(item => `
        <a href="${item.href}" class="${item.key === activeKey ? 'active' : ''}">
            <span class="icon">${icon(item.icon, { size: 19 })}</span>
            <span class="label">${item.label}</span>
        </a>
    `).join('');

    root.innerHTML = `
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

    document.getElementById('sidebar-suggest').addEventListener('click', (e) => {
        e.preventDefault();
        openSuggestionModal();
    });

    document.getElementById('sidebar-logout').addEventListener('click', async (e) => {
        e.preventDefault();
        unlinkOnSignOut(); // فك ربط الجهاز عن هوية المعلم قبل الخروج (إشعارات Push)
        await Auth.signOut();
        window.location.href = 'login.html';
    });

    // بوابة الاشتراك: قفل الصفحة إذا انتهت التجربة/الاشتراك فعليًا (لا تُطبَّق على صفحة الاشتراك نفسها)
    enforceSubscriptionLock();
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
            return new Date(sub.trial_ends_at).toLocaleDateString('ar-EG', { day: 'numeric', month: 'long', year: 'numeric' });
        }
    } catch (e) { /* تجاهل */ }
    return CONFIG.PRICING.FREE_UNTIL_LABEL;
}

async function enforceSubscriptionLock() {
    // لا نقفل صفحة الاشتراك نفسها حتى يستطيع المستخدم الاشتراك دائمًا
    if (window.location.pathname.endsWith('subscription.html')) return;

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
    const plans = CONFIG.PRICING.PLANS.map((p) => {
        const msg = `مرحباً، أرغب في الاشتراك في باقة "${p.name}" (${p.price} جنيه شهريًا) في تطبيق Teachers Manager.`;
        return `<a href="https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(msg)}" target="_blank" rel="noopener" class="btn sub-lock-whatsapp">
            <span>${icon('messageCircle', { size: 16 })} ${p.name} · ${p.price} جنيه في الشهر</span><small>${p.desc}</small></a>`;
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
            root.innerHTML = `
                <div class="trial-banner">
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
                <button type="button" class="bell-btn" id="header-suggest" title="عندك اقتراح؟" aria-label="عندك اقتراح؟">
                    ${icon('lightbulb', { size: 18 })}
                </button>
                <button type="button" class="bell-btn" id="header-bell" title="الإشعارات">
                    ${icon('bell', { size: 18 })}
                </button>
                <button type="button" class="bell-btn mobile-only-flex" id="header-logout-mobile" title="تسجيل الخروج">
                    ${icon('logout', { size: 18 })}
                </button>
                <div class="header-avatar">
                    <div class="avatar-fallback" id="header-avatar-fallback">؟</div>
                    <div>
                        <p class="name" id="header-user-name">...</p>
                        <p class="role">معلم</p>
                    </div>
                </div>
            </div>
        </header>
    `;

    document.getElementById('header-suggest').addEventListener('click', () => openSuggestionModal());

    document.getElementById('header-logout-mobile').addEventListener('click', async () => {
        unlinkOnSignOut();
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
        const nameEl = document.getElementById('header-user-name');
        const avatarEl = document.getElementById('header-avatar-fallback');
        if (profile && nameEl) {
            nameEl.textContent = profile.name || 'معلم';
            avatarEl.textContent = (profile.name || '؟').trim().charAt(0);
        }
    } catch (e) {
        // تجاهل بصمت - الهيدر يظل بقيمة افتراضية
    }
}
