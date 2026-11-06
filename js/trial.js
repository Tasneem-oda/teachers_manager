/**
 * trial.js — v31: الطالب التجريبي
 *
 * الرحلة كلها:
 *  1) "حصة تجريبية" من صفحة الطلاب: الاسم + الرقم + ميعاد الحصة التجريبية (مرة واحدة).
 *     الطالب بيتسجل "تجريبي" (مش بيظهر مع الطلاب الأساسيين) والحصة بتظهر في حصص النهارده والجدول.
 *  2) بعد ميعاد التجربة: كارت "قرّر" في الرئيسية + صفحة الطلاب + ملف الطالب + بعد حفظ الحصة.
 *  3) القرار:
 *     ✅ "ضيفه لطلابي": مواعيده الثابتة + نظام الدفع (باقة/كل كام حصة) + الحصة التجريبية مجانية ولا من الباقة.
 *     🗑️ "مكملش": حذف الطالب ومواعيده.
 *     📅 "غيّر الميعاد": لو التجربة اتأجلت.
 */
import { api } from './api.js?v=39';
import { ErrorHandler, Formatters, askChoice } from './utils.js?v=39';
import { icon } from './icons.js?v=39';

const esc = (s) => Formatters.escapeHtml(String(s == null ? '' : s));
const DAYS = ['الأحد', 'الاتنين', 'التلات', 'الأربع', 'الخميس', 'الجمعة', 'السبت'];
const DAY_ORDER = [6, 0, 1, 2, 3, 4, 5];   // السبت الأول (زي الجدول)
const pad = (n) => String(n).padStart(2, '0');

// ------------------------------------------------------------------ أدوات
export function isTrial(s) { return !!(s && (s.is_trial === true || s.is_trial === 't' || s.is_trial === 'true')); }

export function trialDate(s) {
    if (!s || !s.trial_at) return null;
    const d = new Date(s.trial_at);
    return Number.isNaN(d.getTime()) ? null : d;
}

/** "الخميس 6 نوفمبر · 6:00 م" */
export function trialWhen(s) {
    const d = trialDate(s);
    if (!d) return '';
    try {
        const day = d.toLocaleDateString('ar-EG-u-nu-latn', { weekday: 'long', day: 'numeric', month: 'long' });
        const t = d.toLocaleTimeString('ar-EG-u-nu-latn', { hour: 'numeric', minute: '2-digit' });
        return `${day} · ${t}`;
    } catch (e) { return d.toLocaleString(); }
}

/**
 * حالة الطالب التجريبي
 * @param {object} s الطالب
 * @param {{doneLessons?: number}} [o] عدد الحصص اللي اتسجلت (لو معروف)
 * @returns {{phase: 'nodate'|'upcoming'|'today'|'now'|'decide', text: string}}
 */
export function trialState(s, o = {}) {
    const d = trialDate(s);
    const done = Number(o.doneLessons) || 0;
    if (done > 0) return { phase: 'decide', text: 'الحصة التجريبية اتعملت ✓ — قرّر هيكمل ولا لأ' };
    if (!d) return { phase: 'nodate', text: 'لسه ماتحددش ميعاد الحصة التجريبية' };
    const now = Date.now();
    const t = d.getTime();
    const dur = (Number(s.trial_duration) || 45) * 60000;
    if (now >= t && now <= t + dur) return { phase: 'now', text: `الحصة التجريبية دلوقتي (${trialWhen(s)})` };
    if (now > t + dur) return { phase: 'decide', text: `التجربة كانت ${trialWhen(s)} — قرّر هيكمل ولا لأ` };
    const today = new Date();
    if (d.toDateString() === today.toDateString()) return { phase: 'today', text: `الحصة التجريبية النهارده ${d.toLocaleTimeString('ar-EG-u-nu-latn', { hour: 'numeric', minute: '2-digit' })}` };
    return { phase: 'upcoming', text: `الحصة التجريبية: ${trialWhen(s)}` };
}

