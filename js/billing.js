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

import { api } from './api.js?v=12';
import { Formatters, ErrorHandler } from './utils.js?v=12';
import { icon } from './icons.js?v=12';

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
export function computeBilling(billing) {
    const b = billing || {};
    const view = { available: !!b.available, enabled: !!(b.available && b.mode), mode: b.mode || null };
    if (!view.enabled) return view;

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
        view.progress = view.used != null ? view.used / size : 1;
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
    if (view.mode === 'prepaid' && view.balance > 1 && view.used != null) return { text: `باقي ${view.balance} من ${view.size}`, status: view.status };
    return { text: view.headline, status: view.status };
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
    const renew = view.renewAmount ? ` (${money(view.renewAmount)})` : '';
    const owedAmt = view.owedAmount ? ` (${money(view.owedAmount)})` : '';

    if (tone === 'statement') {
        const lines = [hi, 'ملخص الحصص من بداية المتابعة:'];
        lines.push(`• الحصص اللي تمت: ${view.taken}`);
        lines.push(`• الحصص المدفوعة: ${view.paid + view.adjusted}`);
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

// رقم مصري محلي (01xxxxxxxxx) بيتحوّل لـ 201xxxxxxxxx، وأي رقم دولي بيتقبل زي ما هو
export function normalizePhone(phone) {
    let d = String(phone || '').replace(/[^\d+]/g, '');
    if (!d) return null;
    if (d.startsWith('+')) d = d.slice(1);
    else if (d.startsWith('00')) d = d.slice(2);
    else if (/^01\d{9}$/.test(d)) d = '20' + d.slice(1);
    else if (d.startsWith('0')) return null;   // رقم محلي لبلد غير معروف
    d = d.replace(/\D/g, '');
    return d.length >= 8 ? d : null;
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
            <div><strong>متابعة الدفع غير مفعّلة على الخادم بعد</strong><span>تحتاج تشغيل ملف SQL واستيراد workflows الدفع في n8n.</span></div></div></div>`;
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

export function bindBillingActions(container, ctx) {
    container.querySelectorAll('[data-bill-act]').forEach((btn) => {
        btn.addEventListener('click', () => {
            const act = btn.dataset.billAct;
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
            </div>
        </div>
        <div class="bm-grid">
            <div class="bm-field"><label for="bm-size" id="bm-size-label">عدد حصص الباقة</label>
                <input type="number" id="bm-size" min="1" max="200" inputmode="numeric" value="${esc(view.size || 8)}"></div>
            <div class="bm-field"><label for="bm-price">سعر الحصة <small>(اختياري)</small></label>
                <input type="number" id="bm-price" min="0" step="any" inputmode="decimal" value="${view.price != null ? esc(view.price) : ''}" placeholder="مثلًا 100"></div>
        </div>
        <label class="bm-check">
            <input type="checkbox" id="bm-unexcused" ${view.enabled && view.countUnexcused === false ? '' : 'checked'}>
            <span>الغياب بدون عذر يتحسب من الحصص <small>(الغياب بعذر مش بيتحسب)</small></span>
        </label>
        ${firstTime ? `<div class="bm-field bm-opening">
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
        m.$('#bm-size-label').textContent = md === 'prepaid' ? 'عدد حصص الباقة' : 'الدفع كل كام حصة؟';
        const ol = m.$('#bm-opening-label');
        if (ol) ol.textContent = md === 'prepaid' ? 'كام حصة فاضلة للطالب في الباقة الحالية؟' : 'كام حصة اتعملت ولسه ما اتدفعتش؟';
    };
    m.el.querySelectorAll('input[name="bm-mode"]').forEach((r) => r.addEventListener('change', sync));
    sync();
    m.$('#bm-save').addEventListener('click', (e) => {
        const md = m.el.querySelector('input[name="bm-mode"]:checked').value;
        const size = parseInt(m.$('#bm-size').value, 10);
        if (!size || size < 1 || size > 200) { const er = m.$('.bm-error'); er.textContent = 'عدد الحصص لازم يكون رقم من 1 إلى 200'; er.style.display = 'block'; return; }
        const data = { billing_mode: md, package_size: size, lesson_price: m.$('#bm-price').value, count_unexcused_absence: m.$('#bm-unexcused').checked };
        if (firstTime) {
            const o = Math.max(0, parseInt(m.$('#bm-opening').value, 10) || 0);
            data.opening_lessons = md === 'prepaid' ? o : -o;
        }
        submitBilling(m, e.currentTarget, student.id, 'settings', data, onChange, 'تم حفظ إعدادات الدفع');
    });
    const dis = m.$('#bm-disable');
    if (dis) dis.addEventListener('click', (e) => {
        if (!confirm('إيقاف متابعة الدفع لهذا الطالب؟ سجل الدفعات هيفضل محفوظ.')) return;
        submitBilling(m, e.currentTarget, student.id, 'disable', {}, onChange, 'تم إيقاف متابعة الدفع');
    });
}

export function openPaymentModal(state, onChange) {
    const { student, view } = state;
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
    const m = openModal('رسالة للطالب', `
        <div class="bm-tones" role="tablist">${REMINDER_TONES.map((t, i) => `<button type="button" class="bm-tone ${i === 0 ? 'active' : ''}" data-tone="${t.value}">${t.label}</button>`).join('')}</div>
        <textarea id="bm-msg" class="bm-msg" rows="7" dir="rtl"></textarea>
        <p class="bm-hint">${student.phone ? 'تقدر تعدّل الرسالة قبل الإرسال.' : 'لا يوجد رقم هاتف للطالب: واتساب هيفتح وتختار جهة الاتصال بنفسك.'}</p>
        <div class="bm-buttons">
            <a class="btn bm-wa" id="bm-wa" target="_blank" rel="noopener">${icon('messageCircle', { size: 16 })} إرسال واتساب</a>
            <button type="button" class="btn btn-ghost" id="bm-copy">${icon('copy', { size: 15 })} نسخ</button>
        </div>
    `);
    const msg = m.$('#bm-msg');
    const wa = m.$('#bm-wa');
    const refreshLink = () => { wa.href = whatsappUrl(student.phone, msg.value); };
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
