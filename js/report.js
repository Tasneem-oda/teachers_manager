/**
 * report.js - تقرير الشهر لولي الأمر (رسالة واتساب جاهزة)
 *
 * بيتبني بالكامل من سجل حصص الطالب الموجود (مفيش workflow جديد):
 * الحضور والغياب، مستوى الحفظ/التلاوة/المراجعة، الواجبات، اللي خلصناه، والخطة الجاية.
 */

import { ErrorHandler } from './utils.js?v=29';
import { icon } from './icons.js?v=29';
import { lessonDay, ratingFieldLabels, ratingLabel, normalizeLesson } from './lesson-utils.js?v=29';
import { whatsappUrl, recipientChooser } from './billing.js?v=29';
import { CONFIG } from './config.js?v=29';

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function monthStart(offset = 0, now = new Date()) {
    return new Date(now.getFullYear(), now.getMonth() + offset, 1);
}

function monthLabel(d) {
    try { return d.toLocaleDateString('ar-EG-u-nu-latn', { month: 'long', year: 'numeric' }); } catch (e) { return `${d.getMonth() + 1}/${d.getFullYear()}`; }
}

function inMonth(lesson, start) {
    const d = lessonDay(lesson.lesson_date);
    return !!d && d.getFullYear() === start.getFullYear() && d.getMonth() === start.getMonth();
}

function mode(values) {
    const counts = {};
    values.filter(Boolean).forEach((v) => { counts[v] = (counts[v] || 0) + 1; });
    const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    return best ? best[0] : null;
}

