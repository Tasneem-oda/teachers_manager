/**
 * notifications.js - إشعارات Push (تذكير يومي بحصص اليوم) + مركز الإشعارات
 * ============================================================================
 * الملف ده فيه جزءين مستقلّين عن بعض:
 *
 * 1) إشعارات Push عبر OneSignal (تصل حتى لو التطبيق مقفول تمامًا):
 *    - بنستخدم خدمة OneSignal عشان تتكفّل بكل التعقيد التقني لإشعارات
 *      Push في المتصفح (Service Worker خاص بيها، مفاتيح VAPID، تخزين
 *      الاشتراكات...)، فمحتاجناش نبني أي حاجة من الصفر.
 *    - كل معلّم بعد ما يسجّل دخوله، بنربط جهازه/متصفحه بمعرّفه الموحّد
 *      (external_id = نفس UUID بتاعه في Supabase/قاعدة البيانات) عن طريق
 *      OneSignal.login(teacherId).
 *    - الإشعار الفعلي (تذكير الحصص اليومي) بيتبعت من workflow مجدول في n8n
 *      (شوف n8n/send-daily-lesson-notifications.json) بيستدعي REST API بتاع
 *      OneSignal مباشرة - مفيش أي كود هنا بيبعت الإشعار نفسه.
 *    - ملحوظة مهمة (إصلاح): OneSignal بقى بيستخدم نفس ملف sw.js بدل ما يسجّل
 *      ملفه الخاص (OneSignalSDKWorker.js) على نفس الـ scope - شوف التعليق
 *      الطويل في sw.js وفي initAndLinkTeacher() تحت لتفاصيل المشكلة والحل.
 *
 * 2) مركز الإشعارات (نافذة زر الجرس 🔔 في الهيدر):
 *    - سجل دائم لإشعارات كل معلّم مخزّن في جدول teachers_manager.notifications
 *      (شوف n8n/NOTIFICATIONS_DB_MIGRATION.sql)، مستقل تمامًا عن حالة تفعيل
 *      إشعارات Push أو إذن المتصفح - بيشتغل حتى لو المعلم رفض إذن الإشعارات.
 *    - نفس workflow الإشعار اليومي (n8n/send-daily-lesson-notifications.json)
 *      بيحفظ نسخة من كل إشعار في الجدول ده، وبينضف الإشعارات المقروءة
 *      اللي عدى عليها أكتر من 30 يوم تلقائيًا كل صباح.
 *    - الضغط على الجرس بيفتح نافذة منسدلة فيها تبويبين: "غير مقروءة" و"مقروءة".
 *
 * ملحوظة: لازم تحط الـ ONESIGNAL_APP_ID الحقيقي في js/config.js (تحت
 * CONFIG.PUSH_NOTIFICATIONS.ONESIGNAL_APP_ID) عشان جزء الـ Push يشتغل، ولازم
 * تستورد n8n/get-notifications.json و n8n/mark-notifications-read.json
 * وتنفّذ n8n/NOTIFICATIONS_DB_MIGRATION.sql عشان جزء مركز الإشعارات يشتغل.
 * كل جزء بيفشل بصمت (من غير ما يكسر باقي الصفحة) لو لسه معمولش الإعداد بتاعه.
 * ============================================================================
 */
import { CONFIG } from './config.js?v=10';
import { Auth } from './auth.js?v=10';
import { api } from './api.js?v=10';
import { ErrorHandler } from './utils.js?v=10';

const PROMPT_DISMISS_KEY = 'tm_notif_prompt_dismissed';
const BADGE_CACHE_KEY = 'tm_notif_badge_cache_v1';
const BADGE_CACHE_TTL_MS = 45 * 1000; // 45 ثانية - يقلل عدد نداءات get-notifications عند التنقل السريع بين الصفحات

