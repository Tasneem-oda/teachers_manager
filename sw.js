/**
 * sw.js - Service Worker موحّد (تثبيت PWA + إشعارات OneSignal Push)
 *
 * ============================================================================
 * ملاحظة مهمة جدًا - سبب دمج الملفين في ملف واحد (هذا هو إصلاح مشكلة
 * "الإشعارات اليومية مش بتظهر إلا لو فاتح التطبيق"):
 * ------------------------------------------------------------------------
 * كان عندنا قبل كده ملفين Service Worker منفصلين يسجّلهما كودين مختلفين،
 * وكلاهما بيحاول يتحكم في نفس الـ scope (جذر الموقع "/"):
 *   1) هذا الملف (sw.js) - كان بيتسجل من js/pwa-install.js في كل تحميل صفحة،
 *      وبيستخدم self.skipWaiting() + self.clients.claim() عشان ياخد السيطرة فورًا.
 *   2) OneSignalSDKWorker.js - كان بيتسجل تلقائيًا بواسطة SDK بتاع OneSignal
 *      (بمجرد ما OneSignal.init() بيتنفذ)، وهو اللي فيه فعليًا معالج حدث
 *      'push' اللي بيعرض الإشعار على الشاشة.
 *
 * المتصفح مسموحله يكون عنده Service Worker واحد بس نشط لكل scope. لما ملفين
 * مختلفين يسجلوا لنفس الـ scope، اللي بيسجل/يتفعّل تاني (وهنا كان sw.js بسبب
 * skipWaiting/clients.claim العدوانيين وتسجيله المتكرر في كل صفحة) بيستبدل
 * التاني ويشيل تسجيله بالكامل - وده بيلغي الـ Push Subscription المرتبط
 * بـ OneSignalSDKWorker.js تلقائيًا. النتيجة: n8n كان يبعت الإشعار فعليًا
 * كل يوم عبر REST API بتاع OneSignal (وده كان بيظهر "delivered" في لوحة
 * تحكم OneSignal)، لكن مفيش أي Service Worker عنده معالج 'push' فعّال
 * ليستقبله ويعرضه على الشاشة - فالإشعار كان بيختفي بصمت من غير أي خطأ ظاهر.
 * وده كان بيتكرر بالذات مع المستخدمين اللي مثبّتين التطبيق على شاشة الهاتف،
 * لأنهم بيفتحوا التطبيق (وبالتالي يسجّلوا sw.js من جديد) في أيام مختلفة،
 * فكل مرة كان بيمسح تسجيل OneSignal وترتبط الإشعارات به.
 *
 * الحل: دمج كود OneSignal جوه نفس ملف sw.js (عن طريق importScripts) بدل
 * ما يكون في ملف منفصل، مع تعديل js/notifications.js عشان يقول لـ OneSignal
 * "استخدم sw.js نفسه" (عبر serviceWorkerPath) بدل ما تسجّل ملفها الخاص.
 * كده بقى عندنا تسجيل واحد بس لنفس الملف ونفس الـ scope - مفيش تعارض ولا
 * استبدال، ومعالج 'push' بتاع OneSignal (جوه السطر التالي) بيفضل شغال
 * باستمرار حتى لو التطبيق مقفول تمامًا. (مرجع رسمي: توثيق OneSignal
 * "Using an Existing Service Worker" - نفس الأسلوب الموصى به لأي موقع
 * عنده Service Worker خاص به بالفعل.)
 * ============================================================================
 */
// v29.5: لو مكتبة OneSignal ماتحمّلتش (النت/حاجب إعلانات) الـ Service Worker يفضل شغال (الكاش والفتح من غير نت)
try { importScripts('https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.sw.js'); } catch (e) { /* الإشعارات بس اللي هتقف لحد التحديث الجاي */ }