function firstLine(s, max = 70) {
    const t = String(s || '').split('\n')[0].trim();
    return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

/**
 * يحسب بيانات الشهر ويبني الرسالة
 * @returns {{text:string, stats:object}}
 */
export function buildMonthlyReport(allLessons, student, start, { note = '', signature = true, refCode = '' } = {}) {
    const lessons = (allLessons || []).map(normalizeLesson).filter((l) => inMonth(l, start));
    const done = lessons.filter((l) => l.status === 'completed' || (!l.status && !l.attendance));
    const excused = lessons.filter((l) => l.status === 'cancelled' && l.attendance === 'absent_excused').length;
    const unexcused = lessons.filter((l) => l.status === 'cancelled' && l.attendance === 'absent_unexcused').length;
    const scheduled = done.length + excused + unexcused;
    const labels = ratingFieldLabels(student && student.subject);
    const name = String((student && student.name) || '').trim().split(/\s+/)[0] || 'الطالب';

    const lines = [`📘 تقرير شهر ${monthLabel(start)} — ${name}`];
    if (!scheduled) {
        lines.push('لم تُسجَّل حصص في هذا الشهر.');
    } else {
        const absParts = [];
        if (excused) absParts.push(`${excused} بعذر`);
        if (unexcused) absParts.push(`${unexcused} بدون عذر`);
        lines.push(`✅ الحضور: ${done.length} من ${scheduled}${absParts.length ? ` (غاب ${absParts.join(' و')})` : ''}`);

        const levels = ['memorization', 'recitation', 'revision']
            .map((k) => { const m = mode(done.map((l) => l[k])); return m ? `${labels[k]} ${ratingLabel(m)}` : null; })
            .filter(Boolean);
        if (levels.length) lines.push(`⭐ المستوى: ${levels.join(' · ')}`);

        const hw = done.filter((l) => l.homework_status);
        if (hw.length) {
            const hwDone = hw.filter((l) => l.homework_status === 'done').length;
            const hwPartial = hw.filter((l) => l.homework_status === 'partial').length;
            lines.push(`📝 الواجبات: اتعملت ${hwDone} من ${hw.length}${hwPartial ? ` (و${hwPartial} جزئيًا)` : ''}`);
        }

        const topics = done.map((l) => firstLine(l.lesson_content)).filter(Boolean).slice(0, 3);
        if (topics.length) lines.push(`📖 اللي خلصناه: ${topics.join(' — ')}`);

        const latest = done.find((l) => l.next_assignment);
        if (latest) lines.push(`🎯 الخطة الجاية: ${firstLine(latest.next_assignment, 90)}`);
    }
    if (note && note.trim()) lines.push(`💬 ملاحظة: ${note.trim()}`);
    lines.push('مع تحياتي 🌷');
    // سطر التوقيع فيه رابط بكود المدرس: ولي الأمر (أو أي مدرس يشوف التقرير) يقدر يوصل للبرنامج،
    // والتسجيلات اللي جاية من الرابط ده بتتحسب ترشيح للمدرس (الكود بيتحفظ في صفحة التسجيل)
    if (signature) lines.push(`— من خلال Teachers Manager\n${CONFIG.SITE_URL.replace(/^https?:\/\//, '')}${refCode ? `/?ref=${refCode}` : ''}`);

    return {
        text: lines.join('\n'),
        stats: { attended: done.length, excused, unexcused, scheduled }
    };
}

/**
 * @param {{student:object, loadLessons:(start:Date)=>Promise<Array>}} opts
 */
export function openMonthlyReport({ student, loadLessons }) {
    // كود ترشيح قصير من معرّف المدرس (أول 8 حروف)
    let refCode = '';
    try {
        const raw = localStorage.getItem('auth_session');
        const uid = raw ? (JSON.parse(raw) || {}).user_id : '';
        refCode = String(uid || '').replace(/-/g, '').slice(0, 8);
    } catch (e) { refCode = ''; }
    if (!refCode && window.supabaseClient) {
        window.supabaseClient.auth.getSession().then(({ data }) => {
            refCode = String((data && data.session && data.session.user && data.session.user.id) || '').replace(/-/g, '').slice(0, 8);
            try { if (lessons.length) rebuild(); } catch (e) { /* لسه مااتحملش */ }
        }).catch(() => {});
    }
    const to = recipientChooser(student);
    let toPhone = to.initial;
    const modal = document.createElement('div');
    modal.className = 'modal active bill-modal rp-modal';
    modal.innerHTML = `<div class="modal-content" role="dialog" aria-modal="true" aria-label="تقرير الشهر لولي الأمر">
        <button type="button" class="bm-close" aria-label="إغلاق">${icon('x', { size: 18 })}</button>
        <h2 class="bm-title">تقرير الشهر لولي الأمر</h2>
        ${to.html}
        <div class="bm-tones" role="tablist">
            <button type="button" class="bm-tone active" data-month="0">الشهر ده</button>
            <button type="button" class="bm-tone" data-month="-1">الشهر اللي فات</button>
        </div>
        <div class="bm-field"><label for="rp-note">ملاحظة منك <small>(اختياري)</small></label>
            <input type="text" id="rp-note" maxlength="200" placeholder="مثلًا: مستواه اتحسن جدًا في التجويد"></div>
        <textarea id="rp-msg" class="bm-msg" rows="9" dir="rtl" aria-label="نص التقرير"></textarea>
        <label class="ls-check" style="margin-top:0.5rem"><input type="checkbox" id="rp-sign" checked> إضافة سطر "من خلال Teachers Manager"</label>
        <p class="bm-hint" id="rp-hint"></p>
        <div class="bm-buttons">
            <a class="btn bm-wa" id="rp-wa" target="_blank" rel="noopener">${icon('messageCircle', { size: 16 })} إرسال واتساب</a>
            <button type="button" class="btn btn-ghost" id="rp-copy">${icon('copy', { size: 15 })} نسخ</button>
        </div>
    </div>`;
    const $ = (s) => modal.querySelector(s);
    const closeModal = () => { modal.remove(); document.removeEventListener('keydown', onKey); };
    const onKey = (e) => { if (e.key === 'Escape') closeModal(); };
    modal.addEventListener('mousedown', (e) => { if (e.target === modal) closeModal(); });
    $('.bm-close').addEventListener('click', closeModal);
    document.addEventListener('keydown', onKey);
    document.body.appendChild(modal);

    let offset = 0;
    let lessons = [];
    let edited = false;
    const msg = $('#rp-msg');
    const wa = $('#rp-wa');
    const refreshLink = () => { wa.href = whatsappUrl(toPhone, msg.value); };
    to.bind(modal, (ph) => { toPhone = ph; refreshLink(); });

    const rebuild = () => {
        const r = buildMonthlyReport(lessons, student, monthStart(offset), { note: $('#rp-note').value, signature: $('#rp-sign').checked, refCode });
        msg.value = r.text;
        edited = false;
        $('#rp-hint').textContent = r.stats.scheduled
            ? (toPhone ? 'تقدر تعدّل النص قبل الإرسال.' : 'مفيش رقم لولي الأمر ولا للطالب: واتساب هيفتح وتختار جهة الاتصال بنفسك. (ضيف رقم ولي الأمر من بيانات الطالب)')
            : 'مفيش حصص متسجلة في الشهر ده.';
        refreshLink();
    };

    const load = async () => {
        msg.value = 'جاري تجهيز التقرير...';
        msg.disabled = true;
        try {
            lessons = await loadLessons(monthStart(offset));
            rebuild();
        } catch (e) {
            msg.value = '';
            $('#rp-hint').textContent = 'تعذّر تحميل الحصص: ' + ErrorHandler.getErrorMessage(e);
        } finally {
            msg.disabled = false;
        }
    };

    modal.querySelectorAll('[data-month]').forEach((b) => b.addEventListener('click', () => {
        if (edited && !confirm('هيتم استبدال التعديلات اللي عملتها في النص. تكمل؟')) return;
        modal.querySelectorAll('[data-month]').forEach((x) => x.classList.toggle('active', x === b));
        offset = Number(b.dataset.month);
        load();
    }));
    $('#rp-note').addEventListener('input', () => { if (!edited) rebuild(); });
    $('#rp-sign').addEventListener('change', () => { if (!edited) rebuild(); });
    msg.addEventListener('input', () => { edited = true; refreshLink(); });
    $('#rp-copy').addEventListener('click', async () => {
        try { await navigator.clipboard.writeText(msg.value); } catch (e) { msg.select(); try { document.execCommand('copy'); } catch (x) { /* تجاهل */ } }
        ErrorHandler.showSuccess('تم نسخ التقرير');
    });
    wa.addEventListener('click', () => {
        try { (window.dataLayer = window.dataLayer || []).push({ event: 'parent_report_sent' }); } catch (e) { /* تجاهل */ }
    });
    load();
}

// ============================================================ v28: تقرير الحصة الواحدة لولي الأمر
const HW_TEXT = { done: 'عمله ✅', partial: 'عمل جزء منه', not_done: 'ماعملهوش ❌' };

/** كود الترشيح (أول 8 حروف من معرّف المدرس) — نفس تقرير الشهر */
function getRefCode() {
    try {
        const raw = localStorage.getItem('auth_session');
        const uid = raw ? (JSON.parse(raw) || {}).user_id : '';
        return String(uid || '').replace(/-/g, '').slice(0, 8);
    } catch (e) { return ''; }
}

/**
 * رسالة تقرير الحصة من اللي المدرس سجّله
 * @param {object} student {name, subject}
 * @param {object} f الحقول: lesson_content, memorization, recitation, revision, homework_status, performance, homework, next_assignment
 */
export function buildLessonReport(student, f, { date = new Date(), note = '', signature = true, refCode = '', recordingUrl = '' } = {}) {
    const fields = f || {};
    const labels = ratingFieldLabels(student && student.subject);
    const name = String((student && student.name) || '').trim().split(/\s+/)[0] || 'الطالب';
    let day = '';
    try { day = new Date(date).toLocaleDateString('ar-EG-u-nu-latn', { weekday: 'long', day: 'numeric', month: 'long' }); } catch (e) { /* تجاهل */ }
    const lines = ['السلام عليكم 🌸', `📋 تقرير حصة ${name}${day ? ` — ${day}` : ''}`];
    if (fields.lesson_content) lines.push(`📖 اللي أخدناه: ${fields.lesson_content.trim()}`);
    const levels = ['memorization', 'recitation', 'revision']
        .filter((k) => fields[k])
        .map((k) => `${labels[k]}: ${ratingLabel(fields[k])}`);
    if (levels.length) lines.push(`⭐ المستوى: ${levels.join(' · ')}`);
    if (fields.homework_status) lines.push(`📝 الواجب اللي فات: ${HW_TEXT[fields.homework_status] || fields.homework_status}`);
    if (fields.performance) lines.push(`💬 ملاحظات: ${fields.performance.trim()}`);
    if (fields.homework) lines.push(`📚 الواجب الجاي: ${fields.homework.trim()}`);
    if (fields.next_assignment) lines.push(`🎯 الحصة الجاية: ${fields.next_assignment.trim()}`);
    if (note && note.trim()) lines.push(`✍️ ${note.trim()}`);
    if (recordingUrl) lines.push(`🎥 تسجيل الحصة: ${recordingUrl}`);
    if (lines.length === 2) lines.push('✅ الحصة اتعملت النهارده.');
    lines.push('مع تحياتي 🌷');
    if (signature) lines.push(`— من خلال Teachers Manager\n${CONFIG.SITE_URL.replace(/^https?:\/\//, '')}${refCode ? `/?ref=${refCode}` : ''}`);
    return lines.join('\n');
}

/** نافذة التقرير: نص جاهز يتعدّل + إرسال واتساب لرقم الطالب/ولي الأمر */
export function openLessonReport({ student, fields, date, recordingUrl }) {
    const refCode = getRefCode();
    const to = recipientChooser(student);
    let toPhone = to.initial;
    const modal = document.createElement('div');
    modal.className = 'modal active bill-modal rp-modal';
    modal.innerHTML = `<div class="modal-content" role="dialog" aria-modal="true" aria-label="تقرير الحصة لولي الأمر">
        <button type="button" class="bm-close" aria-label="إغلاق">${icon('x', { size: 18 })}</button>
        <h2 class="bm-title">تقرير الحصة لولي الأمر</h2>
        ${to.html}
        <div class="bm-field"><label for="lr-note">كلمة منك <small>(اختياري)</small></label>
            <input type="text" id="lr-note" maxlength="200" placeholder="مثلًا: ما شاء الله كان مركز جدًا النهارده"></div>
        <textarea id="lr-msg" class="bm-msg" rows="10" dir="rtl" aria-label="نص التقرير"></textarea>
        <label class="ls-check" style="margin-top:0.5rem"><input type="checkbox" id="lr-sign" checked> إضافة سطر "من خلال Teachers Manager"</label>
        <p class="bm-hint" id="lr-hint">${toPhone ? 'تقدر تعدّل النص قبل الإرسال.' : 'مفيش رقم لولي الأمر ولا للطالب: واتساب هيفتح وتختار جهة الاتصال بنفسك.'}</p>
        <div class="bm-buttons">
            <a class="btn bm-wa" id="lr-wa" target="_blank" rel="noopener">${icon('messageCircle', { size: 16 })} إرسال واتساب</a>
            <button type="button" class="btn btn-ghost" id="lr-copy">${icon('copy', { size: 15 })} نسخ</button>
        </div>
    </div>`;
    const $ = (s) => modal.querySelector(s);
    const closeModal = () => { modal.remove(); document.removeEventListener('keydown', onKey); };
    const onKey = (e) => { if (e.key === 'Escape') closeModal(); };
    modal.addEventListener('mousedown', (e) => { if (e.target === modal) closeModal(); });
    $('.bm-close').addEventListener('click', closeModal);
    document.addEventListener('keydown', onKey);
    document.body.appendChild(modal);
    const msg = $('#lr-msg');
    const wa = $('#lr-wa');
    let edited = false;
    const refreshLink = () => { wa.href = whatsappUrl(toPhone, msg.value); };
    to.bind(modal, (ph) => { toPhone = ph; refreshLink(); });
    const rebuild = () => {
        msg.value = buildLessonReport(student, fields, { date, note: $('#lr-note').value, signature: $('#lr-sign').checked, refCode, recordingUrl });
        edited = false;
        refreshLink();
    };
    $('#lr-note').addEventListener('input', () => { if (!edited) rebuild(); });
    $('#lr-sign').addEventListener('change', () => { if (!edited) rebuild(); });
    msg.addEventListener('input', () => { edited = true; refreshLink(); });
    $('#lr-copy').addEventListener('click', async () => {
        try { await navigator.clipboard.writeText(msg.value); } catch (e) { msg.select(); try { document.execCommand('copy'); } catch (x) { /* تجاهل */ } }
        ErrorHandler.showSuccess('تم نسخ التقرير');
    });
    wa.addEventListener('click', () => {
        try { window.tmTrack && window.tmTrack('lesson_report_sent', {}); } catch (e) { /* تجاهل */ }
        setTimeout(closeModal, 400);
    });
    rebuild();
}