// مرجع لزر الجرس الحالي في الصفحة + حالة النافذة المنسدلة + آخر بيانات تم تحميلها
let bellEl = null;
let panelOpen = false;
let activeTab = 'unread';
let cache = { unread: [], read: [] };

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
    // ملحوظة مهمة: الرابط ده هو رابط النسخة الحالية v16 من SDK بتاع OneSignal.
    // الرابط القديم (cdn.onesignal.com/sdks/OneSignalSDK.js) بقى "stub" قديم
    // مالوش علاقة بـ window.OneSignalDeferred، فكان بيخلي كل استدعاءاتنا
    // (init/login/requestPermission) تتحط في الطابور من غير ما تتنفذ أبدًا،
    // من غير أي خطأ ظاهر في الـ console - وده اللي كان بيمنع ظهور نافذة
    // إذن الإشعارات للمستخدم تمامًا.
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
        // إصلاح "[M] No SW registration for postMessage": ده race condition
        // كلاسيكي - أول مرة يتسجل فيها Service Worker (sw.js عبر
        // js/pwa-install.js)، الصفحة الحالية مش بتبقى تحت سيطرته فورًا إلا
        // بعد ما event 'activate' يخلّص تمامًا (اللي فيه self.clients.claim()
        // في sw.js). لو OneSignal.init() اتنادى قبل ما ده يحصل، بيحاول
        // يبعت postMessage لـ Service Worker لسه مش "متحكم" في الصفحة،
        // فبتظهر الرسالة دي. بننتظر هنا navigator.serviceWorker.ready -
        // اللي بيتأكد إن فيه Service Worker نشط وبيتحكم في الصفحة فعليًا -
        // قبل ما نكمل، عشان نضمن إن OneSignal يلاقي التسجيل جاهز من أول مرة.
        if ('serviceWorker' in navigator) {
            try { await navigator.serviceWorker.ready; } catch (e) { /* تجاهل */ }
        }

        await OneSignal.init({
            appId,
            // إصلاح مهم: بنقول لـ OneSignal تستخدم sw.js (نفس ملف الـ Service
            // Worker اللي بيسجّله js/pwa-install.js لتثبيت الـ PWA) بدل ما
            // تسجّل ملفها الافتراضي (OneSignalSDKWorker.js) في نفس الـ scope.
            // لو سابنا الإعداد الافتراضي، كان بيحصل تعارض: تسجيلين مختلفين
            // بيحاولوا يسيطروا على نفس الـ scope ("/")، وكان sw.js (بسبب
            // skipWaiting/clients.claim) بيستبدل تسجيل OneSignal ويلغي
            // اشتراك الإشعارات بصمت - وده كان السبب الفعلي وراء عدم ظهور
            // الإشعار اليومي غير لو التطبيق مفتوح وقت وصوله بالظبط.
            // sw.js دلوقتي فيه importScripts لكود OneSignal بالإضافة لكوده
            // الأصلي، فأصبح ملف واحد بيغطي الوظيفتين. راجع التعليق الكامل
            // أعلى sw.js لتفاصيل أكتر.
            serviceWorkerPath: 'sw.js',
            serviceWorkerParam: { scope: '/' }
        });
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
                /* أقل من النوافذ المنبثقة (1000) وعارض الكتاب (9000) عشان مايغطيش زر الشات ولا حقل الكتابة */
                z-index: 899;
                display: flex;
                align-items: center;
                gap: 0.75rem;
                background: var(--card-bg, #FFFFFF);
                border-top: 1px solid var(--border, #E7E1E8);
                box-shadow: 0 -4px 16px rgba(0,0,0,0.08);
                padding: 0.85rem 1rem calc(0.85rem + env(safe-area-inset-bottom, 0px));
                font-family: 'IBM Plex Sans Arabic', Tahoma, Arial, sans-serif;
                direction: rtl;
                animation: tm-notif-slide-up 0.3s ease-out;
            }
            /* بانر واحد بس في نفس الوقت: لو بانر تثبيت التطبيق ظاهر، بانر الإشعارات بيستنى لحد ما يتقفل */
            body:has(#tm-install-banner) #tm-notif-banner { display: none; }
            @media (max-width: 900px) {
                body:has(.sidebar) #tm-notif-banner {
                    bottom: calc(62px + env(safe-area-inset-bottom, 0px));
                    padding-bottom: 0.85rem;
                }
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
 *
 * ملحوظة مهمة: لو الإذن كان "denied" بالفعل (اتحظر قبل كده من المتصفح)،
 * مفيش أي كود - عندنا أو عند OneSignal - يقدر "يطلب" الإذن تاني برمجيًا؛
 * المتصفح بيرفض المحاولة فورًا (خطأ "Permission blocked") كحماية من
 * تضايق المستخدمين بطلبات متكررة. الحل الوحيد وقتها إن المستخدم نفسه
 * يفك الحظر يدويًا من إعدادات الموقع في المتصفح - مفيش أي بديل برمجي،
 * ومفيش فرق هنا بين OneSignal وأي خدمة إشعارات تانية.
 */
export async function requestPermission() {
    if ('Notification' in window && Notification.permission === 'denied') {
        ErrorHandler.showError(
            'إذن الإشعارات محظور لهذا الموقع من إعدادات المتصفح. افتح إعدادات الموقع (أيقونة القفل 🔒 بجانب رابط الموقع) ← الإشعارات ← اختر "سماح"، ثم أعد تحميل الصفحة.'
        );
        return;
    }

    return new Promise((resolve) => {
        runWhenOneSignalReady(async (OneSignal) => {
            try {
                await OneSignal.Notifications.requestPermission();
            } catch (e) {
                console.warn('تعذّر طلب إذن الإشعارات:', e);
                ErrorHandler.showError(
                    'تعذّر تفعيل الإشعارات. تأكد إن الإشعارات مش محظورة من إعدادات المتصفح لهذا الموقع، ولو بتستخدم آيفون، تأكد إنك فتحت الموقع من الشاشة الرئيسية بعد إضافته (Add to Home Screen) لا من متصفح Safari مباشرة.'
                );
            }
            resolve();
        });
    });
}

/* ============================================================================
 * مركز الإشعارات (نافذة زر الجرس): تبويب "غير مقروءة" و"مقروءة"
 * ============================================================================
 */

/**
 * هروب بسيط من HTML عشان نحط أي نص (عنوان الإشعار، رابط...) جوه innerHTML
 * بأمان - سواء كان النص هيتعرض كمحتوى عادي أو جوه attribute بين علامتي
 * تنصيص (زي data-url="...")، فبنهرب علامات التنصيص كمان يدويًا.
 */
function esc(str) {
    const div = document.createElement('div');
    div.textContent = str == null ? '' : String(str);
    return div.innerHTML.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** وقت نسبي بالعربي ("منذ ٣ ساعات"، "أمس"...) */
function relativeTimeAr(isoString) {
    const then = new Date(isoString).getTime();
    if (isNaN(then)) return '';
    const diffSec = Math.max(0, Math.floor((Date.now() - then) / 1000));

    if (diffSec < 60) return 'الآن';

    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) {
        if (diffMin === 1) return 'منذ دقيقة';
        if (diffMin === 2) return 'منذ دقيقتين';
        if (diffMin <= 10) return `منذ ${diffMin} دقائق`;
        return `منذ ${diffMin} دقيقة`;
    }

    const diffHour = Math.floor(diffMin / 60);
    if (diffHour < 24) {
        if (diffHour === 1) return 'منذ ساعة';
        if (diffHour === 2) return 'منذ ساعتين';
        if (diffHour <= 10) return `منذ ${diffHour} ساعات`;
        return `منذ ${diffHour} ساعة`;
    }

    const diffDay = Math.floor(diffHour / 24);
    if (diffDay < 30) {
        if (diffDay === 1) return 'أمس';
        if (diffDay === 2) return 'منذ يومين';
        if (diffDay <= 10) return `منذ ${diffDay} أيام`;
        return `منذ ${diffDay} يومًا`;
    }

    // احتياطي فقط (عمليًا المقروءة بتتمسح تلقائيًا قبل ما توصل هنا)
    return new Date(isoString).toLocaleDateString('ar-EG', { day: 'numeric', month: 'short' });
}

function injectPanelStyles() {
    if (document.getElementById('tm-notif-panel-style')) return;
    const style = document.createElement('style');
    style.id = 'tm-notif-panel-style';
    style.textContent = `
        #tm-notif-panel {
            position: fixed; width: 360px; max-width: calc(100vw - 16px); max-height: 70vh;
            background: var(--card-bg, #fff); border: 1px solid var(--border, #E7E1E8);
            border-radius: 14px; box-shadow: 0 12px 40px rgba(41,37,45,0.18);
            z-index: 9997; display: none; flex-direction: column; overflow: hidden;
            font-family: 'IBM Plex Sans Arabic', Tahoma, Arial, sans-serif; direction: rtl;
        }
        #tm-notif-panel.open { display: flex; animation: tm-notif-panel-in 0.15s ease-out; }
        @keyframes tm-notif-panel-in { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: translateY(0); } }
        #tm-notif-panel .tm-notif-panel-header {
            display: flex; align-items: center; justify-content: space-between;
            padding: 0.85rem 1rem 0.6rem; border-bottom: 1px solid var(--border, #E7E1E8); flex-shrink: 0;
        }
        #tm-notif-panel .tm-notif-panel-header h3 { margin: 0; font-size: 0.98rem; color: var(--text-primary, #29252D); }
        #tm-notif-panel .tm-notif-panel-close {
            background: transparent; border: none; cursor: pointer; font-size: 1.1rem;
            color: var(--text-secondary, #716A74); padding: 0.2rem 0.4rem; line-height: 1;
        }
        #tm-notif-panel .tm-notif-panel-close:hover { color: var(--text-primary, #29252D); }
        #tm-notif-panel .tm-notif-panel-enable {
            display: flex; align-items: center; justify-content: space-between; gap: 0.5rem;
            background: var(--bg-secondary, #F5F3F0); margin: 0.65rem 1rem 0; padding: 0.55rem 0.7rem;
            border-radius: 10px; font-size: 0.76rem; color: var(--text-primary, #29252D); flex-shrink: 0;
        }
        #tm-notif-panel .tm-notif-panel-enable button {
            background: var(--primary, #4B3A5A); color: #fff; border: none; border-radius: 7px;
            padding: 0.35rem 0.65rem; font-size: 0.74rem; font-weight: 600; cursor: pointer;
            white-space: nowrap; font-family: inherit;
        }
        #tm-notif-panel .tm-notif-tabs {
            display: flex; align-items: center; gap: 0.4rem; padding: 0.65rem 1rem 0.5rem;
            border-bottom: 1px solid var(--border, #E7E1E8); flex-shrink: 0;
        }
        #tm-notif-panel .tm-notif-tab {
            background: transparent; border: 1px solid var(--border, #E7E1E8); color: var(--text-secondary, #716A74);
            border-radius: 20px; padding: 0.3rem 0.75rem; font-size: 0.76rem; font-weight: 600;
            cursor: pointer; font-family: inherit; white-space: nowrap;
        }
        #tm-notif-panel .tm-notif-tab.active { background: var(--primary, #4B3A5A); border-color: var(--primary, #4B3A5A); color: #fff; }
        #tm-notif-panel .tm-notif-mark-all {
            margin-inline-start: auto; background: transparent; border: none; color: var(--primary, #4B3A5A);
            font-size: 0.72rem; font-weight: 600; cursor: pointer; font-family: inherit;
            text-decoration: underline; padding: 0; white-space: nowrap;
        }
        #tm-notif-panel .tm-notif-list { overflow-y: auto; padding: 0.4rem 0; }
        #tm-notif-panel .tm-notif-item { display: flex; align-items: flex-start; gap: 0.5rem; padding: 0.65rem 1rem; cursor: pointer; }
        #tm-notif-panel .tm-notif-item:hover { background: var(--bg-secondary, #F5F3F0); }
        #tm-notif-panel .tm-notif-item.unread { background: rgba(75,58,90,0.05); }
        #tm-notif-panel .tm-notif-item-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--danger, #B85C5C); margin-top: 0.42rem; flex-shrink: 0; }
        #tm-notif-panel .tm-notif-item-body { flex: 1; min-width: 0; }
        #tm-notif-panel .tm-notif-item-title { margin: 0 0 0.15rem; font-size: 0.85rem; font-weight: 700; color: var(--text-primary, #29252D); }
        #tm-notif-panel .tm-notif-item-text {
            margin: 0 0 0.2rem; font-size: 0.78rem; color: var(--text-secondary, #716A74); line-height: 1.4;
            overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
        }
        #tm-notif-panel .tm-notif-item-time { margin: 0; font-size: 0.68rem; color: var(--text-light, #A8A2AA); }
        #tm-notif-panel .tm-notif-empty, #tm-notif-panel .tm-notif-loading {
            text-align: center; padding: 2.25rem 1rem; color: var(--text-secondary, #716A74); font-size: 0.82rem;
        }
        #tm-notif-panel .tm-notif-footnote {
            text-align: center; padding: 0.5rem 1rem 0.7rem; font-size: 0.65rem; color: var(--text-light, #A8A2AA);
            border-top: 1px solid var(--border, #E7E1E8); flex-shrink: 0;
        }
        @media (max-width: 600px) {
            #tm-notif-panel {
                left: 0.6rem !important; right: 0.6rem !important; top: 4.2rem !important;
                width: auto; max-width: none; max-height: 75vh;
            }
        }
    `;
    document.head.appendChild(style);
}

function renderEmptyState(kind) {
    return `<div class="tm-notif-empty">${kind === 'unread' ? 'لا توجد إشعارات جديدة 🎉' : 'لا توجد إشعارات مقروءة بعد'}</div>`;
}

function renderNotificationItem(n, isUnread) {
    return `
        <div class="tm-notif-item ${isUnread ? 'unread' : ''}" data-id="${esc(n.id)}" data-url="${n.url ? esc(n.url) : ''}" data-unread="${isUnread ? '1' : '0'}">
            ${isUnread ? '<span class="tm-notif-item-dot"></span>' : ''}
            <div class="tm-notif-item-body">
                <p class="tm-notif-item-title">${esc(n.title)}</p>
                <p class="tm-notif-item-text">${esc(n.body)}</p>
                <p class="tm-notif-item-time">${relativeTimeAr(n.created_at)}</p>
            </div>
        </div>
    `;
}

function renderActiveTab() {
    const listEl = document.getElementById('tm-notif-list');
    if (!listEl) return;
    const items = cache[activeTab] || [];
    listEl.innerHTML = items.length
        ? items.map((n) => renderNotificationItem(n, activeTab === 'unread')).join('')
        : renderEmptyState(activeTab);

    listEl.querySelectorAll('.tm-notif-item').forEach((el) => {
        el.addEventListener('click', () => {
            const id = el.dataset.id;
            const url = el.dataset.url;
            if (el.dataset.unread === '1') markOneRead(id);
            if (url) window.location.href = url;
        });
    });
}

function updateTabCounts() {
    const unreadTabBtn = document.getElementById('tm-notif-tab-unread');
    if (unreadTabBtn) {
        unreadTabBtn.textContent = cache.unread.length > 0 ? `غير مقروءة (${cache.unread.length})` : 'غير مقروءة';
    }
    const markAllBtn = document.getElementById('tm-notif-mark-all');
    if (markAllBtn) markAllBtn.style.display = cache.unread.length > 0 ? 'inline' : 'none';
}

function applyBadge(unreadCount) {
    if (!bellEl) return;
    let dot = bellEl.querySelector('.dot');
    if (unreadCount > 0) {
        if (!dot) {
            dot = document.createElement('span');
            dot.className = 'dot';
            bellEl.appendChild(dot);
        }
    } else if (dot) {
        dot.remove();
    }
    try {
        sessionStorage.setItem(BADGE_CACHE_KEY, JSON.stringify({ ts: Date.now(), count: unreadCount }));
    } catch (e) { /* تجاهل */ }
}

function updateBellBadge() {
    applyBadge(cache.unread.length);
}

async function fetchAndRenderNotifications() {
    const listEl = document.getElementById('tm-notif-list');
    if (listEl) listEl.innerHTML = '<div class="tm-notif-loading">جارٍ التحميل...</div>';

    try {
        const data = await api.getNotifications();
        cache.unread = Array.isArray(data?.unread) ? data.unread : [];
        cache.read = Array.isArray(data?.read) ? data.read : [];
    } catch (e) {
        console.warn('تعذّر تحميل الإشعارات (تأكد من استيراد وتفعيل n8n/get-notifications.json):', e);
        cache.unread = [];
        cache.read = [];
        if (listEl) listEl.innerHTML = '<div class="tm-notif-empty">تعذّر تحميل الإشعارات حاليًا</div>';
        updateTabCounts();
        applyBadge(0);
        return;
    }

    updateTabCounts();
    updateBellBadge();
    renderActiveTab();
}

/** تحديث تفاؤلي فوري (Optimistic UI) قبل انتظار رد الخادم */
function markOneRead(id) {
    const idx = cache.unread.findIndex((n) => n.id === id);
    if (idx === -1) return;
    const [item] = cache.unread.splice(idx, 1);
    item.is_read = true;
    item.read_at = new Date().toISOString();
    cache.read.unshift(item);

    updateTabCounts();
    updateBellBadge();
    if (activeTab === 'unread') renderActiveTab();

    api.markNotificationsRead(id).catch((e) => {
        console.warn('تعذّر تحديث حالة الإشعار على الخادم:', e);
    });
}

function markAllRead() {
    if (!cache.unread.length) return;
    const now = new Date().toISOString();
    const moved = cache.unread.map((n) => ({ ...n, is_read: true, read_at: now }));
    cache.read = [...moved, ...cache.read];
    cache.unread = [];

    updateTabCounts();
    updateBellBadge();
    renderActiveTab();

    api.markNotificationsRead().catch((e) => {
        console.warn('تعذّر تحديد كل الإشعارات كمقروءة على الخادم:', e);
    });
}

function switchTab(tab) {
    activeTab = tab;
    document.getElementById('tm-notif-tab-unread')?.classList.toggle('active', tab === 'unread');
    document.getElementById('tm-notif-tab-read')?.classList.toggle('active', tab === 'read');
    renderActiveTab();
}

/** إظهار/إخفاء تنبيه "فعّل إشعارات Push" الصغير جوه النافذة حسب حالة الإذن الحالية */
function updateEnableSection() {
    const section = document.getElementById('tm-notif-panel-enable');
    if (!section) return;
    const appId = CONFIG.PUSH_NOTIFICATIONS?.ONESIGNAL_APP_ID;
    const pushConfigured = appId && appId !== 'REPLACE_WITH_YOUR_ONESIGNAL_APP_ID';
    const permissionPending = 'Notification' in window && Notification.permission === 'default';
    section.hidden = !(pushConfigured && permissionPending);
}

function positionPanel() {
    const panel = document.getElementById('tm-notif-panel');
    if (!panel || !bellEl) return;

    // على الشاشات الصغيرة، الـ CSS (media query) بيتكفّل بالموضع بالكامل
    if (window.innerWidth <= 600) return;

    const rect = bellEl.getBoundingClientRect();
    const panelWidth = 360;
    let left = rect.right - panelWidth;
    if (left < 8) left = 8;
    const maxLeft = window.innerWidth - panelWidth - 8;
    if (left > maxLeft) left = Math.max(8, maxLeft);
    panel.style.left = `${left}px`;
    panel.style.top = `${rect.bottom + 10}px`;
}

function ensurePanel() {
    injectPanelStyles();
    let panel = document.getElementById('tm-notif-panel');
    if (panel) return panel;

    panel = document.createElement('div');
    panel.id = 'tm-notif-panel';
    panel.innerHTML = `
        <div class="tm-notif-panel-header">
            <h3>الإشعارات</h3>
            <button type="button" class="tm-notif-panel-close" id="tm-notif-panel-close" aria-label="إغلاق">✕</button>
        </div>
        <div class="tm-notif-panel-enable" id="tm-notif-panel-enable" hidden>
            <span>🔔 فعّل تذكير الحصص اليومي</span>
            <button type="button" id="tm-notif-panel-enable-btn">تفعيل</button>
        </div>
        <div class="tm-notif-tabs">
            <button type="button" class="tm-notif-tab active" data-tab="unread" id="tm-notif-tab-unread">غير مقروءة</button>
            <button type="button" class="tm-notif-tab" data-tab="read" id="tm-notif-tab-read">مقروءة</button>
            <button type="button" class="tm-notif-mark-all" id="tm-notif-mark-all" style="display:none;">تحديد الكل كمقروء</button>
        </div>
        <div class="tm-notif-list" id="tm-notif-list">
            <div class="tm-notif-loading">جارٍ التحميل...</div>
        </div>
        <div class="tm-notif-footnote">الإشعارات المقروءة تُحذف تلقائيًا بعد 30 يومًا</div>
    `;
    document.body.appendChild(panel);

    document.getElementById('tm-notif-panel-close').addEventListener('click', closePanel);
    document.getElementById('tm-notif-tab-unread').addEventListener('click', () => switchTab('unread'));
    document.getElementById('tm-notif-tab-read').addEventListener('click', () => switchTab('read'));
    document.getElementById('tm-notif-mark-all').addEventListener('click', markAllRead);
    document.getElementById('tm-notif-panel-enable-btn').addEventListener('click', async () => {
        await requestPermission();
        updateEnableSection();
    });

    // إغلاق النافذة عند الضغط في أي مكان خارجها (أو خارج زرار الجرس نفسه)
    document.addEventListener('click', (e) => {
        if (!panelOpen) return;
        const panelNow = document.getElementById('tm-notif-panel');
        if (!panelNow) return;
        if (panelNow.contains(e.target) || (bellEl && bellEl.contains(e.target))) return;
        closePanel();
    });
    // إغلاق بزرار Escape
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && panelOpen) closePanel();
    });
    // إعادة حساب موضع النافذة لو حجم الشاشة اتغيّر وهي مفتوحة
    window.addEventListener('resize', () => {
        if (panelOpen) positionPanel();
    });

    return panel;
}

