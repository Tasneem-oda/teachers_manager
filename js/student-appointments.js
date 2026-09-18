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

import { api } from './api.js?v=4';
import { ErrorHandler, Formatters } from './utils.js?v=4';
import { icon } from './icons.js?v=4';

const DAY_NAMES = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const RECURRENCE_LABELS = { weekly: 'أسبوعيًا', daily: 'يوميًا', monthly: 'شهريًا', none: 'مرة واحدة' };

let injected = false;
let currentStudentId = null;
let studentSchedules = [];

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
                <form id="sapp-form">
                    <input type="hidden" id="sapp-id">
                    <input type="hidden" id="sapp-recurrence-group">
                    <div class="form-group">
                        <label for="sapp-recurrence">تكرار الموعد *</label>
                        <select id="sapp-recurrence" required>
                            <option value="weekly" selected>أسبوعيًا (كل أسبوع في نفس اليوم)</option>
                            <option value="daily">يوميًا (كل يوم في نفس الوقت)</option>
                            <option value="monthly">شهريًا (نفس التاريخ كل شهر)</option>
                            <option value="none">بدون تكرار (مرة واحدة)</option>
                        </select>
                    </div>
                    <div class="form-group" id="sapp-day-group">
                        <label for="sapp-day">اليوم *</label>
                        <select id="sapp-day" required>
                            <option value="0">الأحد</option>
                            <option value="1">الإثنين</option>
                            <option value="2">الثلاثاء</option>
                            <option value="3">الأربعاء</option>
                            <option value="4">الخميس</option>
                            <option value="5">الجمعة</option>
                            <option value="6">السبت</option>
                        </select>
                    </div>
                    <div class="form-group" id="sapp-date-group" style="display:none;">
                        <label for="sapp-date">التاريخ *</label>
                        <input type="date" id="sapp-date">
                    </div>
                    <div class="form-group">
                        <label for="sapp-time">وقت البداية *</label>
                        <input type="time" id="sapp-time" required>
                    </div>
                    <div class="form-group">
                        <label for="sapp-duration">مدة الحصة (دقيقة) *</label>
                        <select id="sapp-duration" required>
                            <option value="30">30 دقيقة</option>
                            <option value="45" selected>45 دقيقة</option>
                            <option value="60">60 دقيقة</option>
                            <option value="90">90 دقيقة</option>
                        </select>
                    </div>
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

    // إغلاق أي مودال من المودالين ده بس (ما بيأثرش على أي مودال تاني
    // موجود في الصفحة زي مودال "إضافة طالب" في students.html مثلاً)
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
    const dayGroup = document.getElementById('sapp-day-group');
    const dateGroup = document.getElementById('sapp-date-group');
    const note = document.getElementById('sapp-recurrence-note');
    const daySelect = document.getElementById('sapp-day');
    const dateInput = document.getElementById('sapp-date');

    if (type === 'weekly') {
        dayGroup.style.display = 'block';
        dateGroup.style.display = 'none';
        daySelect.required = true;
        dateInput.required = false;
        note.style.display = 'none';
    } else if (type === 'daily') {
        dayGroup.style.display = 'none';
        dateGroup.style.display = 'none';
        daySelect.required = false;
        dateInput.required = false;
        note.style.display = 'block';
        note.textContent = 'سيتم إضافة هذا الموعد في نفس الوقت في كل أيام الأسبوع السبعة.';
    } else {
        dayGroup.style.display = 'none';
        dateGroup.style.display = 'block';
        daySelect.required = false;
        dateInput.required = true;
        note.style.display = 'block';
        note.textContent = type === 'monthly'
            ? 'يظهر الموعد في الجدول الأسبوعي على يوم الأسبوع المطابق للتاريخ المحدد، كتذكير بالتكرار الشهري.'
            : 'هذا موعد لمرة واحدة فقط في التاريخ المحدد.';
    }
}

function openAddForm() {
    document.getElementById('sapp-form-title').textContent = 'إضافة موعد';
    document.getElementById('sapp-id').value = '';
    document.getElementById('sapp-recurrence-group').value = '';
    document.getElementById('sapp-recurrence').value = 'weekly';
    document.getElementById('sapp-day').value = '0';
    document.getElementById('sapp-date').value = '';
    document.getElementById('sapp-time').value = '16:00';
    document.getElementById('sapp-duration').value = '45';
    updateRecurrenceFields();
    document.getElementById('sapp-form-modal').classList.add('active');
}

function openEditForm(sch) {
    document.getElementById('sapp-form-title').textContent = 'تعديل الموعد';
    document.getElementById('sapp-id').value = sch.id;
    document.getElementById('sapp-recurrence-group').value = sch.recurrence_group_id || '';
    document.getElementById('sapp-recurrence').value = sch.recurrence_type || 'weekly';
    document.getElementById('sapp-day').value = sch.day_of_week;
    document.getElementById('sapp-date').value = sch.start_date ? String(sch.start_date).substring(0, 10) : '';
    document.getElementById('sapp-time').value = sch.start_time.substring(0, 5);
    document.getElementById('sapp-duration').value = String(sch.duration_minutes);
    updateRecurrenceFields();
    document.getElementById('sapp-form-modal').classList.add('active');
}

