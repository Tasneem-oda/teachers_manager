/**
 * billing.js - متابعة عدد الحصص والدفع لكل طالب
 *
 * الفكرة: "رصيد حصص" واحد لكل طالب
 *     الرصيد = الحصص المدفوعة (+ التعديلات) − الحصص المكتملة من بداية المتابعة
 *   موجب = حصص مدفوعة مقدمًا لسه ماتعملتش، سالب = حصص اتعملت ولسه ماتدفعتش.
 *
 * نظامين للدفع:
 *   prepaid  : باقة مقدمة (مثلًا 8 حصص في الشهر) → التذكير قبل ما الباقة تخلص
 *   postpaid : الدفع بعد عدد حصص (مثلًا كل 4 حصص) → التذكير لما المستحق يوصل للعدد ده
 */

import { api } from './api.js?v=44';
import { Formatters, ErrorHandler, toLatinDigits } from './utils.js?v=44';
import { icon } from './icons.js?v=44';

const esc = (s) => Formatters.escapeHtml(s == null ? '' : String(s));

// ------------------------------------------------------------------ نصوص
export function lessonsText(n) {
    n = Math.abs(Math.round(Number(n) || 0));
    if (n === 0) return 'ولا حصة';
    if (n === 1) return 'حصة واحدة';
    if (n === 2) return 'حصتين';
    if (n <= 10) return `${n} حصص`;
    return `${n} حصة`;
}

