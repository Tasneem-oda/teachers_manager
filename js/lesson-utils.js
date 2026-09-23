/**
 * lesson-utils.js - أدوات مشتركة لصفحة الحصة وملف الطالب
 * (أسماء المواد، التقييمات بالعربي، التواريخ النسبية، أقرب موعد قادم، مسودة الحصة)
 */

import { Formatters } from './utils.js?v=11';

export const SUBJECTS = {
    quran: 'القرآن الكريم',
    english: 'اللغة الإنجليزية',
    arabic: 'اللغة العربية',
    math: 'الرياضيات',
    science: 'العلوم'
};

export function subjectLabel(subject) {
    if (!subject) return 'بدون مادة';
    return SUBJECTS[subject] || SUBJECTS[String(subject).toLowerCase()] || subject;
}

export function isQuran(subject) {
    const s = String(subject || '').toLowerCase();
    return s === 'quran' || s.includes('قرآن') || s.includes('قران');
}

export const RATINGS = [
    { value: 'excellent', label: 'ممتاز' },
    { value: 'very_good', label: 'جيد جدًا' },
    { value: 'good', label: 'جيد' },
    { value: 'fair', label: 'مقبول' },
    { value: 'poor', label: 'ضعيف' }
];

// الحصص القديمة ممكن يكون فيها رمز إنجليزي أو نص حر: بنعرض العربي لو معروف، وإلا النص زي ما هو
export function ratingLabel(value) {
    if (!value) return '';
    const r = RATINGS.find((x) => x.value === value);
    return r ? r.label : String(value);
}

// نفس الأعمدة (memorization / recitation) بتسميات مناسبة لمادة الطالب
export function ratingFieldLabels(subject) {
    return isQuran(subject)
        ? { memorization: 'الحفظ', recitation: 'التلاوة' }
        : { memorization: 'الاستيعاب', recitation: 'المشاركة' };
}

// متابعة الواجب السابق (بيتخزن في عمود revision الموجود)
export const HOMEWORK_STATUS = [
    { value: 'done', label: 'تم' },
    { value: 'partial', label: 'جزئيًا' },
    { value: 'not_done', label: 'لم يتم' }
];

export function homeworkStatusLabel(value) {
    if (!value) return '';
    const h = HOMEWORK_STATUS.find((x) => x.value === value);
    return h ? `الواجب السابق: ${h.label}` : `مراجعة: ${value}`;
}

// ------------------------------------------------------------------ التواريخ
const pad = (n) => String(n).padStart(2, '0');

export function localDateISO(d = new Date()) {
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function localTimeISO(d = new Date()) {
    return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function startOfDay(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }

// تاريخ الحصة بيتخزن كتاريخ (بدون وقت مهم)، فبنقرأ اليوم نفسه من غير ما المنطقة الزمنية تزحزحه
export function lessonDay(value) {
    if (!value) return null;
    const s = String(value);
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) {
        const d = new Date(value);
        // لو الوقت المخزن 12:00 UTC أو منتصف الليل UTC: اليوم الصحيح هو الجزء الأول من النص
        if (/T(00|12):00:00/.test(s) || s.length === 10) return new Date(+m[1], +m[2] - 1, +m[3]);
        return isNaN(d) ? new Date(+m[1], +m[2] - 1, +m[3]) : d;
    }
    const d = new Date(value);
    return isNaN(d) ? null : d;
}

export function formatLessonDate(value) {
    const d = lessonDay(value);
    return d ? Formatters.formatDate(d) : '-';
}

export function relativeDay(value) {
    const d = lessonDay(value);
    if (!d) return '-';
    const diff = Math.round((startOfDay(new Date()) - startOfDay(d)) / 86400000);
    if (diff === 0) return 'اليوم';
    if (diff === 1) return 'أمس';
    if (diff === 2) return 'منذ يومين';
    if (diff > 2 && diff <= 10) return `منذ ${diff} أيام`;
    if (diff < 0 && diff >= -1) return 'غدًا';
    return Formatters.formatDate(d);
}

const DAYS = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

export function formatClock(date) {
    let h = date.getHours();
    const m = pad(date.getMinutes());
    const suffix = h >= 12 ? 'م' : 'ص';
    h = h % 12 || 12;
    return `${h}:${m} ${suffix}`;
}

/**
 * أقرب موعد قادم من مواعيد الطالب (أسبوعي / يومي / شهري / مرة واحدة)
 * بيرجّع { date, duration } أو null
 */
export function nextOccurrence(schedules, now = new Date()) {
    let best = null;
    const consider = (d, s) => {
        if (d > now && (!best || d < best.date)) best = { date: d, duration: s.duration_minutes || 45 };
    };
    (schedules || []).forEach((s) => {
        if (!s || !s.start_time) return;
        const [hh, mm] = String(s.start_time).split(':').map((x) => parseInt(x, 10) || 0);
        const startDate = s.start_date ? lessonDay(s.start_date) : null;
        const type = s.recurrence_type || 'weekly';
        if (type === 'none') {
            if (!startDate) return;
            const d = new Date(startDate); d.setHours(hh, mm, 0, 0);
            consider(d, s);
        } else if (type === 'monthly') {
            if (!startDate) return;
            for (let k = 0; k < 3; k++) {
                const d = new Date(now.getFullYear(), now.getMonth() + k, startDate.getDate(), hh, mm);
                if (d.getDate() !== startDate.getDate()) continue;   // شهر مافيهوش اليوم ده (31 مثلًا)
                if (d >= startDate) consider(d, s);
            }
        } else {
            for (let k = 0; k < 8; k++) {
                const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + k, hh, mm);
                if (d.getDay() !== Number(s.day_of_week)) continue;
                if (startDate && d < startDate) continue;
                consider(d, s);
            }
        }
    });
    return best;
}

