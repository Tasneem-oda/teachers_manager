/**
 * form-widgets.js - عناصر نماذج مشتركة
 *
 * 1) اختيار الوقت بنظام 12 ساعة (ساعة / دقيقة / صباحًا-مساءً)
 *    خانة <input type="time"> الأصلية بتظهر 24 ساعة على أغلب موبايلات أندرويد بالعربي،
 *    فبنخفيها ونحط مكانها 3 قوايم. القيمة الحقيقية بتفضل في نفس الخانة بصيغة HH:MM
 *    (زي ما الخادم مستنيها بالظبط) - فمفيش أي تغيير في n8n أو قاعدة البيانات.
 *
 * 2) اختيار الأيام (زرار لكل يوم) - يسمح باختيار أكتر من يوم في نفس المرة.
 */

const DAY_NAMES = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const pad = (n) => String(n).padStart(2, '0');

let stylesInjected = false;
function injectStyles() {
    if (stylesInjected) return;
    stylesInjected = true;
    const css = document.createElement('style');
    css.textContent = `
        .tp12 { display: flex; gap: 0.5rem; align-items: center; direction: rtl; }
        .tp12 select { flex: 1; min-width: 0; padding: 0.7rem 0.5rem; border: 1px solid var(--border, #E7E1E8); border-radius: 8px; font: inherit; font-size: 1rem; background: var(--card-bg, #fff); color: var(--text-primary, #29252D); }
        .tp12 .tp12-sep { font-weight: 700; color: var(--text-secondary, #716A74); }
        .day-chips { display: flex; flex-wrap: wrap; gap: 0.4rem; }
        .day-chips button { border: 1px solid var(--border, #E7E1E8); background: var(--card-bg, #fff); color: var(--text-primary, #29252D); border-radius: 999px; padding: 0.5rem 0.85rem; font: inherit; font-size: 0.9rem; cursor: pointer; min-height: 40px; }
        .day-chips button[aria-pressed="true"] { background: var(--primary, #4B3A5A); border-color: var(--primary, #4B3A5A); color: #fff; font-weight: 600; }
        .day-chips-hint { display: block; font-size: 0.8rem; color: var(--text-secondary, #716A74); margin-top: 0.4rem; }
    `;
    document.head.appendChild(css);
}

/** "16:30" ← {hour:4, minute:30, period:'pm'} */
export function to24(hour12, minute, period) {
    let h = parseInt(hour12, 10) % 12;
    if (period === 'pm') h += 12;
    return `${pad(h)}:${pad(parseInt(minute, 10) || 0)}`;
}

/** {hour, minute, period} ← "16:30" */
export function from24(value) {
    const [hh, mm] = String(value || '').split(':').map((x) => parseInt(x, 10));
    const h = Number.isFinite(hh) ? hh : 16;
    const m = Number.isFinite(mm) ? mm : 0;
    return { hour: (h % 12) || 12, minute: m, period: h >= 12 ? 'pm' : 'am' };
}

/**
 * يحوّل خانة وقت عادية لاختيار 12 ساعة.
 * بعد كده أي كود يغيّر input.value لازم ينادي refreshTimePicker(input) عشان القوايم تتحدث.
 */
export function mountTimePicker(input) {
    if (!input || input._tp12) return;
    injectStyles();
    input.type = 'hidden';
    const wrap = document.createElement('div');
    wrap.className = 'tp12';
    const hourOpts = Array.from({ length: 12 }, (_, i) => i + 1).map((h) => `<option value="${h}">${h}</option>`).join('');
    const minOpts = Array.from({ length: 12 }, (_, i) => i * 5).map((m) => `<option value="${m}">${pad(m)}</option>`).join('');
    wrap.innerHTML = `
        <select aria-label="الساعة" data-tp="hour">${hourOpts}</select>
        <span class="tp12-sep">:</span>
        <select aria-label="الدقيقة" data-tp="minute">${minOpts}</select>
        <select aria-label="صباحًا أو مساءً" data-tp="period">
            <option value="am">صباحًا</option>
            <option value="pm">مساءً</option>
        </select>`;
    input.insertAdjacentElement('afterend', wrap);
    const get = (k) => wrap.querySelector(`[data-tp="${k}"]`);
    const sync = () => {
        input.value = to24(get('hour').value, get('minute').value, get('period').value);
        input.dispatchEvent(new Event('change', { bubbles: true }));
    };
    wrap.addEventListener('change', (e) => { if (e.target.matches('select')) sync(); });
    input._tp12 = { wrap, get };
    refreshTimePicker(input);
}

/** يحدّث القوايم من قيمة الخانة الحالية (HH:MM) */
export function refreshTimePicker(input) {
    if (!input || !input._tp12) return;
    const { hour, minute, period } = from24(input.value || '16:00');
    const { get } = input._tp12;
    const minSel = get('minute');
    // لو الدقيقة مش من مضاعفات 5 (موعد قديم مثلًا 4:07) نضيفها عشان مانغيرش الموعد بالغلط
    if (![...minSel.options].some((o) => Number(o.value) === minute)) {
        minSel.add(new Option(pad(minute), String(minute)));
    }
    get('hour').value = String(hour);
    minSel.value = String(minute);
    get('period').value = period;
    input.value = to24(hour, minute, period);
}

/**
 * زراير الأيام. multi=true يسمح بأكتر من يوم، false يوم واحد بس (وقت التعديل).
 * بيرجّع { get(): number[], set(days:number[]), setMulti(bool) }
 */
export function mountDayChips(container, { multi = true, onChange } = {}) {
    injectStyles();
    let isMulti = multi;
    container.classList.add('day-chips');
    container.setAttribute('role', 'group');
    container.innerHTML = DAY_NAMES.map((n, i) => `<button type="button" data-day="${i}" aria-pressed="false">${n}</button>`).join('');
    const buttons = [...container.querySelectorAll('button')];
    container.addEventListener('click', (e) => {
        const b = e.target.closest('button[data-day]');
        if (!b) return;
        const on = b.getAttribute('aria-pressed') !== 'true';
        if (!isMulti) buttons.forEach((x) => x.setAttribute('aria-pressed', 'false'));
        b.setAttribute('aria-pressed', isMulti ? String(on) : 'true');
        if (onChange) onChange(api.get());
    });
    const api = {
        get: () => buttons.filter((b) => b.getAttribute('aria-pressed') === 'true').map((b) => Number(b.dataset.day)),
        set: (days) => {
            const set = new Set((days || []).map(Number));
            buttons.forEach((b) => b.setAttribute('aria-pressed', String(set.has(Number(b.dataset.day)))));
        },
        setMulti: (v) => { isMulti = !!v; }
    };
    return api;
}

export { DAY_NAMES };