async function openPanel() {
    ensurePanel();
    updateEnableSection();
    positionPanel();
    document.getElementById('tm-notif-panel').classList.add('open');
    panelOpen = true;
    await fetchAndRenderNotifications();
}

function closePanel() {
    const panel = document.getElementById('tm-notif-panel');
    if (panel) panel.classList.remove('open');
    panelOpen = false;
}

function togglePanel() {
    if (panelOpen) {
        closePanel();
    } else {
        openPanel();
    }
}

/**
 * ربط زر الجرس في الهيدر العلوي: يفتح/يقفل نافذة مركز الإشعارات
 */
function wireBellButton() {
    const bell = document.getElementById('header-bell');
    if (!bell) return;
    bellEl = bell;
    if (bell.dataset.tmNotifWired) return;
    bell.dataset.tmNotifWired = '1';

    bell.addEventListener('click', () => {
        togglePanel();
    });
}

/**
 * تحديث "النقطة الحمراء" فوق الجرس بصمت (بدون فتح النافذة) عند تحميل أي
 * صفحة، عشان المعلم يعرف إن فيه إشعارات جديدة من غير ما يفتح النافذة.
 * بيستخدم كاش قصير (45 ثانية) في sessionStorage عشان ميكررش نفس الطلب
 * لـ n8n مع كل تنقل سريع بين صفحات البرنامج.
 */