/** تاريخ ووقت محليين → ISO + اليوم + الوقت (للميعاد اللي بيتعمل مرة واحدة) */
export function localSlot(dateStr, timeStr) {
    const [y, m, d] = String(dateStr).split('-').map(Number);
    const [hh, mm] = String(timeStr).split(':').map(Number);
    const dt = new Date(y, (m || 1) - 1, d || 1, hh || 0, mm || 0, 0);
    return { iso: dt.toISOString(), dow: dt.getDay(), date: `${y}-${pad(m)}-${pad(d)}`, time: `${pad(hh || 0)}:${pad(mm || 0)}`, dt };
}

/** القيم الافتراضية لميعاد التجربة: بكرة 5 العصر (أو النهارده لو لسه بدري) */
export function defaultTrialSlot() {
    const n = new Date();
    const d = new Date(n);
    if (n.getHours() >= 15) d.setDate(d.getDate() + 1);
    return { date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, time: n.getHours() >= 15 ? '17:00' : `${pad(Math.min(21, n.getHours() + 2))}:00` };
}

/** حجز ميعاد التجربة (مرة واحدة) — بيرجّع id الموعد */
export async function bookTrialSlot(studentId, slot, duration) {
    const res = await api.createSchedule({
        student_id: studentId,
        day_of_week: slot.dow,
        start_time: slot.time,
        duration_minutes: Number(duration) || 45,
        recurrence_type: 'none',
        start_date: slot.date
    });
    return (res && (res.id || res.schedule_id)) || null;
}

