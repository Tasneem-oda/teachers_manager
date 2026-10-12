/**
 * calendar-utils.js - منطق الجدول المشترك (الحصص + المواعيد الشخصية)
 *
 * - الأسبوع بيبدأ بالسبت وبيخلص بالجمعة.
 * - كل موعد (حصة أو موعد شخصي) بيتحول لـ "عنصر" موحّد، ونعرف هو بيحصل في يوم معيّن ولا لأ
 *   بنفس منطق قاعدة البيانات بالظبط (get-today-lessons وإشعار الصبح).
 */

export const DAY_NAMES = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
export const DAY_SHORT = ['أحد', 'اثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة', 'سبت'];
export const WEEK_ORDER = [6, 0, 1, 2, 3, 4, 5];

export const EVENT_COLORS = {
    gold:  { label: 'دهبي', bg: '#F6EAD3', border: '#C59A4A', text: '#6B4E17' },
    green: { label: 'أخضر', bg: '#E3EEE4', border: '#6F8F72', text: '#2F4D32' },
    blue:  { label: 'أزرق', bg: '#E1EAF4', border: '#5B7FA6', text: '#23415F' },
    rose:  { label: 'وردي', bg: '#F5E1E4', border: '#B8707C', text: '#6A2C37' },
    gray:  { label: 'رمادي', bg: '#ECEAEE', border: '#8A8290', text: '#3E3843' }
};

const pad = (n) => String(n).padStart(2, '0');

