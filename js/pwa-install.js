/**
 * pwa-install.js — تثبيت التطبيق على أي متصفح (v27)
 * ========================================================================
 * المشكلة قبل كده: زرار "تثبيت" كان بيظهر بس لما المتصفح يطلق beforeinstallprompt
 * (كروم وإيدج بس تقريبًا). على سامسونج/فايرفوكس/أوبرا/شاومي... ومتصفح فيسبوك
 * وإنستجرام والآيفون كان يا إما مش بيظهر خالص، يا إما مايعملش حاجة.
 *
 * دلوقتي:
 * 1) الزرار بيظهر في كل المتصفحات طول ما التطبيق مش مثبّت
 *    (بانر تحت + زرار "ثبّت التطبيق" في الهيدر والسايدبار والإعدادات).
 * 2) لما المدرس يضغط:
 *    • المتصفح بيدعم التثبيت المباشر (كروم/إيدج/سامسونج/أوبرا/...) → نافذة التثبيت الأصلية على طول.
 *    • مش بيدعمه → شرح بالخطوات مخصوص لمتصفحه (اسم الزرار ومكانه بالظبط).
 *    • متصفح جوه تطبيق (فيسبوك/ماسنجر/إنستجرام/تيك توك/سناب/تليجرام/لينكدإن/...)
 *      مايقدرش يثبّت أصلًا → زرار "افتح في كروم/المتصفح" (أندرويد) أو خطوات "افتح في Safari" (آيفون)
 *      + "انسخ الرابط".
 * 3) واجهة عامة للصفحات: window.tmInstall = { open(), isInstalled(), canPromptNow() }
 *    والحدث 'tm:install-state' بيتبعت لما الحالة تتغير (الزراير بتختفي بعد التثبيت).
 *
 * تسجيل Service Worker (sw.js) فضل زي ما هو: شرط أساسي للتثبيت.
 * ========================================================================
 */
