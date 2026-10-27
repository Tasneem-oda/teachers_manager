/**
 * student-actions.js — v28: حذف الطالب وشيله من مجموعة (مشترك بين صفحة الطلاب وملف الطالب)
 */
import { api } from './api.js?v=29';
import { ErrorHandler, askChoice } from './utils.js?v=29';
import { groupTitle } from './groups-utils.js?v=29';

/**
 * تأكيد واضح قبل الحذف (بيقول هيتمسح إيه بالظبط) وبعدين الحذف.
 * @param {{id:string, name?:string, groups?:Array<{name:string}>}} student
 * @returns {Promise<boolean>} true لو اتحذف
 */
export async function confirmDeleteStudent(student) {
    if (!student || !student.id) return false;
    const name = String(student.name || 'الطالب ده').trim();
    const groups = (student.groups || []).filter((g) => !g.left_at);
    const groupLine = groups.length
        ? `\n• هيتشال من ${groups.length === 1 ? groupTitle(groups[0].name || groups[0].group_name || '') : `${groups.length} مجموعات`}.`
        : '';
    // v29: الأرشفة بديل آمن: الطالب بيختفي من القوائم والجدول وحصصه بتفضل محفوظة
    const canArchive = student.status !== 'archived';
    const pick = await askChoice({
        title: `حذف ${name} نهائيًا؟`,
        message: `هيتمسح معاه:\n• كل حصصه وغيابه وملاحظاته.\n• مواعيده الثابتة.\n• مدفوعاته ورصيد الباقة.${groupLine}\n\nالحذف مالوش رجوع.${canArchive ? '\n\n💡 الطالب خلّص معاك؟ أرشفه بدل الحذف: بيختفي من القوائم والجدول، وحصصه وتقاريره بتفضل محفوظة لو رجع.' : ''}`,
        choices: [
            ...(canArchive ? [{ label: 'أرشفه بدل الحذف', value: 'archive' }] : []),
            { label: `احذف ${name.split(' ')[0]} نهائيًا`, value: 'yes', danger: true }
        ],
        cancelLabel: 'رجوع'
    });
    if (!pick) return false;
    if (pick === 'archive') return (await setStudentStatus(student, 'archived')) ? 'archived' : false;
    try {
        await api.deleteStudent(student.id);
        try { api.clearBillingDueCache && api.clearBillingDueCache(); } catch (e) { /* تجاهل */ }
        try { window.tmTrack && window.tmTrack('student_deleted', { groups: groups.length }); } catch (e) { /* تجاهل */ }
        ErrorHandler.showSuccess(`اتحذف ${name}`);
        return true;
    } catch (error) {
        ErrorHandler.showError(ErrorHandler.getErrorMessage(error));
        return false;
    }
}

/**
 * شيل الطالب من مجموعة (حضوره القديم في المجموعة بيفضل محفوظ)
 * @returns {Promise<boolean>}
 */
export async function confirmRemoveFromGroup(student, group) {
    const sName = String((student && student.name) || 'الطالب').split(' ')[0];
    const gName = groupTitle(group.name || group.group_name || '');
    const pick = await askChoice({
        title: `شيل ${sName} من ${gName}؟`,
        message: 'مش هيظهر في حصص المجموعة الجاية ولا في اشتراكها. حضوره في الحصص اللي فاتت بيفضل في ملفه.',
        choices: [{ label: 'شيله من المجموعة', value: 'yes', danger: true }]
    });
    if (!pick) return false;
    try {
        await api.setGroupMembers(group.id || group.group_id, [], [student.id]);
        ErrorHandler.showSuccess(`${sName} اتشال من ${gName}`);
        return true;
    } catch (error) {
        ErrorHandler.showError(ErrorHandler.getErrorMessage(error));
        return false;
    }
}

const STATUS_DONE = {
    active: (n) => `${n} رجع للطلاب النشطين`,
    paused: (n) => `${n} اتوقف مؤقتًا: مش هيظهر في جدولك وتذكيراتك لحد ما ترجّعه`,
    archived: (n) => `${n} اتأرشف. تلاقيه في تبويب "الأرشيف" في صفحة الطلاب`
};
/**
 * v29: تغيير حالة الطالب (نشط / متوقف مؤقتًا / أرشيف)
 * @returns {Promise<boolean>}
 */
export async function setStudentStatus(student, status) {
    const name = String((student && student.name) || 'الطالب').split(' ')[0];
    try {
        await api.updateStudentInfo(student.id, { status });
        try { api.clearBillingDueCache && api.clearBillingDueCache(); } catch (e) { /* تجاهل */ }
        try { window.tmTrack && window.tmTrack('student_status', { status }); } catch (e) { /* تجاهل */ }
        try { window.dispatchEvent(new CustomEvent('tm:student-status', { detail: { id: student.id, status } })); } catch (e) { /* تجاهل */ }
        ErrorHandler.showSuccess((STATUS_DONE[status] || STATUS_DONE.active)(name));
        return true;
    } catch (error) {
        ErrorHandler.showError(ErrorHandler.getErrorMessage(error));
        return false;
    }
}
