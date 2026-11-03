/**
 * local-reminders.js — v29.5: تذكير الحصص من على الجهاز نفسه (بيشتغل من غير نت)
 *
 * الإشعارات العادية بتيجي من n8n عن طريق OneSignal، ولو النت مقطوع وقتها ممكن تتأخر أو تضيع.
 * هنا البرنامج بيحسب مواعيد النهارده من آخر جدول اتحفظ على الجهاز، وبنفس اختيارات المدرس
 * (قبل الحصة بنص ساعة/ساعة، ووقت الحصة، وبصوت ولا لأ):
 *  - لو البرنامج مفتوح وقت التذكير: بيظهر على الشاشة فورًا (حتى لو مفيش نت)، ولو النت مقطوع كمان إشعار على الموبايل.
 *  - لو ميعاد التذكير فات والنت كان مقطوع أو البرنامج كان مقفول: بيظهر أول ما المدرس يفتح البرنامج
 *    أو النت يرجع، طالما الحصة لسه ماخلصتش ولسه ماتسجلتش.
 * كل تذكير بيظهر مرة واحدة بس.
 */
import { api, OfflineCache } from './api.js?v=34';
import { CONFIG } from './config.js?v=34';

const SCHED_KEY = 'tm_rem_sched_v1';
const SHOWN_KEY = 'tm_rem_shown_v1';
const SCHED_TTL = 3 * 3600 * 1000;
const CHECK_MS = 20000;

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const readJSON = (k, def) => { try { const v = JSON.parse(localStorage.getItem(k) || 'null'); return v == null ? def : v; } catch (e) { return def; } };
const writeJSON = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* تجاهل */ } };
const fmtTime = (hhmm) => {
    const [h, m] = String(hhmm || '').split(':').map((x) => parseInt(x, 10));
    if (!Number.isFinite(h)) return '';
    return `${(h % 12) || 12}:${pad(Number.isFinite(m) ? m : 0)} ${h >= 12 ? 'م' : 'ص'}`;
};
const minutesOf = (hhmm) => { const [h, m] = String(hhmm || '').split(':').map((x) => parseInt(x, 10)); return Number.isFinite(h) ? h * 60 + (m || 0) : null; };

function settings() {
    const c = readJSON('tm_settings_v1', null);
    return (c && c.settings) || null;
}
function schedCache() { return readJSON(SCHED_KEY, null); }

/** مواعيد يوم معيّن من الجدول (نفس قواعد التكرار اللي في n8n) */
export function occurrencesOn(date, cache = schedCache()) {
    if (!cache) return [];
    const d = ymd(date); const dow = date.getDay(); const dom = date.getDate();
    const out = [];
    (cache.schedules || []).forEach((s) => {
        const rt = s.recurrence_type || 'weekly';
        const sd = s.start_date ? String(s.start_date).slice(0, 10) : null;
        const ok = ((rt === 'weekly' || rt === 'daily') && Number(s.day_of_week) === dow && (!sd || sd <= d))
            || (rt === 'monthly' && sd && sd <= d && Number(sd.slice(8, 10)) === dom)
            || (rt === 'none' && sd === d);
        if (ok) out.push({ kind: 'lesson', ref: s.id, owner: s.student_id, title: `حصة ${s.student_name || ''}`.trim(), start: String(s.start_time || '').slice(0, 5), dur: Number(s.duration_minutes) || 45, url: `lesson.html?student_id=${encodeURIComponent(s.student_id)}` });
    });
    (cache.group_schedules || []).forEach((g) => {
        const rt = g.recurrence_type || 'weekly';
        const sd = g.start_date ? String(g.start_date).slice(0, 10) : null;
        const ok = (rt === 'weekly' && Number(g.day_of_week) === dow && (!sd || sd <= d)) || (rt === 'none' && sd === d);
        const name = String(g.group_name || '');
        if (ok) out.push({ kind: 'group', ref: g.id, owner: `group:${g.group_id}`, title: name.startsWith('مجموعة') ? name : `مجموعة ${name}`, start: String(g.start_time || '').slice(0, 5), dur: Number(g.duration_minutes) || 60, url: `group.html?id=${encodeURIComponent(g.group_id)}` });
    });
    // الطالب اللي عنده حصتين في نفس اليوم: كل ميعاد لوحده
    return out.sort((a, b) => (minutesOf(a.start) || 0) - (minutesOf(b.start) || 0));
}

/** حصص النهارده اللي اتسجلت أو اتلغت أو شغالة (من آخر تحميل للرئيسية + الحصة الجارية على الجهاز) */
function handledToday(today) {
    const done = new Set();
    try {
        const live = readJSON('tm_live_lessons', {}) || {};
        Object.keys(live).forEach((k) => done.add(`${k}|*`));
    } catch (e) { /* تجاهل */ }
    try {
        const e = OfflineCache.getEntry(CONFIG.API_ENDPOINTS.LESSONS.GET_TODAY);
        if (e && e.at && ymd(new Date(e.at)) === today && e.data) {
            (e.data.lessons || []).forEach((l) => { if (l.lesson_status) done.add(`${l.student_id}|${String(l.start_time || '').slice(0, 5)}`); });
        }
    } catch (e) { /* تجاهل */ }
    try {
        (readJSON('tm_outbox_v1', []) || []).forEach((it) => { const b = it.body || {}; if (b.student_id) done.add(`${b.student_id}|*`); });
    } catch (e) { /* تجاهل */ }
    return done;
}