/** "2026-10-09" من تاريخ محلي (من غير مشاكل المنطقة الزمنية) */
export function isoDate(d) {
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
/** تاريخ محلي من "2026-10-09" أو "2026-10-09T00:00:00Z" */
export function parseDate(value) {
    if (!value) return null;
    const m = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
}
/** سبت الأسبوع اللي فيه التاريخ ده */
export function weekStart(date = new Date()) {
    const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const back = (d.getDay() + 1) % 7;   // السبت = 0
    d.setDate(d.getDate() - back);
    return d;
}
export function addDays(date, n) {
    const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    d.setDate(d.getDate() + n);
    return d;
}
export function sameDay(a, b) {
    return a && b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
/** الأيام السبعة للأسبوع (سبت ← جمعة) */
export function weekDays(start) {
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

export function timeToMinutes(t) {
    const [h, m] = String(t || '0:0').split(':').map((x) => parseInt(x, 10) || 0);
    return h * 60 + m;
}
export function minutesToTime(min) {
    const m = ((min % 1440) + 1440) % 1440;
    return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
}
/** "4:30 م" */
export function formatClock12(min) {
    const m = ((min % 1440) + 1440) % 1440;
    const h = Math.floor(m / 60);
    return `${(h % 12) || 12}:${pad(m % 60)} ${h >= 12 ? 'م' : 'ص'}`;
}
/** "4:00 – 4:45 م" (لو الاتنين في نفس الفترة بنكتب ص/م مرة واحدة) */
export function formatRange(startMin, duration) {
    const end = startMin + (duration || 0);
    const a = formatClock12(startMin);
    const b = formatClock12(end);
    const pa = a.slice(-1);
    const pb = b.slice(-1);
    return pa === pb ? `${a.slice(0, -2)} – ${b}` : `${a} – ${b}`;
}
export function durationText(min) {
    if (min === 60) return 'ساعة';
    if (min === 90) return 'ساعة ونص';
    if (min === 120) return 'ساعتين';
    if (min > 60 && min % 60 === 0) return `${min / 60} ساعات`;
    return `${min} دقيقة`;
}
export function formatDayDate(d, opts = { weekday: 'long', day: 'numeric', month: 'long' }) {
    try { return d.toLocaleDateString('ar-EG', opts); } catch (e) { return isoDate(d); }
}

/** هل العنصر بيحصل في التاريخ ده؟ (نفس منطق SQL) */
export function occursOn(item, date) {
    const type = item.recurrence_type || 'weekly';
    const start = parseDate(item.start_date);
    const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    if (type === 'weekly' || type === 'daily') {
        return Number(item.day_of_week) === d.getDay() && (!start || start <= d);
    }
    if (type === 'monthly') return !!start && start <= d && start.getDate() === d.getDate();
    if (type === 'none') return !!start && sameDay(start, d);
    return false;
}

/** حصة (من جدول schedules) ← عنصر موحّد */
export function lessonItem(sch, studentName) {
    return {
        kind: 'lesson',
        id: sch.id,
        title: studentName || sch.student_name || 'طالب',
        student_id: sch.student_id,
        day_of_week: Number(sch.day_of_week),
        start: timeToMinutes(sch.start_time),
        duration: Number(sch.duration_minutes) || 45,
        recurrence_type: sch.recurrence_type || 'weekly',
        start_date: sch.start_date || null,
        group: sch.recurrence_group_id || null,
        color: 'lesson',
        raw: sch
    };
}
/** موعد شخصي ← عنصر موحّد */
export function eventItem(ev) {
    return {
        kind: 'event',
        id: ev.id,
        title: ev.title || 'موعد',
        note: ev.note || '',
        day_of_week: Number(ev.day_of_week),
        start: timeToMinutes(ev.start_time),
        duration: Number(ev.duration_minutes) || 60,
        recurrence_type: ev.recurrence_type || 'weekly',
        start_date: ev.start_date || null,
        group: ev.recurrence_group_id || null,
        color: EVENT_COLORS[ev.color] ? ev.color : 'gold',
        raw: ev
    };
}

/** العناصر اللي بتحصل في يوم معيّن، مرتبة بالوقت */
export function itemsOn(items, date) {
    return items.filter((it) => occursOn(it, date)).sort((a, b) => a.start - b.start || (a.kind === 'event') - (b.kind === 'event'));
}

/**
 * توزيع العناصر المتداخلة جنب بعض (عشان مايغطوش على بعض في عرض الأسبوع)
 * بيضيف لكل عنصر: lane (رقم العمود) و lanes (عدد الأعمدة في مجموعته)
 */
export function layoutLanes(dayItems) {
    const sorted = [...dayItems].sort((a, b) => a.start - b.start);
    const out = [];
    let cluster = [];
    let clusterEnd = -1;
    const flush = () => {
        const lanesEnd = [];
        cluster.forEach((it) => {
            let lane = lanesEnd.findIndex((end) => end <= it.start);
            if (lane === -1) { lane = lanesEnd.length; lanesEnd.push(0); }
            lanesEnd[lane] = it.start + it.duration;
            out.push({ ...it, lane });
        });
        const n = lanesEnd.length;
        out.slice(out.length - cluster.length).forEach((it) => { it.lanes = n; });
        cluster = [];
        clusterEnd = -1;
    };
    sorted.forEach((it) => {
        if (cluster.length && it.start >= clusterEnd) flush();
        cluster.push(it);
        clusterEnd = Math.max(clusterEnd, it.start + it.duration);
    });
    if (cluster.length) flush();
    return out;
}

/**
 * التعارضات مع عنصر جديد/متعدّل.
 * target: { days: [dow...] أو date, start, duration, recurrence_type }
 * بيرجّع قائمة العناصر اللي بتتقاطع معاه (مع استبعاد العنصر نفسه)
 */
export function findConflicts(items, target, excludeKey = '') {
    const s = target.start;
    const e = target.start + target.duration;
    const overlaps = (it) => it.start < e && s < it.start + it.duration;
    const res = [];
    items.forEach((it) => {
        if (`${it.kind}:${it.id}` === excludeKey || !overlaps(it)) return;
        let clash = false;
        if (target.recurrence_type === 'none' || target.recurrence_type === 'monthly') {
            const d = parseDate(target.date);
            if (d) {
                if (target.recurrence_type === 'none') clash = occursOn(it, d);
                else clash = (it.recurrence_type === 'weekly' || it.recurrence_type === 'daily') ? it.day_of_week === d.getDay() : occursOn(it, d);
            }
        } else {
            const days = target.days || [];
            clash = days.some((dow) => {
                if (it.recurrence_type === 'weekly' || it.recurrence_type === 'daily') return it.day_of_week === dow;
                // موعد لمرة واحدة/شهري: يتعارض لو تاريخه الجاي على نفس اليوم
                const d = parseDate(it.start_date);
                return !!d && d >= addDays(new Date(), -1) && d.getDay() === dow;
            });
        }
        if (clash) res.push(it);
    });
    return res;
}
