/**
 * student-appointments.js - بوب أب "مواعيد الطالب" موحّد لكل صفحات التطبيق
 *
 * أي صفحة عايزة تفتح بوب أب مواعيد طالب معيّن (بدل ما تودّي المستخدم
 * لصفحة الجدول الأسبوعي العام) تستورد الدالة openStudentAppointments
 * من هنا وتناديها بمعرّف الطالب (واسمه اختياريًا لعرضه في العنوان).
 * الملف بيحقن الـ HTML بتاع المودالات مرة واحدة بس (أول استخدام)
 * جوه الصفحة، وبيتعامل مع كل حاجة (تحميل المواعيد، إضافة، تعديل،
 * حذف) بنفس الـ n8n endpoints المستخدمة أصلاً في صفحة الجدول العام
 * (api.getSchedules / createSchedule / updateSchedule / deleteSchedule) -
 * من غير أي تعديل أو إضافة على أي workflow في n8n.
 */

import { api } from './api.js?v=17';
import { ErrorHandler, Formatters } from './utils.js?v=17';
import { icon } from './icons.js?v=17';
import { mountTimePicker, refreshTimePicker, mountDayChips, weekIndex } from './form-widgets.js?v=17';

const DAY_NAMES = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const RECURRENCE_LABELS = { weekly: 'أسبوعيًا', daily: 'يوميًا', monthly: 'شهريًا', none: 'مرة واحدة' };

let injected = false;
let currentStudentId = null;
let currentStudentName = '';
let currentOptions = {};
let studentSchedules = [];
let dayChips = null;

function genGroupId() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'grp-' + Date.now() + '-' + Math.random().toString(16).slice(2);
}