function shownMap() {
    const m = readJSON(SHOWN_KEY, {}) || {};
    const cut = Date.now() - 2 * 864e5;
    let changed = false;
    Object.keys(m).forEach((k) => { if (m[k] < cut) { delete m[k]; changed = true; } });
    if (changed) writeJSON(SHOWN_KEY, m);
    return m;
}

/** التذكيرات اللي وقتها جه ولسه ماظهرتش */
export function dueReminders(now = new Date()) {
    const st = settings();
    if (!st || (st.remind_before_minutes == null && !st.remind_at_start)) return [];
    const today = ymd(now);
    const nowMin = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;
    const shown = shownMap();
    const done = handledToday(today);
    const due = [];
    occurrencesOn(now).forEach((o) => {
        const startMin = minutesOf(o.start);
        if (startMin == null) return;
        if (nowMin >= startMin + o.dur) return;                       // الحصة خلصت: مالوش لازمة
        if (done.has(`${o.owner}|*`) || done.has(`${o.owner}|${o.start}`)) return;   // اتسجلت/اتلغت/شغالة
        const types = [];
        if (st.remind_at_start && nowMin >= startMin) types.push('start');
        else if (st.remind_before_minutes != null && nowMin >= startMin - Number(st.remind_before_minutes)) types.push('before');
        types.forEach((t) => {
            const key = `${today}|${o.kind}|${o.ref}|${t}`;
            const keyBefore = `${today}|${o.kind}|${o.ref}|before`;
            if (shown[key]) return;
            if (t === 'start' && shown[keyBefore] && nowMin - startMin > 10) return;   // اتفكّر قبلها والحصة بدأت من بدري
            due.push({ ...o, type: t, key, late: t === 'before' ? nowMin - (startMin - Number(st.remind_before_minutes)) : nowMin - startMin, mins: Number(st.remind_before_minutes) || 0 });
        });
    });
    return due;
}

// ------------------------------------------------------------------ العرض
const STYLE = `
.tm-rem-stack { position: fixed; z-index: 3300; top: calc(10px + env(safe-area-inset-top, 0px)); inset-inline: 0; margin: 0 auto;
  width: min(460px, calc(100vw - 20px)); display: grid; gap: 8px; pointer-events: none; }
.tm-rem { pointer-events: auto; background: #fff; border: 1px solid #E2C27E; border-inline-start: 5px solid #C59A4A; border-radius: 14px;
  box-shadow: 0 10px 30px rgba(41,37,45,0.18); padding: 0.75rem 0.9rem; display: grid; gap: 0.35rem; animation: tm-rem-in .25s ease; }
.tm-rem b { font-size: 0.98rem; color: #4B3A5A; }
.tm-rem p { margin: 0; font-size: 0.86rem; color: #6B6470; line-height: 1.6; }
.tm-rem .tm-rem-acts { display: flex; gap: 0.5rem; margin-top: 0.2rem; }
.tm-rem a, .tm-rem button { border-radius: 10px; padding: 0.45rem 0.9rem; font: inherit; font-size: 0.86rem; font-weight: 700; cursor: pointer; text-decoration: none; min-height: 38px; display: inline-flex; align-items: center; }
.tm-rem a { background: #4B3A5A; color: #fff; border: 0; }
.tm-rem button { background: #F1EDF3; color: #4B3A5A; border: 0; }
@keyframes tm-rem-in { from { opacity: 0; transform: translateY(-8px); } }
`;
function stack() {
    let s = document.getElementById('tm-rem-stack');
    if (s) return s;
    if (!document.getElementById('tm-rem-style')) {
        const st = document.createElement('style'); st.id = 'tm-rem-style'; st.textContent = STYLE; document.head.appendChild(st);
    }
    s = document.createElement('div'); s.id = 'tm-rem-stack'; s.className = 'tm-rem-stack'; s.setAttribute('aria-live', 'assertive');
    document.body.appendChild(s);
    return s;
}
function inWords(m) {
    if (m <= 1) return 'دلوقتي';
    if (m === 60) return 'كمان ساعة';
    if (m === 30) return 'كمان نص ساعة';
    if (m === 120) return 'كمان ساعتين';
    if (m > 60) return `كمان ساعة و${m - 60} دقيقة`;
    return m <= 10 ? `كمان ${m} دقايق` : `كمان ${m} دقيقة`;
}
function textOf(r) {
    // الوقت الفاضل فعلًا (لو التذكير اتأخر عشان النت كان مقطوع، بيقول الصح)
    const now = new Date();
    const left = Math.max(0, Math.round((minutesOf(r.start) || 0) - (now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60)));
    const title = r.type === 'before' ? `⏰ ${r.title} ${inWords(left)}` : `🔔 ميعاد ${r.title} ${r.late > 3 ? `بدأ الساعة ${fmtTime(r.start)}` : 'دلوقتي'}`;
    const body = r.type === 'before' ? `الساعة ${fmtTime(r.start)}. جهّز نفسك 👌` : (r.kind === 'group' ? 'افتح المجموعة وابدأ الحصة.' : 'افتح الحصة وابدأ.');
    return { title, body };
}
async function systemNotify(r, t) {
    try {
        if (!('Notification' in window) || Notification.permission !== 'granted' || !('serviceWorker' in navigator)) return;
        const reg = await navigator.serviceWorker.ready;
        await reg.showNotification(t.title, { body: t.body, tag: r.key, icon: 'assets/icons/icon-192.png', badge: 'assets/icons/favicon-32.png', lang: 'ar', dir: 'rtl', data: { tmLocal: true, url: r.url }, renotify: false });
    } catch (e) { /* تجاهل */ }
}
function show(r) {
    const t = textOf(r);
    const box = document.createElement('div');
    box.className = 'tm-rem';
    box.setAttribute('role', 'alert');
    box.innerHTML = `<b>${esc(t.title)}</b><p>${esc(t.body)}</p>
        <div class="tm-rem-acts"><a href="${esc(r.url)}">${r.kind === 'group' ? 'افتح المجموعة' : 'افتح الحصة'}</a><button type="button">تمام</button></div>`;
    box.querySelector('button').addEventListener('click', () => box.remove());
    stack().appendChild(box);
    setTimeout(() => { if (box.isConnected) box.remove(); }, 10 * 60 * 1000);
    const st = settings();
    if (st && st.remind_sound && document.visibilityState === 'visible') import('./reminder-settings.js?v=34').then((m) => m.playReminderSound()).catch(() => { /* تجاهل */ });
    // من غير نت إشعار n8n مش هيوصل: نطلّع إشعار الموبايل من الجهاز نفسه
    if (navigator.onLine === false || window.__tmNetDown === true) systemNotify(r, t);
}