(function () {
    'use strict';

    const DISMISS_KEY = 'tm_install_prompt_dismissed_at';
    const DISMISS_DAYS = 5;
    const INSTALLED_KEY = 'tm_pwa_installed';
    const ua = navigator.userAgent || '';
    let deferredPrompt = null;

    // ------------------------------------------------------------------ البيئة
    function isStandalone() {
        try {
            return window.matchMedia('(display-mode: standalone)').matches
                || window.matchMedia('(display-mode: fullscreen)').matches
                || window.matchMedia('(display-mode: minimal-ui)').matches
                || window.navigator.standalone === true
                || document.referrer.startsWith('android-app://');
        } catch (e) { return false; }
    }
    const isIOS = /iphone|ipad|ipod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const isAndroid = /android/i.test(ua);
    const isMobile = isIOS || isAndroid || /mobile/i.test(ua);

    /** متصفحات جوه التطبيقات: مابتقدرش تثبّت مواقع */
    function detectInApp() {
        const list = [
            [/FBAN|FBAV|FB_IAB|FBIOS|FB4A/i, 'فيسبوك'],
            [/Messenger|MessengerForiOS|MessengerLiteForiOS/i, 'ماسنجر'],
            [/Instagram/i, 'إنستجرام'],
            [/musical_ly|TikTok|BytedanceWebview|trill/i, 'تيك توك'],
            [/Snapchat/i, 'سناب شات'],
            [/Telegram/i, 'تليجرام'],
            [/Line\//i, 'لاين'],
            [/Twitter|TwitterAndroid/i, 'X (تويتر)'],
            [/LinkedInApp/i, 'لينكدإن'],
            [/Pinterest/i, 'بنترست'],
            [/MicroMessenger/i, 'وي تشات'],
            [/GSA\//i, 'تطبيق جوجل'],
            [/WhatsApp/i, 'واتساب']
        ];
        for (const [re, name] of list) if (re.test(ua)) return name;
        // WebView عام على أندرويد (تطبيق فاتح الموقع جواه)
        if (isAndroid && /; wv\)/.test(ua)) return 'التطبيق';
        // WebView على الآيفون: مفيش Safari ولا اسم متصفح معروف
        if (isIOS && !/Safari\//.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS|YaBrowser|DuckDuckGo/i.test(ua)) return 'التطبيق';
        return null;
    }
    function detectBrowser() {
        if (/SamsungBrowser/i.test(ua)) return 'samsung';
        if (/EdgA|EdgiOS|Edg\//i.test(ua)) return 'edge';
        if (/OPR\/|OPiOS|OPT\/|Opera/i.test(ua)) return 'opera';
        if (/Firefox|FxiOS/i.test(ua)) return 'firefox';
        if (/MiuiBrowser|XiaoMi/i.test(ua)) return 'miui';
        if (/HuaweiBrowser|HuaweiHiBrowser/i.test(ua)) return 'huawei';
        if (/UCBrowser/i.test(ua)) return 'uc';
        if (/YaBrowser/i.test(ua)) return 'yandex';
        if (/HeyTapBrowser|OppoBrowser|VivoBrowser/i.test(ua)) return 'oem';
        if (/DuckDuckGo/i.test(ua)) return 'ddg';
        if (navigator.brave) return 'brave';
        if (/CriOS/i.test(ua)) return 'chrome';
        if (/Chrome\//i.test(ua)) return 'chrome';
        if (/Safari\//i.test(ua)) return 'safari';
        return 'other';
    }
    const inApp = detectInApp();
    const browser = detectBrowser();

    // ------------------------------------------------------------------ Service Worker
    function registerServiceWorker() {
        if (!('serviceWorker' in navigator)) return;
        navigator.serviceWorker.register('sw.js').catch((err) => console.warn('تعذّر تسجيل Service Worker:', err));
    }

    // ------------------------------------------------------------------ الحالة
    function isInstalled() {
        if (isStandalone()) return true;
        return false;
    }
    function track(event, extra) {
        try { (window.dataLayer = window.dataLayer || []).push(Object.assign({ event, pwa_browser: inApp ? 'inapp' : browser }, extra || {})); } catch (e) { /* تجاهل */ }
        try { if (window.tmTrack) window.tmTrack(event, Object.assign({ browser: inApp ? 'inapp' : browser }, extra || {})); } catch (e) { /* تجاهل */ }
    }
    function emitState() {
        try { window.dispatchEvent(new CustomEvent('tm:install-state', { detail: { installed: isInstalled(), canPrompt: !!deferredPrompt } })); } catch (e) { /* تجاهل */ }
    }

    // ------------------------------------------------------------------ روابط الفتح في متصفح تاني
    const pageUrl = () => {
        // نفتح الصفحة الرئيسية للبرنامج (بعد الدخول بتروح للوحة التحكم) — نفس الصفحة الحالية أوضح للمدرس
        const u = new URL(window.location.href);
        u.searchParams.delete('fbclid');
        return u.toString();
    };
    function androidIntent(pkg) {
        const u = new URL(pageUrl());
        const scheme = u.protocol.replace(':', '');
        const rest = u.href.replace(/^https?:\/\//, '');
        const fallback = encodeURIComponent(u.href);
        return `intent://${rest}#Intent;scheme=${scheme};${pkg ? `package=${pkg};` : ''}S.browser_fallback_url=${fallback};end`;
    }
    async function copyLink() {
        const url = pageUrl();
        try {
            await navigator.clipboard.writeText(url);
            toast('اتنسخ الرابط. افتح كروم (أو أي متصفح) والصقه في خانة العنوان.');
        } catch (e) {
            window.prompt('انسخ الرابط ده وافتحه في المتصفح:', url);
        }
    }
    function toast(msg) {
        let t = document.getElementById('tm-install-toast');
        if (!t) {
            t = document.createElement('div');
            t.id = 'tm-install-toast';
            document.body.appendChild(t);
        }
        t.textContent = msg;
        t.classList.add('show');
        clearTimeout(t._h);
        t._h = setTimeout(() => t.classList.remove('show'), 4500);
    }

    // ------------------------------------------------------------------ الشرح لكل متصفح
    const B = (t) => `<b>${t}</b>`;
    function stepsFor() {
        // متصفح جوه تطبيق
        if (inApp) {
            if (isIOS) {
                return {
                    title: `افتح الموقع في Safari الأول`,
                    lead: `متصفح ${inApp} مايقدرش يثبّت التطبيق. افتحه في Safari وثبّته من هناك (دقيقة واحدة):`,
                    steps: [
                        `اضغط على ${B('⋯')} أو ${B('النقط التلاتة')} أو أيقونة ${B('البوصلة 🧭')} (فوق أو تحت الشاشة).`,
                        `اختار ${B('Open in Safari')} أو ${B('فتح في Safari')} أو ${B('Open in browser')}.`,
                        `في Safari: اضغط زرار المشاركة ${B('⬆️')} ← ${B('إضافة إلى الشاشة الرئيسية')} ← ${B('إضافة')}.`
                    ],
                    actions: ['copy']
                };
            }
            return {
                title: 'افتح الموقع في كروم الأول',
                lead: `متصفح ${inApp} مايقدرش يثبّت التطبيق. اضغط الزرار تحت وهيفتح في كروم، وثبّته من هناك:`,
                steps: [
                    `اضغط ${B('افتح في كروم')} (أو ${B('افتح في متصفح تاني')}).`,
                    `لو مااتفتحش: اضغط ${B('⋮')} فوق على الشمال ← ${B('فتح في المتصفح')} / ${B('Open in Chrome')}.`,
                    `في كروم هيظهر زرار ${B('ثبّت التطبيق')}.`
                ],
                actions: ['chrome', 'browser', 'copy']
            };
        }
        if (isIOS) {
            if (browser === 'safari') {
                return {
                    title: 'ثبّت التطبيق على الآيفون',
                    lead: 'الآيفون مافيهوش زرار تثبيت مباشر، الخطوات دي بتاخد ثواني:',
                    steps: [
                        `اضغط زرار المشاركة ${B('⬆️')} ${navigator.maxTouchPoints > 1 && /Macintosh|iPad/.test(ua) ? '(فوق جنب العنوان)' : '(تحت في نص الشاشة)'}.`,
                        `انزل شوية واختار ${B('إضافة إلى الشاشة الرئيسية')} (Add to Home Screen).`,
                        `اضغط ${B('إضافة')}. الأيقونة هتظهر على الشاشة زي أي تطبيق.`
                    ],
                    actions: []
                };
            }
            // كروم/إيدج/فايرفوكس على الآيفون (iOS 16.4 وأحدث بيدعموا الإضافة للشاشة الرئيسية)
            return {
                title: 'ثبّت التطبيق على الآيفون',
                lead: 'من المتصفح ده:',
                steps: [
                    `اضغط زرار المشاركة ${B('⬆️')} (في شريط العنوان${browser === 'firefox' ? ' أو من قايمة ☰' : ''}).`,
                    `اختار ${B('إضافة إلى الشاشة الرئيسية')} (Add to Home Screen) ← ${B('إضافة')}.`,
                    `لو مش لاقيها: افتح الموقع في ${B('Safari')} واعمل نفس الخطوات.`
                ],
                actions: ['copy']
            };
        }
        // أندرويد / كمبيوتر
        const menu = {
            samsung: { where: `زرار القايمة ${B('☰')} تحت على اليمين`, item: `${B('إضافة صفحة إلى')} ← ${B('الشاشة الرئيسية')}`, alt: `أو أيقونة ${B('⬇')} في شريط العنوان لو ظاهرة` },
            firefox: { where: `زرار ${B('⋮')} (فوق أو تحت)`, item: `${B('تثبيت')} أو ${B('إضافة إلى الشاشة الرئيسية')}` },
            opera: { where: `زرار ${B('⋮')} أو أيقونة أوبرا ${B('O')}`, item: `${B('إضافة إلى…')} ← ${B('الشاشة الرئيسية')}` },
            edge: { where: `زرار ${B('…')} تحت في النص`, item: `${B('إضافة إلى الهاتف')} أو ${B('تثبيت')}` },
            miui: { where: `زرار القايمة ${B('☰')} أو ${B('⋮')}`, item: `${B('إضافة إلى الشاشة الرئيسية')}` },
            huawei: { where: `زرار القايمة ${B('☰')}`, item: `${B('إضافة إلى الشاشة الرئيسية')} أو ${B('اختصار')}` },
            uc: { where: `زرار القايمة ${B('☰')} تحت`, item: `${B('إضافة إلى الشاشة الرئيسية')} (لو مش موجودة افتح في كروم)` },
            yandex: { where: `زرار ${B('⋮')}`, item: `${B('إضافة إلى الشاشة الرئيسية')}` },
            oem: { where: `زرار القايمة ${B('☰')} أو ${B('⋮')}`, item: `${B('إضافة إلى الشاشة الرئيسية')}` },
            brave: { where: `زرار ${B('⋮')}`, item: `${B('تثبيت التطبيق')} أو ${B('إضافة إلى الشاشة الرئيسية')}` },
            ddg: { where: `زرار ${B('⋮')}`, item: `${B('إضافة إلى الشاشة الرئيسية')}` },
            chrome: { where: `زرار ${B('⋮')} فوق على الشمال`, item: `${B('تثبيت التطبيق')} أو ${B('إضافة إلى الشاشة الرئيسية')}` },
            other: { where: `قايمة المتصفح (${B('⋮')} أو ${B('☰')})`, item: `${B('إضافة إلى الشاشة الرئيسية')} أو ${B('تثبيت')}` }
        }[browser] || null;

        if (!isMobile) {
            if (browser === 'safari') {
                return { title: 'ثبّت التطبيق على الماك', lead: 'في Safari (macOS Sonoma وأحدث):',
                    steps: [`من القايمة فوق اختار ${B('ملف')} (File) ← ${B('إضافة إلى Dock')} (Add to Dock).`, `اضغط ${B('إضافة')}.`], actions: ['copy'] };
            }
            if (browser === 'firefox') {
                return { title: 'التثبيت محتاج كروم أو إيدج', lead: 'فايرفوكس على الكمبيوتر مابيثبّتش المواقع كتطبيقات.',
                    steps: [`افتح الموقع في ${B('Google Chrome')} أو ${B('Microsoft Edge')}.`, `اضغط أيقونة التثبيت ${B('⊕')} في آخر شريط العنوان ← ${B('تثبيت')}.`], actions: ['copy'] };
            }
            return { title: 'ثبّت التطبيق على الكمبيوتر', lead: 'هيفتح في شباك لوحده وتلاقيه في قايمة البرامج:',
                steps: [`اضغط أيقونة التثبيت ${B('⊕')} أو ${B('🖥️⬇')} في آخر شريط العنوان.`, `أو من القايمة ${B('⋮')} ← ${B('حفظ ومشاركة')} ← ${B('تثبيت الصفحة كتطبيق')} / ${B('تثبيت Teachers Manager')}.`, `اضغط ${B('تثبيت')}.`], actions: ['copy'] };
        }
        const steps = [
            `اضغط ${menu.where}.`,
            `اختار ${menu.item}.`,
            `اضغط ${B('إضافة')} أو ${B('تثبيت')} للتأكيد.${menu.alt ? ` (${menu.alt})` : ''}`
        ];
        const actions = (browser === 'chrome' || browser === 'brave') ? ['copy'] : ['chrome', 'copy'];
        if (browser !== 'chrome') steps.push(`لو مش لاقي الاختيار ده: افتح الموقع في ${B('كروم')} من الزرار تحت.`);
        return { title: 'ثبّت التطبيق على الموبايل', lead: 'من المتصفح ده بالخطوات دي:', steps, actions };
    }

    // ------------------------------------------------------------------ الواجهة
    const STYLE = `
        #tm-install-banner{position:fixed;inset-inline:0;bottom:0;z-index:900;display:flex;align-items:center;gap:.75rem;background:var(--card-bg,#fff);
            border-top:1px solid var(--border,#E7E1E8);box-shadow:0 -4px 16px rgba(0,0,0,.08);padding:.8rem 1rem calc(.8rem + env(safe-area-inset-bottom,0px));
            font-family:'IBM Plex Sans Arabic',Tahoma,Arial,sans-serif;direction:rtl;animation:tm-slide-up .3s ease-out}
        @media (max-width:900px){body:has(.sidebar) #tm-install-banner{bottom:calc(62px + env(safe-area-inset-bottom,0px));padding-bottom:.8rem}}
        @keyframes tm-slide-up{from{transform:translateY(100%);opacity:0}to{transform:translateY(0);opacity:1}}
        #tm-install-banner .tm-icon{width:44px;height:44px;border-radius:12px;flex-shrink:0;object-fit:cover;background:#fff;border:1px solid var(--border,#E7E1E8)}
        #tm-install-banner .tm-text{flex:1;min-width:0}
        #tm-install-banner .tm-title{font-weight:700;font-size:.9rem;color:var(--text-primary,#29252D);margin:0 0 .15rem}
        #tm-install-banner .tm-desc{font-size:.78rem;color:var(--text-secondary,#716A74);margin:0;line-height:1.45}
        #tm-install-banner .tm-actions{display:flex;align-items:center;gap:.4rem;flex-shrink:0}
        .tm-ib-btn{background:var(--primary,#4B3A5A);color:#fff;border:0;border-radius:10px;padding:.55rem .95rem;font:inherit;font-size:.85rem;font-weight:700;cursor:pointer;white-space:nowrap;min-height:42px}
        .tm-ib-btn:hover{background:var(--primary-hover,#3F304D)}
        .tm-ib-x{background:transparent;color:var(--text-secondary,#716A74);border:0;font-size:1.1rem;line-height:1;cursor:pointer;padding:.5rem;min-width:40px;min-height:40px}
        #tm-install-sheet{position:fixed;inset:0;z-index:10050;background:rgba(41,37,45,.5);display:flex;align-items:flex-end;justify-content:center;direction:rtl;font-family:inherit}
        #tm-install-sheet[hidden]{display:none}
        .tm-is-card{background:var(--card-bg,#fff);width:100%;max-width:480px;border-radius:20px 20px 0 0;padding:1.2rem 1.2rem calc(1.2rem + env(safe-area-inset-bottom,0px));
            box-shadow:0 -10px 40px rgba(0,0,0,.25);max-height:90vh;overflow-y:auto;animation:tm-slide-up .25s ease-out}
        @media (min-width:700px){#tm-install-sheet{align-items:center}.tm-is-card{border-radius:20px}}
        .tm-is-head{display:flex;align-items:center;gap:.75rem;margin-bottom:.6rem}
        .tm-is-head img{width:52px;height:52px;border-radius:14px;border:1px solid var(--border,#E7E1E8);background:#fff}
        .tm-is-head h3{margin:0;font-size:1.05rem;color:var(--text-primary,#29252D)}
        .tm-is-head p{margin:.15rem 0 0;font-size:.82rem;color:var(--text-secondary,#716A74)}
        .tm-is-lead{font-size:.9rem;color:var(--text-primary,#29252D);margin:.3rem 0 .6rem;line-height:1.7}
        .tm-is-steps{list-style:none;margin:0 0 1rem;padding:0;counter-reset:s}
        .tm-is-steps li{counter-increment:s;position:relative;padding:.55rem 2.4rem .55rem .4rem;font-size:.9rem;line-height:1.75;color:var(--text-primary,#29252D);border-bottom:1px dashed var(--border,#E7E1E8)}
        .tm-is-steps li:last-child{border-bottom:0}
        .tm-is-steps li::before{content:counter(s);position:absolute;right:0;top:.55rem;width:1.75rem;height:1.75rem;border-radius:50%;background:#EEE9F3;color:var(--primary,#4B3A5A);font-weight:800;display:flex;align-items:center;justify-content:center;font-size:.85rem}
        .tm-is-steps b{color:var(--primary,#4B3A5A)}
        .tm-is-actions{display:flex;flex-direction:column;gap:.5rem}
        .tm-is-actions a,.tm-is-actions button{display:flex;align-items:center;justify-content:center;gap:.4rem;min-height:48px;border-radius:12px;font:inherit;font-weight:700;font-size:.95rem;cursor:pointer;text-decoration:none}
        .tm-is-primary{background:var(--primary,#4B3A5A);color:#fff;border:0}
        .tm-is-sec{background:var(--card-bg,#fff);color:var(--primary,#4B3A5A);border:1px solid var(--secondary-btn-border,#CFC4D8)}
        .tm-is-close{background:transparent;border:0;color:var(--text-secondary,#716A74);margin-top:.2rem}
        .tm-is-why{font-size:.8rem;color:var(--text-secondary,#716A74);background:var(--bg-secondary,#F5F3F0);border-radius:12px;padding:.6rem .75rem;margin-bottom:.9rem;line-height:1.7}
        #tm-install-toast{position:fixed;left:50%;bottom:calc(90px + env(safe-area-inset-bottom,0px));transform:translateX(-50%) translateY(20px);background:#29252D;color:#fff;
            padding:.7rem 1rem;border-radius:12px;font-size:.88rem;z-index:10060;opacity:0;pointer-events:none;transition:all .25s;max-width:calc(100vw - 32px);text-align:center;line-height:1.6}
        #tm-install-toast.show{opacity:1;transform:translateX(-50%) translateY(0)}
        @media (max-width:420px){#tm-install-banner .tm-desc{font-size:.74rem}}
    `;
    function ensureStyle() {
        if (document.getElementById('tm-install-style')) return;
        const st = document.createElement('style');
        st.id = 'tm-install-style';
        st.textContent = STYLE;
        document.head.appendChild(st);
    }

    function bannerText() {
        if (inApp) return isIOS ? 'افتحه في Safari وثبّته على الشاشة الرئيسية.' : 'افتحه في كروم وثبّته على الموبايل بضغطة.';
        if (deferredPrompt) return 'افتحه بضغطة من الشاشة الرئيسية ويوصلك تنبيه بحصص كل يوم.';
        return 'خليه على الشاشة الرئيسية زي أي تطبيق، ويوصلك تنبيه بحصص كل يوم.';
    }
    function buildBanner() {
        if (document.getElementById('tm-install-banner')) return;
        ensureStyle();
        const banner = document.createElement('div');
        banner.id = 'tm-install-banner';
        banner.setAttribute('role', 'region');
        banner.setAttribute('aria-label', 'تثبيت التطبيق');
        banner.innerHTML = `
            <img class="tm-icon" src="assets/icons/icon-192.png" alt="">
            <div class="tm-text">
                <p class="tm-title">ثبّت تطبيق Teachers Manager</p>
                <p class="tm-desc">${bannerText()}</p>
            </div>
            <div class="tm-actions">
                <button type="button" class="tm-ib-btn" id="tm-install-btn">${inApp ? (isIOS ? 'إزاي؟' : 'افتح في كروم') : 'تثبيت'}</button>
                <button type="button" class="tm-ib-x" id="tm-dismiss-btn" aria-label="إغلاق">✕</button>
            </div>`;
        document.body.appendChild(banner);
        document.getElementById('tm-dismiss-btn').addEventListener('click', () => { dismissBanner(); track('pwa_banner_dismissed'); });
        document.getElementById('tm-install-btn').addEventListener('click', () => {
            track('pwa_banner_click');
            // متصفح جوه تطبيق على أندرويد: نفتح كروم على طول
            if (inApp && isAndroid) { window.location.href = androidIntent('com.android.chrome'); setTimeout(() => openSheet(), 1200); return; }
            install();
        });
    }
    function hideBanner() { const b = document.getElementById('tm-install-banner'); if (b) b.remove(); }
    function dismissBanner() {
        hideBanner();
        try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch (e) { /* تجاهل */ }
    }
    function wasDismissedRecently() {
        try {
            const t = Number(localStorage.getItem(DISMISS_KEY) || 0);
            return t > 0 && (Date.now() - t) < DISMISS_DAYS * 86400000;
        } catch (e) { return false; }
    }

    function openSheet() {
        ensureStyle();
        let sheet = document.getElementById('tm-install-sheet');
        if (!sheet) {
            sheet = document.createElement('div');
            sheet.id = 'tm-install-sheet';
            sheet.setAttribute('role', 'dialog');
            sheet.setAttribute('aria-modal', 'true');
            sheet.setAttribute('aria-label', 'تثبيت التطبيق');
            document.body.appendChild(sheet);
            sheet.addEventListener('click', (e) => {
                if (e.target === sheet || e.target.closest('[data-is="close"]')) { sheet.hidden = true; return; }
                const a = e.target.closest('[data-is]');
                if (!a) return;
                const act = a.dataset.is;
                if (act === 'copy') { e.preventDefault(); copyLink(); track('pwa_copy_link'); }
                if (act === 'chrome' || act === 'browser') track('pwa_open_external', { target: act });
                if (act === 'prompt') { e.preventDefault(); sheet.hidden = true; install(); }
            });
            document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !sheet.hidden) sheet.hidden = true; });
        }
        const info = stepsFor();
        const acts = [];
        if (deferredPrompt) acts.push('<button type="button" class="tm-is-primary" data-is="prompt">📲 ثبّت دلوقتي</button>');
        if (isAndroid && info.actions.includes('chrome')) acts.push(`<a class="${acts.length ? 'tm-is-sec' : 'tm-is-primary'}" data-is="chrome" href="${androidIntent('com.android.chrome')}">افتح في كروم</a>`);
        if (isAndroid && info.actions.includes('browser')) acts.push(`<a class="tm-is-sec" data-is="browser" href="${androidIntent('')}">افتح في متصفح تاني</a>`);
        if (info.actions.includes('copy')) acts.push('<button type="button" class="tm-is-sec" data-is="copy">📋 انسخ رابط الموقع</button>');
        sheet.innerHTML = `
            <div class="tm-is-card">
                <div class="tm-is-head">
                    <img src="assets/icons/icon-192.png" alt="">
                    <div><h3>${info.title}</h3><p>Teachers Manager على شاشتك الرئيسية</p></div>
                </div>
                <div class="tm-is-why">✓ يفتح بضغطة زي أي تطبيق &nbsp; ✓ تنبيه بحصص كل يوم &nbsp; ✓ من غير متجر ومن غير مساحة كبيرة</div>
                <p class="tm-is-lead">${info.lead}</p>
                <ol class="tm-is-steps">${info.steps.map((s) => `<li>${s}</li>`).join('')}</ol>
                <div class="tm-is-actions">
                    ${acts.join('')}
                    <button type="button" class="tm-is-close" data-is="close">بعدين</button>
                </div>
            </div>`;
        sheet.hidden = false;
        track('pwa_sheet_open');
    }

    /** الضغط على أي زرار "ثبّت التطبيق" */
    async function install() {
        if (isInstalled()) { toast('التطبيق متثبّت بالفعل على الجهاز ده 👍'); return; }
        if (deferredPrompt) {
            const ev = deferredPrompt;
            deferredPrompt = null;
            try {
                ev.prompt();
                const choice = await ev.userChoice;
                track('pwa_prompt_result', { outcome: choice && choice.outcome });
                if (choice && choice.outcome === 'accepted') { hideBanner(); return; }
            } catch (e) {
                openSheet();
                return;
            }
            emitState();
            return;
        }
        openSheet();
    }

    // ------------------------------------------------------------------ متى البانر يظهر
    function isAuthPage() {
        return /\/(signup|login|reset-password)(\.html)?$/.test(window.location.pathname);
    }
    function maybeShowBanner() {
        if (isInstalled() || wasDismissedRecently() || isAuthPage()) return;
        // الكمبيوتر: البانر بس لو المتصفح جاهز للتثبيت المباشر (الزرار في السايدبار والإعدادات موجود دايمًا)
        if (!isMobile && !deferredPrompt) return;
        buildBanner();
    }

    function init() {
        registerServiceWorker();
        window.tmInstall = {
            open: install,
            showHelp: openSheet,
            isInstalled,
            canPromptNow: () => !!deferredPrompt,
            browser: inApp ? 'inapp' : browser
        };
        if (isInstalled()) {
            try { localStorage.setItem(INSTALLED_KEY, '1'); } catch (e) { /* تجاهل */ }
            emitState();
            return;
        }
        window.addEventListener('appinstalled', () => {
            deferredPrompt = null;
            hideBanner();
            const sh = document.getElementById('tm-install-sheet');
            if (sh) sh.hidden = true;
            try { localStorage.setItem(INSTALLED_KEY, '1'); } catch (e) { /* تجاهل */ }
            track('pwa_installed');
            toast('اتثبّت التطبيق ✓ هتلاقيه على الشاشة الرئيسية');
            emitState();
        });
        // مهلة صغيرة عشان مايغطيش أول تحميل للصفحة
        setTimeout(maybeShowBanner, 1800);
        emitState();
    }

    // بنسمع للحدث فورًا (قبل DOMContentLoaded) عشان مايفوتناش لو المتصفح بعته بدري
    let ready = false;
    window.addEventListener('beforeinstallprompt', (event) => {
        event.preventDefault();
        deferredPrompt = event;
        emitState();
        if (!ready) return;
        const b = document.getElementById('tm-install-banner');
        if (b) { const d = b.querySelector('.tm-desc'); if (d) d.textContent = bannerText(); }
        else maybeShowBanner();
    });
    const start = () => { ready = true; init(); };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
    else start();
})();