function injectMarkup() {
    if (injected) return;
    injected = true;
    const wrap = document.createElement('div');
    wrap.id = 'sapp-root';
    wrap.innerHTML = `
        <div class="modal" id="sapp-list-modal">
            <div class="modal-content">
                <span class="close-modal">&times;</span>
                <h2 id="sapp-list-title">مواعيد الطالب</h2>
                <div id="sapp-next" class="sapp-next" hidden></div>
                <div style="margin-bottom: 1rem;">
                    <button type="button" class="btn btn-primary" id="sapp-add-btn">
                        <span id="sapp-add-icon" class="icon" style="display:inline-flex; vertical-align:-3px;"></span> إضافة موعد جديد
                    </button>
                </div>
                <div id="sapp-list">
                    <div class="empty-state">جاري التحميل...</div>
                </div>
            </div>
        </div>

        <div class="modal" id="sapp-form-modal">
            <div class="modal-content">
                <span class="close-modal">&times;</span>
                <h2 id="sapp-form-title">إضافة موعد</h2>
                <form id="sapp-form" novalidate>
                    <input type="hidden" id="sapp-id">
                    <input type="hidden" id="sapp-recurrence-group">

                    <div class="form-group" id="sapp-day-group">
                        <label id="sapp-day-label">أيام الحصة *</label>
                        <div id="sapp-days"></div>
                        <small class="day-chips-hint" id="sapp-day-hint">اختار كل الأيام اللي الطالب بيحضر فيها في نفس الميعاد</small>
                    </div>

                    <div class="form-group" id="sapp-date-group" style="display:none;">
                        <label for="sapp-date">التاريخ *</label>
                        <input type="date" id="sapp-date">
                    </div>

                    <div class="form-group">
                        <label>وقت البداية *</label>
                        <input type="time" id="sapp-time" value="16:00">
                    </div>

                    <div class="form-group">
                        <label for="sapp-duration">مدة الحصة *</label>
                        <select id="sapp-duration" required>
                            <option value="30">30 دقيقة</option>
                            <option value="45" selected>45 دقيقة</option>
                            <option value="60">ساعة</option>
                            <option value="90">ساعة ونص</option>
                            <option value="120">ساعتين</option>
                        </select>
                    </div>

                    <details class="x-more" id="sapp-rec-more">
                        <summary>+ تكرار مختلف (يومي، شهري، مرة واحدة)</summary>
                        <div class="form-group">
                            <label for="sapp-recurrence">تكرار الموعد</label>
                            <select id="sapp-recurrence">
                                <option value="weekly" selected>أسبوعيًا في الأيام المختارة</option>
                                <option value="daily">يوميًا (كل أيام الأسبوع)</option>
                                <option value="monthly">شهريًا (نفس التاريخ كل شهر)</option>
                                <option value="none">مرة واحدة بس</option>
                            </select>
                        </div>
                    </details>

                    <p id="sapp-recurrence-note" style="display:none; font-size:0.8rem; color:var(--text-secondary); background:var(--bg-secondary); padding:0.6rem 0.8rem; border-radius:8px;"></p>

                    <div style="display:flex; gap:0.5rem; margin-top:1rem; flex-wrap:wrap;">
                        <button type="submit" class="btn" id="sapp-save-btn">حفظ الموعد</button>
                        <button type="button" class="btn close-modal" style="background: var(--bg-muted); color: var(--text-primary);">إلغاء</button>
                    </div>
                </form>
            </div>
        </div>
    `;
    document.body.appendChild(wrap);
    document.getElementById('sapp-add-icon').innerHTML = icon('plus', { size: 14 });
    mountTimePicker(document.getElementById('sapp-time'));
    dayChips = mountDayChips(document.getElementById('sapp-days'), { multi: true });

    wrap.querySelectorAll('.close-modal').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const modal = e.target.closest('.modal');
            if (modal) modal.classList.remove('active');
        });
    });

    document.getElementById('sapp-list').addEventListener('click', async (e) => {
        const btn = e.target.closest('button[data-action]');
        if (!btn) return;
        const sch = studentSchedules.find(s => String(s.id) === String(btn.dataset.id));
        if (!sch) return;

        if (btn.dataset.action === 'edit') {
            openEditForm(sch);
        } else if (btn.dataset.action === 'delete') {
            if (!confirm('هل تريد حذف هذا الموعد؟')) return;
            try {
                await api.deleteSchedule(sch.id);
                ErrorHandler.showSuccess('تم حذف الموعد');
                await loadList();
                notifySchedulesChanged();
            } catch (error) {
                ErrorHandler.showError(ErrorHandler.getErrorMessage(error));
            }
        }
    });

    document.getElementById('sapp-add-btn').addEventListener('click', () => openAddForm());
    document.getElementById('sapp-recurrence').addEventListener('change', updateRecurrenceFields);
    document.getElementById('sapp-form').addEventListener('submit', handleFormSubmit);
}

function updateRecurrenceFields() {
    const type = document.getElementById('sapp-recurrence').value;
    const editing = !!document.getElementById('sapp-id').value;
    const dayGroup = document.getElementById('sapp-day-group');
    const dateGroup = document.getElementById('sapp-date-group');
    const note = document.getElementById('sapp-recurrence-note');
    const dateInput = document.getElementById('sapp-date');

    if (type === 'weekly') {
        dayGroup.style.display = 'block';
        dateGroup.style.display = 'none';
        dateInput.required = false;
        note.style.display = 'none';
    } else if (type === 'daily') {
        // عند التعديل: اليوم بيفضل ظاهر (كل يوم في التكرار اليومي صف منفصل)
        dayGroup.style.display = editing ? 'block' : 'none';
        dateGroup.style.display = 'none';
        dateInput.required = false;
        note.style.display = 'block';
        note.textContent = editing ? 'ده يوم من أيام التكرار اليومي.' : 'هيتضاف الموعد في نفس الوقت في كل أيام الأسبوع السبعة.';
    } else {
        dayGroup.style.display = 'none';
        dateGroup.style.display = 'block';
        dateInput.required = true;
        note.style.display = 'block';
        note.textContent = type === 'monthly'
            ? 'الموعد بيتكرر كل شهر في نفس التاريخ.'
            : 'موعد لمرة واحدة بس في التاريخ ده.';
    }
}

