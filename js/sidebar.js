/**
 * sidebar.js - السايدبار الموحّد لكل صفحات البرنامج (مطابق للثيم الجديد)
 */
import { Auth } from './auth.js';
import { icon } from './icons.js';

const NAV_ITEMS = [
    { key: 'dashboard', href: 'dashboard.html', icon: 'home', label: 'الرئيسية' },
    { key: 'students', href: 'students.html', icon: 'users', label: 'الطلاب' },
    { key: 'schedule', href: 'schedule.html', icon: 'calendar', label: 'المواعيد' },
    { key: 'notes', href: 'students.html', icon: 'edit', label: 'الملاحظات' },
    { key: 'books', href: 'books.html', icon: 'bookOpen', label: 'كتابي' },
    { key: 'settings', href: 'settings.html', icon: 'gear', label: 'الإعدادات' }
];

export function renderSidebar(activeKey) {
    const root = document.getElementById('sidebar-root');
    if (!root) return;

    const navHtml = NAV_ITEMS.map(item => `
        <a href="${item.href}" class="${item.key === activeKey ? 'active' : ''}">
            <span class="icon">${icon(item.icon, { size: 19 })}</span>
            <span>${item.label}</span>
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
            <div class="sidebar-sub-card" id="sidebar-sub-card" style="display:none;">
                <div class="title">${icon('crown', { size: 15 })} الخطة الاحترافية</div>
                <p class="desc" id="sidebar-sub-desc">تجديد الاشتراك</p>
                <div class="bar"><div class="bar-fill" id="sidebar-sub-bar" style="width: 100%;"></div></div>
            </div>
            <div class="sidebar-footer">
                <a href="#" id="sidebar-logout">
                    <span class="icon">${icon('logout', { size: 19 })}</span>
                    <span>تسجيل الخروج</span>
                </a>
            </div>
        </aside>
    `;

    document.getElementById('sidebar-logout').addEventListener('click', async (e) => {
        e.preventDefault();
        await Auth.signOut();
        window.location.href = 'login.html';
    });

    loadSubscriptionBadge();
}

async function loadSubscriptionBadge() {
    try {
        const { api } = await import('./api.js');
        const sub = await api.checkSubscription();
        const card = document.getElementById('sidebar-sub-card');
        const desc = document.getElementById('sidebar-sub-desc');
        const bar = document.getElementById('sidebar-sub-bar');
        if (!sub || sub.status === 'none') return;
        card.style.display = 'block';
        if (sub.status === 'trial' && sub.trial_ends_at) {
            const daysLeft = Math.max(0, Math.ceil((new Date(sub.trial_ends_at) - new Date()) / 86400000));
            desc.textContent = `${daysLeft} يوم متبقٍ في التجربة`;
            bar.style.width = `${Math.min(100, (daysLeft / 7) * 100)}%`;
        } else if (sub.status === 'active') {
            desc.textContent = 'اشتراك فعّال';
            bar.style.width = '100%';
        } else {
            desc.textContent = 'انتهى الاشتراك - جددي الآن';
            bar.style.width = '0%';
        }
    } catch (e) {
        // فشل تحميل الاشتراك ليس خطأ حرج، نخفي الكارت بصمت
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
                <div class="header-avatar">
                    <div class="avatar-fallback" id="header-avatar-fallback">؟</div>
                    <div>
                        <p class="name" id="header-user-name">...</p>
                        <p class="role">معلمة</p>
                    </div>
                </div>
            </div>
        </header>
    `;

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
            nameEl.textContent = profile.name || 'معلمة';
            avatarEl.textContent = (profile.name || '؟').trim().charAt(0);
        }
    } catch (e) {
        // تجاهل بصمت - الهيدر يظل بقيمة افتراضية
    }
}
