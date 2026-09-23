# إعداد استعادة كلمة المرور (Supabase)

الكود في `reset-password.html` و `js/auth.js` بيستخدم استعادة كلمة المرور الحقيقية من Supabase.
عشان الرابط يشتغل لازم الإعدادات دي في لوحة Supabase (مرة واحدة فقط).

## 1) عناوين الموقع (أهم خطوة)
Supabase ← Authentication ← URL Configuration:

- **Site URL**: رابط الموقع الحقيقي، مثال: `https://your-domain.com`
  (لو فاضل على `http://localhost:3000` الإيميل هيبعت رابط مش شغال — ده أشهر سبب للمشكلة)
- **Redirect URLs**: أضف رابط صفحة الاستعادة بالظبط:
  - `https://your-domain.com/reset-password.html`
  - `https://your-domain.com/reset-password` (لو الاستضافة بتشيل `.html` زي Cloudflare Pages)
  - (اختياري للتجربة المحلية) `http://localhost:5500/reset-password.html`

لو الرابط مش موجود في Redirect URLs، Supabase بيرجّع المستخدم على Site URL.
الكود بيتعامل مع الحالة دي ويحوّله تلقائيًا لصفحة الاستعادة، لكن الأفضل تضيفه.

## 2) خادم البريد (SMTP)
Supabase ← Project Settings ← Authentication ← SMTP Settings:

خادم البريد الافتراضي في Supabase معمول للتجربة فقط: عدد رسائل قليل جدًا في الساعة،
وممكن مايبعتش غير لإيميلات أعضاء فريق المشروع. للنشر الحقيقي فعّل **Custom SMTP**
(Resend أو Brevo أو Amazon SES أو SendGrid...) وبعدها ارفع حد الإرسال من
Authentication ← Rate Limits.

## 3) قالب الإيميل (اختياري لكن مُوصى به)
Supabase ← Authentication ← Email Templates ← Reset Password.

القالب الافتراضي بيشتغل مع الكود كما هو. لكن لو عايز الرابط يشتغل حتى لو برنامج
البريد (زي Outlook) فتح الرابط تلقائيًا قبل المستخدم، ويكون فيه رمز احتياطي، استخدم:

```html
<h2>استعادة كلمة المرور - Teachers Manager</h2>
<p>اضغط الرابط لتعيين كلمة مرور جديدة:</p>
<p><a href="{{ .SiteURL }}/reset-password.html?token_hash={{ .TokenHash }}&type=recovery">تعيين كلمة مرور جديدة</a></p>
<p>أو اكتب هذا الرمز في صفحة الاستعادة: <strong>{{ .Token }}</strong></p>
<p>لو ماطلبتش استعادة كلمة المرور تجاهل الرسالة.</p>
```

## كيف يعمل
1. المستخدم يكتب بريده ← `resetPasswordForEmail` يبعت الإيميل (إعادة الإرسال متاحة كل 60 ثانية).
2. الرابط يفتح `reset-password.html` ← يتم التحقق من التوكن (بكل الصيغ: `#access_token`، `?token_hash`، `?code`)
   أو المستخدم يكتب الرمز يدويًا (`verifyOtp`).
3. المستخدم يكتب كلمة مرور جديدة ← `updateUser` ← تسجيل خروج من كل الأجهزة ← صفحة الدخول.
4. الروابط المنتهية أو المستخدمة تُظهر رسالة واضحة وزر لطلب رابط جديد.

## اختبار سريع بعد النشر
- اطلب رابط لإيميل حقيقي ← افتحه من الموبايل ← غيّر كلمة المرور ← سجّل دخول بالجديدة.
- افتح نفس الرابط مرة تانية ← لازم تظهر رسالة "الرابط غير صالح".
- اطلب رابطين ورا بعض بسرعة ← لازم يظهر العداد ورسالة الانتظار.
