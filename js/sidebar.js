/**
 * sidebar.js - السايدبار الموحّد لكل صفحات البرنامج (مطابق للثيم الجديد)
 */
import { Auth } from './auth.js';
import { icon } from './icons.js';

const NAV_ITEMS = [
    { key: 'dashboard', href: 'dashboard.html', icon: 'home', label: 'الرئيسية' },
    { key: 'students', href: 'students.html', icon: 'users', label: 'الطلاب' },
    { key: 'schedule', href: 'schedule.html', icon: 'calendar', label: 'المواعيد' },
    { key: 'books', href: 'books.html', icon: 'bookOpen', label: 'كتابي' },
    { key: 'settings', href: 'settings.html', icon: 'gear', label: 'الإعدادات' }
];

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
                <a href="#" id="sidebar-logout">
                    <span class="icon">${icon('logout', { size: 19 })}</span>
                    <span class="label">تسجيل الخروج</span>
                </a>
            </div>
        </aside>
    `;

    document.getElementById('sidebar-logout').addEventListener('click', async (e) => {
        e.preventDefault();
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

const WHATSAPP_NUMBER = '201037728764';

async function enforceSubscriptionLock() {
    // لا نقفل صفحة الاشتراك نفسها حتى يستطيع المستخدم الاشتراك دائمًا
    if (window.location.pathname.endsWith('subscription.html')) return;

    try {
        const { api } = await import('./api.js');
        const sub = await api.checkSubscription();
        const state = computeSubscriptionState(sub);
        if (!state.locked) return;

        let studentsNote = 'جميع بيانات طلابك وحصصك محفوظة بالكامل ولن يتم حذف أي شيء منها.';
        try {
            const data = await api.getDashboard();
            const count = data && typeof data.studentsCount === 'number' ? data.studentsCount : null;
            if (count !== null) {
                studentsNote = `بياناتك محفوظة بالكامل — لديك ${count} طالب${count === 1 ? '' : ' مسجّلين'} وكل حصصهم وملاحظاتهم موجودة كما هي، ولن يُحذف منها أي شيء.`;
            }
        } catch (e) {
            // تجاهل بصمت — تُستخدم الرسالة العامة أعلاه
        }

        const heading = state.reason === 'trial_expired' ? 'انتهت الفترة التجريبية المجانية' : 'انتهت فترة الاشتراك الحالية';
        const whatsappMessage = 'مرحباً، أرغب في تجديد/تفعيل الاشتراك في الخطة الشهرية (150 جنيه) في تطبيق Teachers Manager.';
        const waHref = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(whatsappMessage)}`;

        const overlay = document.createElement('div');
        overlay.id = 'sub-lock-overlay';
        overlay.innerHTML = `
            <div class="sub-lock-card">
                <div class="sub-lock-icon">${icon('lock', { size: 26 })}</div>
                <h2>${heading}</h2>
                <p class="sub-lock-reassure">${icon('checkCircle', { size: 15 })} ${studentsNote}</p>
                <p class="sub-lock-desc">فعّل الاشتراك الشهري (150 جنيه) لاستعادة الوصول الكامل فورًا — بياناتك في انتظارك.</p>
                <a href="${waHref}" target="_blank" rel="noopener" class="btn sub-lock-whatsapp">${icon('messageCircle', { size: 17 })} تجديد الاشتراك عبر واتساب</a>
                <a href="subscription.html" class="sub-lock-link">عرض تفاصيل الاشتراك</a>
                <button type="button" id="sub-lock-logout" class="sub-lock-link sub-lock-logout-btn">تسجيل الخروج</button>
            </div>
        `;
        document.body.appendChild(overlay);
        document.body.style.overflow = 'hidden';

        document.getElementById('sub-lock-logout').addEventListener('click', async () => {
            await Auth.signOut();
            window.location.href = 'login.html';
        });
    } catch (e) {
        // فشل التحقق ليس سببًا لقفل التطبيق على المستخدم — تجاهل بصمت
    }
}

/**
 * بانر حالة الاشتراك/التجربة المجانية — مكان ثابت في بداية البرنامج (أعلى لوحة التحكم)
 * بدلاً من ظهوره داخل السايدبار (كان يختفي على الموبايل ويسبب مشاكل تصميم).
 * يُستدعى مرة واحدة من dashboard.html فقط.
 */
export async function renderTrialBanner(containerId = 'trial-banner-root') {
    const root = document.getElementById(containerId);
    if (!root) return;
    try {
        const { api } = await import('./api.js');
        const sub = await api.checkSubscription();
        const state = computeSubscriptionState(sub);

        // القفل العام (enforceSubscriptionLock) هيتكفّل بعرض شاشة القفل الكاملة عند انتهاء الاشتراك فعليًا
        if (state.locked) { root.innerHTML = ''; return; }

        if (state.kind === 'trial' && state.daysLeft !== null) {
            root.innerHTML = `
                <div class="trial-banner">
                    <div class="trial-banner-icon">${icon('sparkles', { size: 20 })}</div>
                    <div class="trial-banner-text">
                        <strong>الفترة التجريبية المجانية</strong>
                        <span>متبقٍ ${daysLabel(state.daysLeft)} — بعدها يمكنك الاشتراك في الخطة الشهرية لمتابعة الاستخدام.</span>
                    </div>
                    <a href="subscription.html" class="btn trial-banner-btn">عرض الاشتراك</a>
                </div>
            `;
        } else if (state.kind === 'active' && state.daysLeft !== null && state.daysLeft <= 5) {
            // تذكير بقرب انتهاء الاشتراك المدفوع (5 أيام أو أقل)
            root.innerHTML = `
                <div class="trial-banner">
                    <div class="trial-banner-icon">${icon('clock', { size: 20 })}</div>
                    <div class="trial-banner-text">
                        <strong>اشتراكك على وشك الانتهاء</strong>
                        <span>متبقٍ ${daysLabel(state.daysLeft)} على نهاية الخطة الشهرية الحالية.</span>
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

    document.getElementById('header-logout-mobile').addEventListener('click', async () => {
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
}

async function loadHeaderProfile() {
    try {
        const session = await Auth.getSession();
        if (!session) return;
        const profile = await Auth.bootstrapSession();
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