async function refreshUnreadBadge() {
    try {
        const raw = sessionStorage.getItem(BADGE_CACHE_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed && (Date.now() - parsed.ts) < BADGE_CACHE_TTL_MS) {
                applyBadge(parsed.count);
                return;
            }
        }
    } catch (e) { /* تجاهل كاش تالف */ }

    try {
        const data = await api.getNotifications();
        const unreadCount = Array.isArray(data?.unread) ? data.unread.length : 0;
        applyBadge(unreadCount);
    } catch (e) {
        // فشل صامت - غالبًا لسه n8n/get-notifications.json ماتفعّلش، ومش المفروض
        // يمنع باقي الصفحة من الشغل
    }
}

/**
 * نقطة الدخول: تُستدعى مرة واحدة من كل صفحة محمية (عبر sidebar.js)
 */
export async function initPushNotifications() {
    // مركز الإشعارات (نافذة الجرس): يشتغل دايمًا بغض النظر عن حالة إعداد
    // OneSignal أو إذن الإشعارات - لأنه بس بيعرض سجل إشعارات مخزّن عندنا
    try {
        wireBellButton();
        refreshUnreadBadge();
    } catch (e) {
        console.warn('تعذّر تهيئة مركز الإشعارات:', e);
    }

    // إشعارات Push الفعلية عبر OneSignal
    try {
        const teacherId = await initAndLinkTeacher();
        if (!teacherId) return; // مفيش App ID متضبط أو مفيش جلسة دخول

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