export function checkNow() {
    try {
        const list = dueReminders();
        if (!list.length) return;
        const m = shownMap();
        // لو فيه أكتر من تذكير لنفس الحصة نعرض الأحدث بس
        list.forEach((r) => { m[r.key] = Date.now(); });
        writeJSON(SHOWN_KEY, m);
        list.slice(0, 3).forEach(show);
    } catch (e) { /* تجاهل */ }
}

// ------------------------------------------------------------------ تحديث الجدول المحفوظ (لما النت شغال)
async function refreshSchedules(force = false) {
    const c = schedCache();
    if (!force && c && Date.now() - c.at < SCHED_TTL) return;
    if (navigator.onLine === false) return;
    try {
        const d = await api.getSchedules();
        if (d && (Array.isArray(d.schedules) || Array.isArray(d.group_schedules))) {
            writeJSON(SCHED_KEY, { at: Date.now(), schedules: d.schedules || [], group_schedules: d.group_schedules || [] });
        }
    } catch (e) { /* مفيش نت: نكمّل بآخر جدول */ }
}
async function refreshSettings() {
    const c = readJSON('tm_settings_v1', null);
    if (c && Date.now() - (c.at || 0) < 6 * 3600 * 1000) return;
    if (navigator.onLine === false) return;
    try { await api.getTeacherSettings(); } catch (e) { /* تجاهل */ }
}

/** هل التذكير المحلي شغال (عشان إشعار OneSignal وهو البرنامج مفتوح مايتكررش) */
export function localRemindersActive() {
    const st = settings(); const c = schedCache();
    return !!(st && c && (st.remind_before_minutes != null || st.remind_at_start) && Date.now() - c.at < 24 * 3600 * 1000);
}

export function initLocalReminders() {
    if (window.__tmLocalReminders) return;
    window.__tmLocalReminders = { active: localRemindersActive, check: checkNow };
    const kick = () => { checkNow(); };
    // أول ما الصفحة تفتح (ولو فيه تذكير فات وقت ما النت كان مقطوع بيظهر هنا)
    setTimeout(kick, 1500);
    setInterval(kick, CHECK_MS);
    window.addEventListener('online', () => { setTimeout(kick, 800); refreshSchedules(); refreshSettings(); });
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') kick(); });
    window.addEventListener('tm:schedules-changed', () => { refreshSchedules(true); });
    window.addEventListener('tm:settings-changed', kick);
    // الجدول والإعدادات بيتحدّثوا في الخلفية (بعد ما الصفحة تخلص تحميل)
    const later = () => setTimeout(() => { refreshSettings(); refreshSchedules().then(kick); }, 3000);
    if (document.readyState === 'complete') later(); else window.addEventListener('load', later, { once: true });
}
