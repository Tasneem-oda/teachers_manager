/**
 * hw-builder.js — v33: "الواجب بالتفصيل" تحت خانة الواجب في الحصة
 * أزرار سريعة (حفظ / مراجعة / تلاوة / قراءة / كتابة / تمارين) + السورة أو الدرس + من/إلى ← سطر جاهز في الواجب.
 * الواجب بيفضل نص عادي (نفس الحقل)، فالتقرير والسجل بيشتغلوا زي ما هما.
 */
const TYPES = {
    quran: [['حفظ جديد', '📖'], ['مراجعة', '🔁'], ['تلاوة', '🎙️'], ['تسميع', '🗣️']],
    other: [['قراءة', '📖'], ['كتابة', '✍️'], ['حل تمارين', '📝'], ['مراجعة', '🔁']]
};
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function mountHomeworkBuilder(textarea, { subject = '' } = {}) {
    if (!textarea || textarea.dataset.hwb) return;
    textarea.dataset.hwb = '1';
    const isQuran = /quran|قرآن|قران/i.test(subject || '');
    const types = isQuran ? TYPES.quran : TYPES.other;
    const box = document.createElement('div');
    box.className = 'hwb';
    box.innerHTML = `
        <style>
            .hwb{margin-top:.45rem}.hwb-chips{display:flex;gap:.3rem;flex-wrap:wrap}
            .hwb-chip{border:1px dashed var(--border);background:var(--card-bg);border-radius:999px;padding:.25rem .65rem;font:inherit;font-size:.78rem;cursor:pointer;color:var(--text-secondary);min-height:32px}
            .hwb-chip.is-on{border-style:solid;border-color:var(--primary);color:var(--primary);background:#F5F0FA}
            .hwb-row{display:grid;grid-template-columns:2fr 1fr 1fr auto;gap:.35rem;margin-top:.4rem;align-items:center}
            .hwb-row input{min-height:38px;border:1px solid var(--border);border-radius:10px;padding:0 .5rem;font:inherit;font-size:.85rem;width:100%;box-sizing:border-box;background:#fff}
            .hwb-row button{min-height:38px;border:0;border-radius:10px;background:var(--primary);color:#fff;font:inherit;font-weight:700;padding:0 .8rem;cursor:pointer}
            @media (max-width:480px){.hwb-row{grid-template-columns:1fr 1fr}.hwb-row input:first-child{grid-column:1/-1}}
        </style>
        <div class="hwb-chips" role="group" aria-label="أضف للواجب بالتفصيل">${types.map(([t, em]) => `<button type="button" class="hwb-chip" data-t="${esc(t)}">${em} ${esc(t)}</button>`).join('')}</div>
        <div class="hwb-row" hidden>
            <input type="text" data-w="what" list="hwb-surahs" placeholder="${isQuran ? 'السورة (مثلًا: النبأ)' : 'الدرس / الكتاب'}" maxlength="60">
            <input type="text" data-w="from" inputmode="numeric" placeholder="${isQuran ? 'من آية' : 'من صفحة'}" maxlength="8">
            <input type="text" data-w="to" inputmode="numeric" placeholder="${isQuran ? 'لحد آية' : 'لحد صفحة'}" maxlength="8">
            <button type="button" data-w="add">أضف</button>
        </div>
        <datalist id="hwb-surahs"></datalist>`;
    textarea.insertAdjacentElement('afterend', box);
    let type = '';
    const row = box.querySelector('.hwb-row');
    const w = (k) => box.querySelector(`[data-w="${k}"]`);
    let surahsLoaded = false;
    const loadSurahs = () => {
        if (surahsLoaded || !isQuran) return; surahsLoaded = true;
        import('./games/quran.js?v=44').then((m) => m.surahList()).then((l) => {
            box.querySelector('#hwb-surahs').innerHTML = l.map((s) => `<option value="${esc(s.name)}">`).join('');
        }).catch(() => { surahsLoaded = false; });
    };
    box.querySelector('.hwb-chips').addEventListener('click', (e) => {
        const b = e.target.closest('[data-t]'); if (!b) return;
        type = type === b.dataset.t ? '' : b.dataset.t;
        box.querySelectorAll('[data-t]').forEach((x) => x.classList.toggle('is-on', x.dataset.t === type));
        row.hidden = !type;
        if (type) { loadSurahs(); w('what').focus(); }
    });
    const add = () => {
        const what = w('what').value.trim(), from = w('from').value.trim(), to = w('to').value.trim();
        if (!what && !from) { w('what').focus(); return; }
        const unit = isQuran ? 'آية' : 'صفحة';
        let line = `${type}: ${isQuran && what && !/^سورة/.test(what) ? `سورة ${what}` : what}`.trim();
        if (from && to && from !== to) line += ` من ${unit} ${from} لحد ${unit} ${to}`;
        else if (from) line += ` ${unit} ${from}`;
        const cur = textarea.value.replace(/\s+$/, '');
        textarea.value = (cur ? `${cur}\n` : '') + `• ${line}`;
        textarea.dispatchEvent(new Event('input', { bubbles: true }));   // بيتحفظ في المسودة تلقائيًا
        w('what').value = ''; w('from').value = ''; w('to').value = '';
        type = ''; row.hidden = true;
        box.querySelectorAll('[data-t]').forEach((x) => x.classList.remove('is-on'));
    };
    w('add').addEventListener('click', add);
    row.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } });
}