// ------------------------------------------------------------------ ستايل (مرة واحدة)
function ensureCss() {
    if (document.getElementById('tr-css')) return;
    const st = document.createElement('style');
    st.id = 'tr-css';
    st.textContent = `
    .tr-modal .modal-content{position:relative;max-width:520px;max-height:calc(100dvh - 24px);overflow:auto}
    .tr-close{position:absolute;inset-inline-end:.8rem;top:.8rem;border:0;background:transparent;cursor:pointer;color:var(--text-secondary);padding:.3rem}
    .tr-title{margin:0 0 .25rem;font-size:1.2rem}
    .tr-sub{margin:0 0 1rem;color:var(--text-secondary);font-size:.88rem;line-height:1.7}
    .tr-sec{border:1px solid var(--border,#E8E2D6);border-radius:14px;padding:.85rem .9rem;margin-bottom:.8rem;background:#fff}
    .tr-sec h3{margin:0 0 .55rem;font-size:.98rem;display:flex;align-items:center;gap:.4rem}
    .tr-sec h3 small{font-weight:400;color:var(--text-light,#8A8494);font-size:.8rem}
    .tr-days{display:flex;flex-wrap:wrap;gap:.35rem;margin-bottom:.6rem}
    .tr-day{border:1.5px solid var(--border,#E8E2D6);background:#fff;border-radius:999px;padding:.35rem .7rem;font:inherit;font-size:.86rem;cursor:pointer;min-height:38px}
    .tr-day[aria-pressed="true"]{background:var(--primary,#4B3A5A);border-color:var(--primary,#4B3A5A);color:#fff;font-weight:700}
    .tr-row{display:grid;grid-template-columns:1fr 1fr;gap:.6rem}
    .tr-field label{display:block;font-weight:600;font-size:.84rem;margin-bottom:.3rem}
    .tr-field input,.tr-field select{width:100%;padding:.6rem .7rem;border:1px solid var(--field-border,#DDD6C8);border-radius:10px;font:inherit;font-size:1rem;margin:0;background:#fff;min-height:44px}
    .tr-opts{display:flex;flex-direction:column;gap:.45rem}
    .tr-opt{display:flex;gap:.6rem;align-items:flex-start;border:1.5px solid var(--border,#E8E2D6);border-radius:12px;padding:.6rem .7rem;cursor:pointer;line-height:1.55}
    .tr-opt input{margin-top:.25rem;accent-color:var(--primary,#4B3A5A);width:18px;height:18px;flex-shrink:0}
    .tr-opt b{display:block;font-size:.92rem}.tr-opt small{color:var(--text-secondary);font-size:.8rem}
    .tr-opt:has(input:checked){border-color:var(--primary,#4B3A5A);background:rgba(75,58,90,.04)}
    .tr-sub-fields{margin-top:.6rem}
    .tr-skip{display:flex;align-items:center;gap:.45rem;font-size:.86rem;color:var(--text-secondary);margin-top:.2rem;cursor:pointer}
    .tr-skip input{width:18px;height:18px;accent-color:var(--primary,#4B3A5A)}
    .tr-actions{display:flex;gap:.6rem;flex-wrap:wrap;margin-top:.4rem}
    .tr-actions .btn{flex:1;min-height:46px}
    .tr-err{color:#B3261E;font-size:.85rem;margin:.2rem 0 .5rem;display:none;line-height:1.6}
    .tr-card{border:1.5px solid #E7D3A7;background:linear-gradient(180deg,#FFFBF2,#fff);border-radius:16px;padding:.85rem 1rem;margin-bottom:1rem}
    .tr-card-head{display:flex;align-items:center;gap:.5rem;font-weight:700;margin-bottom:.15rem}
    .tr-card p{margin:.15rem 0 .6rem;color:var(--text-secondary);font-size:.88rem;line-height:1.7}
    .tr-card .tr-btns{display:flex;flex-wrap:wrap;gap:.45rem}
    .tr-card .tr-btns .btn{min-height:40px}
    .tr-list-item{display:flex;align-items:center;gap:.6rem;padding:.55rem 0;border-top:1px solid #F0E8D6;flex-wrap:wrap}
    .tr-list-item:first-of-type{border-top:0}
    .tr-list-item .tr-li-main{flex:1;min-width:160px}
    .tr-list-item .tr-li-main a{font-weight:700;color:var(--text-primary);text-decoration:none}
    .tr-list-item .tr-li-main small{display:block;color:var(--text-secondary);font-size:.8rem}
    .tr-badge{display:inline-flex;align-items:center;gap:.2rem;background:#FFF1D6;color:#8A5A00;border:1px solid #F0D49A;border-radius:999px;padding:0 .5rem;font-size:.74rem;font-weight:700;margin-inline-start:.35rem;vertical-align:middle;white-space:nowrap}
    @media (max-width:480px){.tr-row{grid-template-columns:1fr}.tr-actions .btn{flex:1 1 100%}}
    `;
    document.head.appendChild(st);
}

function makeModal(html, label) {
    ensureCss();
    const modal = document.createElement('div');
    modal.className = 'modal active tr-modal';
    modal.innerHTML = `<div class="modal-content" role="dialog" aria-modal="true" aria-label="${esc(label)}">
        <button type="button" class="tr-close" aria-label="إغلاق">${icon('x', { size: 20 })}</button>${html}</div>`;
    document.body.appendChild(modal);
    const close = () => { modal.remove(); document.removeEventListener('keydown', onKey); };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    modal.querySelector('.tr-close').addEventListener('click', close);
    modal.addEventListener('mousedown', (e) => { if (e.target === modal) close(); });
    return { modal, close, $: (s) => modal.querySelector(s) };
}

const durOptions = (sel) => [30, 45, 60, 90, 120].map((m) => `<option value="${m}" ${Number(sel) === m ? 'selected' : ''}>${m === 60 ? 'ساعة' : m === 90 ? 'ساعة ونص' : m === 120 ? 'ساعتين' : `${m} دقيقة`}</option>`).join('');

if (typeof document !== 'undefined') { try { ensureCss(); } catch (e) { /* تجاهل */ } }

// ------------------------------------------------------------------ ✅ ضيفه لطلابي
/**
 * @param {object} student {id, name, trial_at, ...}
 * @param {{onDone?: Function, doneLessons?: number}} [o]
 */
