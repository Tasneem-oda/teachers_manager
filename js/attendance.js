/**
 * attendance.js - تسجيل غياب الطالب بضغطة (مشترك: الرئيسية، صفحة الحصة، ملف الطالب)
 *
 * بيسجل صف في جدول الحصص بحالة cancelled ونوع الغياب في attendance:
 *   absent_excused (غاب بعذر) | absent_unexcused (غاب بدون عذر) | teacher_cancelled (المعلم ألغى/أجّل)
 * لو فيه حصة جارية (lessonId) بتتحوّل هي نفسها لغياب بدل ما يتعمل صف جديد.
 */

import { api } from './api.js?v=23';
import { Formatters, ErrorHandler } from './utils.js?v=23';
import { icon } from './icons.js?v=23';
import { localDateISO } from './lesson-utils.js?v=23';

const esc = (s) => Formatters.escapeHtml(s == null ? '' : String(s));

const OPTIONS = [
    { value: 'absent_excused', title: 'غاب بعذر', sub: 'مش هتتحسب من باقة الطالب', emoji: '🙋' },
    { value: 'absent_unexcused', title: 'غاب بدون عذر', sub: 'بتتحسب من الباقة (حسب إعدادات الدفع)', emoji: '❌' },
    { value: 'teacher_cancelled', title: 'أنا ألغيت / أجّلت الحصة', sub: 'مش بتتحسب على الطالب خالص', emoji: '⏸️' }
];

/**
 * @param {{studentId:string, studentName?:string, lessonId?:string|null, date?:string, onSaved?:Function}} opts
 */
/** الغياب بيغيّر الباقة والفلوس: الكروت في الرئيسية لازم تتحسب من جديد */
function clearMoneyCaches() {
    try { api.clearBillingDueCache(); } catch (e) { /* تجاهل */ }
    try { sessionStorage.removeItem('tm_income_cache_v1'); } catch (e) { /* تجاهل */ }
}

/** رسالة صغيرة فيها زرار "تراجع" (8 ثواني) */
function showUndo(text, onUndo) {
    const old = document.getElementById('tm-undo');
    if (old) old.remove();
    const bar = document.createElement('div');
    bar.id = 'tm-undo';
    bar.setAttribute('role', 'status');
    bar.style.cssText = 'position:fixed;z-index:9998;left:50%;transform:translateX(-50%);bottom:calc(90px + env(safe-area-inset-bottom,0px));background:#2E2140;color:#fff;border-radius:12px;padding:.65rem .8rem .65rem 1rem;display:flex;align-items:center;gap:.8rem;box-shadow:0 8px 24px rgba(0,0,0,.25);font-size:.9rem;max-width:calc(100vw - 32px)';
    bar.innerHTML = `<span></span><button type="button" style="background:#C59A4A;color:#2E2140;border:0;border-radius:9px;padding:.4rem .8rem;font:inherit;font-weight:800;cursor:pointer;white-space:nowrap">تراجع</button>`;
    bar.querySelector('span').textContent = text;
    document.body.appendChild(bar);
    const timer = setTimeout(() => bar.remove(), 8000);
    bar.querySelector('button').addEventListener('click', async (e) => {
        const b = e.currentTarget;
        if (b.disabled) return;
        b.disabled = true;
        b.textContent = '...';
        try {
            await onUndo();
            clearTimeout(timer);
            bar.remove();
            ErrorHandler.showSuccess('اتلغى تسجيل الغياب');
        } catch (err) {
            clearTimeout(timer);
            bar.remove();
            ErrorHandler.showError(err && err.status === 404 ? 'التراجع محتاج تحديث save-lesson على الخادم.' : ErrorHandler.getErrorMessage(err));
        }
    });
}

