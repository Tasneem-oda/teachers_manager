/**
 * groups-utils.js (v26) - أدوات مشتركة للمجموعات:
 * الاسم المعروض، ملخص المواعيد، محرر المواعيد، ونافذة اختيار الطلاب
 */
import { Formatters, ErrorHandler, askChoice } from './utils.js?v=30';
import { icon } from './icons.js?v=30';
import { DAY_NAMES, WEEK_ORDER, timeToMinutes, formatClock12, durationText, parseDate } from './calendar-utils.js?v=30';
import { SUBJECTS } from './lesson-utils.js?v=30';

const esc = (s) => Formatters.escapeHtml(s == null ? '' : String(s));

export const GROUP_COLORS = ['purple', 'blue', 'green', 'gold', 'rose', 'gray'];
export const GROUP_COLOR_LABELS = { purple: 'بنفسجي', blue: 'أزرق', green: 'أخضر', gold: 'ذهبي', rose: 'وردي', gray: 'رمادي' };

export function groupColorClass(color) {
    return `gc-${GROUP_COLORS.includes(color) ? color : 'purple'}`;
}

/** "مجموعة السبت" لو الاسم مش بادئ بكلمة مجموعة، وإلا زي ما هو */
export function groupTitle(name) {
    const n = String(name || '').trim();
    if (!n) return 'مجموعة';
    return /^مجموع/.test(n) ? n : `مجموعة ${n}`;
}

export function membersText(n) {
    n = Number(n) || 0;
    if (n === 0) return 'مفيش طلاب لسه';
    if (n === 1) return 'طالب واحد';
    if (n === 2) return 'طالبين';
    if (n <= 10) return `${n} طلاب`;
    return `${n} طالب`;
}

/** ملخص المواعيد: "السبت والثلاثاء 6:00 م" (الأيام اللي في نفس الوقت بتتجمع) */
export function scheduleSummary(schedules) {
    const list = Array.isArray(schedules) ? schedules : [];
    if (!list.length) return 'من غير مواعيد';
    const weekly = list.filter((s) => (s.recurrence_type || 'weekly') === 'weekly');
    const once = list.filter((s) => s.recurrence_type === 'none');
    const byTime = new Map();
    weekly.forEach((s) => {
        const key = `${String(s.start_time).slice(0, 5)}|${s.duration_minutes || 60}`;
        if (!byTime.has(key)) byTime.set(key, []);
        byTime.get(key).push(Number(s.day_of_week));
    });
    const parts = [];
    byTime.forEach((days, key) => {
        const [t] = key.split('|');
        const ordered = WEEK_ORDER.filter((d) => days.includes(d)).map((d) => DAY_NAMES[d]);
        const dayText = ordered.length > 1 ? `${ordered.slice(0, -1).join('، ')} و${ordered[ordered.length - 1]}` : ordered[0];
        parts.push(`${dayText} ${formatClock12(timeToMinutes(t))}`);
    });
    once.forEach((s) => {
        const d = parseDate(s.start_date);
        const dt = d ? d.toLocaleDateString('ar-EG-u-nu-latn', { weekday: 'long', day: 'numeric', month: 'long' }) : '';
        parts.push(`${dt} ${formatClock12(timeToMinutes(s.start_time))} (مرة واحدة)`);
    });
    return parts.join(' · ');
}

/** اختيارات المادة (نفس قايمة باقي البرنامج) */
export function subjectOptionsHtml(selected = '', placeholder = 'بدون مادة') {
    const opts = [`<option value="">${esc(placeholder)}</option>`];
    Object.entries(SUBJECTS).forEach(([v, l]) => opts.push(`<option value="${v}" ${v === selected ? 'selected' : ''}>${esc(l)}</option>`));
    if (selected && !SUBJECTS[selected]) opts.push(`<option value="${esc(selected)}" selected>${esc(/[؀-ۿ]/.test(selected) ? selected : 'أخرى')}</option>`);
    return opts.join('');
}

