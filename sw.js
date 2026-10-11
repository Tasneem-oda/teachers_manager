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
importScripts('https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.sw.js');

/**
 * الجزء التالي هو الكود الأصلي لملف sw.js: الحد الأدنى المطلوب عشان الموقع
 * يبقى "قابل للتثبيت" (installable) في أغلب المتصفحات. عمدًا مفيش فيه أي
 * كاش (caching) للصفحات أو استدعاءات الـ API، عشان منضمنش إن أي تحديث أو
 * تعديل مستقبلي في الموقع أو في n8n webhooks يفضل "عالق" على نسخة قديمة
 * مخزّنة عند المستخدم. الطلبات بتتنفذ عادي من الشبكة زي ما هي، من غير أي
 * تدخل. الكود ده وكود OneSignal (اللي اتضاف فوق بـ importScripts) بيشتغلوا
 * مع بعض بدون تعارض، لأن كل واحد بيستخدم addEventListener (مش استبدال
 * مباشر لمعالج واحد)، فكل الأحداث بتوصل لكل المستمعين المسجّلين.
 */

self.addEventListener('install', (event) => {
    // تفعيل الـ Service Worker الجديد فورًا بدون انتظار إغلاق كل التابات القديمة
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    // السيطرة على كل الصفحات المفتوحة فورًا بعد التفعيل
    event.waitUntil(self.clients.claim());
});

// بنتدخّل في فتح الصفحات بس (مش طلبات n8n ولا الصور ولا المكتبات): لو مفيش نت خالص
// المدرس يشوف رسالة عربي واضحة بدل صفحة المتصفح "No internet". مفيش أي كاش.
const OFFLINE_HTML = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>مفيش نت</title>
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#FAF9F6;font-family:Tahoma,Arial,sans-serif;color:#29252D;text-align:center;padding:24px}
.c{max-width:360px}h1{font-size:1.3rem;color:#4B3A5A}p{color:#6B6470;line-height:1.8}button{background:#4B3A5A;color:#fff;border:0;border-radius:12px;padding:12px 26px;font:inherit;font-size:1rem;cursor:pointer}</style></head>
<body><div class="c"><h1>📶 مفيش اتصال بالإنترنت</h1><p>اتأكد من الواي فاي أو الباقة وجرّب تاني. كل بياناتك محفوظة، والحصة الجارية (لو فيه) لسه شغالة.</p><button onclick="location.reload()">جرّب تاني</button></div></body></html>`;

self.addEventListener('fetch', (event) => {
    const req = event.request;
    if (req.mode !== 'navigate' || req.method !== 'GET') return;   // الباقي يروح للشبكة عادي من غير تدخل
    event.respondWith(fetch(req).catch(() => new Response(OFFLINE_HTML, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })));
});
