/**
 * sw.js - Service Worker بسيط جدًا (الحد الأدنى المطلوب)
 *
 * ملاحظة مهمة: الهدف الوحيد من هذا الملف هو تلبية شرط "وجود Service Worker
 * يحتوي على معالج fetch" اللي بعض المتصفحات (خصوصًا Chrome على أندرويد)
 * بتطلبه عشان تعتبر الموقع "قابل للتثبيت" (installable) وتفعّل حدث
 * beforeinstallprompt. الملف ده عمدًا مفيش فيه أي كاش (caching) للصفحات
 * أو استدعاءات الـ API، عشان منضمنش إن أي تحديث أو تعديل مستقبلي في
 * الموقع أو في n8n webhooks يفضل "عالق" على نسخة قديمة مخزّنة عند المستخدم.
 * الطلبات بتتنفذ عادي من الشبكة زي ما هي، من غير أي تدخل.
 */

self.addEventListener('install', (event) => {
    // تفعيل الـ Service Worker الجديد فورًا بدون انتظار إغلاق كل التابات القديمة
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    // السيطرة على كل الصفحات المفتوحة فورًا بعد التفعيل
    event.waitUntil(self.clients.claim());
});

// معالج fetch "شفاف" بالكامل: بيمرر كل طلب للشبكة زي ما هو، من غير كاش
// (موجود بس عشان يحقق شرط الـ installability، مش عشان يغيّر سلوك الموقع)
self.addEventListener('fetch', (event) => {
    event.respondWith(fetch(event.request));
});