// ------------------------------------------------------------------ محرر المواعيد
const DURATIONS = [30, 45, 60, 75, 90, 120, 150, 180];

/**
 * صفوف: اليوم (أسبوعي) أو "مرة واحدة" بتاريخ + الوقت + المدة
 * بيرجّع { get() } — get بترجّع المواعيد جاهزة للإرسال أو بترمي Error برسالة عربي
 */
export function mountScheduleEditor(root, schedules = []) {
    root.innerHTML = `<div class="sched-rows"></div>
        <button type="button" class="btn btn-outline btn-sm sched-add">${icon('plus', { size: 15 })} ميعاد تاني</button>
        <p class="sched-hint">كل ميعاد أسبوعي بيتكرر كل أسبوع في نفس اليوم. "مرة واحدة" لحصة إضافية أو تعويض.</p>`;
    const rows = root.querySelector('.sched-rows');

    function rowHtml(s = {}) {
        const rec = s.recurrence_type === 'none' ? 'none' : 'weekly';
        const day = s.day_of_week != null ? Number(s.day_of_week) : 6;
        const dur = Number(s.duration_minutes) || 60;
        const durs = DURATIONS.includes(dur) ? DURATIONS : [...DURATIONS, dur].sort((a, b) => a - b);
        return `<div class="sched-row">
            <select class="sr-when" aria-label="اليوم">
                ${WEEK_ORDER.map((d) => `<option value="${d}" ${rec === 'weekly' && d === day ? 'selected' : ''}>كل ${DAY_NAMES[d]}</option>`).join('')}
                <option value="once" ${rec === 'none' ? 'selected' : ''}>مرة واحدة (تاريخ)</option>
            </select>
            <input type="date" class="sr-date" aria-label="التاريخ" value="${esc(s.start_date || '')}" ${rec === 'none' ? '' : 'hidden'}>
            <input type="time" class="sr-time" aria-label="الوقت" value="${esc(String(s.start_time || '').slice(0, 5) || '17:00')}">
            <select class="sr-dur" aria-label="المدة">${durs.map((m) => `<option value="${m}" ${m === dur ? 'selected' : ''}>${esc(durationText(m))}</option>`).join('')}</select>
            <button type="button" class="sr-del" aria-label="شيل الميعاد ده">${icon('trash', { size: 16 })}</button>
        </div>`;
    }
    function add(s) {
        rows.insertAdjacentHTML('beforeend', rowHtml(s));
        const row = rows.lastElementChild;
        const when = row.querySelector('.sr-when');
        const date = row.querySelector('.sr-date');
        when.addEventListener('change', () => {
            const once = when.value === 'once';
            date.hidden = !once;
            if (once && !date.value) date.value = new Date().toLocaleDateString('en-CA');
        });
        row.querySelector('.sr-del').addEventListener('click', () => row.remove());
    }
    (schedules.length ? schedules : []).forEach(add);
    root.querySelector('.sched-add').addEventListener('click', () => {
        const last = rows.lastElementChild;
        if (last) {
            // الميعاد الجديد بنفس وقت ومدة اللي قبله (أغلب المجموعات بتتكرر بنفس الساعة)
            add({ day_of_week: 6, start_time: last.querySelector('.sr-time').value, duration_minutes: Number(last.querySelector('.sr-dur').value) });
        } else add({});
    });

    return {
        isEmpty: () => !rows.children.length,
        addDefault: () => add({}),
        get() {
            const out = [];
            const seen = new Set();
            [...rows.children].forEach((row) => {
                const whenV = row.querySelector('.sr-when').value;
                const time = row.querySelector('.sr-time').value;
                const dur = Number(row.querySelector('.sr-dur').value) || 60;
                if (!time) throw new Error('اكتب وقت كل ميعاد');
                if (whenV === 'once') {
                    const d = row.querySelector('.sr-date').value;
                    if (!d) throw new Error('اختار تاريخ الميعاد اللي "مرة واحدة"');
                    out.push({ recurrence_type: 'none', start_date: d, start_time: time, duration_minutes: dur });
                } else {
                    const key = `${whenV}|${time}`;
                    if (seen.has(key)) return;
                    seen.add(key);
                    out.push({ recurrence_type: 'weekly', day_of_week: Number(whenV), start_time: time, duration_minutes: dur });
                }
            });
            return out;
        }
    };
}