function openAddForm() {
    document.getElementById('sapp-form-title').textContent = 'إضافة موعد';
    document.getElementById('sapp-id').value = '';
    document.getElementById('sapp-recurrence-group').value = '';
    document.getElementById('sapp-recurrence').value = 'weekly';
    document.getElementById('sapp-rec-more').open = false;
    document.getElementById('sapp-day-label').textContent = 'أيام الحصة *';
    document.getElementById('sapp-day-hint').hidden = false;
    dayChips.setMulti(true);
    // مفيش يوم متختار تلقائيًا: المدرس يختار بنفسه (عشان مايتضافش يوم مش عايزه بالغلط)
    dayChips.set([]);
    document.getElementById('sapp-date').value = '';
    // نفس ميعاد آخر موعد للطالب لو موجود، وإلا 4 العصر
    const last = studentSchedules[studentSchedules.length - 1];
    document.getElementById('sapp-time').value = last ? String(last.start_time).substring(0, 5) : '16:00';
    refreshTimePicker(document.getElementById('sapp-time'));
    document.getElementById('sapp-duration').value = last ? String(last.duration_minutes || 45) : '45';
    if (!document.getElementById('sapp-duration').value) document.getElementById('sapp-duration').value = '45';
    updateRecurrenceFields();
    document.getElementById('sapp-form-modal').classList.add('active');
}

function openEditForm(sch) {
    document.getElementById('sapp-form-title').textContent = 'تعديل الموعد';
    document.getElementById('sapp-id').value = sch.id;
    document.getElementById('sapp-recurrence-group').value = sch.recurrence_group_id || '';
    document.getElementById('sapp-recurrence').value = sch.recurrence_type || 'weekly';
    document.getElementById('sapp-rec-more').open = !!(sch.recurrence_type && sch.recurrence_type !== 'weekly');
    document.getElementById('sapp-day-label').textContent = 'اليوم *';
    document.getElementById('sapp-day-hint').hidden = true;
    dayChips.setMulti(false);
    dayChips.set([sch.day_of_week]);
    document.getElementById('sapp-date').value = sch.start_date ? String(sch.start_date).substring(0, 10) : '';
    document.getElementById('sapp-time').value = String(sch.start_time).substring(0, 5);
    refreshTimePicker(document.getElementById('sapp-time'));
    const dur = document.getElementById('sapp-duration');
    if (![...dur.options].some((o) => o.value === String(sch.duration_minutes))) dur.add(new Option(`${sch.duration_minutes} دقيقة`, String(sch.duration_minutes)));
    dur.value = String(sch.duration_minutes);
    updateRecurrenceFields();
    document.getElementById('sapp-form-modal').classList.add('active');
}

/** ينشئ مجموعة مواعيد بالتوازي ويرجّع ملخص النجاح/الفشل */
async function createMany(days, base) {
    const results = await Promise.allSettled(days.map((day) => api.createSchedule({ ...base, day_of_week: day })));
    const failed = [];
    let ok = 0;
    results.forEach((r, i) => {
        if (r.status === 'fulfilled') ok++;
        else failed.push(`${DAY_NAMES[days[i]]} (${ErrorHandler.getErrorMessage(r.reason)})`);
    });
    return { ok, failed };
}

