/**
 * session.js — v30: الجلسة الصح دايمًا (حتى لو ساعة الموبايل غلط)
 *
 * المشكلة اللي كانت بتعمل "Unauthorized" كتير في n8n:
 *  - مكتبة Supabase بتقرر "التوكن خلص ولا لأ" بساعة الموبايل. لو الساعة متأخرة (أو المنطقة الزمنية غلط
 *    زي ما بيحصل مع التوقيت الصيفي في مصر) بتبعت توكن منتهي، والسيرفر بيرفضه.
 *  - البرنامج لما يرجع من الخلفية (واتساب/Zoom) أول طلب كان بيطلع بتوكن قديم.
 *
 * الحل:
 *  - بنقرا وقت انتهاء التوكن من التوكن نفسه (بساعة السيرفر) ونقارنه بالوقت الحقيقي (js/server-time.js).
 *  - لو فاضل أقل من دقيقتين بنجدّده قبل الطلب. ولو السيرفر رد 401 بنجدّد ونعيد الطلب مرة واحدة.
 *  - طلب تجديد واحد بس في نفس الوقت (حتى لو 5 طلبات طلعت مع بعض).
 * الملف ده خفيف ومابيستوردش غير server-time.js.
 */
import { nowMs } from './server-time.js?v=39';

const REF = 'qdpnupgqvjxlrmwwgmij';
const STORE_KEY = `sb-${REF}-auth-token`;
const MARGIN_MS = 2 * 60 * 1000;

function b64json(part) {
    try {
        const s = part.replace(/-/g, '+').replace(/_/g, '/');
        const pad = s.length % 4 ? '='.repeat(4 - (s.length % 4)) : '';
        const bin = atob(s + pad);
        let txt = bin;
        try { txt = decodeURIComponent(bin.split('').map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join('')); } catch (e) { /* ASCII */ }
        return JSON.parse(txt);
    } catch (e) { return null; }
}

/** وقت انتهاء التوكن بالملّي ثانية (من التوكن نفسه = ساعة السيرفر) */
export function tokenExpMs(token) {
    if (!token || typeof token !== 'string') return 0;
    const p = b64json(token.split('.')[1] || '');
    return p && p.exp ? Number(p.exp) * 1000 : 0;
}

/** الجلسة المحفوظة على الجهاز (من غير ما نلمس أقفال مكتبة Supabase) */
export function storedSession() {
    try {
        const raw = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
        const s = raw && (raw.currentSession || raw);
        return s && s.access_token ? s : null;
    } catch (e) { return null; }
}

const isNetErr = (err) => !!err && /fetch|network|retryable|timeout|load failed|failed to fetch|abort/i.test(`${err.name || ''} ${err.message || ''} ${err.status === 0 ? 'network' : ''}`);

let refreshing = null;
async function refreshNow() {
    if (refreshing) return refreshing;
    refreshing = (async () => {
        const client = window.supabaseClient;
        if (!client) throw { error: { code: 'NETWORK', message: 'الصفحة ماتحمّلتش كاملة. حمّلها تاني.' } };
        let res;
        try { res = await client.auth.refreshSession(); } catch (e) { res = { data: null, error: e }; }
        const session = res && res.data ? res.data.session : null;
        if (session && session.access_token) return session;
        const err = res ? res.error : null;
        if (isNetErr(err) || (typeof navigator !== 'undefined' && navigator.onLine === false)) {
            throw { error: { code: 'NETWORK', message: 'تعذّر الاتصال بالخادم. تأكد من اتصالك بالإنترنت وحاول مرة أخرى.' } };
        }
        // تاب تانية جدّدت في نفس اللحظة: التوكن الجديد بقى محفوظ
        const s2 = storedSession();
        if (s2 && tokenExpMs(s2.access_token) - nowMs() > 30000) return s2;
        return null;   // الجلسة انتهت فعلًا (اتسجّل خروج من جهاز تاني / كلمة السر اتغيرت)
    })();
    try { return await refreshing; } finally { refreshing = null; }
}

/**
 * جلسة صالحة للطلبات.
 * @param {{force?: boolean}} [o] force = جدّد حتى لو التوكن لسه صالح (بعد رد 401 من السيرفر)
 * @returns {Promise<object|null>} null = لازم تسجيل دخول تاني. بيرمي {error:{code:'NETWORK'}} لو النت هو المشكلة.
 */
export async function getFreshSession({ force = false, rejected = null } = {}) {
    let s = storedSession();
    if (!s && window.supabaseClient) {
        try { const r = await window.supabaseClient.auth.getSession(); s = r && r.data ? r.data.session : null; } catch (e) { s = null; }
        if (!s) return null;
    }
    if (!s) return null;
    const left = tokenExpMs(s.access_token) - nowMs();
    if (!force && left > MARGIN_MS) return s;
    // السيرفر رفض توكن قديم، بس طلب تاني جدّده في نفس اللحظة: نستخدم الجديد من غير تجديد تاني
    if (force && rejected && s.access_token !== rejected && left > 30000) return s;
    try {
        const fresh = await refreshNow();
        return fresh;
    } catch (err) {
        // من غير نت: لو التوكن الحالي لسه صالح نكمّل بيه
        if (!force && left > 5000) return s;
        throw err;
    }
}