export function money(x) {
    const n = Number(x);
    if (!Number.isFinite(n)) return '';
    return n.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

function firstName(name) {
    return String(name || '').trim().split(/\s+/)[0] || '';
}

// ------------------------------------------------------------------ الحساب
export const MONEY_MODES = ['per_lesson', 'monthly', 'hourly'];
export const MODE_LABELS = { prepaid: 'باقة حصص مقدمة', postpaid: 'الدفع بعد عدد حصص', per_lesson: 'بالحصة', monthly: 'مبلغ شهري ثابت', hourly: 'بالساعة' };
const MONTHS_AR = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
export function monthLabel(ym) { const [y, m] = String(ym || '').split('-').map(Number); return m ? `${MONTHS_AR[m - 1]} ${y}` : ''; }
export function hoursText(min) {
    const m = Math.round(Number(min) || 0);
    const h = Math.floor(m / 60), r = m % 60;
    if (!h) return `${r} دقيقة`;
    const hs = h === 1 ? 'ساعة' : h === 2 ? 'ساعتين' : `${h} ساعات`;
    return r ? `${hs} و${r} دقيقة` : hs;
}

/** v34: الحساب بالفلوس (بالحصة / شهري ثابت / بالساعة) — الأرقام من app-hub (billing.money) */
function computeMoney(b, view) {
    const m = b.money || {};
    view.money = true;
    if (m.error || m.due_amount == null) {
        Object.assign(view, { status: 'ok', headline: 'الحساب مش متاح دلوقتي', detail: 'محتاج تحديث app-hub على الخادم (v34)', progress: 0, balance: 0, owed: 0, owedAmount: 0, needsReminder: false, unavailable: true });
        return view;
    }
    // الحصة الجارية (قبل ما تتسجل): بنزوّدها على الحساب
    const extra = Math.max(0, (Number(b.taken) || 0) - (Number(m.base_taken) || 0));
    const price = m.lesson_price != null ? Number(m.lesson_price) : null;
    const rate = m.hourly_rate != null ? Number(m.hourly_rate) : null;
    const fee = m.monthly_fee != null ? Number(m.monthly_fee) : null;
    let due = Number(m.due_amount) || 0;
    let minutes = Number(m.taken_minutes) || 0;
    if (extra && view.mode === 'per_lesson') due += extra * (price || 0);
    if (extra && view.mode === 'hourly') { minutes += extra * (Number(m.default_minutes) || 60); due = Math.round((minutes / 60) * (rate || 0) * 100) / 100; }
    const paidAmount = Number(m.paid_amount) || 0;
    const bal = Math.round((paidAmount - due) * 100) / 100;
    Object.assign(view, {
        price, rate, fee, minutes, due, paidAmount, balance: bal, owedAmount: Math.max(0, -bal), creditAmount: Math.max(0, bal),
        owed: Math.max(0, -bal), remaining: Math.max(0, bal), taken: (Number(m.taken_lessons) || 0) + extra, since: m.since,
        months: m.months || [], thisMonth: m.this_month, thisMonthPaid: Number(m.this_month_paid) || 0, payments: m.payments || [],
        lastPayment: (m.payments || []).find((x) => x.amount != null) || null, countUnexcused: m.count_unexcused_absence !== false, absencesCounted: 0
    });
    view.paid = paidAmount; view.adjusted = 0;
    if (view.mode === 'monthly') {
        const left = Math.max(0, (fee || 0) - view.thisMonthPaid);
        view.monthLeft = left;
        view.progress = fee ? Math.min(1, view.thisMonthPaid / fee) : 1;
        if (!fee) { view.status = 'ok'; view.headline = 'اكتب المبلغ الشهري'; view.detail = 'من إعدادات الدفع'; }
        else if (bal >= 0) { view.status = 'ok'; view.headline = `${monthLabel(view.thisMonth)}: مدفوع ✓`; view.detail = bal > 0 ? `مدفوع مقدمًا ${money(bal)}` : `الاشتراك ${money(fee)} في الشهر`; }
        else if (left > 0 && view.owedAmount <= left) { view.status = 'due'; view.headline = `اشتراك ${monthLabel(view.thisMonth)}: باقي ${money(left)}`; view.detail = `الاشتراك ${money(fee)} في الشهر`; }
        else { view.status = 'due'; view.headline = `مستحق: ${money(view.owedAmount)}`; view.detail = 'فيه شهور لسه ما اتدفعتش'; }
    } else {
        const unit = view.mode === 'hourly' ? `${hoursText(minutes)} × ${money(rate || 0)} للساعة` : `${lessonsText(view.taken)} × ${money(price || 0)}`;
        view.progress = due ? Math.min(1, paidAmount / due) : 1;
        if ((view.mode === 'hourly' && !rate) || (view.mode === 'per_lesson' && !price)) { view.status = 'ok'; view.headline = view.mode === 'hourly' ? 'اكتب سعر الساعة' : 'اكتب سعر الحصة'; view.detail = 'من إعدادات الدفع'; }
        else if (bal > 0) { view.status = 'ok'; view.headline = `مدفوع مقدمًا: ${money(bal)}`; view.detail = unit; }
        else if (bal === 0) { view.status = 'ok'; view.headline = 'لا يوجد مستحق'; view.detail = unit; }
        else { view.status = 'due'; view.headline = `مستحق: ${money(view.owedAmount)}`; view.detail = unit; }
    }
    view.needsReminder = view.status === 'due';
    return view;
}

export function computeBilling(billing) {
    const b = billing || {};
    const view = { available: !!b.available, enabled: !!(b.available && b.mode), mode: b.mode || null };
    if (!view.enabled) return view;
    if (MONEY_MODES.includes(view.mode)) return computeMoney(b, view);

    const size = Math.max(1, parseInt(b.package_size, 10) || 1);
    const price = b.lesson_price != null && b.lesson_price !== '' ? Number(b.lesson_price) : null;
    const paid = Number(b.paid_lessons) || 0;
    const adjusted = Number(b.adjusted_lessons) || 0;
    const taken = Number(b.taken) || 0;
    const balance = paid + adjusted - taken;

    Object.assign(view, {
        size, price, paid, adjusted, taken, balance,
        remaining: Math.max(0, balance),
        owed: Math.max(0, -balance),
        since: b.since || null,
        lastPayment: b.last_payment || null,
        paidAmount: Number(b.paid_amount) || 0,
        absencesCounted: Number(b.absences_counted) || 0,
        countUnexcused: b.count_unexcused_absence !== false
    });
    view.owedAmount = price ? price * view.owed : null;
    view.renewAmount = price ? price * size : null;

    if (view.mode === 'prepaid') {
        view.used = balance >= 0 && balance <= size ? size - balance : null;
        // رصيد أكبر من باقة (دفع مقدمًا لأكتر من باقة): الشريط فاضي مش مليان
        view.progress = view.used != null ? view.used / size : (balance > size ? 0 : 1);
        if (balance > 1) {
            view.status = 'ok';
            view.headline = `باقي ${lessonsText(balance)}`;
            view.detail = view.used != null ? `تم ${view.used} من ${size} في الباقة الحالية` : `رصيد مدفوع مقدمًا`;
        } else if (balance === 1) {
            view.status = 'low';
            view.headline = 'باقي حصة واحدة';
            view.detail = 'الحصة الجاية آخر حصة في الباقة';
        } else if (balance === 0) {
            view.status = 'due';
            view.headline = 'الباقة خلصت';
            view.detail = 'وقت التجديد قبل الحصة الجاية';
        } else {
            view.status = 'due';
            view.headline = `مستحق: ${lessonsText(view.owed)}`;
            view.detail = 'حصص اتعملت بعد نهاية الباقة';
        }
    } else {
        view.progress = Math.min(1, view.owed / size);
        if (balance > 0) {
            view.status = 'ok';
            view.headline = `مدفوع مقدمًا: ${lessonsText(balance)}`;
            view.detail = `الدفع كل ${lessonsText(size)}`;
        } else if (view.owed === 0) {
            view.status = 'ok';
            view.headline = 'لا يوجد مستحق';
            view.detail = `الدفع كل ${lessonsText(size)}`;
        } else if (view.owed >= size) {
            view.status = 'due';
            view.headline = `مستحق: ${lessonsText(view.owed)}`;
            view.detail = 'وصل لموعد الدفع';
        } else if (view.owed === size - 1) {
            view.status = 'low';
            view.headline = `مستحق: ${lessonsText(view.owed)}`;
            view.detail = 'موعد الدفع بعد الحصة الجاية';
        } else {
            view.status = 'ok';
            view.headline = `مستحق: ${lessonsText(view.owed)}`;
            view.detail = `${view.owed} من ${size} قبل موعد الدفع`;
        }
    }
    view.needsReminder = view.status === 'low' || view.status === 'due';
    return view;
}

// شارة قصيرة للهيدر (مثلًا: "باقي 3 من 8")
export function billingBadge(view) {
    if (!view || !view.enabled) return null;
    if (view.money) return { text: view.headline, status: view.status };
    if (view.mode === 'prepaid' && view.balance > 1 && view.used != null) return { text: `باقي ${view.balance} من ${view.size}`, status: view.status };
    return { text: view.headline, status: view.status };
}

/**
 * وضع الحصة الجارية في الحساب (الحصة دي لسه ماتحسبتش، فبنحسب "بعد الحصة دي")
 * { status: ok|low|due, title, sub, actions: bool }
 */
export function liveBillingInfo(view) {
    if (!view || !view.enabled) return null;
    if (view.money) {
        if (view.unavailable) return null;
        // view هنا محسوب "بعد الحصة دي" في صفحة الحصة؟ لأ: ده الحساب الحالي
        if (view.mode === 'monthly') return view.status === 'due' ? { status: 'due', title: view.headline, sub: view.detail, actions: true } : { status: 'ok', title: view.headline, sub: view.detail, actions: false };
        const add = view.mode === 'hourly' ? (view.rate || 0) * ((view.minutesPlanned || 60) / 60) : (view.price || 0);
        const after = view.balance - add;
        if (after >= 0) return { status: 'ok', title: view.balance > 0 ? `مدفوع مقدمًا ${money(view.balance)}` : 'مفيش مستحق', sub: `بعد الحصة دي ${after > 0 ? `يفضل له ${money(after)}` : 'الحساب يبقى صفر'}`, actions: false };
        return { status: view.balance < 0 ? 'due' : 'low', title: view.balance < 0 ? `عليه ${money(-view.balance)}` : 'الحصة دي مش مدفوعة', sub: `بعد الحصة دي يكون عليه ${money(-after)}`, actions: true };
    }
    const amt = (n) => (view.price ? ` (${money(view.price * n)})` : '');
    const b = view.balance;
    if (view.mode === 'prepaid') {
        if (b >= 2) {
            const inPkg = b <= view.size;
            return {
                status: 'ok',
                title: inPkg ? `الحصة ${view.size - b + 1} من ${view.size} في الباقة` : `مدفوع مقدمًا: ${lessonsText(b)}`,
                sub: `بعد الحصة دي باقي ${lessonsText(b - 1)}`,
                actions: false
            };
        }
        if (b === 1) {
            return { status: 'low', title: `آخر حصة في الباقة (${view.size} من ${view.size})`, sub: `فكّره بالتجديد${amt(view.size)} قبل الحصة الجاية`, actions: true };
        }
        return { status: 'due', title: 'الباقة خلصت — الحصة دي مش مدفوعة', sub: `بعدها يكون عليه ${lessonsText(view.owed + 1)}${amt(view.owed + 1)}`, actions: true };
    }
    // الدفع بعد عدد حصص
    if (b > 0) return { status: 'ok', title: `مدفوع مقدمًا: ${lessonsText(b)}`, sub: `بعد الحصة دي باقي ${lessonsText(b - 1)}`, actions: false };
    const n = view.owed + 1;
    if (n > view.size) return { status: 'due', title: `متأخر في الدفع: عليه ${lessonsText(n)} بالحصة دي`, sub: `المستحق${amt(n)} — كان المفروض يدفع كل ${lessonsText(view.size)}`, actions: true };
    if (n === view.size) return { status: 'due', title: `الحصة ${n} من ${n} — وقت الدفع`, sub: `بعد الحصة دي المستحق ${lessonsText(n)}${amt(n)}`, actions: true };
    if (n === view.size - 1) return { status: 'low', title: `الحصة ${n} من ${view.size} قبل الدفع`, sub: 'موعد الدفع بعد الحصة الجاية', actions: false };
    return { status: 'ok', title: `الحصة ${n} من ${view.size} قبل الدفع`, sub: `الدفع بعد ${lessonsText(view.size - n)}`, actions: false };
}

// ------------------------------------------------------------------ رسالة التذكير
export const REMINDER_TONES = [
    { value: 'friendly', label: 'ودية' },
    { value: 'short', label: 'مختصرة' },
    { value: 'statement', label: 'كشف حساب' }
];

export function buildReminder(view, student, tone = 'friendly') {
    if (!view || !view.enabled) return '';
    const name = firstName(student && student.name);
    const hi = name ? `أهلًا ${name} 🌷` : 'أهلًا 🌷';
    if (view.money) return buildMoneyReminder(view, hi, tone);
    const renew = view.renewAmount ? ` (${money(view.renewAmount)})` : '';
    const owedAmt = view.owedAmount ? ` (${money(view.owedAmount)})` : '';

    if (tone === 'statement') {
        const lines = [hi, 'ملخص الحصص من بداية المتابعة:'];
        lines.push(`• الحصص اللي تمت: ${view.taken}`);
        lines.push(`• الحصص المدفوعة: ${view.paid}`);
        if (view.adjusted > 0) lines.push(`• حصص إضافية/تعويض: ${view.adjusted}`);
        else if (view.adjusted < 0) lines.push(`• حصص اتخصمت: ${-view.adjusted}`);
        if (view.balance > 0) lines.push(`• المتبقي من المدفوع: ${lessonsText(view.balance)}`);
        else if (view.owed > 0) lines.push(`• المستحق: ${lessonsText(view.owed)}${owedAmt}`);
        else lines.push('• لا يوجد مستحق حاليًا');
        lines.push('شكرًا جدًا 🙏');
        return lines.join('\n');
    }

    if (view.mode === 'prepaid') {
        if (tone === 'short') {
            if (view.balance >= 1) return `تذكير: باقي ${lessonsText(view.balance)} في الباقة الحالية. التجديد${renew} قبل نهايتها. شكرًا 🙏`;
            if (view.balance === 0) return `تذكير: الباقة الحالية خلصت، والتجديد${renew} قبل الحصة الجاية. شكرًا 🙏`;
            return `تذكير: الباقة خلصت واتعمل بعدها ${lessonsText(view.owed)}${owedAmt}. شكرًا 🙏`;
        }
        if (view.balance > 1) return `${hi}\nتذكير بسيط: باقي ${lessonsText(view.balance)} في الباقة الحالية (تم ${view.used ?? view.taken} من ${view.size}).\nشكرًا جدًا 🙏`;
        if (view.balance === 1) return `${hi}\nتذكير بسيط: الحصة الجاية هي آخر حصة في الباقة الحالية (${lessonsText(view.size)}).\nالتجديد${renew} يكون قبل الحصة اللي بعدها عشان نكمّل على نفس المواعيد.\nشكرًا جدًا 🙏`;
        if (view.balance === 0) return `${hi}\nالباقة الحالية (${lessonsText(view.size)}) خلصت مع آخر حصة.\nالتجديد${renew} يكون قبل الحصة الجاية عشان نكمّل على نفس المواعيد.\nشكرًا جدًا 🙏`;
        return `${hi}\nالباقة الحالية خلصت، واتعمل بعدها ${lessonsText(view.owed)}${owedAmt}.\nيا ريت يتم التجديد قبل الحصة الجاية.\nشكرًا جدًا 🙏`;
    }

    // postpaid
    if (view.owed === 0) return `${hi}\nتذكير بسيط: مفيش أي مستحق حاليًا. شكرًا جدًا 🙏`;
    if (tone === 'short') return `تذكير: تم ${lessonsText(view.owed)} من آخر دفعة${owedAmt}. شكرًا 🙏`;
    return `${hi}\nتذكير بسيط بحساب الحصص: تم ${lessonsText(view.owed)} من آخر دفعة${owedAmt}.\nالدفع يكون في أي وقت مناسب خلال الأسبوع ده.\nشكرًا جدًا 🙏`;
}

function buildMoneyReminder(view, hi, tone) {
    const owed = view.owedAmount;
    if (tone === 'statement') {
        const lines = [hi, 'ملخص الحساب من بداية المتابعة:'];
        if (view.mode === 'monthly') {
            (view.months || []).slice(0, 6).forEach((mo) => lines.push(`• ${monthLabel(mo.month)}: ${Number(mo.paid) >= (view.fee || 0) ? 'مدفوع ✓' : (Number(mo.paid) > 0 ? `مدفوع ${money(mo.paid)} من ${money(view.fee)}` : `لسه (${money(view.fee)})`)}`));
        } else if (view.mode === 'hourly') {
            lines.push(`• الوقت: ${hoursText(view.minutes)} (${lessonsText(view.taken)})`);
            lines.push(`• سعر الساعة: ${money(view.rate)}`);
        } else {
            lines.push(`• الحصص: ${view.taken}`);
            lines.push(`• سعر الحصة: ${money(view.price)}`);
        }
        lines.push(`• المطلوب: ${money(view.due)}`);
        lines.push(`• المدفوع: ${money(view.paidAmount)}`);
        lines.push(owed > 0 ? `• المتبقي: ${money(owed)}` : view.balance > 0 ? `• مدفوع مقدمًا: ${money(view.balance)}` : '• لا يوجد مستحق حاليًا');
        lines.push('شكرًا جدًا 🙏');
        return lines.join('\n');
    }
    if (owed <= 0) return `${hi}\nتذكير بسيط: مفيش أي مستحق حاليًا. شكرًا جدًا 🙏`;
    if (view.mode === 'monthly') {
        const left = view.monthLeft || 0;
        const msg = left > 0 && owed <= left ? `اشتراك شهر ${monthLabel(view.thisMonth)} (${money(left)})` : `المستحق ${money(owed)}`;
        return tone === 'short' ? `تذكير: ${msg}. شكرًا 🙏` : `${hi}\nتذكير بسيط بـ${msg}.\nالدفع في أي وقت مناسب خلال الأسبوع ده.\nشكرًا جدًا 🙏`;
    }
    const what = view.mode === 'hourly' ? `${hoursText(view.minutes)} حصص` : lessonsText(view.taken);
    return tone === 'short' ? `تذكير: المستحق ${money(owed)}. شكرًا 🙏` : `${hi}\nتذكير بسيط بالحساب: المستحق ${money(owed)} (${what} من بداية المتابعة، بعد خصم المدفوع).\nالدفع في أي وقت مناسب خلال الأسبوع ده.\nشكرًا جدًا 🙏`;
}

// رقم مصري محلي (01xxxxxxxxx) بيتحوّل لـ 201xxxxxxxxx، وأي رقم دولي بيتقبل زي ما هو
export function normalizePhone(phone) {
    let d = toLatinDigits(phone || '').replace(/[^\d+]/g, '');
    if (!d) return null;
    if (d.startsWith('+')) d = d.slice(1);
    else if (d.startsWith('00')) d = d.slice(2);
    else if (/^01\d{9}$/.test(d)) d = '20' + d.slice(1);
    else if (/^1[0125]\d{8}$/.test(d)) d = '20' + d;   // رقم مصري اتكتب من غير الصفر (1012345678)
    else if (d.startsWith('0')) return null;   // رقم محلي لبلد غير معروف
    d = d.replace(/\D/g, '');
    return d.length >= 8 ? d : null;
}

/**
 * v29: رقم ولي الأمر للتقارير ورسايل الفلوس.
 * report_to: auto = ولي الأمر لو رقمه موجود وإلا الطالب | guardian | student
 */
export function parentPhone(st) {
    if (!st) return '';
    const g = normalizePhone(st.guardian_phone) ? st.guardian_phone : '';
    const s = normalizePhone(st.phone) ? st.phone : '';
    if (st.report_to === 'student') return s || g;
    return g || s;
}
/** كل الأرقام المتاحة للطالب (للاختيار في نافذة الإرسال) */
export function contactOptions(st) {
    const out = [];
    if (!st) return out;
    if (normalizePhone(st.guardian_phone)) out.push({ key: 'guardian', label: st.guardian_name ? `ولي الأمر (${String(st.guardian_name).split(' ')[0]})` : 'ولي الأمر', phone: st.guardian_phone });
    if (normalizePhone(st.phone)) out.push({ key: 'student', label: 'الطالب', phone: st.phone });
    return out;
}
/**
 * v29: "ابعت لـ: ولي الأمر | الطالب" جوه نوافذ الإرسال (بيظهر بس لو فيه رقمين)
 * @returns {{ html: string, bind: (root: HTMLElement, onChange: (phone: string) => void) => void, initial: string }}
 */
export function recipientChooser(st) {
    const opts = contactOptions(st);
    const initial = parentPhone(st);
    if (opts.length < 2) return { html: '', bind: () => {}, initial };
    const html = `<div class="bm-to" role="radiogroup" aria-label="ابعت لـ"><span>ابعت لـ:</span>${opts.map((o) =>
        `<button type="button" class="bm-to-opt${o.phone === initial ? ' active' : ''}" data-to="${esc(o.phone)}" role="radio" aria-checked="${o.phone === initial}">${esc(o.label)}</button>`).join('')}</div>`;
    const bind = (root, onChange) => {
        root.querySelectorAll('.bm-to-opt').forEach((b) => b.addEventListener('click', () => {
            root.querySelectorAll('.bm-to-opt').forEach((x) => { const on = x === b; x.classList.toggle('active', on); x.setAttribute('aria-checked', String(on)); });
            onChange(b.dataset.to);
        }));
    };
    return { html, bind, initial };
}

export function whatsappUrl(phone, text) {
    const n = normalizePhone(phone);
    const q = text ? `?text=${encodeURIComponent(text)}` : '';
    return n ? `https://wa.me/${n}${q}` : `https://wa.me/${q}`;
}

// ------------------------------------------------------------------ كارت الدفع
export function billingCardHtml(view, opts = {}) {
    if (!view || !view.available) {
        return `<div class="bill-card bill-off"><div class="bill-off-text">${icon('creditCard', { size: 18 })}
            <div><strong>متابعة الدفع مش متاحة دلوقتي</strong><span>جرّب تاني بعد شوية، ولو المشكلة فضلت كلّمنا على واتساب.</span></div></div></div>`;
    }
    if (!view.enabled) {
        return `<div class="bill-card bill-off">
            <div class="bill-off-text">${icon('creditCard', { size: 18 })}
                <div><strong>تابع حصص ودفع الطالب</strong><span>اعرف كام حصة اتعملت، وكام فاضل، وجهّز رسالة تذكير بضغطة.</span></div>
            </div>
            <button type="button" class="btn btn-sm" data-bill-act="setup">تفعيل المتابعة</button>
        </div>`;
    }
    const pct = Math.round(Math.max(0, Math.min(1, view.progress || 0)) * 100);
    if (view.money) return moneyCardHtml(view, pct, opts);
    const modeText = view.mode === 'prepaid' ? `باقة ${lessonsText(view.size)}` : `الدفع كل ${lessonsText(view.size)}`;
    const last = view.lastPayment ? `آخر دفعة: ${Formatters.formatDate(view.lastPayment.created_at)}` : 'لا توجد دفعات بعد';
    return `<div class="bill-card bill-${view.status}">
        <div class="bill-top">
            <div>
                <div class="bill-headline">${esc(view.headline)}</div>
                <div class="bill-detail">${esc(view.detail || '')}</div>
            </div>
            <span class="bill-mode">${esc(modeText)}</span>
        </div>
        <div class="bill-bar" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><span style="width:${pct}%"></span></div>
        <div class="bill-meta">${esc(last)}${opts.compact ? '' : ` · محسوبة ${view.taken}${view.absencesCounted ? ` (منها ${view.absencesCounted} غياب)` : ''} · مدفوع ${view.paid + view.adjusted}`}</div>
        <div class="bill-actions">
            <button type="button" class="btn btn-sm" data-bill-act="pay">${icon('plus', { size: 14 })} سجّل دفعة</button>
            <button type="button" class="btn btn-sm ${view.needsReminder ? 'bill-remind-hot' : 'btn-ghost'}" data-bill-act="remind">${icon('messageCircle', { size: 14 })} رسالة تذكير</button>
            ${opts.compact ? '' : `<button type="button" class="btn btn-sm btn-ghost" data-bill-act="adjust">${icon('minus', { size: 14 })} تعديل الرصيد</button>`}
        </div>
    </div>`;
}

function moneyCardHtml(view, pct, opts) {
    const modeText = view.mode === 'monthly' ? `شهري ${view.fee ? money(view.fee) : ''}` : view.mode === 'hourly' ? `بالساعة ${view.rate ? money(view.rate) : ''}` : `بالحصة ${view.price ? money(view.price) : ''}`;
    const last = view.lastPayment ? `آخر دفعة: ${money(view.lastPayment.amount)} · ${Formatters.formatDate(view.lastPayment.created_at)}` : 'لا توجد دفعات بعد';
    const meta = view.mode === 'monthly' ? '' : view.mode === 'hourly' ? ` · ${hoursText(view.minutes)} من بداية المتابعة` : ` · ${lessonsText(view.taken)} من بداية المتابعة`;
    const months = view.mode === 'monthly' && !opts.compact && (view.months || []).length ? `<div class="bill-months">${view.months.slice(0, 6).map((mo) => {
        const paid = Number(mo.paid) || 0; const full = view.fee ? paid >= view.fee : paid > 0;
        return `<span class="bill-month ${full ? 'ok' : paid ? 'part' : 'no'}" title="${esc(monthLabel(mo.month))}">${esc(monthLabel(mo.month).split(' ')[0])}${full ? ' ✓' : paid ? ` ${money(paid)}` : ''}</span>`;
    }).join('')}</div>` : '';
    return `<div class="bill-card bill-${view.status}">
        <div class="bill-top">
            <div><div class="bill-headline">${esc(view.headline)}</div><div class="bill-detail">${esc(view.detail || '')}</div></div>
            <span class="bill-mode">${esc(modeText)}</span>
        </div>
        <div class="bill-bar" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><span style="width:${pct}%"></span></div>
        ${months}
        <div class="bill-meta">${esc(last)}${opts.compact ? '' : esc(meta)}</div>
        <div class="bill-actions">
            <button type="button" class="btn btn-sm" data-bill-act="pay">${icon('plus', { size: 14 })} سجّل دفعة</button>
            <button type="button" class="btn btn-sm ${view.needsReminder ? 'bill-remind-hot' : 'btn-ghost'}" data-bill-act="remind">${icon('messageCircle', { size: 14 })} رسالة تذكير</button>
            ${opts.compact ? '' : `<button type="button" class="btn btn-sm btn-ghost" data-bill-act="settings">${icon('gear', { size: 14 })} نظام الدفع</button>`}
        </div>
    </div>`;
}

export function bindBillingActions(container, ctx) {
    container.querySelectorAll('[data-bill-act]').forEach((btn) => {
        btn.addEventListener('click', () => {
            const act = btn.dataset.billAct;
            try { if (window.tmTrack) window.tmTrack('billing_action', { action: act, page_mode: document.body.dataset.mode || '' }, { gtm: false }); } catch (e) { /* تجاهل */ }
            const s = ctx.getState();
            if (act === 'setup' || act === 'settings') openBillingSetup(s, ctx.onChange);
            else if (act === 'pay') openPaymentModal(s, ctx.onChange);
            else if (act === 'remind') openReminder(s);
            else if (act === 'adjust') openAdjustModal(s, ctx.onChange);
        });
    });
}

// ------------------------------------------------------------------ مودالات
function openModal(title, bodyHtml) {
    const modal = document.createElement('div');
    modal.className = 'modal active bill-modal';
    modal.innerHTML = `<div class="modal-content" role="dialog" aria-modal="true" aria-label="${esc(title)}">
        <button type="button" class="bm-close" aria-label="إغلاق">${icon('x', { size: 18 })}</button>
        <h2 class="bm-title">${esc(title)}</h2>
        ${bodyHtml}
    </div>`;
    const close = () => { modal.remove(); document.removeEventListener('keydown', onKey); };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    modal.addEventListener('mousedown', (e) => { if (e.target === modal) close(); });
    modal.querySelector('.bm-close').addEventListener('click', close);
    modal.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', close));
    document.addEventListener('keydown', onKey);
    document.body.appendChild(modal);
    return { el: modal, close, $: (sel) => modal.querySelector(sel) };
}

async function submitBilling(m, btn, studentId, action, data, onChange, successMsg) {
    const err = m.$('.bm-error');
    err.style.display = 'none';
    btn.disabled = true;
    const label = btn.textContent;
    btn.textContent = 'جاري الحفظ...';
    try {
        await api.studentBilling(studentId, action, data);
        try { sessionStorage.removeItem('tm_income_cache_v1'); } catch (e) { /* فلوس الشهر تتحسب من جديد */ }
        api.clearBillingDueCache();
        m.close();
        ErrorHandler.showSuccess(successMsg);
        if (onChange) onChange();
    } catch (e) {
        err.textContent = ErrorHandler.getErrorMessage(e);
        err.style.display = 'block';
        btn.disabled = false;
        btn.textContent = label;
    }
}

/** v34: حفظ الأنظمة بالفلوس (app-hub) */
async function submitMoney(m, btn, action, data, onChange, successMsg) {
    const err = m.$('.bm-error');
    err.style.display = 'none';
    btn.disabled = true;
    const label = btn.textContent;
    btn.textContent = 'جاري الحفظ...';
    try {
        await api.hub(action, data);
        try { sessionStorage.removeItem('tm_income_cache_v1'); } catch (e) { /* تجاهل */ }
        api.clearBillingDueCache();
        m.close();
        ErrorHandler.showSuccess(successMsg);
        if (onChange) onChange();
    } catch (e) {
        const code = e && e.error && e.error.code;
        err.textContent = code === 'INVALID' && /معروف/.test((e.error && e.error.message) || '') ? 'الأنظمة الجديدة (شهري/بالساعة/بالحصة) محتاجة تحديث app-hub وقاعدة البيانات (v34).' : ErrorHandler.getErrorMessage(e);
        err.style.display = 'block';
        btn.disabled = false;
        btn.textContent = label;
    }
}

/** الطلاب اللي متابعة الدفع مش مفعّلة عندهم (ماعدا الطالب الحالي) */
async function loadStudentsWithoutBilling(excludeId) {
    const [all, due] = await Promise.all([
        api.getAllStudents(),
        api.getBillingDue().catch(() => null)
    ]);
    if (!due) return [];   // مانقدرش نعرف مين مفعّل، فمانعرضش الاختيار أحسن من إننا نغيّر إعدادات حد بالغلط
    const enabled = new Set(((due && due.students) || []).filter((s) => s.billing && s.billing.mode).map((s) => String(s.id)));
    return ((all && all.students) || []).filter((s) => String(s.id) !== String(excludeId) && !enabled.has(String(s.id)));
}

/** حفظ نفس النظام للطالب الحالي + باقي الطلاب (رصيد البداية صفر للباقيين) */
async function applyToAll(m, btn, studentId, data, others, onChange) {
    const err = m.$('.bm-error');
    err.style.display = 'none';
    btn.disabled = true;
    const label = btn.textContent;
    try {
        btn.textContent = 'جاري الحفظ...';
        await api.studentBilling(studentId, 'settings', data);
        api.clearBillingDueCache();
        const rest = { ...data, opening_lessons: 0 };
        const failed = [];
        let done = 0;
        const queue = [...others];
        const worker = async () => {
            while (queue.length) {
                const st = queue.shift();
                try { await api.studentBilling(st.id, 'settings', rest); }
                catch (e) { failed.push(st.name || ''); }
                done++;
                btn.textContent = `جاري الحفظ ${done} من ${others.length}...`;
            }
        };
        await Promise.all([worker(), worker(), worker()]);
        m.close();
        try { sessionStorage.removeItem('tm_income_cache_v1'); } catch (e) { /* تجاهل */ }
        if (failed.length) ErrorHandler.showError(`اتفعّلت المتابعة لـ ${others.length - failed.length + 1} طالب. ماتفعّلتش لـ: ${failed.join('، ')}`);
        else ErrorHandler.showSuccess(`تم تفعيل متابعة الدفع لـ ${others.length + 1} طالب`);
        if (onChange) onChange();
    } catch (e) {
        err.textContent = ErrorHandler.getErrorMessage(e);
        err.style.display = 'block';
        btn.disabled = false;
        btn.textContent = label;
    }
}

export function openBillingSetup(state, onChange) {
    const { student, view } = state;
    const firstTime = !view.since;
    const mode = view.mode || 'prepaid';
    const m = openModal(view.enabled ? 'إعدادات الدفع' : 'متابعة حصص ودفع الطالب', `
        <div class="bm-error" role="alert"></div>
        <div class="bm-field">
            <label>نظام الدفع</label>
            <div class="bm-options">
                <label class="bm-option"><input type="radio" name="bm-mode" value="prepaid" ${mode === 'prepaid' ? 'checked' : ''}>
                    <span><strong>باقة مقدمة</strong><small>يدفع عدد حصص مقدمًا (مثلًا 8 حصص في الشهر)</small></span></label>
                <label class="bm-option"><input type="radio" name="bm-mode" value="postpaid" ${mode === 'postpaid' ? 'checked' : ''}>
                    <span><strong>الدفع بعد الحصص</strong><small>يدفع بعد ما يخلص عدد حصص (مثلًا كل 4 حصص)</small></span></label>
                <label class="bm-option"><input type="radio" name="bm-mode" value="monthly" ${mode === 'monthly' ? 'checked' : ''}>
                    <span><strong>مبلغ شهري ثابت</strong><small>نفس المبلغ كل شهر مهما كان عدد الحصص</small></span></label>
                <label class="bm-option"><input type="radio" name="bm-mode" value="hourly" ${mode === 'hourly' ? 'checked' : ''}>
                    <span><strong>بالساعة</strong><small>حسب الوقت الحقيقي اللي الطالب أخده (من المؤقت أو المدة اللي تكتبها)</small></span></label>
                <label class="bm-option"><input type="radio" name="bm-mode" value="per_lesson" ${mode === 'per_lesson' ? 'checked' : ''}>
                    <span><strong>بالحصة (حساب بالفلوس)</strong><small>كل حصة بسعرها، وتسجّل أي مبلغ يدفعه وقت ما يدفع</small></span></label>
            </div>
        </div>
        <div class="bm-grid">
            <div class="bm-field" data-for="pkg"><label for="bm-size" id="bm-size-label">عدد حصص الباقة</label>
                <input type="number" id="bm-size" min="1" max="200" inputmode="numeric" value="${esc(view.size || 8)}"></div>
            <div class="bm-field" data-for="pkg per_lesson"><label for="bm-price">سعر الحصة <small data-opt>(اختياري)</small></label>
                <input type="number" id="bm-price" min="0" step="any" inputmode="decimal" value="${view.price != null ? esc(view.price) : ''}" placeholder="مثلًا 100"></div>
            <div class="bm-field" data-for="monthly"><label for="bm-fee">المبلغ الشهري</label>
                <input type="number" id="bm-fee" min="0" step="any" inputmode="decimal" value="${view.fee != null ? esc(view.fee) : ''}" placeholder="مثلًا 600"></div>
            <div class="bm-field" data-for="hourly"><label for="bm-rate">سعر الساعة</label>
                <input type="number" id="bm-rate" min="0" step="any" inputmode="decimal" value="${view.rate != null ? esc(view.rate) : ''}" placeholder="مثلًا 150"></div>
        </div>
        <label class="bm-check">
            <input type="checkbox" id="bm-unexcused" ${view.enabled && view.countUnexcused === false ? '' : 'checked'}>
            <span>الغياب بدون عذر يتحسب من الحصص <small>(الغياب بعذر مش بيتحسب)</small></span>
        </label>
        ${firstTime ? `<label class="bm-check" id="bm-all-wrap" data-for="pkg" hidden>
            <input type="checkbox" id="bm-all">
            <span id="bm-all-text">طبّق نفس النظام على باقي الطلاب</span>
        </label>` : ''}
        ${firstTime ? `<div class="bm-field bm-opening" data-for="pkg">
            <label for="bm-opening" id="bm-opening-label"></label>
            <input type="number" id="bm-opening" min="0" max="500" inputmode="numeric" value="0">
            <small class="bm-hint">الحصص القديمة مش هتتحسب في الرصيد — العدّ بيبدأ من دلوقتي.</small>
        </div>` : ''}
        <div class="bm-buttons">
            <button type="button" class="btn" id="bm-save">حفظ</button>
            <button type="button" class="btn btn-ghost" data-close>إلغاء</button>
        </div>
        ${view.enabled ? '<button type="button" class="bm-link-danger" id="bm-disable">إيقاف متابعة الدفع لهذا الطالب</button>' : ''}
    `);
    const sync = () => {
        const md = m.el.querySelector('input[name="bm-mode"]:checked').value;
        const grp = MONEY_MODES.includes(md) ? md : 'pkg';
        m.el.querySelectorAll('[data-for]').forEach((el) => { const show = el.dataset.for.split(' ').includes(grp); el.style.display = show ? '' : 'none'; });
        const opt = m.el.querySelector('[data-opt]'); if (opt) opt.hidden = md === 'per_lesson';
        m.$('#bm-size-label').textContent = md === 'prepaid' ? 'عدد حصص الباقة' : 'الدفع كل كام حصة؟';
        const ol = m.$('#bm-opening-label');
        if (ol) ol.textContent = md === 'prepaid' ? 'كام حصة فاضلة للطالب في الباقة الحالية؟' : 'كام حصة اتعملت ولسه ما اتدفعتش؟';
    };
    m.el.querySelectorAll('input[name="bm-mode"]').forEach((r) => r.addEventListener('change', sync));
    sync();

    // أول تفعيل: نعرض اختيار "نفس النظام لباقي الطلاب" (المحفّظ عنده 30 طالب = 30 مرة إعداد قبل كده)
    let others = [];
    if (firstTime) {
        loadStudentsWithoutBilling(student.id).then((list) => {
            others = list;
            if (!others.length || !m.el.isConnected) return;
            m.$('#bm-all-text').textContent = `طبّق نفس النظام على باقي الطلاب اللي لسه مالهمش متابعة دفع (${others.length === 1 ? 'طالب واحد' : others.length === 2 ? 'طالبين' : others.length <= 10 ? others.length + ' طلاب' : others.length + ' طالب'})`;
            m.$('#bm-all-wrap').hidden = false;
        }).catch(() => { /* الاختيار ده إضافي، لو فشل نكمّل عادي */ });
    }
    m.$('#bm-save').addEventListener('click', (e) => {
        const md = m.el.querySelector('input[name="bm-mode"]:checked').value;
        if (MONEY_MODES.includes(md)) {
            const num = (id) => { const v = toLatinDigits(m.$(id).value).trim(); return v === '' ? '' : String(Number(v)); };
            const data = { mode: md, count_unexcused_absence: m.$('#bm-unexcused').checked };
            const need = md === 'monthly' ? ['#bm-fee', 'monthly_fee', 'اكتب المبلغ الشهري'] : md === 'hourly' ? ['#bm-rate', 'hourly_rate', 'اكتب سعر الساعة'] : ['#bm-price', 'lesson_price', 'اكتب سعر الحصة'];
            const val = num(need[0]);
            if (!val || Number(val) <= 0) { const er = m.$('.bm-error'); er.textContent = need[2]; er.style.display = 'block'; return; }
            data[need[1]] = val;
            try { (window.dataLayer = window.dataLayer || []).push({ event: 'billing_enabled', billing_mode: md, students_count: 1 }); } catch (er) { /* تجاهل */ }
            submitMoney(m, e.currentTarget, 'billing_save', { student_id: student.id, ...data }, onChange, 'تم حفظ نظام الدفع');
            return;
        }
        const size = parseInt(m.$('#bm-size').value, 10);
        if (!size || size < 1 || size > 200) { const er = m.$('.bm-error'); er.textContent = 'عدد الحصص لازم يكون رقم من 1 إلى 200'; er.style.display = 'block'; return; }
        const data = { billing_mode: md, package_size: size, lesson_price: m.$('#bm-price').value, count_unexcused_absence: m.$('#bm-unexcused').checked };
        if (firstTime) {
            const o = Math.max(0, parseInt(m.$('#bm-opening').value, 10) || 0);
            data.opening_lessons = md === 'prepaid' ? o : -o;
        }
        const applyAll = firstTime && others.length && m.$('#bm-all') && m.$('#bm-all').checked;
        if (firstTime) try { (window.dataLayer = window.dataLayer || []).push({ event: 'billing_enabled', billing_mode: md, students_count: applyAll ? others.length + 1 : 1 }); } catch (e) { /* تجاهل */ }
        if (!applyAll) {
            submitBilling(m, e.currentTarget, student.id, 'settings', data, onChange, 'تم حفظ إعدادات الدفع');
            return;
        }
        applyToAll(m, e.currentTarget, student.id, data, others, onChange);
    });
    const dis = m.$('#bm-disable');
    if (dis) dis.addEventListener('click', (e) => {
        if (!confirm('إيقاف متابعة الدفع لهذا الطالب؟ سجل الدفعات هيفضل محفوظ.')) return;
        submitBilling(m, e.currentTarget, student.id, 'disable', {}, onChange, 'تم إيقاف متابعة الدفع');
    });
}

export function openPaymentModal(state, onChange) {
    const { student, view } = state;
    if (view.money) return openMoneyPayment(state, onChange);
    const count = view.size || 1;
    const m = openModal('تسجيل دفعة', `
        <div class="bm-error" role="alert"></div>
        <div class="bm-grid">
            <div class="bm-field"><label for="bm-count">عدد الحصص المدفوعة</label>
                <input type="number" id="bm-count" min="1" max="500" inputmode="numeric" value="${count}"></div>
            <div class="bm-field"><label for="bm-amount">المبلغ <small>(اختياري)</small></label>
                <input type="number" id="bm-amount" min="0" step="any" inputmode="decimal" value="${view.price ? view.price * count : ''}"></div>
        </div>
        <div class="bm-field"><label for="bm-note">ملاحظة <small>(اختياري)</small></label>
            <input type="text" id="bm-note" maxlength="300" placeholder="مثلًا: تحويل فودافون كاش"></div>
        <p class="bm-hint" id="bm-after"></p>
        <div class="bm-buttons">
            <button type="button" class="btn" id="bm-save">حفظ الدفعة</button>
            <button type="button" class="btn btn-ghost" data-close>إلغاء</button>
        </div>
    `);
    let amountTouched = false;
    const after = () => {
        const c = parseInt(m.$('#bm-count').value, 10) || 0;
        const nb = view.balance + c;
        m.$('#bm-after').textContent = c > 0 ? (nb >= 0 ? `بعد الدفعة: باقي ${lessonsText(nb)}` : `بعد الدفعة: مستحق ${lessonsText(-nb)}`) : '';
        if (!amountTouched && view.price) m.$('#bm-amount').value = c > 0 ? view.price * c : '';
    };
    m.$('#bm-amount').addEventListener('input', () => { amountTouched = true; });
    m.$('#bm-count').addEventListener('input', after);
    after();
    m.$('#bm-save').addEventListener('click', (e) => {
        const c = parseInt(m.$('#bm-count').value, 10);
        if (!c || c < 1) { const er = m.$('.bm-error'); er.textContent = 'اكتب عدد الحصص المدفوعة'; er.style.display = 'block'; return; }
        submitBilling(m, e.currentTarget, student.id, 'add_payment',
            { lessons_count: c, amount: m.$('#bm-amount').value, note: m.$('#bm-note').value }, onChange, 'تم تسجيل الدفعة');
    });
}

function openMoneyPayment(state, onChange) {
    const { student, view } = state;
    const months = view.mode === 'monthly' ? (view.months || []) : [];
    const firstUnpaid = months.slice().reverse().find((mo) => (Number(mo.paid) || 0) < (view.fee || 0));
    const suggest = view.mode === 'monthly' ? (view.fee ? Math.max(0, view.fee - (firstUnpaid ? Number(firstUnpaid.paid) || 0 : 0)) : '') : (view.owedAmount || '');
    const next = (() => { const [y, mo] = String(view.thisMonth || '').split('-').map(Number); if (!mo) return null; const d = new Date(y, mo, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; })();
    const opts = months.slice().reverse().map((mo) => mo.month).concat(next ? [next] : []);
    const m = openModal('تسجيل دفعة', `
        <div class="bm-error" role="alert"></div>
        <div class="bm-grid">
            <div class="bm-field"><label for="bm-amount">المبلغ</label>
                <input type="number" id="bm-amount" min="1" step="any" inputmode="decimal" value="${esc(suggest || '')}"></div>
            ${view.mode === 'monthly' ? `<div class="bm-field"><label for="bm-period">عن شهر</label>
                <select id="bm-period">${opts.map((o) => `<option value="${esc(o)}" ${firstUnpaid && o === firstUnpaid.month ? 'selected' : (!firstUnpaid && o === next ? 'selected' : '')}>${esc(monthLabel(o))}</option>`).join('')}</select></div>` : ''}
        </div>
        <div class="bm-field"><label for="bm-note">ملاحظة <small>(اختياري)</small></label>
            <input type="text" id="bm-note" maxlength="300" placeholder="مثلًا: تحويل فودافون كاش"></div>
        <p class="bm-hint">${view.owedAmount > 0 ? `المستحق دلوقتي: ${money(view.owedAmount)}` : view.balance > 0 ? `مدفوع مقدمًا: ${money(view.balance)}` : 'مفيش مستحق دلوقتي'}</p>
        <div class="bm-buttons">
            <button type="button" class="btn" id="bm-save">حفظ الدفعة</button>
            <button type="button" class="btn btn-ghost" data-close>إلغاء</button>
        </div>
    `);
    m.$('#bm-save').addEventListener('click', (e) => {
        const a = Number(toLatinDigits(m.$('#bm-amount').value));
        if (!a || a <= 0) { const er = m.$('.bm-error'); er.textContent = 'اكتب المبلغ'; er.style.display = 'block'; return; }
        const data = { student_id: student.id, amount: String(a), note: m.$('#bm-note').value };
        if (m.$('#bm-period')) data.period = m.$('#bm-period').value;
        submitMoney(m, e.currentTarget, 'pay_add', data, onChange, 'تم تسجيل الدفعة');
    });
}

export function openAdjustModal(state, onChange) {
    const { student } = state;
    const m = openModal('تعديل الرصيد', `
        <div class="bm-error" role="alert"></div>
        <p class="bm-hint" style="margin-top:0">الغياب بيتسجل من زرار "الطالب غاب" في الحصة أو ملف الطالب وبيتحسب تلقائيًا. التعديل هنا للحالات الخاصة بس.</p>
        <div class="bm-grid">
            <div class="bm-field"><label for="bm-dir">نوع التعديل</label>
                <select id="bm-dir"><option value="-1">خصم حصص من الرصيد</option><option value="1">إضافة حصص للرصيد (مجانًا/تعويض)</option></select></div>
            <div class="bm-field"><label for="bm-n">عدد الحصص</label>
                <input type="number" id="bm-n" min="1" max="500" inputmode="numeric" value="1"></div>
        </div>
        <div class="bm-field"><label for="bm-note">السبب <small>(اختياري)</small></label>
            <input type="text" id="bm-note" maxlength="300" placeholder="مثلًا: حصة تعويضية"></div>
        <div class="bm-buttons">
            <button type="button" class="btn" id="bm-save">حفظ التعديل</button>
            <button type="button" class="btn btn-ghost" data-close>إلغاء</button>
        </div>
    `);
    m.$('#bm-save').addEventListener('click', (e) => {
        const n = parseInt(m.$('#bm-n').value, 10);
        if (!n || n < 1) { const er = m.$('.bm-error'); er.textContent = 'اكتب عدد الحصص'; er.style.display = 'block'; return; }
        const sign = parseInt(m.$('#bm-dir').value, 10);
        submitBilling(m, e.currentTarget, student.id, 'adjust', { lessons_count: sign * n, note: m.$('#bm-note').value || (sign < 0 ? 'خصم يدوي' : 'إضافة يدوية') }, onChange, 'تم تعديل الرصيد');
    });
}

export function openReminder(state) {
    const { student, view } = state;
    const to = recipientChooser(student);
    let toPhone = to.initial;
    const m = openModal('رسالة للطالب', `
        ${to.html}
        <div class="bm-tones" role="tablist">${REMINDER_TONES.map((t, i) => `<button type="button" class="bm-tone ${i === 0 ? 'active' : ''}" data-tone="${t.value}">${t.label}</button>`).join('')}</div>
        <textarea id="bm-msg" class="bm-msg" rows="7" dir="rtl"></textarea>
        <p class="bm-hint">${toPhone ? 'تقدر تعدّل الرسالة قبل الإرسال.' : 'لا يوجد رقم هاتف للطالب: واتساب هيفتح وتختار جهة الاتصال بنفسك.'}</p>
        <div class="bm-buttons">
            <a class="btn bm-wa" id="bm-wa" target="_blank" rel="noopener">${icon('messageCircle', { size: 16 })} إرسال واتساب</a>
            <button type="button" class="btn btn-ghost" id="bm-copy">${icon('copy', { size: 15 })} نسخ</button>
        </div>
    `);
    const msg = m.$('#bm-msg');
    const wa = m.$('#bm-wa');
    const refreshLink = () => { wa.href = whatsappUrl(toPhone, msg.value); };
    to.bind(m.el, (ph) => { toPhone = ph; refreshLink(); });
    wa.addEventListener('click', () => { try { (window.dataLayer = window.dataLayer || []).push({ event: 'payment_reminder_sent' }); } catch (e) { /* تجاهل */ } });
    const setTone = (tone) => {
        m.el.querySelectorAll('.bm-tone').forEach((b) => b.classList.toggle('active', b.dataset.tone === tone));
        msg.value = buildReminder(view, student, tone);
        refreshLink();
    };
    m.el.querySelectorAll('.bm-tone').forEach((b) => b.addEventListener('click', () => setTone(b.dataset.tone)));
    msg.addEventListener('input', refreshLink);
    m.$('#bm-copy').addEventListener('click', async () => {
        try { await navigator.clipboard.writeText(msg.value); ErrorHandler.showSuccess('تم نسخ الرسالة'); }
        catch (e) { msg.select(); document.execCommand && document.execCommand('copy'); ErrorHandler.showSuccess('تم نسخ الرسالة'); }
    });
    setTone('friendly');
}


/**
 * v29: تذكير جماعي بالفلوس — رسالة جاهزة لكل واحد ورا التاني (كل ضغطة بتفتح واتساب للي عليه الدور)
 * items: [{ name, phone, text }]
 */
export function openBulkReminders(items) {
    const list = (items || []).filter((x) => x && x.text);
    if (!list.length) return;
    let i = 0;
    const sent = new Set();
    const m = openModal('تذكير الكل بالفلوس', `
        <p class="bm-hint" style="margin-top:0">كل ضغطة على "ابعت" بتفتح واتساب برسالة جاهزة للي عليه الدور، وبعدها ارجع هنا للي بعده.</p>
        <div class="bulk-prog"><div class="bulk-bar"><i></i></div><span class="bulk-count"></span></div>
        <div class="bulk-who"></div>
        <textarea class="bm-msg bulk-msg" rows="6" dir="rtl" aria-label="نص الرسالة"></textarea>
        <div class="bm-buttons">
            <a class="btn bm-wa bulk-send" target="_blank" rel="noopener">${icon('messageCircle', { size: 16 })} ابعت</a>
            <button type="button" class="btn btn-ghost bulk-skip">تخطّي</button>
        </div>
        <div class="bulk-done" hidden><p>✅ خلصت كل الرسايل (${list.length}).</p><button type="button" class="btn" data-close>تمام</button></div>
    `);
    const $ = (sel) => m.el.querySelector(sel);
    const render = () => {
        if (i >= list.length) {
            $('.bulk-who').hidden = true; $('.bulk-msg').hidden = true;
            m.el.querySelector('.bm-buttons').hidden = true;
            $('.bulk-done').hidden = false;
            $('.bulk-done [data-close]').onclick = () => m.close();
            $('.bulk-bar i').style.width = '100%';
            $('.bulk-count').textContent = `${sent.size} اتبعت من ${list.length}`;
            return;
        }
        const it = list[i];
        $('.bulk-count').textContent = `${i + 1} من ${list.length}`;
        $('.bulk-bar i').style.width = `${Math.round((i / list.length) * 100)}%`;
        $('.bulk-who').innerHTML = `<b>${esc(it.name || '')}</b>${it.phone ? '' : ' <small class="bulk-nophone">— مفيش رقم: واتساب هيفتح وتختار جهة الاتصال</small>'}${it.sub ? `<small>${esc(it.sub)}</small>` : ''}`;
        $('.bulk-msg').value = it.text;
        $('.bulk-send').href = whatsappUrl(it.phone, it.text);
    };
    $('.bulk-msg').addEventListener('input', () => { list[i].text = $('.bulk-msg').value; $('.bulk-send').href = whatsappUrl(list[i].phone, list[i].text); });
    $('.bulk-send').addEventListener('click', () => {
        sent.add(i);
        try { (window.dataLayer = window.dataLayer || []).push({ event: 'payment_reminder_sent', bulk: true }); } catch (e) { /* تجاهل */ }
        // ننتقل للي بعده بعد ما واتساب يفتح
        setTimeout(() => { i++; render(); }, 350);
    });
    $('.bulk-skip').addEventListener('click', () => { i++; render(); });
    render();
}
