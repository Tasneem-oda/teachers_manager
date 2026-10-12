/**
 * track.js - تتبع استخدام البرنامج (عشان نعرف المدرسين بيستخدموا إيه، وبيقفوا فين، وإيه اللي بيضايقهم)
 *
 * كل حدث بيروح لمكانين:
 *   1) Google Tag Manager (dataLayer) زي ما هو.
 *   2) قاعدتنا (n8n/track-events.json ← جدول teachers_manager.app_events) مربوط بالمدرس،
 *      عشان نقدر نسأل أسئلة زي: "مين بطّل يفتح البرنامج؟" و"أنهي ميزة محدش بيستخدمها؟".
 *
 * الخصوصية: مابنبعتش أي نص كتبه المدرس، ولا أسماء طلاب، ولا أرقام. أسماء أحداث + أرقام وأنواع بس.
 *
 * التلقائي (من غير ما حد يكتب كود):
 *   page_view / page_leave (المدة اللي الصفحة فضلت ظاهرة + أبعد نقطة نزلها)،
 *   ui_click (ضغطات الأزرار اللي ليها id أو data-track)، rage_click (ضغط متكرر بعصبية على نفس الحاجة)،
 *   js_error، error_shown (رسالة خطأ ظهرت للمدرس)، api_slow / api_error، session_start،
 *   وأي event بيتعمله push في dataLayer في أي مكان في البرنامج.
 */

import { CONFIG } from './config.js?v=21';
import { APIUtils } from './utils.js?v=21';

const QUEUE_KEY = 'tm_track_queue_v1';
const SESSION_KEY = 'tm_track_session';
const MAX_BATCH = 25;
const FLUSH_MS = 15000;
const PROP_LIMIT = 1500;

let token = null;
let queue = [];
let flushTimer = null;
let installed = false;
let sending = false;

const pageName = () => {
    const p = (location.pathname.split('/').pop() || 'index').replace(/\.html$/, '') || 'index';
    return p.slice(0, 40);
};
const device = () => {
    const w = window.innerWidth || 0;
    return w < 600 ? 'mobile' : (w < 1024 ? 'tablet' : 'desktop');
};
const standalone = () => {
    try { return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true; } catch (e) { return false; }
};

function sessionId() {
    try {
        let s = sessionStorage.getItem(SESSION_KEY);
        if (!s) {
            s = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
            sessionStorage.setItem(SESSION_KEY, s);
            sessionStorage.setItem(SESSION_KEY + '_new', '1');
        }
        return s;
    } catch (e) { return 'nosession'; }
}

/** بنشيل أي قيمة ممكن تكون نص حر (أسماء/محتوى): أرقام وقيم قصيرة بس */
function cleanProps(props) {
    const out = {};
    Object.entries(props || {}).forEach(([k, v]) => {
        if (k === 'event' || k.startsWith('gtm')) return;
        if (v == null) return;
        if (typeof v === 'number' || typeof v === 'boolean') out[k] = v;
        else if (typeof v === 'string') out[k] = v.slice(0, 80);
    });
    const json = JSON.stringify(out);
    return json.length > PROP_LIMIT ? { truncated: true } : out;
}

function persist() {
    try { localStorage.setItem(QUEUE_KEY, JSON.stringify(queue.slice(-200))); } catch (e) { /* تجاهل */ }
}
function restore() {
    try { queue = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]') || []; } catch (e) { queue = []; }
    if (!Array.isArray(queue)) queue = [];
}

async function refreshToken() {
    try {
        if (!window.supabaseClient) return;
        const { data } = await window.supabaseClient.auth.getSession();
        token = data && data.session ? data.session.access_token : null;
    } catch (e) { /* تجاهل */ }
}

function endpoint() {
    try { return APIUtils.buildUrl(CONFIG.API_ENDPOINTS.TRACKING.EVENTS); } catch (e) { return null; }
}

async function flush({ beacon = false } = {}) {
    if (!queue.length || (sending && !beacon)) return;
    const url = endpoint();
    if (!url) return;
    if (!token) await refreshToken();
    if (!token) return;   // لسه مش مسجّل دخول: الأحداث تستنى في الطابور
    // بنشيل الدفعة من الطابور قبل الإرسال (عشان طلبين في نفس اللحظة مايبعتوش نفس الأحداث مرتين)
    // ولو الإرسال فشل بنرجّعها
    const batch = queue.splice(0, MAX_BATCH);
    persist();
    const body = JSON.stringify({ events: batch });
    sending = true;
    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body,
            keepalive: beacon && body.length < 60000
        });
        // 404 = الـ workflow لسه متستوردش، 400 = دفعة مرفوضة: مانكدّسش الأحداث للأبد
        if (!(res.ok || res.status === 404 || res.status === 400)) {
            if (res.status === 401) token = null;
            queue = batch.concat(queue);
            persist();
        }
    } catch (e) {
        // النت مقطوع: الأحداث ترجع للطابور وتتبعت بعدين
        queue = batch.concat(queue);
        persist();
    } finally {
        sending = false;
    }
    if (!beacon && queue.length >= MAX_BATCH) setTimeout(() => flush(), 1000);
}

function schedule() {
    if (flushTimer) return;
    flushTimer = setTimeout(() => { flushTimer = null; flush(); }, FLUSH_MS);
}