async function handleFormSubmit(e) {
    e.preventDefault();
    const id = document.getElementById('sapp-id').value;
    const recurrenceType = document.getElementById('sapp-recurrence').value;
    const startTime = document.getElementById('sapp-time').value;
    const duration = parseInt(document.getElementById('sapp-duration').value);
    const dateValue = document.getElementById('sapp-date').value;
    const existingGroupId = document.getElementById('sapp-recurrence-group').value || null;
    const saveBtn = document.getElementById('sapp-save-btn');

    try {
        saveBtn.disabled = true;
        saveBtn.textContent = 'جاري الحفظ...';

        if (!id && recurrenceType === 'daily') {
            // نفس منطق "يوميًا" الموجود في صفحة الجدول العام: إنشاء 7 مواعيد
            // (كل أيام الأسبوع) بنفس معرّف مجموعة التكرار، بالتوازي.
            const groupId = genGroupId();

            const results = await Promise.allSettled(
                Array.from({ length: 7 }, (_, day) => api.createSchedule({
                    student_id: currentStudentId,
                    day_of_week: day,
                    start_time: startTime,
                    duration_minutes: duration,
                    recurrence_type: 'daily',
                    recurrence_group_id: groupId
                }))
            );

            const failedDays = [];
            let successCount = 0;
            results.forEach((r, day) => {
                if (r.status === 'fulfilled') {
                    successCount++;
                } else {
                    failedDays.push(`${DAY_NAMES[day]} (${ErrorHandler.getErrorMessage(r.reason)})`);
                }
            });

            if (successCount === 0) {
                throw new Error('لم يتم إنشاء أي موعد: ' + failedDays.join('، '));
            }
            if (failedDays.length > 0) {
                ErrorHandler.showError(`تم إنشاء ${successCount} من 7 أيام فقط. الأيام التي بها تعارض ولم تُضف: ${failedDays.join('، ')}`);
            } else {
                ErrorHandler.showSuccess('تم حفظ الموعد بنجاح في كل أيام الأسبوع');
            }
            document.getElementById('sapp-form-modal').classList.remove('active');
            await loadList();
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
            payload.day_of_week = parseInt(document.getElementById('sapp-day').value || '0');
            payload.start_date = null;
        } else {
            if (!dateValue) throw new Error('يرجى اختيار التاريخ');
            payload.start_date = dateValue;
            payload.day_of_week = new Date(dateValue + 'T00:00:00').getDay();
        }
        if (id) {
            await api.updateSchedule(id, payload);
        } else {
            await api.createSchedule(payload);
        }

        ErrorHandler.showSuccess('تم حفظ الموعد بنجاح');
        document.getElementById('sapp-form-modal').classList.remove('active');
        await loadList();
    } catch (error) {
        ErrorHandler.showError(ErrorHandler.getErrorMessage(error));
    } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = 'حفظ الموعد';
    }
}

function renderList() {
    const list = document.getElementById('sapp-list');
    if (studentSchedules.length === 0) {
        list.innerHTML = '<div class="empty-state">لا توجد مواعيد مجدولة لهذا الطالب بعد</div>';
        return;
    }
    const sorted = [...studentSchedules].sort((a, b) => a.day_of_week - b.day_of_week || a.start_time.localeCompare(b.start_time));
    list.innerHTML = sorted.map(sch => `
        <div class="sapp-item" data-id="${sch.id}">
            <div class="sapp-item-info">
                <span class="sapp-item-day">${DAY_NAMES[sch.day_of_week] || ''} - ${Formatters.formatTime(sch.start_time)}</span>
                <span class="sapp-item-meta">${sch.duration_minutes} دقيقة${sch.recurrence_type ? ' · ' + (RECURRENCE_LABELS[sch.recurrence_type] || '') : ''}</span>
            </div>
            <div class="sapp-item-actions">
                <button type="button" class="sapp-icon-btn" title="تعديل الموعد" data-action="edit" data-id="${sch.id}">${icon('edit', { size: 14 })}</button>
                <button type="button" class="sapp-icon-btn danger" title="حذف الموعد" data-action="delete" data-id="${sch.id}">${icon('trash', { size: 14 })}</button>
            </div>
        </div>
    `).join('');
}

async function loadList() {
    const list = document.getElementById('sapp-list');
    list.innerHTML = '<div class="empty-state">جاري التحميل...</div>';
    try {
        const data = await api.getSchedules();
        const all = data.schedules || [];
        studentSchedules = all.filter(s => s.student_id === currentStudentId);
        renderList();
    } catch (error) {
        list.innerHTML = `<div class="empty-state">تعذّر تحميل المواعيد: ${Formatters.escapeHtml(ErrorHandler.getErrorMessage(error))}</div>`;
    }
}

/**
 * الدالة الرئيسية اللي أي صفحة تناديها: بتفتح بوب أب مواعيد الطالب
 * (بتحقن الـ HTML أول مرة بس لو لسه متحقنش) وتحمّل مواعيد الطالب ده.
 * @param {string} studentId - معرف الطالب
 * @param {string} [studentName] - اسم الطالب (اختياري، بيظهر في عنوان البوب أب)
 */
export async function openStudentAppointments(studentId, studentName = '') {
    injectMarkup();
    currentStudentId = studentId;
    document.getElementById('sapp-list-title').textContent = studentName ? `مواعيد ${studentName}` : 'مواعيد الطالب';
    document.getElementById('sapp-list-modal').classList.add('active');
    await loadList();
}

// إتاحتها عالميًا كمان عشان أي صفحة تقدر تستخدمها بـ onclick مباشر
// من غير ما تعمل import لو حابة (اختياري، الاستخدام الموصى به هو الـ import)
window.openStudentAppointments = openStudentAppointments;