export function openConvertTrial(student, o = {}) {
    if (!student || !student.id) return;
    const first = String(student.name || 'الطالب').trim().split(/\s+/)[0];
    const td = trialDate(student);
    const defDay = td ? td.getDay() : new Date().getDay();
    const defTime = td ? `${pad(td.getHours())}:${pad(td.getMinutes())}` : '17:00';
    const m = makeModal(`
        <h2 class="tr-title">🎉 ${esc(first)} هيكمل معاك</h2>
        <p class="tr-sub">خطوة واحدة ويبقى من طلابك: حدّد مواعيده الثابتة ونظام الدفع. تقدر تغيّر أي حاجة بعدين من ملفه.</p>

        <div class="tr-sec">
            <h3>${icon('calendar', { size: 17 })} مواعيده الثابتة كل أسبوع</h3>
            <div class="tr-days" role="group" aria-label="أيام الحصص">
                ${DAY_ORDER.map((d) => `<button type="button" class="tr-day" data-day="${d}" aria-pressed="${d === defDay}">${DAYS[d]}</button>`).join('')}
            </div>
            <div class="tr-row">
                <div class="tr-field"><label for="tr-time">الساعة</label><input type="time" id="tr-time" value="${defTime}"></div>
                <div class="tr-field"><label for="tr-dur">مدة الحصة</label><select id="tr-dur">${durOptions(student.trial_duration || 45)}</select></div>
            </div>
            <label class="tr-skip"><input type="checkbox" id="tr-skip-sched"> هحدد المواعيد بعدين</label>
        </div>

        <div class="tr-sec">
            <h3>${icon('creditCard', { size: 17 })} الحساب</h3>
            <div class="tr-opts" role="radiogroup" aria-label="نظام الدفع">
                <label class="tr-opt"><input type="radio" name="tr-bill" value="prepaid" checked><span><b>باقة مدفوعة مقدمًا</b><small>بيدفع عدد حصص الأول، والبرنامج يقولك فاضله كام.</small></span></label>
                <label class="tr-opt"><input type="radio" name="tr-bill" value="postpaid"><span><b>بيدفع بعد كل كام حصة</b><small>مثلًا كل 4 حصص، والبرنامج يفكّرك لما ييجي ميعاد الدفع.</small></span></label>
                <label class="tr-opt"><input type="radio" name="tr-bill" value="none"><span><b>من غير متابعة دفع دلوقتي</b><small>تقدر تفعّلها بعدين من ملفه.</small></span></label>
            </div>
            <div class="tr-sub-fields" id="tr-bill-fields">
                <div class="tr-row">
                    <div class="tr-field"><label for="tr-size" id="tr-size-label">عدد حصص الباقة</label><input type="number" id="tr-size" min="1" max="100" value="8" inputmode="numeric"></div>
                    <div class="tr-field"><label for="tr-price">سعر الحصة <small>(اختياري)</small></label><input type="number" id="tr-price" min="0" step="any" inputmode="decimal" placeholder="مثلًا 100"></div>
                </div>
                <label class="tr-skip" id="tr-paid-wrap"><input type="checkbox" id="tr-paid"> دفع الباقة خلاص</label>
            </div>
        </div>

        <div class="tr-sec" id="tr-trial-sec">
            <h3>🎯 الحصة التجريبية</h3>
            <div class="tr-opts" role="radiogroup" aria-label="الحصة التجريبية">
                <label class="tr-opt"><input type="radio" name="tr-count" value="count" checked><span><b>تتحسب من أول باقة</b><small>كأنها أول حصة من الحصص المدفوعة.</small></span></label>
                <label class="tr-opt"><input type="radio" name="tr-count" value="free"><span><b>مجانية</b><small>ماتتحسبش في الفلوس.</small></span></label>
            </div>
        </div>

        <p class="tr-err" id="tr-err"></p>
        <div class="tr-actions">
            <button type="button" class="btn" id="tr-go">${icon('check', { size: 17 })} ضيفه لطلابي</button>
            <button type="button" class="btn btn-outline" id="tr-cancel">رجوع</button>
        </div>`, `إضافة ${first} للطلاب`);

    const days = () => [...m.modal.querySelectorAll('.tr-day[aria-pressed="true"]')].map((b) => Number(b.dataset.day));
    m.modal.querySelectorAll('.tr-day').forEach((b) => b.addEventListener('click', () => b.setAttribute('aria-pressed', b.getAttribute('aria-pressed') === 'true' ? 'false' : 'true')));
    const skip = m.$('#tr-skip-sched');
    skip.addEventListener('change', () => {
        m.modal.querySelectorAll('.tr-day, #tr-time, #tr-dur').forEach((el) => { el.disabled = skip.checked; });
    });
    const syncBill = () => {
        const v = m.modal.querySelector('input[name="tr-bill"]:checked').value;
        m.$('#tr-bill-fields').hidden = v === 'none';
        m.$('#tr-trial-sec').hidden = v === 'none';
        m.$('#tr-size-label').textContent = v === 'postpaid' ? 'بيدفع كل كام حصة' : 'عدد حصص الباقة';
        if (v === 'postpaid' && Number(m.$('#tr-size').value) === 8) m.$('#tr-size').value = 4;
        if (v === 'prepaid' && Number(m.$('#tr-size').value) === 4) m.$('#tr-size').value = 8;
        m.$('#tr-paid-wrap').hidden = v !== 'prepaid';
    };
    m.modal.querySelectorAll('input[name="tr-bill"]').forEach((r) => r.addEventListener('change', syncBill));
    syncBill();
    m.$('#tr-cancel').addEventListener('click', m.close);

    m.$('#tr-go').addEventListener('click', async (e) => {
        const btn = e.currentTarget;
        const err = m.$('#tr-err');
        err.style.display = 'none';
        const bill = m.modal.querySelector('input[name="tr-bill"]:checked').value;
        const countTrial = m.modal.querySelector('input[name="tr-count"]:checked').value === 'count';
        const size = Math.round(Number(m.$('#tr-size').value) || 0);
        const priceRaw = m.$('#tr-price').value;
        const chosenDays = skip.checked ? [] : days();
        const time = m.$('#tr-time').value;
        const dur = Number(m.$('#tr-dur').value) || 45;
        if (!skip.checked && !chosenDays.length) { err.textContent = 'اختار يوم واحد على الأقل (أو علّم "هحدد المواعيد بعدين").'; err.style.display = 'block'; return; }
        if (!skip.checked && !time) { err.textContent = 'اختار الساعة.'; err.style.display = 'block'; return; }
        if (bill !== 'none' && (size < 1 || size > 100)) { err.textContent = 'اكتب عدد حصص صحيح (من 1 لـ 100).'; err.style.display = 'block'; return; }

        btn.disabled = true;
        const label = btn.innerHTML;
        const problems = [];
        try {
            // 1) بقى طالب أساسي (أهم خطوة: لو اللي بعدها فشل يقدر يكمّله من ملفه)
            btn.textContent = 'جاري الإضافة...';
            await api.updateStudentInfo(student.id, { is_trial: false });
            // 2) المواعيد الثابتة
            if (chosenDays.length) {
                btn.textContent = 'جاري حفظ المواعيد...';
                const groupId = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : null;
                const res = await Promise.allSettled(chosenDays.map((d) => api.createSchedule({
                    student_id: student.id, day_of_week: d, start_time: time, duration_minutes: dur, recurrence_type: 'weekly',
                    ...(groupId && chosenDays.length > 1 ? { recurrence_group_id: groupId } : {})
                })));
                const bad = res.map((r, i) => (r.status === 'rejected' ? DAYS[chosenDays[i]] : null)).filter(Boolean);
                if (bad.length) problems.push(`مواعيد ${bad.join('، ')} ماتحفظتش (ضيفها من "المواعيد" في ملفه)`);
            }
            // 3) نظام الدفع + الحصة التجريبية
            if (bill !== 'none') {
                btn.textContent = 'جاري حفظ الحساب...';
                try {
                    await api.studentBilling(student.id, 'settings', {
                        billing_mode: bill, package_size: size,
                        lesson_price: priceRaw !== '' ? Number(priceRaw) : null,
                        count_unexcused_absence: true,
                        opening_lessons: bill === 'prepaid' && m.$('#tr-paid').checked ? size : 0
                    });
                    // رصيد البداية بيبدأ العد من دلوقتي، فالحصة التجريبية (اللي قبلها) بتتخصم يدوي لو المدرس عايزها من الباقة
                    if (countTrial) {
                        await api.studentBilling(student.id, 'adjust', { lessons_count: -1, note: 'الحصة التجريبية' });
                    }
                    try { api.clearBillingDueCache(); } catch (er) { /* تجاهل */ }
                } catch (er) {
                    problems.push('نظام الدفع ماتحفظش (فعّله من تاب "الحساب" في ملفه)');
                }
            }
            try { window.tmTrack && window.tmTrack('trial_converted', { days: chosenDays.length, bill, count_trial: countTrial }); } catch (er) { /* تجاهل */ }
            m.close();
            if (problems.length) ErrorHandler.showError(`${first} بقى من طلابك ✓ بس: ${problems.join(' — ')}`, 9000);
            else ErrorHandler.showSuccess(`${first} بقى من طلابك ✓`);
            if (typeof o.onDone === 'function') o.onDone('converted');
        } catch (error) {
            err.textContent = ErrorHandler.getErrorMessage(error);
            err.style.display = 'block';
            btn.disabled = false;
            btn.innerHTML = label;
        }
    });
}