/** تسجيل حدث. props = أرقام وقيم قصيرة بس (مفيش نص كتبه المدرس) */
export function track(event, props = {}, { gtm = true } = {}) {
    if (!event || typeof event !== 'string') return;
    const name = event.replace(/[^a-z0-9_]/gi, '_').slice(0, 50).toLowerCase();
    if (gtm) {
        try { (window.dataLayer = window.dataLayer || []).push({ event: name, ...props, __tm_mirrored: true }); } catch (e) { /* تجاهل */ }
    }
    queue.push({
        e: name,
        p: pageName(),
        props: cleanProps(props),
        s: sessionId(),
        d: device(),
        t: new Date().toISOString()
    });
    if (queue.length > 300) queue = queue.slice(-300);
    persist();
    if (queue.length >= MAX_BATCH) flush(); else schedule();
}

// ------------------------------------------------------------------ التلقائي
function mirrorDataLayer() {
    // أي push في dataLayer من أي مكان في البرنامج (lesson_saved، ai_request، ...) بيتسجل عندنا كمان
    const dl = (window.dataLayer = window.dataLayer || []);
    const orig = dl.push;
    dl.push = function (...args) {
        args.forEach((a) => {
            if (a && typeof a === 'object' && typeof a.event === 'string' && !a.__tm_mirrored && !/^gtm\./.test(a.event)) {
                track(a.event, a, { gtm: false });
            }
        });
        return orig.apply(this, args);
    };
}

function trackPageTime() {
    let visibleMs = 0;
    let since = document.visibilityState === 'visible' ? Date.now() : null;
    let maxScroll = 0;
    let sent = false;
    const onScroll = () => {
        const h = document.documentElement;
        const total = Math.max(1, h.scrollHeight - h.clientHeight);
        maxScroll = Math.max(maxScroll, Math.min(100, Math.round((h.scrollTop / total) * 100)));
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') {
            if (since) { visibleMs += Date.now() - since; since = null; }
            flush({ beacon: true });
        } else {
            since = Date.now();
        }
    });
    window.addEventListener('pagehide', () => {
        if (sent) return;
        sent = true;
        if (since) { visibleMs += Date.now() - since; since = null; }
        track('page_leave', { seconds: Math.round(visibleMs / 1000), scroll_pct: maxScroll }, { gtm: false });
        flush({ beacon: true });
    });
}

function trackClicks() {
    let last = { key: '', n: 0, t: 0 };
    document.addEventListener('click', (e) => {
        const el = e.target && e.target.closest ? e.target.closest('[data-track], button, a, [role="button"]') : null;
        if (!el) return;
        const key = el.getAttribute('data-track') || el.id || '';
        // ضغط متكرر بسرعة على نفس الحاجة = المدرس متضايق ومش فاهم ليه مفيش حاجة بتحصل
        const sig = key || `${el.tagName}.${(el.className || '').toString().split(' ')[0]}`;
        const now = Date.now();
        if (sig === last.key && now - last.t < 1200) { last.n++; } else { last = { key: sig, n: 1, t: now }; }
        last.t = now;
        if (last.n === 3) track('rage_click', { target: sig.slice(0, 60) }, { gtm: false });
        if (key) track('ui_click', { target: key.slice(0, 60) }, { gtm: false });
    }, true);
}

function trackErrors() {
    window.addEventListener('error', (e) => {
        if (!e || !e.message) return;
        track('js_error', { msg: String(e.message).slice(0, 80), src: String(e.filename || '').split('/').pop().slice(0, 40), line: e.lineno || 0 }, { gtm: false });
    });
    window.addEventListener('unhandledrejection', (e) => {
        const r = e && e.reason;
        const msg = r && (r.message || (r.error && r.error.code) || String(r));
        track('js_error', { msg: String(msg || 'promise').slice(0, 80), kind: 'promise' }, { gtm: false });
    });
    // رسالة خطأ ظهرت للمدرس (ErrorHandler.showError)
    window.addEventListener('tm:error-shown', (e) => track('error_shown', { msg: String(e.detail || '').slice(0, 80) }, { gtm: false }));
}

/** api.js بيبلّغ هنا: الطلبات البطيئة والفاشلة (عشان نعرف المدرس استنى فين وزهق) */
export function trackApi(endpointPath, ms, error) {
    const ep = String(endpointPath || '').split('?')[0].slice(0, 40);
    if (error) {
        const code = (error.error && error.error.code) || error.status || 'ERR';
        if (code === 'ABORTED' || code === 'READ_ONLY') return;
        track('api_error', { endpoint: ep, code: String(code).slice(0, 30), ms: Math.round(ms) }, { gtm: false });
    } else if (ms > 4000) {
        track('api_slow', { endpoint: ep, ms: Math.round(ms) }, { gtm: false });
    }
}

/** تشغيل التتبع (مرة واحدة في كل صفحة) */
export function initTracking() {
    if (installed || typeof window === 'undefined') return;
    installed = true;
    restore();
    sessionId();
    mirrorDataLayer();
    trackClicks();
    trackErrors();
    trackPageTime();
    window.__tmTrackApi = trackApi;
    let isNew = false;
    try { isNew = sessionStorage.getItem(SESSION_KEY + '_new') === '1'; sessionStorage.removeItem(SESSION_KEY + '_new'); } catch (e) { /* تجاهل */ }
    if (isNew) {
        track('session_start', {
            standalone: standalone(),
            source: new URLSearchParams(location.search).get('source') || '',
            online: navigator.onLine !== false,
            conn: (navigator.connection && navigator.connection.effectiveType) || ''
        }, { gtm: false });
    }
    track('page_view', { standalone: standalone() }, { gtm: false });
    refreshToken().then(() => flush());
    window.addEventListener('online', () => flush());
}

window.tmTrack = track;
