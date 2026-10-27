/**
 * export-data.js — v29: نسخة من كل بيانات المدرس (ملف مضغوط فيه جداول Excel/CSV بالعربي)
 */
import { api } from './api.js?v=29';
import { ErrorHandler } from './utils.js?v=29';
import { loadJsZip } from './book-libs.js?v=29';
import { subjectLabel } from './lesson-utils.js?v=29';

const DAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const STATUS = { completed: 'تمت', cancelled: 'ملغاة/غياب', in_progress: 'جارية' };
const ATT = { present: 'حضر', absent_excused: 'غاب بعذر', absent_unexcused: 'غاب بدون عذر', teacher_cancelled: 'ألغاها المدرس' };
const HW = { done: 'عمله', partial: 'عمل جزء', not_done: 'ماعملهوش' };
const ST_STATUS = { active: 'نشط', paused: 'متوقف مؤقتًا', archived: 'أرشيف' };
const REC = { weekly: 'أسبوعي', daily: 'يومي', monthly: 'شهري', none: 'مرة واحدة' };

function cell(v) {
    if (v === null || v === undefined) return '';
    let t = String(v);
    // حماية من الصيغ الضارة لما الملف يتفتح في Excel
    if (/^[=+\-@]/.test(t) && !/^-?\d+(\.\d+)?$/.test(t)) t = "'" + t;
    return /[",\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
}
function toCsv(headers, rows) {
    const lines = [headers.map((h) => cell(h[1])).join(',')];
    for (const r of rows) lines.push(headers.map((h) => cell(typeof h[0] === 'function' ? h[0](r) : r[h[0]])).join(','));
    return '﻿' + lines.join('\r\n');   // BOM عشان Excel يقرأ العربي صح
}

export function buildExportFiles(d) {
    const data = d || {};
    return {
        'الطلاب.csv': toCsv([
            ['name', 'الاسم'], ['phone', 'الموبايل'], [(r) => subjectLabel(r.subject), 'المادة'], [(r) => ST_STATUS[r.status] || 'نشط', 'الحالة'],
            ['guardian_name', 'ولي الأمر'], ['guardian_phone', 'موبايل ولي الأمر'], ['current_topic', 'الموضوع الحالي'], ['email', 'الإيميل'],
            ['lesson_link', 'لينك الحصة'], [(r) => (r.billing_mode === 'prepaid' ? 'باقة' : r.billing_mode === 'postpaid' ? 'بعد الحصص' : ''), 'نظام الدفع'],
            ['package_size', 'عدد حصص الباقة'], ['lesson_price', 'سعر الحصة'], [(r) => String(r.created_at || '').slice(0, 10), 'تاريخ الإضافة']
        ], data.students || []),
        'الحصص.csv': toCsv([
            ['lesson_date', 'التاريخ'], ['start_time', 'الساعة'], ['student_name', 'الطالب'], ['group_name', 'المجموعة'],
            [(r) => STATUS[r.status] || r.status, 'الحالة'], [(r) => ATT[r.attendance] || '', 'الحضور'], ['lesson_content', 'اللي اتعمل'],
            ['memorization', 'تقييم 1'], ['recitation', 'تقييم 2'], ['revision', 'تقييم 3'], [(r) => HW[r.homework_status] || '', 'الواجب اللي فات'],
            ['homework', 'الواجب'], ['next_assignment', 'الحصة الجاية'], ['performance', 'ملاحظات الأداء'], ['notes', 'ملاحظات'], ['recording_url', 'لينك التسجيل']
        ], data.lessons || []),
        'الدفعات.csv': toCsv([
            ['date', 'التاريخ'], ['student_name', 'الطالب'], ['lessons_count', 'عدد الحصص'], ['amount', 'المبلغ'], ['note', 'ملاحظة']
        ], data.payments || []),
        'اشتراكات المجموعات.csv': toCsv([
            ['date', 'التاريخ'], ['group_name', 'المجموعة'], ['student_name', 'الطالب'], ['month', 'الشهر'], ['amount', 'المبلغ'], ['note', 'ملاحظة']
        ], data.group_payments || []),
        'المواعيد.csv': toCsv([
            ['student_name', 'الطالب'], [(r) => DAYS[r.day_of_week] || '', 'اليوم'], ['start_time', 'الساعة'], ['duration_minutes', 'المدة (دقيقة)'],
            [(r) => REC[r.recurrence_type] || r.recurrence_type, 'التكرار'], ['start_date', 'من تاريخ']
        ], data.schedules || []),
        'المجموعات.csv': toCsv([
            ['name', 'المجموعة'], [(r) => subjectLabel(r.subject), 'المادة'], [(r) => (r.status === 'archived' ? 'مؤرشفة' : 'نشطة'), 'الحالة'],
            [(r) => (r.billing_type === 'monthly' ? 'اشتراك شهري' : 'بالحصة'), 'نظام الدفع'], ['monthly_fee', 'الاشتراك الشهري'], ['members', 'الطلاب'], ['created_at', 'تاريخ الإنشاء']
        ], data.groups || []),
        'الملاحظات.csv': toCsv([['date', 'التاريخ'], ['student_name', 'الطالب'], ['note', 'الملاحظة']], data.notes || [])
    };
}

/** بيجيب البيانات وينزّل ملف مضغوط. btn (اختياري) بيتقفل وقت التجهيز */
export async function downloadAllData(btn) {
    const label = btn ? btn.innerHTML : '';
    if (btn) { btn.disabled = true; btn.textContent = 'جاري تجهيز الملف...'; }
    try {
        const d = await api.exportData();
        const files = buildExportFiles(d);
        const JSZip = await loadJsZip();
        const zip = new JSZip();
        Object.entries(files).forEach(([name, text]) => zip.file(name, text));
        zip.file('اقرأني.txt', 'نسخة من بياناتك في Teachers Manager\r\nكل ملف بيتفتح في Excel أو Google Sheets.\r\nتاريخ النسخة: '
            + new Date().toLocaleString('ar-EG') + '\r\n');
        const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
        const day = new Date().toISOString().slice(0, 10);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `teachers-manager-${day}.zip`;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 60000);
        const n = (d.students || []).length;
        ErrorHandler.showSuccess(`اتنزّلت نسخة بياناتك (${n} طالب، ${(d.lessons || []).length} حصة)`);
        try { window.tmTrack && window.tmTrack('data_exported', { students: n }); } catch (e) { /* تجاهل */ }
        return true;
    } catch (e) {
        ErrorHandler.showError(ErrorHandler.getErrorMessage(e));
        return false;
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = label; }
    }
}