// ------------------------------------------------------------------ 🗑️ مكملش
export async function openDeleteTrial(student, o = {}) {
    if (!student || !student.id) return false;
    const first = String(student.name || 'الطالب').trim().split(/\s+/)[0];
    const pick = await askChoice({
        title: `${first} مش هيكمل؟`,
        message: `هيتمسح ${first} وميعاد الحصة التجريبية وأي حاجة اتسجلت له.\nلو ممكن يرجع بعدين، اختار "سيبه تجريبي" وقرّر وقت ما تحب.`,
        choices: [{ label: `احذف ${first}`, value: 'del', danger: true }],
        cancelLabel: 'سيبه تجريبي'
    });
    if (pick !== 'del') return false;
    try {
        await api.deleteStudent(student.id);
        try { window.tmTrack && window.tmTrack('trial_dropped', {}); } catch (e) { /* تجاهل */ }
        ErrorHandler.showSuccess(`اتحذف ${first}`);
        if (typeof o.onDone === 'function') o.onDone('deleted');
        return true;
    } catch (error) {
        ErrorHandler.showError(ErrorHandler.getErrorMessage(error));
        return false;
    }
}

// ------------------------------------------------------------------ 📅 غيّر ميعاد التجربة
export function openRescheduleTrial(student, o = {}) {
    if (!student || !student.id) return;
    const first = String(student.name || 'الطالب').trim().split(/\s+/)[0];
    const td = trialDate(student);
    const def = td && td.getTime() > Date.now() ? { date: `${td.getFullYear()}-${pad(td.getMonth() + 1)}-${pad(td.getDate())}`, time: `${pad(td.getHours())}:${pad(td.getMinutes())}` } : defaultTrialSlot();
    const m = makeModal(`
        <h2 class="tr-title">📅 ميعاد الحصة التجريبية مع ${esc(first)}</h2>
        <p class="tr-sub">الحصة هتظهر في حصص اليوم ده وفي الجدول، وهيوصلك تذكير قبلها.</p>
        <div class="tr-sec"><div class="tr-row">
            <div class="tr-field"><label for="tr-rdate">اليوم</label><input type="date" id="tr-rdate" value="${def.date}"></div>
            <div class="tr-field"><label for="tr-rtime">الساعة</label><input type="time" id="tr-rtime" value="${def.time}"></div>
        </div>
        <div class="tr-field" style="margin-top:.6rem"><label for="tr-rdur">المدة</label><select id="tr-rdur">${durOptions(student.trial_duration || 45)}</select></div></div>
        <p class="tr-err" id="tr-err"></p>
        <div class="tr-actions"><button type="button" class="btn" id="tr-save">احفظ الميعاد</button><button type="button" class="btn btn-outline" id="tr-cancel">رجوع</button></div>`, 'ميعاد الحصة التجريبية');
    m.$('#tr-cancel').addEventListener('click', m.close);
    m.$('#tr-save').addEventListener('click', async (e) => {
        const btn = e.currentTarget;
        const err = m.$('#tr-err');
        const date = m.$('#tr-rdate').value;
        const time = m.$('#tr-rtime').value;
        if (!date || !time) { err.textContent = 'اختار اليوم والساعة.'; err.style.display = 'block'; return; }
        const slot = localSlot(date, time);
        btn.disabled = true;
        btn.textContent = 'جاري الحفظ...';
        try {
            // الميعاد القديم (اللي مرة واحدة) يتشال، ونحجز الجديد
            try {
                const all = await api.getSchedules();
                const old = ((all && all.schedules) || []).filter((x) => String(x.student_id) === String(student.id) && x.recurrence_type === 'none');
                await Promise.allSettled(old.map((x) => api.deleteSchedule(x.id)));
            } catch (er) { /* لو مقدرناش نشيله هيفضل في الجدول وتقدر تمسحه بإيدك */ }
            await bookTrialSlot(student.id, slot, m.$('#tr-rdur').value);
            await api.updateStudentInfo(student.id, { trial_at: slot.iso });
            m.close();
            ErrorHandler.showSuccess(`اتحدد الميعاد: ${trialWhen({ trial_at: slot.iso })}`);
            if (typeof o.onDone === 'function') o.onDone('rescheduled', slot.iso);
        } catch (error) {
            err.textContent = ErrorHandler.getErrorMessage(error);
            err.style.display = 'block';
            btn.disabled = false;
            btn.textContent = 'احفظ الميعاد';
        }
    });
}

