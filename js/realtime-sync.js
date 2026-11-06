/**
 * realtime-sync.js — v31: مزامنة لحظية مضمونة بين أجهزة نفس المدرس + كاش آمن
 *
 * الفكرة: في قاعدة البيانات عدّاد صغير لكل مدرس (public.tm_sync.version) بيزيد لوحده (Trigger)
 * مع أي تغيير في الطلاب/الحصص/المواعيد/المجموعات/الدفع… مهما كان مصدره (لابتوب، موبايل، n8n).
 *
 *  1) لحظي: الجهاز مشترك في تغييرات العدّاد ده (Supabase Realtime) ← أي تغيير يوصل خلال ثانية.
 *  2) احتياطي: إشارة Broadcast من الجهاز اللي حفظ (لو Realtime على الجداول مش متاح).
 *  3) مضمون: أول ما البرنامج يظهر/يرجع النت/كل 20 ثانية لو القناة واقعة، بنقرا رقم العدّاد
 *     (طلب صغير جدًا لـ Supabase مش لـ n8n). لو اتغيّر ← الصفحة تتحدّث.
 *
 * والكاش: البيانات المحفوظة على الجهاز مختومة برقم العدّاد. طول ما الرقم ماتغيّرش الكاش صالح
 * (لحد 10 دقايق) فالتنقل بين الصفحات فوري، وأول ما الرقم يتغيّر الكاش بيتمسح.
 */
import { storedSession, getFreshSession } from './session.js?v=39';

const TAB = Math.random().toString(36).slice(2, 10);
const V_KEY = 'tm_sync_v';            // {uid, v, at} آخر رقم معروف (مشترك بين التابات)
const CHECK_KEY = 'tm_sync_checked';  // آخر مرة اتأكدنا من الرقم (ms)

let channel = null;
let joined = false;
let uid = null;
let hideTimer = null;
let pollTimer = null;
let started = false;
let lastSent = 0;
let pendingKind = null;
let restBroken = false;
let fireTimer = null;
let checking = null;

function userId() {
    const s = storedSession();
    return (s && s.user && s.user.id) || null;
}
const lsGet = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* تجاهل */ } };

/** رقم العدّاد المعروف حاليًا (null = لسه مانعرفش) */
export function currentSyncVersion() {
    try {
        const o = JSON.parse(lsGet(V_KEY) || 'null');
        const me = userId();
        return o && me && o.uid === me && o.v != null ? String(o.v) : null;
    } catch (e) { return null; }
}

/** هل نقدر نثق في الكاش؟ (القناة شغالة، أو اتأكدنا من الرقم من أقل من 45 ثانية من أي تابة) */
export function syncTrusted() {
    if (joined) return true;
    const at = Number(lsGet(CHECK_KEY) || 0);
    return at > 0 && Date.now() - at < 45000;
}

function fireRemote(kind) {
    // تجميع: كذا تغيير ورا بعض (حصة مجموعة = صف لكل طالب) = تحديث واحد
    clearTimeout(fireTimer);
    fireTimer = setTimeout(() => {
        try { window.dispatchEvent(new CustomEvent('tm:cache-invalidate')); } catch (e) { /* تجاهل */ }
        try { window.dispatchEvent(new CustomEvent('tm:remote-change', { detail: { kind } })); } catch (e) { /* تجاهل */ }
    }, 350);
}

/** رقم جديد وصل (من Realtime أو من الفحص) */
function onVersion(v, kind, source) {
    if (v == null) return null;
    const me = userId();
    if (!me) return null;
    const prev = currentSyncVersion();
    lsSet(V_KEY, JSON.stringify({ uid: me, v: String(v), at: Date.now() }));
    lsSet(CHECK_KEY, String(Date.now()));
    if (prev === null) {
        // أول مرة نعرف الرقم: البيانات اللي اتحمّلت قبل كده مالهاش ختم، فبنختمها بالرقم ده بس لو جديدة
        try { window.dispatchEvent(new CustomEvent('tm:sync-version', { detail: { v: String(v), first: true } })); } catch (e) { /* تجاهل */ }
        return 'first';
    }
    if (String(v) === prev) return 'same';
    // أي رقم جديد = تحديث (حتى لو الجهاز ده لسه حافظ حاجة: ممكن جهاز تاني حفظ في نفس اللحظة،
    // فمابنفترضش إن التغيير "بتاعنا" — تحميل زيادة مرة أحسن من بيانات ناقصة)
    fireRemote(kind || source || 'data');
    return 'changed';
}

/** فحص سريع لرقم العدّاد من Supabase مباشرة (مش n8n) */
export async function checkNow() {
    if (restBroken || checking) return checking;
    const client = window.supabaseClient;
    const me = userId();
    if (!client || !me || typeof client.from !== 'function') return null;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return null;
    checking = (async () => {
        try {
            await getFreshSession().catch(() => null);
            const { data, error } = await client.from('tm_sync').select('version,kind').eq('teacher_id', me).maybeSingle();
            if (error) {
                // الجدول لسه ماتعملش (ملف SQL ماتشغلش): نعتمد على Broadcast + التحديث الدوري
                if (/relation|does not exist|schema cache|not found|404|42P01|PGRST/i.test(`${error.code || ''} ${error.message || ''}`)) restBroken = true;
                return null;
            }
            window.__tmSyncOk = true;
            return onVersion(data ? data.version : 0, data && data.kind, 'check');
        } catch (e) { return null; } finally { checking = null; }
    })();
    return checking;
}

