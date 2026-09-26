/**
 * attendance.js - تسجيل غياب الطالب بضغطة (مشترك: الرئيسية، صفحة الحصة، ملف الطالب)
 *
 * بيسجل صف في جدول الحصص بحالة cancelled ونوع الغياب في attendance:
 *   absent_excused (غاب بعذر) | absent_unexcused (غاب بدون عذر) | teacher_cancelled (المعلم ألغى/أجّل)
 * لو فيه حصة جارية (lessonId) بتتحوّل هي نفسها لغياب بدل ما يتعمل صف جديد.
 */

import { api } from './api.js?v=13';
import { Formatters, ErrorHandler } from './utils.js?v=13';
import { icon } from './icons.js?v=13';
import { localDateISO } from './lesson-utils.js?v=13';

const esc = (s) => Formatters.escapeHtml(s == null ? '' : String(s));

const OPTIONS = [
    { value: 'absent_excused', title: 'غاب بعذر', sub: 'مش هتتحسب من باقة الطالب', emoji: '🙋' },
    { value: 'absent_unexcused', title: 'غاب بدون عذر', sub: 'بتتحسب من الباقة (حسب إعدادات الدفع)', emoji: '❌' },
    { value: 'teacher_cancelled', title: 'أنا ألغيت / أجّلت الحصة', sub: 'مش بتتحسب على الطالب خالص', emoji: '⏸️' }
];

/**
 * @param {{studentId:string, studentName?:string, lessonId?:string|null, date?:string, onSaved?:Function}} opts
 */
export function openAttendanceModal(opts) {
    const { studentId, studentName = '', lessonId = null, onSaved } = opts || {};
    if (!studentId) return;
    const modal = document.createElement('div');
    modal.className = 'modal active bill-modal att-modal';
    modal.innerHTML = `<div class="modal-content" role="dialog" aria-modal="true" aria-label="تسجيل غياب">
        <button type="button" class="bm-close" aria-label="إغلاق">${icon('x', { size: 18 })}</button>
        <h2 class="bm-title">${studentName ? `حصة ${esc(studentName)}` : 'تسجيل غياب'}</h2>
        <div class="bm-error" role="alert"></div>
        <div class="att-options">
            ${OPTIONS.map((o) => `<button type="button" class="att-option" data-value="${o.value}">
                <span class="att-emoji" aria-hidden="true">${o.emoji}</span>
                <span><strong>${o.title}</strong><small>${o.sub}</small></span>
            </button>`).join('')}
        </div>
        <div class="bm-field" style="margin-top:0.9rem;">
            <label for="att-date">التاريخ</label>
            <input type="date" id="att-date" value="${esc(opts.date || localDateISO())}" max="${esc(localDateISO())}">
        </div>
        <div class="bm-field">
            <label for="att-note">ملاحظة <small>(اختياري)</small></label>
            <input type="text" id="att-note" maxlength="300" placeholder="مثلًا: مسافر / مريض">
        </div>
    </div>`;
    const $ = (sel) => modal.querySelector(sel);
    const close = () => { modal.remove(); document.removeEventListener('keydown', onKey); };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    modal.addEventListener('mousedown', (e) => { if (e.target === modal) close(); });
    $('.bm-close').addEventListener('click', close);
    document.addEventListener('keydown', onKey);
    if (lessonId) $('#att-date').closest('.bm-field').style.display = 'none';   // الحصة الجارية ليها تاريخها

    modal.querySelectorAll('.att-option').forEach((btn) => btn.addEventListener('click', async () => {
        const err = $('.bm-error');
        err.style.display = 'none';
        modal.querySelectorAll('.att-option').forEach((b) => { b.disabled = true; });
        btn.classList.add('is-busy');
        try {
            await api.saveLesson({
                action: 'absence',
                attendance: btn.dataset.value,
                student_id: studentId,
                lesson_id: lessonId || null,
                local_date: $('#att-date').value || localDateISO(),
                notes: $('#att-note').value.trim() || null
            });
            try { (window.dataLayer = window.dataLayer || []).push({ event: 'absence_saved', attendance: btn.dataset.value }); } catch (e) { /* تجاهل */ }
            close();
            const opt = OPTIONS.find((o) => o.value === btn.dataset.value);
            ErrorHandler.showSuccess(`تم التسجيل: ${opt ? opt.title : 'غياب'}`);
            if (onSaved) onSaved(btn.dataset.value);
        } catch (e) {
            err.textContent = e && e.status === 404
                ? 'تسجيل الغياب يحتاج تحديث workflow "save-lesson" في n8n.'
                : ErrorHandler.getErrorMessage(e);
            err.style.display = 'block';
            modal.querySelectorAll('.att-option').forEach((b) => { b.disabled = false; });
            btn.classList.remove('is-busy');
        }
    }));
    document.body.appendChild(modal);
}
