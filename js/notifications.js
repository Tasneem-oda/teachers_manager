/**
 * notifications.js - تفعيل إشعارات Push للمعلمين (تذكير يومي بحصص اليوم)
 * ============================================================================
 * الفكرة:
 * - بنستخدم خدمة OneSignal (مجانية لعدد كبير من المستخدمين) عشان تتكفّل
 *   بكل التعقيد التقني لإشعارات Push في المتصفح (Service Worker خاص بيها،
 *   مفاتيح VAPID، تخزين الاشتراكات...)، فمحتاجناش نبني أي حاجة من الصفر.
 * - كل معلّم بعد ما يسجّل دخوله، بنربط جهازه/متصفحه بمعرّفه الموحّد
 *   (external_id = نفس UUID بتاعه في Supabase/قاعدة البيانات) عن طريق
 *   OneSignal.login(teacherId). وده اللي بيخلّي n8n يقدر يستهدفه بإشعار
 *   لاحقًا وهو بس عارف الـ teacher_id، من غير ما نحتاج نخزّن أي بيانات
 *   اشتراك (subscription) بنفسنا في قاعدة بياناتنا.
 * - الإشعار الفعلي (تذكير الحصص اليومي) بيتبعت من workflow مجدول في n8n
 *   (شوفي n8n/send-daily-lesson-notifications.json) بيستدعي REST API بتاع
 *   OneSignal مباشرة - مفيش أي كود هنا بيبعت الإشعار نفسه.
 *
 * ملحوظة: لازم تحطي الـ ONESIGNAL_APP_ID الحقيقي في js/config.js (تحت
 * CONFIG.PUSH_NOTIFICATIONS.ONESIGNAL_APP_ID) عشان الكود ده يشتغل فعليًا.
 * ============================================================================
 */
import { CONFIG } from './config.js';
import { Auth } from './auth.js';

const PROMPT_DISMISS_KEY = 'tm_notif_prompt_dismissed';

/**
 * إضافة دالة لقائمة انتظار OneSignal (OneSignalDeferred) - طريقة OneSignal
 * الرسمية لتنفيذ كود بعد ما الـ SDK بتاعها يخلّص تحميل، بدل ما نستنى
 * إحنا يدويًا بـ setTimeout أو ما شابه
 */
function runWhenOneSignalReady(fn) {
    window.OneSignalDeferred = window.OneSignalDeferred || [];
    window.OneSignalDeferred.push(fn);
}

/**
 * تحميل مكتبة OneSignal من الـ CDN بتاعها مرة واحدة بس لكل صفحة
 * (بدل ما نضطر نضيف تاج <script> يدويًا في كل صفحة HTML على حدة)
 */
function loadOneSignalSdk() {
    if (document.getElementById('onesignal-sdk')) return; // محمّلة بالفعل
    const script = document.createElement('script');
    script.id = 'onesignal-sdk';
    script.src = 'https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js';
    script.defer = true;
    document.head.appendChild(script);
}

/**
 * تهيئة OneSignal وربط الجهاز الحالي بمعرّف المعلم المسجّل دخوله
 */
async function initAndLinkTeacher() {
    const appId = CONFIG.PUSH_NOTIFICATIONS?.ONESIGNAL_APP_ID;
    if (!appId || appId === 'REPLACE_WITH_YOUR_ONESIGNAL_APP_ID') {
        // لسه محدّش حط الـ App ID الحقيقي - منعملش حاجة عشان منطلعش أخطاء
        // في الـ console للمستخدم النهائي
        return null;
    }

    const session = await Auth.getSession();
    if (!session || !session.user) return null;
    const teacherId = session.user.id;

    loadOneSignalSdk();

    runWhenOneSignalReady(async (OneSignal) => {
        await OneSignal.init({ appId });
        // ربط هذا المتصفح/الجهاز بمعرّف المعلم الموحّد، عشان نقدر نستهدفه
        // بالإشعار اليومي من n8n لاحقًا بنفس الـ UUID المستخدم في باقي النظام
        await OneSignal.login(teacherId);
    });

    return teacherId;
}

/**
 * بناء بانر بسيط (بنفس أسلوب بانر تثبيت التطبيق) بيسأل المعلم إذا كان
 * عايز يفعّل إشعارات تذكير الحصص اليومية
 */