async function connect() {
    const client = window.supabaseClient;
    if (!client || typeof client.channel !== 'function') return;
    uid = userId();
    if (!uid || channel) return;
    try {
        // توكن صالح للقناة (Realtime بيطبّق صلاحيات الجدول: كل مدرس يشوف عدّاده بس)
        const s = await getFreshSession().catch(() => null);
        if (s && client.realtime && typeof client.realtime.setAuth === 'function') { try { client.realtime.setAuth(s.access_token); } catch (e) { /* تجاهل */ } }
        if (channel) return;
        channel = client.channel(`tm-sync-${uid}`, { config: { broadcast: { self: false, ack: false } } });
        channel.on('broadcast', { event: 'changed' }, (msg) => {
            const p = (msg && msg.payload) || {};
            if (p.tab === TAB) return;
            if (p.v != null) onVersion(p.v, p.kind, 'broadcast');
            else fireRemote(p.kind || 'broadcast');
        });
        if (!restBroken) {
            channel.on('postgres_changes', { event: '*', schema: 'public', table: 'tm_sync', filter: `teacher_id=eq.${uid}` }, (payload) => {
                const row = (payload && (payload.new || payload.record)) || {};
                if (row.version != null) onVersion(row.version, row.kind, 'realtime');
            });
        }
        channel.subscribe((status) => {
            joined = status === 'SUBSCRIBED';
            window.__tmRealtime = joined;
            if (joined) {
                // ممكن يكون حصل تغيير وإحنا مش متصلين: نتأكد مرة
                checkNow();
                let stored = null;
                try { stored = localStorage.getItem('tm_rt_pending'); localStorage.removeItem('tm_rt_pending'); } catch (e) { /* تجاهل */ }
                const k = pendingKind || stored;
                pendingKind = null;
                if (k) send(k);
            }
            if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
                const wasMine = channel;
                disconnect();
                // إعادة محاولة بعد شوية (لو الصفحة ظاهرة)
                if (wasMine && status !== 'CLOSED') setTimeout(() => { if (document.visibilityState === 'visible') connect(); }, 15000);
            }
        });
    } catch (e) { channel = null; joined = false; }
}

function disconnect() {
    joined = false;
    window.__tmRealtime = false;
    const ch = channel;
    channel = null;
    if (ch) { try { window.supabaseClient.removeChannel(ch); } catch (e) { /* تجاهل */ } }
}

function send(kind) {
    if (!channel || !joined) {
        pendingKind = kind;
        try { localStorage.setItem('tm_rt_pending', String(kind || 'data').slice(0, 60)); } catch (e) { /* تجاهل */ }
        return;
    }
    const now = Date.now();
    if (now - lastSent < 400) { setTimeout(() => send(kind), 450); return; }
    lastSent = now;
    try { channel.send({ type: 'broadcast', event: 'changed', payload: { kind: String(kind || 'data').slice(0, 60), tab: TAB, at: now } }); } catch (e) { /* تجاهل */ }
}

function schedulePoll() {
    clearTimeout(pollTimer);
    // القناة شغالة: فحص كل دقيقة كضمان. واقعة: كل 20 ثانية
    const every = joined ? 60000 : 20000;
    pollTimer = setTimeout(() => {
        if (document.visibilityState === 'visible') checkNow();
        schedulePoll();
    }, every);
}

export function initRealtimeSync() {
    if (started || typeof window === 'undefined') return;
    started = true;
    // js/auto-refresh.js بيسأل هنا الأول لما المدرس يرجع للبرنامج: "فيه تغيير؟" بدل ما يحمّل كل حاجة
    window.__tmSyncCheck = checkNow;
    // حفظ حصل في التابة دي (js/auto-refresh.js announceChange)
    window.addEventListener('tm:local-change', (e) => send(e && e.detail));
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') {
            clearTimeout(hideTimer);
            hideTimer = setTimeout(disconnect, 60 * 1000);
        } else {
            clearTimeout(hideTimer);
            checkNow();     // أول ما المدرس يفتح البرنامج: نعرف فورًا لو حاجة اتغيرت
            connect();
        }
    });
    window.addEventListener('focus', () => checkNow());
    window.addEventListener('online', () => { disconnect(); checkNow(); setTimeout(connect, 1200); });
    window.addEventListener('pagehide', disconnect);
    window.addEventListener('pageshow', (e) => { if (e.persisted) { checkNow(); setTimeout(connect, 300); } });
    // فحص سريع بعد التحميل، وبعده القناة اللحظية
    setTimeout(checkNow, 600);
    setTimeout(connect, 1200);
    schedulePoll();
}