// ------------------------------------------------------------------ اختيار الطلاب
/**
 * قايمة طلاب بخانات اختيار + بحث + إضافة طالب جديد بالاسم
 * opts: { students, selectedIds, excludeIds, onCreateStudent(name) => Promise<{id,name}> }
 * بيرجّع { getSelected() }
 */
export function mountStudentPicker(root, opts = {}) {
    const exclude = new Set((opts.excludeIds || []).map(String));
    const selected = new Set((opts.selectedIds || []).map(String));
    let students = (opts.students || []).filter((s) => !exclude.has(String(s.id)));
    root.innerHTML = `
        <input type="search" class="pick-search" placeholder="ابحث باسم الطالب…" aria-label="ابحث عن طالب" autocomplete="off">
        <div class="pick-list" role="group" aria-label="الطلاب"></div>
        <p class="pick-count"></p>
        ${opts.onCreateStudent ? `<div class="quick-new">
            <input type="text" class="qn-name" maxlength="120" placeholder="طالب مش موجود؟ اكتب اسمه" aria-label="اسم طالب جديد">
            <button type="button" class="btn btn-outline btn-sm qn-add">${icon('plus', { size: 15 })} ضيفه</button>
        </div>` : ''}`;
    const list = root.querySelector('.pick-list');
    const search = root.querySelector('.pick-search');
    const count = root.querySelector('.pick-count');

    function render() {
        const q = search.value.trim().toLowerCase();
        const shown = students.filter((s) => !q || String(s.name || '').toLowerCase().includes(q));
        list.innerHTML = shown.length
            ? shown.map((s) => `<label class="pick-item"><input type="checkbox" value="${esc(s.id)}" ${selected.has(String(s.id)) ? 'checked' : ''}>
                <span>${esc(s.name)}</span>${s.subject ? `<small>${esc(SUBJECTS[s.subject] || '')}</small>` : ''}</label>`).join('')
            : `<div class="pick-empty">${students.length ? 'مفيش طالب بالاسم ده' : 'كل طلابك في المجموعة دي بالفعل'}</div>`;
        count.textContent = selected.size ? `اخترت ${membersText(selected.size)}` : '';
    }
    list.addEventListener('change', (e) => {
        const cb = e.target.closest('input[type=checkbox]');
        if (!cb) return;
        if (cb.checked) selected.add(cb.value); else selected.delete(cb.value);
        count.textContent = selected.size ? `اخترت ${membersText(selected.size)}` : '';
    });
    search.addEventListener('input', render);

    if (opts.onCreateStudent) {
        const nameIn = root.querySelector('.qn-name');
        const btn = root.querySelector('.qn-add');
        const create = async () => {
            const name = nameIn.value.trim();
            if (!name) { nameIn.focus(); return; }
            btn.disabled = true;
            try {
                const st = await opts.onCreateStudent(name);
                if (st && st.id) {
                    students = [st, ...students];
                    selected.add(String(st.id));
                    nameIn.value = '';
                    search.value = '';
                    render();
                    ErrorHandler.showSuccess(`اتضاف ${name}`);
                }
            } catch (err) {
                ErrorHandler.showError(ErrorHandler.getErrorMessage(err));
            } finally { btn.disabled = false; }
        };
        btn.addEventListener('click', create);
        nameIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); create(); } });
    }
    render();
    return { getSelected: () => [...selected] };
}

