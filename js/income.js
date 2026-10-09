/**
 * income.js - "فلوس الشهر": كام طالب دفع خلال الشهر، والمدرس جمع كام
 *
 * المصدر الأساسي: n8n/monthly-income.json (دالة SQL واحدة، سريعة).
 * لو الـ workflow لسه متستوردش: بنحسبها هنا من سجل دفعات كل طالب
 * (أبطأ شوية لأنها طلب لكل طالب، فبتشتغل لما المدرس يضغط بس).
 */

import { api } from './api.js?v=17';
import { Formatters, ErrorHandler } from './utils.js?v=17';
import { icon } from './icons.js?v=17';
import { lessonsText, money } from './billing.js?v=17';

const esc = (s) => Formatters.escapeHtml(s == null ? '' : String(s));
const CACHE_KEY = 'tm_income_cache_v1';
const CACHE_TTL_MS = 10 * 60 * 1000;

/** 'YYYY-MM' للشهر الحالي + offset بتوقيت الجهاز */
export function monthKey(offset = 0, now = new Date()) {
    const d = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
export function monthLabel(key) {
    const [y, m] = key.split('-').map(Number);
    try { return new Date(y, m - 1, 1).toLocaleDateString('ar-EG', { month: 'long', year: 'numeric' }); }
    catch (e) { return key; }
}
function studentsWord(n) {
    if (n === 1) return 'طالب واحد';
    if (n === 2) return 'طالبين';
    if (n <= 10) return `${n} طلاب`;
    return `${n} طالب`;
}

// --------------------------------------------------------------- الحساب
function readCache(key) {
    try {
        const all = JSON.parse(sessionStorage.getItem(CACHE_KEY) || '{}');
        const c = all[key];
        return c && (Date.now() - c.ts) < CACHE_TTL_MS ? c.data : null;
    } catch (e) { return null; }
}
function writeCache(key, data) {
    try {
        const all = JSON.parse(sessionStorage.getItem(CACHE_KEY) || '{}');
        all[key] = { ts: Date.now(), data };
        sessionStorage.setItem(CACHE_KEY, JSON.stringify(all));
    } catch (e) { /* تجاهل */ }
}
export function clearIncomeCache() {
    try { sessionStorage.removeItem(CACHE_KEY); } catch (e) { /* تجاهل */ }
}

/** هل القيد ده دفعة فعلية؟ (مش تعديل يدوي ولا رصيد بداية) */
function isPayment(p) {
    const kind = String(p.kind || p.type || p.entry_type || p.payment_type || p.action || '').toLowerCase();
    if (kind) return ['payment', 'pay', 'add_payment', 'paid'].includes(kind);
    const note = String(p.note || '');
    if (/^إضافة يدوية|^خصم|بداية/.test(note)) return false;
    return Number(p.amount) > 0 || Number(p.lessons_count) > 0;
}

/** حساب احتياطي من سجل دفعات كل طالب (لو workflow الخادم مش موجود) */
async function computeLocally(key, onProgress) {
    const due = await api.getBillingDue();
    const students = ((due && due.students) || []).filter((s) => s.billing && s.billing.mode);
    const [y, m] = key.split('-').map(Number);
    const from = new Date(y, m - 1, 1).getTime();
    const to = new Date(y, m, 1).getTime();
    const rows = [];
    let done = 0;
    const queue = [...students];
    const worker = async () => {
        while (queue.length) {
            const st = queue.shift();
            try {
                const ov = await api.getStudentOverview(st.id, { limit: 1 });
                const pays = ((ov && ov.payments) || []).filter((p) => {
                    const t = new Date(p.created_at).getTime();
                    return t >= from && t < to && isPayment(p);
                });
                if (pays.length) {
                    const price = st.billing && st.billing.lesson_price != null && st.billing.lesson_price !== '' ? Number(st.billing.lesson_price) : null;
                    let amount = 0;
                    let estimated = false;
                    let lessons = 0;
                    pays.forEach((p) => {
                        const n = Number(p.lessons_count) || 0;
                        lessons += Math.max(0, n);
                        if (Number(p.amount) > 0) amount += Number(p.amount);
                        else if (price && n > 0) { amount += price * n; estimated = true; }
                    });
                    rows.push({ student_id: st.id, name: st.name, amount, lessons, payments: pays.length, estimated,
                        last_paid_at: pays.map((p) => p.created_at).sort().pop() });
                }
            } catch (e) { /* طالب واحد فشل مايوقفش الباقي */ }
            done++;
            if (onProgress) onProgress(done, students.length);
        }
    };
    await Promise.all([worker(), worker(), worker(), worker()]);
    rows.sort((a, b) => b.amount - a.amount || String(a.name).localeCompare(String(b.name), 'ar'));
    return {
        month: key,
        paid_students: rows.length,
        total_amount: rows.reduce((s, r) => s + r.amount, 0),
        payments_count: rows.reduce((s, r) => s + r.payments, 0),
        lessons_paid: rows.reduce((s, r) => s + r.lessons, 0),
        students: rows,
        estimated: rows.some((r) => r.estimated),
        source: 'local'
    };
}

/**
 * @param {string} key 'YYYY-MM'
 * @param {{allowLocal?:boolean, onProgress?:Function, force?:boolean}} opts
 * @returns {Promise<object|null>} null = الخادم مش جاهز ومسموحش بالحساب المحلي
 */
export async function loadMonthlyIncome(key, { allowLocal = true, onProgress, force = false } = {}) {
    if (!force) {
        const cached = readCache(key);
        if (cached) return cached;
    }
    let data = await api.getMonthlyIncome(key);
    if (data) {
        data.source = 'server';
        // لو فيه دفعات من غير مبلغ مسجل: نقدّر المبلغ من سعر الحصة في إعدادات الطالب
        const missing = (data.students || []).filter((r) => !(Number(r.amount) > 0) && Number(r.lessons) > 0);
        if (missing.length) {
            try {
                const due = await api.getBillingDue();
                const priceOf = new Map(((due && due.students) || []).map((s) => [String(s.id), s.billing && s.billing.lesson_price]));
                missing.forEach((r) => {
                    const price = Number(priceOf.get(String(r.student_id)));
                    if (price > 0) { r.amount = price * Number(r.lessons); r.estimated = true; }
                });
                data.total_amount = (data.students || []).reduce((s, r) => s + (Number(r.amount) || 0), 0);
                data.estimated = missing.some((r) => r.estimated);
            } catch (e) { /* نكمّل بالأرقام المسجلة */ }
        }
    } else {
        if (!allowLocal) return null;
        data = await computeLocally(key, onProgress);
    }
    writeCache(key, data);
    return data;
}

export function incomeSummaryText(data) {
    const n = Number(data.paid_students) || 0;
    const total = Number(data.total_amount) || 0;
    return `ملخص شهر ${monthLabel(data.month)}:\n• ${studentsWord(n)} دفعوا\n• الإجمالي: ${money(total)} جنيه${data.estimated ? ' (تقريبًا)' : ''}\n• ${lessonsText(Number(data.lessons_paid) || 0)} مدفوعة`;
}

// --------------------------------------------------------------- كارت الرئيسية
/**
 * كارت "فلوس الشهر" في الرئيسية. في أول 5 أيام من الشهر بيعرض الشهر اللي فات
 * (ده وقت ما المدرس عايز يعرف "جمعت كام الشهر اللي خلص").
 */
export async function renderIncomeCard(root) {
    if (!root) return;
    const today = new Date();
    const offset = today.getDate() <= 5 ? -1 : 0;
    const key = monthKey(offset);
    const endOfMonth = today.getDate() >= 25 || offset === -1;
    try {
        // في الرئيسية مانعملش الحساب المحلي التقيل تلقائيًا
        const data = await loadMonthlyIncome(key, { allowLocal: false });
        if (data) {
            root.innerHTML = cardHtml(data, endOfMonth);
        } else {
            root.innerHTML = `<div class="inc-card">
                <div class="inc-head"><h3>💰 فلوس شهر ${esc(monthLabel(key))}</h3></div>
                <p class="inc-sub">اعرف كام طالب دفع وجمعت كام خلال الشهر.</p>
                <button type="button" class="btn btn-sm" data-inc-open>احسب فلوس الشهر</button>
            </div>`;
        }
        const b = root.querySelector('[data-inc-open]');
        if (b) b.addEventListener('click', () => openIncomeModal(offset));
    } catch (e) {
        root.innerHTML = '';
    }
}

function cardHtml(data, highlight) {
    const n = Number(data.paid_students) || 0;
    return `<div class="inc-card${highlight ? ' inc-hot' : ''}">
        <div class="inc-head"><h3>💰 ${highlight ? 'ملخص' : 'فلوس'} شهر ${esc(monthLabel(data.month))}</h3></div>
        <div class="inc-stats">
            <div><b>${n}</b><small>${n === 1 ? 'طالب دفع' : 'طلاب دفعوا'}</small></div>
            <div><b>${esc(money(Number(data.total_amount) || 0))}</b><small>جنيه${data.estimated ? ' تقريبًا' : ''}</small></div>
        </div>
        <button type="button" class="btn btn-sm btn-ghost" data-inc-open>التفاصيل</button>
    </div>`;
}

// --------------------------------------------------------------- نافذة التفاصيل
export function openIncomeModal(startOffset = 0) {
    let offset = startOffset;
    const modal = document.createElement('div');
    modal.className = 'modal active bill-modal';
    modal.innerHTML = `<div class="modal-content" role="dialog" aria-modal="true" aria-label="فلوس الشهر">
        <button type="button" class="bm-close" aria-label="إغلاق">${icon('x', { size: 18 })}</button>
        <h2 class="bm-title">💰 فلوس الشهر</h2>
        <div class="inc-months bm-tones">
            <button type="button" class="bm-tone" data-off="0">الشهر ده</button>
            <button type="button" class="bm-tone" data-off="-1">الشهر اللي فات</button>
            <button type="button" class="bm-tone" data-off="-2">قبلها</button>
        </div>
        <div class="inc-body" aria-live="polite"></div>
        <div class="bm-buttons">
            <button type="button" class="btn btn-ghost" data-copy>${icon('copy', { size: 15 })} نسخ الملخص</button>
            <button type="button" class="btn" data-close>تمام</button>
        </div>
    </div>`;
    document.body.appendChild(modal);
    const body = modal.querySelector('.inc-body');
    const close = () => modal.remove();
    modal.querySelector('.bm-close').addEventListener('click', close);
    modal.querySelector('[data-close]').addEventListener('click', close);
    modal.addEventListener('mousedown', (e) => { if (e.target === modal) close(); });
    let current = null;

    const load = async () => {
        modal.querySelectorAll('[data-off]').forEach((b) => b.classList.toggle('active', Number(b.dataset.off) === offset));
        const key = monthKey(offset);
        body.innerHTML = `<p class="inc-sub">جاري الحساب...</p>`;
        current = null;
        try {
            const data = await loadMonthlyIncome(key, {
                onProgress: (d, t) => { if (t > 3) body.innerHTML = `<p class="inc-sub">جاري الحساب ${d} من ${t} طالب...</p>`; }
            });
            if (monthKey(offset) !== key || !modal.isConnected) return;
            current = data;
            body.innerHTML = detailsHtml(data);
            try { (window.dataLayer = window.dataLayer || []).push({ event: 'income_viewed', month: key }); } catch (e) { /* تجاهل */ }
        } catch (e) {
            body.innerHTML = `<p class="inc-sub">تعذّر الحساب. ${esc(ErrorHandler.getErrorMessage(e))}</p>`;
        }
    };
    modal.querySelectorAll('[data-off]').forEach((b) => b.addEventListener('click', () => { offset = Number(b.dataset.off); load(); }));
    modal.querySelector('[data-copy]').addEventListener('click', async () => {
        if (!current) return;
        const text = incomeSummaryText(current);
        try { await navigator.clipboard.writeText(text); ErrorHandler.showSuccess('تم نسخ الملخص'); }
        catch (e) { ErrorHandler.showError('مقدرناش ننسخ تلقائيًا'); }
    });
    load();
}

function detailsHtml(data) {
    const n = Number(data.paid_students) || 0;
    const list = data.students || [];
    const rows = list.length
        ? list.map((r) => `<div class="inc-row">
                <a href="student.html?id=${encodeURIComponent(r.student_id)}#billing">${esc(r.name || 'طالب')}</a>
                <span>${Number(r.amount) > 0 ? esc(money(Number(r.amount))) + ' جنيه' + (r.estimated ? '*' : '') : esc(lessonsText(Number(r.lessons) || 0))}</span>
            </div>`).join('')
        : `<p class="inc-sub">مفيش دفعات متسجلة في الشهر ده. سجّل الدفعة من ملف الطالب (زرار "سجّل دفعة") عشان تظهر هنا.</p>`;
    return `<div class="inc-stats inc-stats-lg">
            <div><b>${n}</b><small>${n === 1 ? 'طالب دفع' : 'طلاب دفعوا'}</small></div>
            <div><b>${esc(money(Number(data.total_amount) || 0))}</b><small>جنيه${data.estimated ? ' تقريبًا' : ''}</small></div>
            <div><b>${Number(data.lessons_paid) || 0}</b><small>حصة مدفوعة</small></div>
        </div>
        <div class="inc-list">${rows}</div>
        ${data.estimated ? '<p class="inc-note">* مبلغ تقريبي: الدفعة اتسجلت من غير مبلغ، فحسبناه من سعر الحصة في إعدادات الطالب.</p>' : ''}`;
}