export function formatNextOccurrence(next, now = new Date()) {
    if (!next) return null;
    const diff = Math.round((startOfDay(next.date) - startOfDay(now)) / 86400000);
    const day = diff === 0 ? 'اليوم' : diff === 1 ? 'غدًا' : DAYS[next.date.getDay()];
    return `${day} ${formatClock(next.date)}`;
}

export function formatDuration(ms) {
    const total = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

export function minutesText(ms) {
    const m = Math.max(1, Math.round(ms / 60000));
    if (m === 1) return 'دقيقة واحدة';
    if (m === 2) return 'دقيقتين';
    if (m <= 10) return `${m} دقائق`;
    return `${m} دقيقة`;
}

// ------------------------------------------------------------------ مسودة الحصة (حفظ تلقائي في المتصفح)
const DRAFT_PREFIX = 'tm_lesson_draft:';

export const LessonDraft = {
    load(studentId) {
        try { return JSON.parse(localStorage.getItem(DRAFT_PREFIX + studentId) || 'null'); } catch (e) { return null; }
    },
    save(studentId, draft) {
        try { localStorage.setItem(DRAFT_PREFIX + studentId, JSON.stringify({ ...draft, savedAt: Date.now() })); return true; } catch (e) { return false; }
    },
    clear(studentId) {
        try { localStorage.removeItem(DRAFT_PREFIX + studentId); } catch (e) { /* تجاهل */ }
    }
};

// هل الحصة فيها أي بيانات مكتوبة؟
export function lessonHasContent(fields) {
    return Object.entries(fields || {}).some(([k, v]) => k !== 'current_topic' && v && String(v).trim());
}

/**
 * HTML لعرض حصة واحدة في السجل (ملف الطالب + لوحة الحصص السابقة أثناء الحصة)
 */
export function lessonDetailsHtml(lesson, subject, icon, opts = {}) {
    const esc = Formatters.escapeHtml;
    const labels = ratingFieldLabels(subject);
    const rows = [];
    const row = (ic, label, value, cls = '') => {
        if (value) rows.push(`<div class="lh-row ${cls}"><span class="lh-ic">${icon(ic, { size: 14 })}</span><div><span class="lh-label">${label}</span><span class="lh-val">${esc(value)}</span></div></div>`);
    };
    row('bookOpen', 'ماذا تم', lesson.lesson_content);
    const chips = [];
    if (lesson.memorization) chips.push(`${labels.memorization}: ${ratingLabel(lesson.memorization)}`);
    if (lesson.recitation) chips.push(`${labels.recitation}: ${ratingLabel(lesson.recitation)}`);
    if (lesson.revision) chips.push(homeworkStatusLabel(lesson.revision));
    if (chips.length) rows.push(`<div class="lh-chips">${chips.map((c) => `<span class="lh-chip">${esc(c)}</span>`).join('')}</div>`);
    row('clipboardList', 'الواجب', lesson.homework);
    row('arrowNext', 'للحصة القادمة', lesson.next_assignment, opts.highlightNext ? 'lh-next' : '');
    row('star', 'ملاحظات الأداء', lesson.performance);
    row('messageSquare', 'ملاحظات', lesson.notes);
    if (!rows.length) return '<div class="lh-empty">لم تُسجَّل تفاصيل لهذه الحصة.</div>';
    return rows.join('');
}