async function handleFormSubmit(e) {
    e.preventDefault();
    const id = document.getElementById('sapp-id').value;
    const recurrenceType = document.getElementById('sapp-recurrence').value;
    const startTime = document.getElementById('sapp-time').value;
    const duration = parseInt(document.getElementById('sapp-duration').value, 10);
    const dateValue = document.getElementById('sapp-date').value;
    const existingGroupId = document.getElementById('sapp-recurrence-group').value || null;
    const saveBtn = document.getElementById('sapp-save-btn');
    const days = dayChips.get();

    if (!startTime) { ErrorHandler.showError('اختار وقت الحصة'); return; }
    if ((recurrenceType === 'weekly' || (recurrenceType === 'daily' && id)) && days.length === 0) {
        ErrorHandler.showError('اختار يوم واحد على الأقل');
        return;
    }
    if ((recurrenceType === 'monthly' || recurrenceType === 'none') && !dateValue) {
        ErrorHandler.showError('اختار التاريخ');
        return;
    }

    try {
        saveBtn.disabled = true;
        saveBtn.textContent = 'جاري الحفظ...';

        // إضافة جديدة لأكتر من يوم (أسبوعي) أو يومي (7 أيام بنفس معرّف مجموعة)
        if (!id && (recurrenceType === 'weekly' || recurrenceType === 'daily')) {
            const isDaily = recurrenceType === 'daily';
            const targetDays = isDaily ? [0, 1, 2, 3, 4, 5, 6] : days;
            const { ok, failed } = await createMany(targetDays, {
                student_id: currentStudentId,
                start_time: startTime,
                duration_minutes: duration,
                recurrence_type: recurrenceType,
                recurrence_group_id: isDaily ? genGroupId() : null,
                start_date: null
            });
            if (ok === 0) throw new Error('ماتحفظش أي موعد: ' + failed.join('، '));
            try { (window.dataLayer = window.dataLayer || []).push({ event: 'schedule_saved', days_count: ok, recurrence: recurrenceType }); } catch (e) { /* تجاهل */ }
            if (failed.length) ErrorHandler.showError(`اتحفظ ${ok} من ${targetDays.length}. الأيام اللي فيها تعارض: ${failed.join('، ')}`);
            else ErrorHandler.showSuccess(ok === 1 ? 'تم حفظ الموعد' : `تم حفظ ${ok} مواعيد`);
            document.getElementById('sapp-form-modal').classList.remove('active');
            await loadList();
            notifySchedulesChanged();
            return;
        }

        const payload = {
            student_id: currentStudentId,
            start_time: startTime,
            duration_minutes: duration,
            recurrence_type: recurrenceType,
            recurrence_group_id: recurrenceType === 'daily' ? existingGroupId : null
        };
        if (recurrenceType === 'weekly' || recurrenceType === 'daily') {
            payload.day_of_week = days[0];
            payload.start_date = null;
        } else {
            payload.start_date = dateValue;
            payload.day_of_week = new Date(dateValue + 'T00:00:00').getDay();
        }
        if (id) await api.updateSchedule(id, payload);
        else await api.createSchedule(payload);

        ErrorHandler.showSuccess('تم حفظ الموعد بنجاح');
        document.getElementById('sapp-form-modal').classList.remove('active');
        await loadList();
        notifySchedulesChanged();
    } catch (error) {
        ErrorHandler.showError(ErrorHandler.getErrorMessage(error));
    } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = 'حفظ الموعد';
    }
}

// بيبلّغ أي صفحة مفتوحة (زي الرئيسية ودليل البداية) إن مواعيد الطالب اتغيرت
function notifySchedulesChanged() {
    try { window.dispatchEvent(new CustomEvent('tm:schedules-changed', { detail: { studentId: currentStudentId } })); } catch (e) { /* تجاهل */ }
}