// ------------------------------------------------------------------ كارت القرار (ملف الطالب / بعد الحصة)
export function trialCardHtml(student, o = {}) {
    ensureCss();
    const st = trialState(student, o);
    const first = esc(String(student.name || 'الطالب').trim().split(/\s+/)[0]);
    const decide = st.phase === 'decide';
    return `<div class="tr-card" data-trial-card>
        <div class="tr-card-head">🎯 ${first} طالب تجريبي</div>
        <p>${esc(st.text)}${decide ? '' : '. بعد الحصة قرّر: يكمل معاك ولا لأ.'}</p>
        <div class="tr-btns">
            <button type="button" class="btn btn-sm" data-trial-convert>${icon('check', { size: 15 })} ${decide ? 'هيكمل — ضيفه لطلابي' : 'ضيفه لطلابي'}</button>
            <button type="button" class="btn btn-sm btn-outline" data-trial-resched>${icon('calendar', { size: 15 })} ${st.phase === 'nodate' ? 'حدد ميعاد التجربة' : 'غيّر الميعاد'}</button>
            <button type="button" class="btn btn-sm btn-ghost" data-trial-delete>${icon('trash', { size: 15 })} مكملش</button>
        </div></div>`;
}

/** ربط أزرار الكارت (كارت واحد أو قايمة) */
export function bindTrialActions(root, getStudent, onDone) {
    root.addEventListener('click', (e) => {
        const b = e.target.closest('[data-trial-convert], [data-trial-resched], [data-trial-delete]');
        if (!b) return;
        const st = getStudent(b);
        if (!st) return;
        if (b.hasAttribute('data-trial-convert')) openConvertTrial(st, { onDone });
        else if (b.hasAttribute('data-trial-resched')) openRescheduleTrial(st, { onDone });
        else openDeleteTrial(st, { onDone });
    });
}