export function openAttendanceModal(opts) {
    const { studentId, studentName = '', lessonId = null, onSaved } = opts || {};
    if (!studentId) return;
    const modal = document.createElement('div');
    modal.className = 'modal active bill-modal att-modal';
    modal.innerHTML = `<div class="modal-content" role="dialog" aria-modal="true" aria-label="تسجيل غياب">
        <button type="button" class="bm-close" aria-label="إغلاق">${icon('x', { size: 18 })}</button>
        <h2 class="bm-title">${studentName ? `حصة ${esc(studentName)}` : 'تسجيل غياب'}</h2>
        <div class="bm-error" role="alert"></div>
        <div class="bm-field" >
            <label for="att-date">التاريخ</label>
            <input type="date" id="att-date" value="${esc(opts.date || localDateISO())}" max="${esc(localDateISO())}">
        </div>
        <div class="bm-field">
            <label for="att-note">ملاحظة <small>(اختياري)</small></label>
            <input type="text" id="att-note" maxlength="300" placeholder="مثلًا: مسافر / مريض">
        </div>
        <p class="bm-hint" style="margin:0.2rem 0 0.5rem">اختار نوع الغياب وهيتسجّل على طول:</p>
        <div class="att-options">
            ${OPTIONS.map((o) => `<button type="button" class="att-option" data-value="${o.value}">
                <span class="att-emoji" aria-hidden="true">${o.emoji}</span>
                <span><strong>${o.title}</strong><small>${o.sub}</small></span>
            </button>`).join('')}
        </div>
    </div>`;
    const $ = (sel) => modal.querySelector(sel);
    let busy = false;
    // وقت الحفظ مانقفلش النافذة (وإلا لو الحفظ فشل الرسالة تضيع والمدرس يفتكر إنه اتسجّل)
    const close = (force) => { if (busy && force !== true) return; modal.remove(); document.removeEventListener('keydown', onKey); };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    modal.addEventListener('mousedown', (e) => { if (e.target === modal) close(); });
    $('.bm-close').addEventListener('click', close);
    document.addEventListener('keydown', onKey);
    if (lessonId) $('#att-date').closest('.bm-field').style.display = 'none';   // الحصة الجارية ليها تاريخها

    modal.querySelectorAll('.att-option').forEach((btn) => btn.addEventListener('click', async () => {
        const err = $('.bm-error');
        err.style.display = 'none';
        // غياب بدون عذر بيتخصم من الباقة: تأكيد سريع عشان الضغطة الغلط
        if (btn.dataset.value === 'absent_unexcused' && !confirm('تسجيل "غاب بدون عذر"؟ الحصة دي ممكن تتحسب من باقة الطالب.')) return;
        busy = true;
        modal.querySelectorAll('.att-option').forEach((b) => { b.disabled = true; });
        btn.classList.add('is-busy');
        try {
            const res = await api.saveLesson({
                action: 'absence',
                attendance: btn.dataset.value,
                student_id: studentId,
                lesson_id: lessonId || null,
                local_date: $('#att-date').value || localDateISO(),
                notes: $('#att-note').value.trim() || null
            });
            try { (window.dataLayer = window.dataLayer || []).push({ event: 'absence_saved', attendance: btn.dataset.value }); } catch (e) { /* تجاهل */ }
            clearMoneyCaches();
            busy = false;
            close(true);
            const opt = OPTIONS.find((o) => o.value === btn.dataset.value);
            if (onSaved) onSaved(btn.dataset.value);
            // "تراجع" لـ 8 ثواني: بس لو الغياب ده اتعمل كسطر جديد (created).
            // لو الخادم حدّث سطر موجود (حصة شغالة أو غياب قديم) المسح هيمسح حاجة تانية، فمانعرضش تراجع
            const savedId = res && res.lesson_id;
            if (savedId && !lessonId && res.created === true) showUndo(`تم التسجيل: ${opt ? opt.title : 'غياب'}`, async () => {
                await api.saveLesson({ action: 'delete', student_id: studentId, lesson_id: savedId });
                clearMoneyCaches();
                try { (window.dataLayer = window.dataLayer || []).push({ event: 'absence_undone', attendance: btn.dataset.value }); } catch (e) { /* تجاهل */ }
                if (opts.onUndone) opts.onUndone(); else if (onSaved) onSaved(null);
            });
            else ErrorHandler.showSuccess(`تم التسجيل: ${opt ? opt.title : 'غياب'}`);
        } catch (e) {
            if (e && e.status === 404) console.warn('[dev] تسجيل الغياب محتاج workflow "save-lesson" في n8n');
            err.textContent = e && e.status === 404
                ? 'الميزة دي مش متاحة دلوقتي. جرّب تاني بعد شوية، ولو المشكلة فضلت كلّمنا على واتساب.'
                : ErrorHandler.getErrorMessage(e);
            err.style.display = 'block';
            busy = false;
            modal.querySelectorAll('.att-option').forEach((b) => { b.disabled = false; });
            btn.classList.remove('is-busy');
        }
    }));
    document.body.appendChild(modal);
}