function renderList() {
    const list = document.getElementById('sapp-list');
    renderNext();
    if (studentSchedules.length === 0) {
        list.innerHTML = '<div class="empty-state">لسه مفيش مواعيد للطالب ده.<br><small>اضغط "إضافة موعد جديد" واختار الأيام والساعة، وحصصه هتظهر لك في "حصص النهارده" وهيوصلك تنبيه بيها.</small></div>';
        return;
    }
    const sorted = [...studentSchedules].sort((a, b) => weekIndex(a.day_of_week) - weekIndex(b.day_of_week) || String(a.start_time).localeCompare(String(b.start_time)));
    list.innerHTML = sorted.map(sch => `
        <div class="sapp-item" data-id="${sch.id}">
            <div class="sapp-item-info">
                <span class="sapp-item-day">${DAY_NAMES[sch.day_of_week] || ''} - ${Formatters.formatTime(sch.start_time)}</span>
                <span class="sapp-item-meta">${sch.duration_minutes} دقيقة${sch.recurrence_type ? ' · ' + (RECURRENCE_LABELS[sch.recurrence_type] || '') : ''}</span>
            </div>
            <div class="sapp-item-actions">
                <button type="button" class="sapp-icon-btn" title="تعديل الموعد" aria-label="تعديل الموعد" data-action="edit" data-id="${sch.id}">${icon('edit', { size: 14 })}</button>
                <button type="button" class="sapp-icon-btn danger" title="حذف الموعد" aria-label="حذف الموعد" data-action="delete" data-id="${sch.id}">${icon('trash', { size: 14 })}</button>
            </div>
        </div>
    `).join('');
}

// في دليل البداية: بعد ما المدرس يحدد المواعيد، زرار واضح للخطوة الجاية
// (بدل التحويل التلقائي اللي كان بيمنعه يضيف اليوم التاني)
function renderNext() {
    const box = document.getElementById('sapp-next');
    if (!box) return;
    if (!currentOptions.onboarding || studentSchedules.length === 0) { box.hidden = true; box.innerHTML = ''; return; }
    box.hidden = false;
    box.innerHTML = `<p>✓ تمام! لو الطالب بيحضر أيام تانية بميعاد مختلف ضيفها، ولو خلصت كمّل:</p>
        <button type="button" class="btn" id="sapp-next-btn">خلصت المواعيد — سجّل أول حصة</button>`;
    document.getElementById('sapp-next-btn').addEventListener('click', () => {
        window.location.href = `lesson.html?student_id=${encodeURIComponent(currentStudentId)}&manual=1&onboarding=1`;
    });
}

async function loadList() {
    const list = document.getElementById('sapp-list');
    list.innerHTML = '<div class="empty-state">جاري التحميل...</div>';
    try {
        const data = await api.getSchedules();
        const all = data.schedules || [];
        studentSchedules = all.filter(s => String(s.student_id) === String(currentStudentId));
        renderList();
    } catch (error) {
        list.innerHTML = `<div class="empty-state">تعذّر تحميل المواعيد. <button type="button" class="btn btn-sm" id="sapp-retry">حاول تاني</button></div>`;
        const r = document.getElementById('sapp-retry');
        if (r) r.addEventListener('click', loadList);
    }
}

/**
 * الدالة الرئيسية اللي أي صفحة تناديها: بتفتح بوب أب مواعيد الطالب
 * @param {string} studentId - معرف الطالب
 * @param {string} [studentName] - اسم الطالب (بيظهر في العنوان)
 * @param {{onboarding?:boolean}} [options] - onboarding: يظهر زرار "الخطوة الجاية" بعد الحفظ
 */
export async function openStudentAppointments(studentId, studentName = '', options = {}) {
    injectMarkup();
    currentStudentId = studentId;
    currentStudentName = studentName;
    currentOptions = options || {};
    document.getElementById('sapp-list-title').textContent = studentName ? `مواعيد ${studentName}` : 'مواعيد الطالب';
    document.getElementById('sapp-list-modal').classList.add('active');
    await loadList();
    // لو مفيش مواعيد خالص: نفتح نموذج الإضافة على طول (خطوة أقل)
    if (studentSchedules.length === 0) openAddForm();
}

// إتاحتها عالميًا كمان عشان أي صفحة تقدر تستخدمها بـ onclick مباشر
window.openStudentAppointments = openStudentAppointments;