function showEnablePrompt() {
    if (document.getElementById('tm-notif-banner')) return;

    try {
        if (sessionStorage.getItem(PROMPT_DISMISS_KEY) === '1') return;
    } catch (e) { /* تجاهل */ }

    // لو المتصفح أصلاً رافض الإذن أو موافق عليه بالفعل، مفيش داعي نعرض بانر
    if (!('Notification' in window)) return;
    if (Notification.permission === 'granted' || Notification.permission === 'denied') return;

    if (!document.getElementById('tm-notif-banner-style')) {
        const style = document.createElement('style');
        style.id = 'tm-notif-banner-style';
        style.textContent = `
            #tm-notif-banner {
                position: fixed;
                inset-inline: 0;
                bottom: 0;
                z-index: 9998;
                display: flex;
                align-items: center;
                gap: 0.75rem;
                background: var(--card-bg, #FFFFFF);
                border-top: 1px solid var(--border, #E7E1E8);
                box-shadow: 0 -4px 16px rgba(0,0,0,0.08);
                padding: 0.85rem 1rem;
                font-family: 'IBM Plex Sans Arabic', Tahoma, Arial, sans-serif;
                direction: rtl;
                animation: tm-notif-slide-up 0.3s ease-out;
            }
            @keyframes tm-notif-slide-up {
                from { transform: translateY(100%); opacity: 0; }
                to { transform: translateY(0); opacity: 1; }
            }
            #tm-notif-banner .tm-notif-icon {
                width: 40px; height: 40px; border-radius: 50%; flex-shrink: 0;
                background: var(--bg-secondary, #F5F3F0); color: var(--primary, #4B3A5A);
                display: flex; align-items: center; justify-content: center;
            }
            #tm-notif-banner .tm-notif-text { flex: 1; min-width: 0; }
            #tm-notif-banner .tm-notif-title { font-weight: 700; font-size: 0.9rem; color: var(--text-primary, #29252D); margin: 0 0 0.15rem; }
            #tm-notif-banner .tm-notif-desc { font-size: 0.78rem; color: var(--text-secondary, #716A74); margin: 0; line-height: 1.4; }
            #tm-notif-banner .tm-notif-actions { display: flex; align-items: center; gap: 0.5rem; flex-shrink: 0; }
            #tm-notif-banner .tm-notif-btn-enable {
                background: var(--primary, #4B3A5A); color: #fff; border: none; border-radius: 8px;
                padding: 0.5rem 0.9rem; font-size: 0.82rem; font-weight: 600; cursor: pointer;
                white-space: nowrap; font-family: inherit;
            }
            #tm-notif-banner .tm-notif-btn-enable:hover { background: var(--primary-hover, #3F304D); }
            #tm-notif-banner .tm-notif-btn-dismiss {
                background: transparent; color: var(--text-secondary, #716A74); border: none;
                font-size: 1.1rem; line-height: 1; cursor: pointer; padding: 0.4rem;
            }
            @media (max-width: 480px) { #tm-notif-banner .tm-notif-desc { display: none; } }
        `;
        document.head.appendChild(style);
    }

    const banner = document.createElement('div');
    banner.id = 'tm-notif-banner';
    banner.innerHTML = `
        <div class="tm-notif-icon">🔔</div>
        <div class="tm-notif-text">
            <p class="tm-notif-title">فعّل تذكير الحصص اليومي</p>
            <p class="tm-notif-desc">هنبعتلك إشعار كل يوم بحصص المعلم المجدولة اليوم حسب جدولك.</p>
        </div>
        <div class="tm-notif-actions">
            <button type="button" class="tm-notif-btn-enable" id="tm-notif-enable-btn">تفعيل الإشعارات</button>
            <button type="button" class="tm-notif-btn-dismiss" id="tm-notif-dismiss-btn" aria-label="إغلاق">✕</button>
        </div>
    `;
    document.body.appendChild(banner);

    document.getElementById('tm-notif-dismiss-btn').addEventListener('click', dismissPrompt);
    document.getElementById('tm-notif-enable-btn').addEventListener('click', async () => {
        await requestPermission();
        dismissPrompt();
    });
}

function dismissPrompt() {
    const banner = document.getElementById('tm-notif-banner');
    if (banner) banner.remove();
    try {
        sessionStorage.setItem(PROMPT_DISMISS_KEY, '1');
    } catch (e) { /* تجاهل */ }
}

/**
 * طلب إذن الإشعارات من المتصفح فعليًا (بيظهر نافذة المتصفح الأصلية)
 */
export async function requestPermission() {
    return new Promise((resolve) => {
        runWhenOneSignalReady(async (OneSignal) => {
            try {
                await OneSignal.Notifications.requestPermission();
            } catch (e) {
                console.warn('تعذّر طلب إذن الإشعارات:', e);
            }
            resolve();
        });
    });
}

/**
 * ربط زر الجرس في الهيدر العلوي: يفتح/يطلب إذن الإشعارات عند الضغط عليه
 */
function wireBellButton() {
    const bell = document.getElementById('header-bell');
    if (!bell || bell.dataset.tmNotifWired) return;
    bell.dataset.tmNotifWired = '1';

    bell.addEventListener('click', async () => {
        if ('Notification' in window && Notification.permission === 'granted') {
            const { ErrorHandler } = await import('./utils.js');
            ErrorHandler.showSuccess('إشعارات تذكير الحصص مفعّلة بالفعل على هذا الجهاز.');
            return;
        }
        await requestPermission();
    });
}

/**
 * نقطة الدخول: تُستدعى مرة واحدة من كل صفحة محمية (عبر sidebar.js)
 */
export async function initPushNotifications() {
    try {
        const teacherId = await initAndLinkTeacher();
        if (!teacherId) return; // مفيش App ID متضبط أو مفيش جلسة دخول

        wireBellButton();

        // بانر التفعيل بيظهر بتأخير بسيط عشان ميزاحمش تحميل باقي الصفحة،
        // ومش هيظهر أصلًا لو الإذن مفعّل/مرفوض بالفعل أو المعلم قفله قبل كده
        setTimeout(showEnablePrompt, 2000);
    } catch (e) {
        // فشل تفعيل الإشعارات مش المفروض يوقف استخدام باقي البرنامج
        console.warn('تعذّر تهيئة إشعارات Push:', e);
    }
}

/**
 * تُستدعى عند تسجيل الخروج - تفك ربط الجهاز عن هوية المعلم الحالي، عشان
 * لو جهاز مشترك (كمبيوتر مكتب مثلاً) منبعتش إشعارات معلم لمعلم تاني بالغلط
 */
export function unlinkOnSignOut() {
    try {
        runWhenOneSignalReady(async (OneSignal) => {
            await OneSignal.logout();
        });
    } catch (e) { /* تجاهل بصمت */ }
}
