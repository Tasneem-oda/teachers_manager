/**
 * pwa-install.js
 * ========================================================================
 * إدارة تثبيت التطبيق (PWA Install Prompt) على كل صفحات الموقع.
 *
 * الوظيفة:
 * 1) تسجيل الـ Service Worker (sw.js) عشان الموقع يبقى "قابل للتثبيت".
 * 2) لما المتصفح يطلق حدث beforeinstallprompt (يعني الموقع جاهز يتثبت)،
 *    بنوقف الرسالة التلقائية الافتراضية للمتصفح ونعرض بدالها بانر مخصص
 *    بتصميم بسيط بيسأل المستخدم "هل تريد تثبيت التطبيق؟" مع أيقونة البرنامج.
 * 3) لما المستخدم يضغط "تثبيت"، بننده على deferredPrompt.prompt() اللي
 *    بيطلع نافذة التثبيت الأصلية من المتصفح، ولو وافق، البرنامج بينزل
 *    على شاشته تلقائيًا (Home Screen / قائمة البرامج) بدون أي خطوة يدوية تانية.
 * 4) على أجهزة آيفون/آيباد (iOS/iPadOS) المتصفح مش بيدعم beforeinstallprompt
 *    خالص، فبنعرض بدالها تعليمات بسيطة (زرار المشاركة ← إضافة إلى الشاشة الرئيسية).
 *
 * ملحوظة: الكود ده مستقل تمامًا ومحاط بالكامل، مفيش فيه أي تعديل على
 * منطق تسجيل الدخول أو أي صفحة تانية - فقط إضافة بانر اختياري يقدر
 * المستخدم يتجاهله ("لاحقًا") من غير ما يأثر على استخدام الموقع.
 * ========================================================================
 */

