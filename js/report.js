/**
 * report.js - تقرير الشهر لولي الأمر (رسالة واتساب جاهزة)
 *
 * بيتبني بالكامل من سجل حصص الطالب الموجود (مفيش workflow جديد):
 * الحضور والغياب، مستوى الحفظ/التلاوة/المراجعة، الواجبات، اللي خلصناه، والخطة الجاية.
 */

import { ErrorHandler } from './utils.js?v=13';
import { icon } from './icons.js?v=13';
import { lessonDay, ratingFieldLabels, ratingLabel, normalizeLesson } from './lesson-utils.js?v=13';
import { whatsappUrl } from './billing.js?v=13';

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function monthStart(offset = 0, now = new Date()) {
    return new Date(now.getFullYear(), now.getMonth() + offset, 1);
}

function monthLabel(d) {
    try { return d.toLocaleDateString('ar-EG', { month: 'long', year: 'numeric' }); } catch (e) { return `${d.getMonth() + 1}/${d.getFullYear()}`; }
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
export function buildMonthlyReport(allLessons, student, start, { note = '', signature = true } = {}) {
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
    if (signature) lines.push('— من خلال Teachers Manager');

    return {
        text: lines.join('\n'),
        stats: { attended: done.length, excused, unexcused, scheduled }
    };
}

/**
 * @param {{student:object, loadLessons:(start:Date)=>Promise<Array>}} opts
 */
export function openMonthlyReport({ student, loadLessons }) {
    const modal = document.createElement('div');
    modal.className = 'modal active bill-modal rp-modal';
    modal.innerHTML = `<div class="modal-content" role="dialog" aria-modal="true" aria-label="تقرير الشهر لولي الأمر">
        <button type="button" class="bm-close" aria-label="إغلاق">${icon('x', { size: 18 })}</button>
        <h2 class="bm-title">تقرير الشهر لولي الأمر</h2>
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
    const refreshLink = () => { wa.href = whatsappUrl(student && student.phone, msg.value); };

    const rebuild = () => {
        const r = buildMonthlyReport(lessons, student, monthStart(offset), { note: $('#rp-note').value, signature: $('#rp-sign').checked });
        msg.value = r.text;
        edited = false;
        $('#rp-hint').textContent = r.stats.scheduled
            ? (student && student.phone ? 'تقدر تعدّل النص قبل الإرسال.' : 'لا يوجد رقم هاتف للطالب: واتساب هيفتح وتختار جهة الاتصال بنفسك.')
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
