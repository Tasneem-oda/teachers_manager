/**
 * attendance.js - تسجيل غياب الطالب بضغطة (مشترك: الرئيسية، صفحة الحصة، ملف الطالب)
 *
 * بيسجل صف في جدول الحصص بحالة cancelled ونوع الغياب في attendance:
 *   absent_excused (غاب بعذر) | absent_unexcused (غاب بدون عذر) | teacher_cancelled (المعلم ألغى/أجّل)
 * لو فيه حصة جارية (lessonId) بتتحوّل هي نفسها لغياب بدل ما يتعمل صف جديد.
 */

import { api } from './api.js?v=28';
import { Formatters, ErrorHandler } from './utils.js?v=28';
import { icon } from './icons.js?v=28';
import { localDateISO } from './lesson-utils.js?v=28';
import { whatsappUrl } from './billing.js?v=28';
import { saveWithConflictCheck } from './groups-utils.js?v=28';
import { DAY_NAMES, formatClock12, timeToMinutes } from './calendar-utils.js?v=28';

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

/** "الخميس 29 أكتوبر" */
function dayLabel(iso) {
    try {
        const d = new Date(iso + 'T12:00:00');
        return `${DAY_NAMES[d.getDay()]} ${d.toLocaleDateString('ar-EG-u-nu-latn', { day: 'numeric', month: 'long' })}`;
    } catch (e) { return iso; }
}
function addDaysISO(n) {
    const d = new Date();
    d.setDate(d.getDate() + n);
    return localDateISO(d);
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
            <!-- v28: تأجيل الحصة ليوم/ساعة تانية -->
            <button type="button" class="att-option att-postpone" data-postpone>
                <span class="att-emoji" aria-hidden="true">📅</span>
                <span><strong>أجّل الحصة ليوم تاني</strong><small>اختار اليوم والساعة: للمرة دي بس أو على طول</small></span>
            </button>
        </div>
        <div class="att-pp" hidden>
            <p class="att-pp-q">الحصة تتأجل لإمتى؟</p>
            <div class="att-pp-days" role="group" aria-label="اليوم">
                <button type="button" data-day="0">النهارده</button>
                <button type="button" data-day="1">بكرة</button>
                <button type="button" data-day="2">بعد بكرة</button>
            </div>
            <div class="att-pp-grid">
                <div class="bm-field"><label for="pp-date">اليوم</label><input type="date" id="pp-date"></div>
                <div class="bm-field"><label for="pp-time">الساعة</label><input type="time" id="pp-time"></div>
            </div>
            <div class="att-pp-mode" role="radiogroup" aria-label="التأجيل">
                <label><input type="radio" name="pp-mode" value="once" checked> <span><b>المرة دي بس</b><small>الميعاد الثابت يفضل زي ما هو</small></span></label>
                <label><input type="radio" name="pp-mode" value="always"> <span><b>على طول</b><small>الميعاد الثابت نفسه يتغير لليوم والساعة دول</small></span></label>
            </div>
            <div class="att-pp-btns">
                <button type="button" class="btn btn-outline" data-pp-back>رجوع</button>
                <button type="button" class="btn" data-pp-save>📅 أجّل الحصة</button>
            </div>
        </div>
        <div class="att-pp-done" hidden></div>
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

    // ------------------------------------------------------------ v28: تأجيل الحصة
    const pp = $('.att-pp');
    const ppDate = $('#pp-date');
    const ppTime = $('#pp-time');
    ppDate.min = localDateISO();
    const setDay = (n) => {
        ppDate.value = addDaysISO(n);
        modal.querySelectorAll('.att-pp-days button').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.day) === n)));
    };
    $('[data-postpone]').addEventListener('click', () => {
        modal.querySelector('.att-options').hidden = true;
        modal.querySelector('.bm-hint').hidden = true;
        $('#att-note').closest('.bm-field').hidden = true;
        $('#att-date').closest('.bm-field').hidden = true;
        pp.hidden = false;
        setDay(1);
        ppTime.value = opts.startTime ? String(opts.startTime).slice(0, 5) : '';
        $('.bm-title').textContent = studentName ? `تأجيل حصة ${studentName}` : 'تأجيل الحصة';
        setTimeout(() => ppTime.focus(), 50);
    });
    modal.querySelectorAll('.att-pp-days button').forEach((b) => b.addEventListener('click', () => setDay(Number(b.dataset.day))));
    ppDate.addEventListener('change', () => modal.querySelectorAll('.att-pp-days button').forEach((b) => b.setAttribute('aria-pressed', String(addDaysISO(Number(b.dataset.day)) === ppDate.value))));
    $('[data-pp-back]').addEventListener('click', () => {
        pp.hidden = true;
        modal.querySelector('.att-options').hidden = false;
        modal.querySelector('.bm-hint').hidden = false;
        $('#att-note').closest('.bm-field').hidden = false;
        if (!lessonId) $('#att-date').closest('.bm-field').hidden = false;
        $('.bm-title').textContent = studentName ? `حصة ${studentName}` : 'تسجيل غياب';
    });
    $('[data-pp-save]').addEventListener('click', async (ev) => {
        const err = $('.bm-error');
        err.style.display = 'none';
        const newDate = ppDate.value;
        const newTime = ppTime.value;
        if (!newDate || !newTime) { err.textContent = 'اختار اليوم والساعة.'; err.style.display = 'block'; return; }
        if (newDate === localDateISO()) {
            const now = new Date();
            if (timeToMinutes(newTime) <= now.getHours() * 60 + now.getMinutes()) { err.textContent = 'الساعة دي عدّت. اختار ساعة جاية.'; err.style.display = 'block'; return; }
        }
        const mode = (modal.querySelector('input[name="pp-mode"]:checked') || {}).value || 'once';
        const btn = ev.currentTarget;
        busy = true;
        btn.disabled = true;
        try {
            const res = await saveWithConflictCheck((force) => api.postponeLesson({
                student_id: studentId,
                schedule_id: opts.scheduleId || undefined,
                lesson_id: lessonId || undefined,
                occ_date: $('#att-date').value || localDateISO(),
                occ_time: opts.startTime || undefined,
                new_date: newDate,
                new_time: newTime,
                mode,
                note: $('#att-note').value.trim(),
                force
            }));
            busy = false;
            btn.disabled = false;
            if (!res) return;   // المدرس اختار يغيّر الميعاد
            if (res.invalid) {
                err.textContent = mode === 'always'
                    ? 'مفيش ميعاد ثابت للطالب ده في اليوم ده عشان يتغير. اختار "المرة دي بس".'
                    : 'مقدرناش نأجّل الحصة. اتأكد من اليوم والساعة.';
                err.style.display = 'block';
                return;
            }
            clearMoneyCaches();
            try { window.dispatchEvent(new CustomEvent('tm:schedules-changed')); } catch (e) { /* تجاهل */ }
            try { window.tmTrack && window.tmTrack('lesson_postponed', { mode }); } catch (e) { /* تجاهل */ }
            showPostponed(res, newDate, newTime, mode);
        } catch (e) {
            busy = false;
            btn.disabled = false;
            err.textContent = ErrorHandler.getErrorMessage(e);
            err.style.display = 'block';
        }
    });
    function showPostponed(res, newDate, newTime, mode) {
        const st = res.student || {};
        const first = String(st.name || studentName || '').split(' ')[0];
        const when = `${dayLabel(newDate)} الساعة ${formatClock12(timeToMinutes(newTime))}`;
        const msg = `السلام عليكم 🌸\n${mode === 'always' ? `ميعاد حصة ${first} اتغير وبقى كل ${DAY_NAMES[new Date(newDate + 'T12:00:00').getDay()]} الساعة ${formatClock12(timeToMinutes(newTime))}، أول مرة ${dayLabel(newDate)}.` : `حصة ${first} اتأجلت لـ ${when}.`}${st.lesson_link ? `\nلينك الحصة: ${st.lesson_link}` : ''}\nشكرًا 🌷`;
        pp.hidden = true;
        const box = $('.att-pp-done');
        box.hidden = false;
        box.innerHTML = `<div class="att-pp-ok">✅ <b>اتأجلت لـ ${esc(when)}</b>${mode === 'always' ? '<br><small>والميعاد الثابت اتغير من هنا ورايح.</small>' : '<br><small>الميعاد الثابت زي ما هو.</small>'}</div>
            ${st.phone
                ? `<a class="btn att-pp-wa" href="${esc(whatsappUrl(st.phone, msg))}" target="_blank" rel="noopener">${icon('messageCircle', { size: 16 })} ابعت الميعاد الجديد لـ ${esc(first)} على واتساب</a>`
                : `<p class="bm-hint">مفيش رقم واتساب للطالب ده عشان نبعتله الميعاد.</p>`}
            <button type="button" class="btn btn-outline" data-pp-close>تمام</button>`;
        box.querySelector('[data-pp-close]').addEventListener('click', () => { close(true); if (onSaved) onSaved('postponed'); });
        const wa = box.querySelector('.att-pp-wa');
        if (wa) wa.addEventListener('click', () => { try { window.tmTrack && window.tmTrack('postpone_whatsapp', {}); } catch (e) { /* تجاهل */ } });
    }

    modal.querySelectorAll('.att-option:not([data-postpone])').forEach((btn) => btn.addEventListener('click', async () => {
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