(function () {
    'use strict';

    // مفتاح تخزين مؤقت (لمدة الجلسة الحالية فقط) عشان لو المستخدم قفل
    // البانر أو ضغط "لاحقًا"، منعرضهوش تاني في نفس الجلسة وهو بيتنقل
    // بين صفحات الموقع - بس هيرجع يظهر تاني في زيارة/جلسة جديدة لو لسه
    // مش مثبّت البرنامج.
    const DISMISS_KEY = 'tm_install_prompt_dismissed';

    // متغير هيحمل حدث beforeinstallprompt لحد ما المستخدم يضغط "تثبيت"
    let deferredPrompt = null;

    /**
     * تسجيل الـ Service Worker (شرط أساسي للتثبيت في أغلب المتصفحات)
     */
    function registerServiceWorker() {
        if (!('serviceWorker' in navigator)) return;

        // نحسب مسار sw.js بالنسبة لجذر الموقع، بغض النظر عن الصفحة الحالية
        // (كل صفحات المشروع في نفس المجلد الجذري، فالمسار النسبي "sw.js" كافي)
        navigator.serviceWorker.register('sw.js').catch((err) => {
            // لو التسجيل فشل (مثلاً الموقع شغال محليًا بدون HTTPS)، منوقفش
            // الموقع أو نظهر خطأ للمستخدم - بس التثبيت مش هيتفعل وخلاص
            console.warn('تعذّر تسجيل Service Worker:', err);
        });
    }

    /**
     * هل التطبيق شغال حاليًا كتطبيق مثبّت (standalone) بالفعل؟
     * لو أيوه، مفيش داعي نعرض بانر "ثبّت التطبيق" من الأساس.
     */
    function isRunningStandalone() {
        const isStandaloneDisplay = window.matchMedia('(display-mode: standalone)').matches;
        // فحص خاص بمتصفح Safari على iOS
        const isIosStandalone = window.navigator.standalone === true;
        return isStandaloneDisplay || isIosStandalone;
    }

    /**
     * هل الجهاز/المتصفح الحالي iOS (Safari) اللي محتاج تعليمات يدوية؟
     */
    function isIosDevice() {
        return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
    }

    /**
     * بناء البانر (HTML + CSS) وإضافته للصفحة، مرة واحدة بس
     */
    function buildBanner({ isIos }) {
        if (document.getElementById('tm-install-banner')) return; // موجود بالفعل

        const style = document.createElement('style');
        style.id = 'tm-install-banner-style';
        style.textContent = `
            #tm-install-banner {
                position: fixed;
                inset-inline: 0;
                bottom: 0;
                z-index: 9999;
                display: flex;
                align-items: center;
                gap: 0.75rem;
                background: var(--card-bg, #FFFFFF);
                border-top: 1px solid var(--border, #E7E1E8);
                box-shadow: 0 -4px 16px rgba(0,0,0,0.08);
                padding: 0.85rem 1rem;
                font-family: 'IBM Plex Sans Arabic', Tahoma, Arial, sans-serif;
                direction: rtl;
                animation: tm-slide-up 0.3s ease-out;
            }
            @keyframes tm-slide-up {
                from { transform: translateY(100%); opacity: 0; }
                to { transform: translateY(0); opacity: 1; }
            }
            #tm-install-banner .tm-icon {
                width: 44px;
                height: 44px;
                border-radius: 12px;
                flex-shrink: 0;
                object-fit: cover;
                background: #fff;
                border: 1px solid var(--border, #E7E1E8);
            }
            #tm-install-banner .tm-text {
                flex: 1;
                min-width: 0;
            }
            #tm-install-banner .tm-title {
                font-weight: 700;
                font-size: 0.9rem;
                color: var(--text-primary, #29252D);
                margin: 0 0 0.15rem;
            }
            #tm-install-banner .tm-desc {
                font-size: 0.78rem;
                color: var(--text-secondary, #716A74);
                margin: 0;
                line-height: 1.4;
            }
            #tm-install-banner .tm-actions {
                display: flex;
                align-items: center;
                gap: 0.5rem;
                flex-shrink: 0;
            }
            #tm-install-banner .tm-btn-install {
                background: var(--primary, #4B3A5A);
                color: #fff;
                border: none;
                border-radius: 8px;
                padding: 0.5rem 0.9rem;
                font-size: 0.82rem;
                font-weight: 600;
                cursor: pointer;
                white-space: nowrap;
                font-family: inherit;
            }
            #tm-install-banner .tm-btn-install:hover { background: var(--primary-hover, #3F304D); }
            #tm-install-banner .tm-btn-dismiss {
                background: transparent;
                color: var(--text-secondary, #716A74);
                border: none;
                font-size: 1.1rem;
                line-height: 1;
                cursor: pointer;
                padding: 0.4rem;
            }
            @media (max-width: 480px) {
                #tm-install-banner .tm-desc { display: none; }
            }
        `;
        document.head.appendChild(style);

        const banner = document.createElement('div');
        banner.id = 'tm-install-banner';
        banner.innerHTML = `
            <img class="tm-icon" src="assets/icons/icon-192.png" alt="شعار Teachers Manager">
            <div class="tm-text">
                <p class="tm-title">ثبّت تطبيق Teachers Manager</p>
                <p class="tm-desc">${isIos
                    ? 'اضغط على زر المشاركة ⬆️ ثم "إضافة إلى الشاشة الرئيسية" لتثبيت التطبيق.'
                    : 'ثبّت التطبيق على جهازك للوصول السريع بدون فتح المتصفح.'}</p>
            </div>
            <div class="tm-actions">
                ${isIos ? '' : '<button type="button" class="tm-btn-install" id="tm-install-btn">تثبيت</button>'}
                <button type="button" class="tm-btn-dismiss" id="tm-dismiss-btn" aria-label="إغلاق">✕</button>
            </div>
        `;
        document.body.appendChild(banner);

        // زرار الإغلاق: يخفي البانر ويمنع ظهوره تاني في نفس الجلسة
        document.getElementById('tm-dismiss-btn').addEventListener('click', () => {
            dismissBanner();
        });

        if (!isIos) {
            document.getElementById('tm-install-btn').addEventListener('click', async () => {
                if (!deferredPrompt) return;

                // إظهار نافذة التثبيت الرسمية من المتصفح نفسه
                deferredPrompt.prompt();

                // ننتظر قرار المستخدم (قبول/رفض) عشان نعرف نخفي البانر ولا لأ
                const { outcome } = await deferredPrompt.userChoice;
                deferredPrompt = null;

                // بغض النظر عن القرار، البانر مالوش داعي يفضل ظاهر بعد كده
                dismissBanner();

                if (outcome === 'accepted') {
                    console.info('تم قبول تثبيت التطبيق.');
                }
            });
        }
    }

    function showBanner(options) {
        buildBanner(options);
        const banner = document.getElementById('tm-install-banner');
        if (banner) banner.style.display = 'flex';
    }

    function dismissBanner() {
        const banner = document.getElementById('tm-install-banner');
        if (banner) banner.remove();
        try {
            sessionStorage.setItem(DISMISS_KEY, '1');
        } catch (e) {
            // لو sessionStorage مش متاح (مثلاً وضع التصفح الخفي في بعض المتصفحات)
            // منوقفش الكود، بس ممكن البانر يظهر تاني في نفس الجلسة وده مش خطير
        }
    }

    function wasDismissedThisSession() {
        try {
            return sessionStorage.getItem(DISMISS_KEY) === '1';
        } catch (e) {
            return false;
        }
    }

    function init() {
        registerServiceWorker();

        // لو التطبيق مثبّت بالفعل وشغال standalone، أو المستخدم قفل
        // البانر قبل كده في نفس الجلسة، منعملش حاجة تانية
        if (isRunningStandalone() || wasDismissedThisSession()) {
            return;
        }

        // حالة iOS: مفيش beforeinstallprompt خالص، فبنعرض تعليمات يدوية
        // مباشرة (بعد تأخير بسيط عشان الصفحة تخلص تحميل الأول)
        if (isIosDevice()) {
            setTimeout(() => showBanner({ isIos: true }), 1500);
            return;
        }

        // باقي المتصفحات (Chrome/Edge/Samsung Internet على أندرويد ودسكتوب):
        // بننتظر المتصفح يطلق الحدث ده لما يتأكد إن الموقع قابل للتثبيت
        window.addEventListener('beforeinstallprompt', (event) => {
            // نمنع البانر التلقائي المصغّر اللي المتصفح بيعرضه تحت
            event.preventDefault();
            deferredPrompt = event;
            showBanner({ isIos: false });
        });

        // لو المستخدم ثبّت التطبيق (سواء من بانرنا أو من قائمة المتصفح
        // مباشرة)، نخفي البانر ونعتبره متعامل معاه
        window.addEventListener('appinstalled', () => {
            dismissBanner();
            console.info('تم تثبيت تطبيق Teachers Manager بنجاح.');
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
