/**
 * google-auth.js — v29: الدخول/التسجيل بحساب جوجل بضغطة
 *
 * • زرار "ادخل بحساب جوجل" في صفحة الدخول والتسجيل.
 * • جوجل مابيسمحش بالدخول من المتصفحات اللي جوه التطبيقات (فيسبوك/إنستجرام/تيك توك...):
 *   هناك بنظهر "افتح في Chrome" بدل الزرار عشان المدرس مايشوفش رسالة خطأ من جوجل.
 * • بعد الرجوع من جوجل: لو المدرس جديد بنعمله ملف تلقائي ونوديه للرئيسية يكمّل بياناته.
 */
import { Auth } from './auth.js?v=30';
import { ErrorHandler } from './utils.js?v=30';

const ua = navigator.userAgent || '';
const isIOS = /iphone|ipad|ipod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isAndroid = /android/i.test(ua);

/** المتصفحات اللي جوجل بيرفض الدخول منها (WebView جوه تطبيق) */
export function inAppBrowserName() {
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
        [/MicroMessenger/i, 'وي تشات']
    ];
    for (const [re, name] of list) if (re.test(ua)) return name;
    if (isAndroid && /; wv\)/.test(ua)) return 'التطبيق';
    if (isIOS && !/Safari\//.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS|YaBrowser|DuckDuckGo|GSA\//i.test(ua)) return 'التطبيق';
    return null;
}

const GOOGLE_G = `<svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>`;

function openInChromeUrl() {
    const u = new URL(location.href);
    return `intent://${u.host}${u.pathname}${u.search}#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(u.href)};end`;
}

/**
 * @param {HTMLElement} root  مكان الزرار
 * @param {{ mode?: 'login'|'signup' }} o
 */
export function mountGoogleButton(root, { mode = 'login' } = {}) {
    if (!root) return;
    const label = mode === 'signup' ? 'سجّل بحساب جوجل' : 'ادخل بحساب جوجل';
    const inApp = inAppBrowserName();
    if (inApp) {
        root.innerHTML = `<div class="g-inapp" role="note">
            <b>عايز تدخل بحساب جوجل؟</b>
            <span>جوجل مابيسمحش بالدخول من متصفح ${inApp}. افتح الصفحة في ${isIOS ? 'Safari' : 'Chrome'} وادخل بضغطة.</span>
            <div class="g-inapp-btns">
                ${isAndroid ? `<a class="g-btn g-btn-sm" href="${openInChromeUrl()}">افتح في Chrome</a>` : ''}
                <button type="button" class="g-btn g-btn-sm g-copy">انسخ رابط الصفحة</button>
            </div>
            ${isIOS ? '<small>من زرار ⋯ أو 🧭 فوق اختار "افتح في Safari".</small>' : ''}
        </div>`;
        root.querySelector('.g-copy').addEventListener('click', async () => {
            try { await navigator.clipboard.writeText(location.href); ErrorHandler.showSuccess('اتنسخ الرابط: الصقه في Chrome'); }
            catch (e) { prompt('انسخ الرابط ده وافتحه في المتصفح:', location.href); }
        });
        return;
    }
    root.innerHTML = `<button type="button" class="g-btn" id="g-signin">${GOOGLE_G}<span>${label}</span></button>`;
    const btn = root.querySelector('#g-signin');
    btn.addEventListener('click', async () => {
        if (btn.disabled) return;
        btn.disabled = true;
        btn.querySelector('span').textContent = 'جاري فتح جوجل...';
        try { (window.dataLayer = window.dataLayer || []).push({ event: 'google_signin_click', mode }); } catch (e) { /* تجاهل */ }
        const res = await Auth.signInWithGoogle();
        if (!res.success) {
            ErrorHandler.showError(res.error);
            btn.disabled = false;
            btn.querySelector('span').textContent = label;
        }
        // النجاح = المتصفح بيتنقل لصفحة جوجل
    });
}

/**
 * على صفحة الدخول: لو راجعين من جوجل بنكمّل الدخول.
 * بيرجّع true لو بيتعامل مع رجوع من جوجل (عشان الصفحة ماتعملش حاجة تانية)
 */
export async function handleOAuthReturn({ overlay } = {}) {
    const q = new URLSearchParams(location.search);
    const h = new URLSearchParams(location.hash.replace(/^#/, ''));
    const fromGoogle = q.get('oauth') === 'google' || h.has('access_token') || q.has('code');
    const errDesc = q.get('error_description') || h.get('error_description');
    if (!fromGoogle && !errDesc) return false;
    const clean = () => { try { history.replaceState(null, '', location.pathname); } catch (e) { /* تجاهل */ } };
    if (errDesc) {
        clean();
        ErrorHandler.showError(/access_denied|cancel/i.test(q.get('error') || h.get('error') || '')
            ? 'اتلغى الدخول بجوجل. جرّب تاني أو ادخل بالإيميل.'
            : 'الدخول بجوجل ماكملش. جرّب تاني أو ادخل بالإيميل وكلمة السر.', 7000);
        return false;
    }
    if (overlay) overlay.hidden = false;
    // مكتبة Supabase بتقرا التوكن من الرابط لوحدها: نستنى الجلسة شوية
    let session = null;
    for (let i = 0; i < 25 && !session; i++) {
        try { const { data } = await window.supabaseClient.auth.getSession(); session = data && data.session; } catch (e) { /* تجاهل */ }
        if (!session) await new Promise((r) => setTimeout(r, 300));
    }
    clean();
    if (!session) {
        if (overlay) overlay.hidden = true;
        ErrorHandler.showError('مقدرناش نكمّل الدخول بجوجل. جرّب تاني.', 7000);
        return false;
    }
    const { profile, isNew } = await Auth.finishOAuth(session);
    try { (window.dataLayer = window.dataLayer || []).push({ event: 'login', method: 'google', new_user: !!isNew }); } catch (e) { /* تجاهل */ }
    location.replace(isNew || (profile && !profile.phone) ? 'dashboard.html?welcome=google' : 'dashboard.html');
    return true;
}
