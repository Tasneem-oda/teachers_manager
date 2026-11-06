/**
 * realtime-sync.js — v30: مزامنة لحظية بين أجهزة نفس المدرس
 *
 * قبل كده: لو المدرس سجّل حصة على اللابتوب، الموبايل كان بيعرف بعد دقيقتين (أو لما يرجع للبرنامج).
 * دلوقتي: أي حفظ بيبعت إشارة صغيرة على قناة خاصة بالمدرس (Supabase Realtime Broadcast)،
 * والأجهزة التانية المفتوحة بتحدّث بياناتها خلال ثانية.
 *  - الإشارة مافيهاش أي بيانات (بس "فيه تغيير")، والبيانات نفسها بتيجي من n8n زي العادي.
 *  - القناة بتتقفل لما البرنامج يستخبى أكتر من دقيقة (توفير بطارية واتصالات)، وبترجع أول ما يظهر.
 *  - لو Realtime مش متاح لأي سبب: البرنامج بيرجع للتحديث كل دقيقتين زي ما كان، من غير أي رسالة.
 */
import { storedSession } from './session.js?v=38';

const TAB = Math.random().toString(36).slice(2, 10);
let channel = null;
let joined = false;
let uid = null;
let hideTimer = null;
let started = false;
let lastSent = 0;
let pendingKind = null;

function userId() {
    const s = storedSession();
    return (s && s.user && s.user.id) || null;
}

function connect() {
    const client = window.supabaseClient;
    if (!client || typeof client.channel !== 'function') return;
    uid = userId();
    if (!uid || channel) return;
    try {
        channel = client.channel(`tm-sync-${uid}`, { config: { broadcast: { self: false, ack: false } } });
        channel.on('broadcast', { event: 'changed' }, (msg) => {
            const p = (msg && msg.payload) || {};
            if (p.tab === TAB) return;
            try { window.dispatchEvent(new CustomEvent('tm:cache-invalidate')); } catch (e) { /* تجاهل */ }
            try { window.dispatchEvent(new CustomEvent('tm:remote-change', { detail: p })); } catch (e) { /* تجاهل */ }
        });
        channel.subscribe((status) => {
            joined = status === 'SUBSCRIBED';
            window.__tmRealtime = joined;
            if (joined) {
                // حفظ حصل قبل ما الصفحة تتقفل وماتبعتش: نبعته دلوقتي
                let stored = null;
                try { stored = localStorage.getItem('tm_rt_pending'); localStorage.removeItem('tm_rt_pending'); } catch (e) { /* تجاهل */ }
                const k = pendingKind || stored;
                pendingKind = null;
                if (k) send(k);
            }
            if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
                // Realtime مش متاح دلوقتي: نقفل ونرجع للتحديث الدوري
                disconnect();
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

export function initRealtimeSync() {
    if (started || typeof window === 'undefined') return;
    started = true;
    // حفظ حصل في التابة دي (js/auto-refresh.js announceChange) ← نبلّغ باقي الأجهزة
    window.addEventListener('tm:local-change', (e) => send(e && e.detail));
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') {
            clearTimeout(hideTimer);
            hideTimer = setTimeout(disconnect, 60 * 1000);
        } else {
            clearTimeout(hideTimer);
            connect();
        }
    });
    window.addEventListener('online', () => { disconnect(); setTimeout(connect, 1200); });
    window.addEventListener('pagehide', disconnect);
    window.addEventListener('pageshow', (e) => { if (e.persisted) setTimeout(connect, 300); });
    // بعد تحميل الصفحة بشوية (مانأخرش أول عرض)
    setTimeout(connect, 1500);
}