/**
 * v29.5: كاش ذكي عشان التنقل يبقى فوري والبرنامج يفتح من غير نت
 * ------------------------------------------------------------------
 * - ملفات js/css/الأيقونات: كلها بتتنادى برقم نسخة (?v=..)، فبنحفظها ونرجّعها من الجهاز على طول
 *   (أي تحديث بيغيّر رقم النسخة = ملف جديد، فمفيش حاجة بتفضل "عالقة").
 * - الصفحات (html): بنعرض آخر نسخة محفوظة فورًا ونجيب الجديدة من النت في الخلفية للمرة الجاية
 *   (لو مفيش نسخة محفوظة بنجيبها من النت عادي، ولو مفيش نت خالص بنعرض رسالة "مفيش نت").
 * - طلبات n8n و Supabase مابتعديش على الكاش هنا خالص (الكود في js/api.js هو اللي بيتعامل معاها).
 */
const STATIC_CACHE = 'tm-static-v1';
const PAGE_CACHE = 'tm-pages-v1';
const KEEP = [STATIC_CACHE, PAGE_CACHE];

const OFFLINE_HTML = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>مفيش نت</title>
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#FAF9F6;font-family:Tahoma,Arial,sans-serif;color:#29252D;text-align:center;padding:24px}
.c{max-width:360px}h1{font-size:1.3rem;color:#4B3A5A}p{color:#6B6470;line-height:1.8}button{background:#4B3A5A;color:#fff;border:0;border-radius:12px;padding:12px 26px;font:inherit;font-size:1rem;cursor:pointer}</style></head>
<body><div class="c"><h1>📶 مفيش اتصال بالإنترنت</h1><p>اتأكد من الواي فاي أو الباقة وجرّب تاني. كل بياناتك محفوظة، والحصة الجارية (لو فيه) لسه شغالة.</p><button onclick="location.reload()">جرّب تاني</button></div></body></html>`;

self.addEventListener('install', () => {
    // تفعيل الـ Service Worker الجديد فورًا بدون انتظار إغلاق كل التابات القديمة
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil((async () => {
        // طلب الصفحة بيبدأ على طول من غير ما يستنى الـ Service Worker "يصحى" (أسرع على الموبايل)
        try { if (self.registration.navigationPreload) await self.registration.navigationPreload.enable(); } catch (e) { /* متصفح قديم */ }
        try { for (const k of await caches.keys()) if (k.startsWith('tm-') && !KEEP.includes(k)) await caches.delete(k); } catch (e) { /* تجاهل */ }
        await self.clients.claim();
    })());
});

// ملفات ثابتة: من نفس الموقع (js/css/assets) أو مكتبات بنسخة ثابتة (supabase-js@2.45.4، خطوط جوجل)
function isStatic(url) {
    if (url.origin === self.location.origin) return /^\/(js|css|assets)\//.test(url.pathname) && (url.pathname.startsWith('/assets/') || url.search.includes('v='));
    if (url.hostname === 'cdn.jsdelivr.net') return /@\d+\.\d+\.\d+/.test(url.pathname);
    return url.hostname === 'fonts.gstatic.com';
}

async function staticFirst(req) {
    const cache = await caches.open(STATIC_CACHE);
    const hit = await cache.match(req);
    if (hit) return hit;
    const res = await fetch(req);
    if (res && (res.ok || res.type === 'opaque')) { try { await cache.put(req, res.clone()); } catch (e) { /* التخزين مليان */ } }
    return res;
}

// مفتاح الصفحة من غير ?student_id=... (نفس الصفحة لكل الطلاب)
const pageKey = (url) => new Request(new URL(url.pathname, self.location.origin).href);
// Cloudflare ممكن يحوّل /dashboard.html لـ /dashboard: لو ده بيحصل بنطلب /dashboard على طول (لفة أقل على النت)
let htmlRedirects = null;
const cleanPath = (url) => url.pathname.replace(/\/index\.html$/, '/').replace(/\.html$/, '') + url.search;
// المتصفح مابيقبلش صفحة "جاية من تحويل" من الكاش، فبنعمل نسخة نضيفة منها
async function plain(res) {
    if (!res || !res.redirected) return res;
    return new Response(await res.blob(), { status: res.status, statusText: res.statusText, headers: res.headers });
}

async function fetchPage(event, url) {
    const isHtml = url.pathname.endsWith('.html');
    let pre = null;
    try { pre = await event.preloadResponse; } catch (e) { pre = null; }
    if (pre && pre.ok && !pre.redirected) return pre;
    if (pre && pre.type === 'opaqueredirect' && isHtml) htmlRedirects = true;
    if (htmlRedirects === true && isHtml) {
        const r = await fetch(cleanPath(url), { credentials: 'same-origin' });
        if (r.ok) return plain(r);
    }
    if (pre) return pre;
    const r = await fetch(event.request);
    if (isHtml && r.type === 'opaqueredirect') {
        htmlRedirects = true;
        const r2 = await fetch(cleanPath(url), { credentials: 'same-origin' });
        if (r2.ok) return plain(r2);
    }
    return r;
}

async function navigate(event) {
    const url = new URL(event.request.url);
    const cache = await caches.open(PAGE_CACHE);
    const key = pageKey(url);
    const cached = await cache.match(key);
    const network = fetchPage(event, url).then(async (res) => {
        if (res && res.ok && !res.redirected && (res.type === 'basic' || res.type === 'default')) { try { await cache.put(key, res.clone()); } catch (e) { /* تجاهل */ } }
        return res;
    });
    if (cached) {
        event.waitUntil(network.catch(() => { /* مفيش نت: النسخة المحفوظة كفاية */ }));
        return cached;
    }
    try { return await network; } catch (e) {
        return new Response(OFFLINE_HTML, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    }
}

self.addEventListener('fetch', (event) => {
    const req = event.request;
    if (req.method !== 'GET') return;
    let url;
    try { url = new URL(req.url); } catch (e) { return; }
    if (req.mode === 'navigate') {
        if (url.origin !== self.location.origin) return;
        event.respondWith(navigate(event));
        return;
    }
    if (isStatic(url)) event.respondWith(staticFirst(req).catch(() => fetch(req)));
    // الباقي (n8n، Supabase، OneSignal، جوجل) بيروح للشبكة عادي من غير تدخل
});

// الصفحة بتقول للـ Service Worker "خزّن الصفحات دي" (بعد ما تفتح أول مرة) عشان التنقل بينها يبقى فوري حتى أول مرة
self.addEventListener('message', (event) => {
    const d = event.data || {};
    if (d.type !== 'tm:warm' || !Array.isArray(d.pages)) return;
    event.waitUntil((async () => {
        const cache = await caches.open(PAGE_CACHE);
        for (const p of d.pages.slice(0, 15)) {
            try {
                const url = new URL(p, self.location.origin);
                if (url.origin !== self.location.origin) continue;
                const key = pageKey(url);
                if (await cache.match(key)) continue;
                const res = await plain(await fetch(url.href, { credentials: 'same-origin' }));
                if (res.ok && res.type !== 'opaque') await cache.put(key, res);
            } catch (e) { /* تجاهل */ }
        }
    })());
});

// v29.5: الضغط على تذكير طلّعه البرنامج نفسه وهو من غير نت (js/local-reminders.js)
self.addEventListener('notificationclick', (event) => {
    const data = (event.notification && event.notification.data) || {};
    if (!data.tmLocal) return;   // إشعارات OneSignal ليها معالجها الخاص
    event.notification.close();
    const target = new URL(data.url || 'dashboard.html', self.location.origin).href;
    event.waitUntil((async () => {
        const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
        for (const w of wins) {
            if (w.url.startsWith(self.location.origin)) { try { await w.focus(); return w.navigate(target); } catch (e) { /* نجرب نفتح جديد */ } }
        }
        return self.clients.openWindow(target);
    })());
});