/** إنشاء طالب جديد بالاسم بس (من جوه المجموعة) وإرجاع { id, name } */
export async function quickCreateStudent(api, name, subject) {
    const res = await api.createStudent({ name, phone: null, subject: subject || null, email: null, lesson_link: null, current_topic: null });
    let id = res && (res.id || res.student_id || (res.student && res.student.id));
    if (!id) {
        // نسخة الخادم القديمة مابترجّعش الـ id: ندوّر عليه بالاسم
        const all = await api.getAllStudents();
        const found = (all.students || []).find((s) => s.name === name);
        id = found && found.id;
    }
    return id ? { id, name, subject } : null;
}

/** نص ملخص الحصة اللي بيتبعت على جروب واتساب المجموعة */
export function sessionShareText(groupName, s) {
    const lines = [`📚 ${groupTitle(groupName)}`];
    if (s.session_date) {
        const d = parseDate(s.session_date);
        if (d) lines.push(`حصة ${d.toLocaleDateString('ar-EG-u-nu-latn', { weekday: 'long', day: 'numeric', month: 'long' })}`);
    }
    if (s.status === 'cancelled') { lines.push('الحصة دي اتلغت.'); return lines.join('\n'); }
    if (s.lesson_content) lines.push('', `✅ اللي أخدناه: ${s.lesson_content}`);
    if (s.homework) lines.push('', `📝 الواجب: ${s.homework}`);
    if (s.next_assignment) lines.push('', `📌 الحصة الجاية: ${s.next_assignment}`);
    return lines.join('\n');
}

// ============================================================ v27
/**
 * حفظ مواعيد المجموعة مع فحص التعارض على الخادم:
 * save(force) لازم ترجّع نتيجة groups (فيها blocked + conflicts).
 * لو فيه تعارض بنسأل المدرس "تحفظ برضه؟" ونعيد الطلب بـ force. بيرجّع null لو المدرس رجع.
 */
export async function saveWithConflictCheck(save) {
    const res = await save(false);
    if (!res || !res.blocked) return res;
    const list = (res.conflicts || []).slice(0, 6).map((c) => {
        const what = c.kind === 'group' ? groupTitle(c.title) : `حصة ${c.title}`;
        return `• ${what}: ${DAY_NAMES[c.day_of_week] || ''} ${formatClock12(timeToMinutes(c.start_time))}`;
    });
    const more = (res.conflicts || []).length > 6 ? `\nو${(res.conflicts || []).length - 6} كمان` : '';
    const pick = await askChoice({
        title: 'المواعيد دي بتتعارض مع مواعيد تانية',
        message: `${list.join('\n')}${more}\n\nلو ده مقصود (مثلًا الطالب بيحضر في المجموعة بدل حصته) احفظ برضه.`,
        choices: [{ label: 'احفظ برضه', value: 'yes' }],
        cancelLabel: 'أغيّر الميعاد'
    });
    if (!pick) return null;
    return await save(true);
}

/** أقرب ميعاد للمجموعة النهارده (HH:MM) أو '' */
export function todayScheduleTime(schedules, date = new Date()) {
    const dow = date.getDay();
    const iso = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    const nowMin = date.getHours() * 60 + date.getMinutes();
    const today = (schedules || []).filter((s) => (s.recurrence_type === 'none' ? s.start_date === iso : Number(s.day_of_week) === dow && (!s.start_date || s.start_date <= iso)));
    if (!today.length) return '';
    today.sort((a, b) => Math.abs(timeToMinutes(a.start_time) - nowMin) - Math.abs(timeToMinutes(b.start_time) - nowMin));
    return String(today[0].start_time || '').slice(0, 5);
}

const MONTHS_AR = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
/** 'YYYY-MM' للشهر الحالي بتوقيت الجهاز */
export function currentMonthKey(d = new Date()) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
export function shiftMonth(key, n) {
    const [y, m] = String(key).split('-').map(Number);
    const d = new Date(y, m - 1 + n, 1);
    return currentMonthKey(d);
}
/** "أكتوبر 2026" أو "أكتوبر" (short) */
export function monthLabel(key, short = false) {
    const [y, m] = String(key).split('-').map(Number);
    if (!y || !m) return '';
    return short ? MONTHS_AR[m - 1] : `${MONTHS_AR[m - 1]} ${y}`;
}
