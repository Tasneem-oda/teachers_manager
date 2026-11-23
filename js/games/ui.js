/**
 * games/ui.js — v33: واجهة ألعاب الحصة المشتركة (صفحة الألعاب + زرار "لعبة" جوه الحصة)
 *   - صانع ألعاب القرآن (سورة + آيات + نوع اللعبة)
 *   - الألعاب الجاهزة
 *   - محرّر الألعاب (المدرس يعمل لعبته) + مشاركة لينك مع الطالب
 */
import { TEMPLATES, templateOf, openGame, gi } from './engine.js?v=55';
import { PACKS, packGame } from './packs.js?v=55';
import { surahList, surahAyahs, QURAN_GAMES, buildQuranGame } from './quran.js?v=55';

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let api = null;
let toast = { ok: (m) => alert(m), err: (m) => alert(m) };
export function setupGamesUi(o) { api = o.api; if (o.toast) toast = o.toast; }

let cssDone = false;
export function ensureUiCss() {
    if (cssDone) return; cssDone = true;
    const s = document.createElement('style');
    s.textContent = `
.gx-tiles{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:.6rem}
.gx-tile{display:flex;flex-direction:column;align-items:flex-start;gap:.2rem;padding:.75rem .8rem;border:1.5px solid var(--border);border-radius:14px;background:var(--card-bg);font:inherit;text-align:start;cursor:pointer;color:var(--text-primary);min-height:84px}
.gx-tile:hover{border-color:var(--primary)}.gx-tile.is-on{border-color:var(--primary);background:#F5F0FA;box-shadow:0 0 0 2px var(--primary) inset}
.gx-tile .em{display:inline-flex;margin-bottom:.15rem}.gx-tile .em svg{display:block}.gx-tile b{font-size:.9rem}.gx-tile small{font-size:.74rem;color:var(--text-secondary);line-height:1.5}
.gx-row{display:flex;gap:.6rem;flex-wrap:wrap;align-items:end}
.gx-row .form-group{margin:0;flex:1 1 140px}
.gx-row select,.gx-row input{width:100%}
.gx-actions{display:flex;gap:.5rem;flex-wrap:wrap;margin-top:.9rem}
.gx-actions .btn{margin:0;display:inline-flex;align-items:center;gap:.35rem;min-height:44px}
.gx-cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:.7rem}
.gx-card{display:flex;flex-direction:column;gap:.35rem;padding:.8rem;border:1px solid var(--border);border-radius:16px;background:var(--card-bg)}
.gx-card .hd{display:flex;align-items:center;gap:.5rem}.gx-card .em{width:42px;height:42px;display:inline-flex;flex-shrink:0}.gx-card .em svg{display:block;filter:drop-shadow(0 3px 6px rgba(41,37,45,.15))}
.gx-help-ic{display:flex;align-items:center;gap:.6rem}.gx-help-ic svg{flex-shrink:0}
.gx-card .ac .btn,.gx-actions .btn{display:inline-flex;align-items:center;justify-content:center;gap:.3rem}
.gx-card b{font-size:.92rem;line-height:1.5}.gx-card small{color:var(--text-secondary);font-size:.74rem}
.gx-card .ac{display:flex;gap:.35rem;margin-top:auto;padding-top:.3rem;flex-wrap:wrap}.gx-card .ac .btn{margin:0;min-height:38px;padding:0 .7rem;font-size:.8rem;flex:1}
.gx-card .ac .btn.icon{flex:0 0 38px;padding:0}
.gx-sec{margin-bottom:1.2rem}.gx-sec>h3{display:flex;align-items:center;gap:.4rem;margin:0 0 .7rem;font-size:1.05rem}
.gx-chips{display:flex;gap:.35rem;flex-wrap:wrap;margin-bottom:.7rem}
.gx-ed-rows{display:flex;flex-direction:column;gap:.5rem;margin:.6rem 0}
.gx-ed-row{display:grid;grid-template-columns:1fr 1fr auto;gap:.4rem;align-items:center}
.gx-ed-row.q{grid-template-columns:1fr auto}
.gx-ed-row input,.gx-ed-row textarea{width:100%;min-height:40px;border:1px solid var(--border);border-radius:10px;padding:.35rem .55rem;font:inherit;background:#fff}
.gx-ed-q{border:1px solid var(--border);border-radius:12px;padding:.6rem;display:flex;flex-direction:column;gap:.35rem;background:var(--bg-secondary)}
.gx-ed-q .opt{display:flex;gap:.35rem;align-items:center}.gx-ed-q .opt input[type=text]{flex:1}
.gx-x{border:0;background:transparent;color:var(--text-light);cursor:pointer;font-size:1.1rem;width:34px;height:34px;border-radius:8px}.gx-x:hover{background:#FDECEC;color:#B3261E}
.gx-help{font-size:.78rem;color:var(--text-secondary);line-height:1.7;margin:.2rem 0}
.gx-modal .modal-content{max-width:640px}
.gx-share{display:flex;gap:.4rem;align-items:center;background:var(--bg-secondary);border-radius:10px;padding:.4rem .5rem;margin-top:.6rem}
.gx-share input{flex:1;border:0;background:transparent;font:inherit;direction:ltr;font-size:.8rem}`;
    document.head.appendChild(s);
}

// ------------------------------------------------------------------ نافذة بسيطة
export function modal(title, inner, onMount) {
    const m = document.createElement('div');
    m.className = 'modal active gx-modal';
    m.innerHTML = `<div class="modal-content" role="dialog" aria-modal="true" aria-label="${esc(title)}"><span class="close-modal" role="button" tabindex="0" aria-label="إغلاق">&times;</span><h2 style="margin-top:0">${esc(title)}</h2>${inner}</div>`;
    const close = () => { m.remove(); document.removeEventListener('keydown', onKey); };
    const onKey = (e) => { if (e.key === 'Escape' && !document.querySelector('.gm')) close(); };
    m.querySelector('.close-modal').addEventListener('click', close);
    m.addEventListener('mousedown', (e) => { if (e.target === m) close(); });
    document.addEventListener('keydown', onKey);
    document.body.appendChild(m);
    if (onMount) onMount(m, close);
    return { m, close };
}

// ------------------------------------------------------------------ صانع ألعاب القرآن
const QPREF = 'tm_q_pref_v1';
export function mountQuranBuilder(box, { onPlay, onSave }) {
    ensureUiCss();
    let pref = {}; try { pref = JSON.parse(localStorage.getItem(QPREF) || '{}') || {}; } catch (e) { pref = {}; }
    let kind = pref.kind || 'complete';
    box.innerHTML = `
        <div class="gx-row">
            <div class="form-group"><label>السورة</label><select data-q="surah"><option>جاري التحميل...</option></select></div>
            <div class="form-group" style="flex:0 1 110px"><label>من آية</label><input type="number" min="1" data-q="from" value="1" inputmode="numeric"></div>
            <div class="form-group" style="flex:0 1 110px"><label>لحد آية</label><input type="number" min="1" data-q="to" value="7" inputmode="numeric"></div>
            <div class="form-group" style="flex:0 1 130px" data-q="levelbox"><label>الصعوبة</label><select data-q="level"><option value="easy">سهل</option><option value="medium" selected>متوسط</option><option value="hard">صعب</option></select></div>
        </div>
        <p class="gx-help" data-q="msg"></p>
        <div class="gx-tiles" data-q="kinds" style="margin-top:.6rem">${QURAN_GAMES.map((g) => `<button type="button" class="gx-tile ${g.id === kind ? 'is-on' : ''}" data-k="${g.id}"><span class="em">${gi(g.id, { size: 40 })}</span><b>${g.name}</b><small>${g.desc}</small></button>`).join('')}</div>
        <div class="gx-actions"><button type="button" class="btn btn-primary" data-q="play">${gi('play', { tile: false, size: 16 })} العب دلوقتي</button>${onSave ? '<button type="button" class="btn btn-outline" data-q="save">احفظها في ألعابي</button>' : ''}</div>`;
    const q = (k) => box.querySelector(`[data-q="${k}"]`);
    let list = [];
    const msg = (t, bad) => { q('msg').textContent = t || ''; q('msg').style.color = bad ? 'var(--danger,#B3261E)' : ''; };
    const syncKind = () => {
        box.querySelectorAll('[data-k]').forEach((b) => b.classList.toggle('is-on', b.dataset.k === kind));
        q('levelbox').hidden = kind !== 'complete';
        const s = list.find((x) => String(x.n) === q('surah').value);
        if (kind === 'surahs') { q('from').max = 114; q('to').max = 114; msg('اختار مدى السور بأرقامها (مثلًا جزء عمّ: من 78 لحد 114)'); }
        else if (s) { q('from').max = s.ayahs; q('to').max = s.ayahs; msg(`سورة ${s.name}: ${s.ayahs} آية`); }
    };
    surahList().then((l) => {
        list = l;
        q('surah').innerHTML = l.map((s) => `<option value="${s.n}">${s.n}. ${esc(s.name)}</option>`).join('');
        q('surah').value = String(pref.surah || 1);
        if (pref.from) q('from').value = pref.from;
        if (pref.to) q('to').value = pref.to;
        syncKind();
    }).catch(() => { q('surah').innerHTML = '<option value="">مفيش نت؟</option>'; msg('مقدرناش نجيب قايمة السور. اتأكد من النت وجرّب تاني.', true); });
    q('surah').addEventListener('change', () => {
        const s = list.find((x) => String(x.n) === q('surah').value);
        if (s) { q('from').value = 1; q('to').value = Math.min(s.ayahs, kind === 'ayahs' ? 10 : 7); }
        syncKind();
    });
    box.querySelector('[data-q="kinds"]').addEventListener('click', (e) => {
        const b = e.target.closest('[data-k]'); if (!b) return;
        kind = b.dataset.k;
        if (kind === 'surahs') { q('from').value = 78; q('to').value = 114; }
        syncKind();
    });
    async function build() {
        const n = Number(q('surah').value);
        let from = Math.max(1, parseInt(q('from').value, 10) || 1);
        let to = Math.max(from, parseInt(q('to').value, 10) || from);
        if (kind === 'surahs') {
            from = Math.min(from, 114); to = Math.min(to, 114);
            if (to - from < 1) { msg('اختار سورتين على الأقل', true); return null; }
            return buildQuranGame('surahs', { from, to, list });
        }
        const s = list.find((x) => x.n === n);
        if (!s) { msg('اختار السورة', true); return null; }
        to = Math.min(to, s.ayahs); from = Math.min(from, to);
        if (to - from > 60) { to = from + 60; q('to').value = to; }
        msg('جاري تجهيز الآيات...');
        let ayahs;
        try { ayahs = await surahAyahs(n); } catch (e) { msg('مقدرناش نجيب الآيات. اتأكد من النت (أول مرة بس، وبعدها بتتحفظ).', true); return null; }
        const g = buildQuranGame(kind, { surah: s, from, to, ayahs, level: q('level').value });
        if (!g) { msg('الآيات دي مش كفاية للعبة دي. اختار آيات أكتر أو لعبة تانية.', true); return null; }
        msg('');
        try { localStorage.setItem(QPREF, JSON.stringify({ surah: n, from, to, kind })); } catch (e) { /* تجاهل */ }
        return g;
    }
    q('play').addEventListener('click', async (e) => { const b = e.currentTarget; b.disabled = true; try { const g = await build(); if (g) onPlay(g); } finally { b.disabled = false; } });
    if (onSave) q('save').addEventListener('click', async (e) => { const b = e.currentTarget; b.disabled = true; try { const g = await build(); if (g) await onSave(g); } finally { b.disabled = false; } });
}

// ------------------------------------------------------------------ الألعاب الجاهزة
export function packsHtml(filterCat = '') {
    ensureUiCss();
    const cats = [...new Set(PACKS.map((p) => p.cat))];
    return `<div class="gx-chips" data-pack-cats>${['', ...cats].map((c) => `<button type="button" class="lib2-chip ${c === filterCat ? 'is-on' : ''}" data-pcat="${esc(c)}">${c || 'الكل'}</button>`).join('')}</div>
        <div class="gx-cards">${PACKS.filter((p) => !filterCat || p.cat === filterCat).map((p) => {
            const t = templateOf(p.template);
            return `<div class="gx-card"><div class="hd"><span class="em">${gi(t.id, { size: 42 })}</span><div><b>${esc(p.title)}</b><br><small>${esc(p.cat)} · ${esc(t.name)}</small></div></div>
                <div class="ac"><button type="button" class="btn btn-primary" data-pack-play="${p.id}">${gi('play', { tile: false, size: 15 })} العب</button><button type="button" class="btn btn-ghost" data-pack-copy="${p.id}" title="انسخها لألعابي وعدّل فيها">${gi('edit', { tile: false, size: 15 })} انسخ وعدّل</button></div></div>`;
        }).join('')}</div>`;
}
export { packGame };

// ------------------------------------------------------------------ المحرّر
function lines(v) { return String(v || '').split('\n').map((x) => x.trim()).filter(Boolean); }

/**
 * @param {object|null} game لعبة موجودة (أو null)
 * @param {string} template لو لعبة جديدة
 * @param {(saved:object)=>void} onSaved
 */
export function openEditor(game, template, onSaved) {
    ensureUiCss();
    const g = game ? JSON.parse(JSON.stringify(game)) : { title: '', template, subject: '', content: {} };
    const t = templateOf(g.template);
    const C = g.content || {};
    const help = {
        quiz: 'اكتب السؤال والاختيارات، واختار الإجابة الصح بالدايرة.',
        truefalse: 'اكتب الجملة واختار هي صح ولا غلط.',
        match: 'كل سطر: الكلمة واللي يناسبها (زي: كتاب ↔ كتب).',
        memory: 'كل سطر: كارتين بيكمّلوا بعض (زي: كبير ↔ صغير).',
        flash: 'كل سطر: وش الكارت (السؤال) وضهره (الإجابة).',
        order: 'اكتب العناصر بالترتيب الصح (كل واحد في سطر). اللعبة هتلخبطهم لوحدها. ولو عايز أكتر من جولة سيب سطر فاضي بين كل جولة.',
        sort: 'اكتب اسم كل مجموعة والكلمات اللي تحتها (كل كلمة في سطر).',
        fill: 'اكتب النص وحط الكلمة اللي عايزها تختفي بين قوسين [ ] — ولو ماحطّيتش أقواس اللعبة هتخفي كلمات لوحدها.',
        letters: 'اكتب الكلمات (كل كلمة في سطر) والطالب يكوّنها من حروفها.',
        wheel: 'اكتب أسماء الطلاب أو الأسئلة (كل واحد في سطر).'
    }[t.id];
    const pairRows = (pairs) => (pairs && pairs.length ? pairs : [['', ''], ['', ''], ['', '']]).map((p) => `<div class="gx-ed-row" data-pair><input type="text" value="${esc(p[0])}" maxlength="200" aria-label="الأول"><input type="text" value="${esc(p[1])}" maxlength="300" aria-label="التاني"><button type="button" class="gx-x" data-del aria-label="مسح">✕</button></div>`).join('');
    const qBlock = (q, nm = `r${Math.random().toString(36).slice(2, 9)}`) => `<div class="gx-ed-q" data-q><div class="opt"><input type="text" data-qq value="${esc(q.q || '')}" placeholder="السؤال" maxlength="300"><button type="button" class="gx-x" data-del aria-label="مسح السؤال">✕</button></div>
        ${[0, 1, 2, 3].map((k) => `<div class="opt"><input type="radio" name="${nm}" data-ans ${Number(q.answer || 0) === k ? 'checked' : ''} aria-label="الإجابة الصح"><input type="text" data-o value="${esc((q.options || [])[k] || '')}" placeholder="${k < 2 ? 'اختيار' : 'اختيار (اختياري)'}" maxlength="200"></div>`).join('')}</div>`;
    const tfRow = (x) => `<div class="gx-ed-row q" data-tf><input type="text" value="${esc(x.q || '')}" placeholder="الجملة" maxlength="300"><select aria-label="صح ولا غلط"><option value="1" ${x.a !== false ? 'selected' : ''}>✔ صح</option><option value="0" ${x.a === false ? 'selected' : ''}>✘ غلط</option></select></div>`;
    const sortGroup = (gr) => `<div class="gx-ed-q" data-grp><div class="opt"><input type="text" data-gn value="${esc(gr.name || '')}" placeholder="اسم المجموعة (زي: اسم)" maxlength="60"><button type="button" class="gx-x" data-del aria-label="مسح المجموعة">✕</button></div><textarea data-gi rows="3" placeholder="الكلمات (كل كلمة في سطر)">${esc((gr.items || []).join('\n'))}</textarea></div>`;
    let body = '';
    if (t.id === 'quiz') body = `<div class="gx-ed-rows" data-list>${(C.questions && C.questions.length ? C.questions : [{}, {}]).map((q) => qBlock(q)).join('')}</div><button type="button" class="btn btn-sm btn-outline" data-add>+ سؤال</button>
        <div class="form-group" style="margin-top:.6rem"><label>وقت لكل سؤال</label><select data-timer><option value="0">من غير وقت</option>${[10, 15, 20, 30, 45, 60].map((s) => `<option value="${s}" ${Number(C.timer) === s ? 'selected' : ''}>${s} ثانية</option>`).join('')}</select></div>`;
    else if (t.id === 'truefalse') body = `<div class="gx-ed-rows" data-list>${(C.items && C.items.length ? C.items : [{}, {}, {}]).map(tfRow).join('')}</div><button type="button" class="btn btn-sm btn-outline" data-add>+ جملة</button>`;
    else if (['match', 'memory', 'flash'].includes(t.id)) body = `<div class="gx-ed-rows" data-list>${pairRows(t.id === 'flash' ? C.cards : C.pairs)}</div><button type="button" class="btn btn-sm btn-outline" data-add>+ سطر</button>`;
    else if (t.id === 'order') body = `<div class="form-group"><label>التعليمات</label><input type="text" data-prompt value="${esc((C.rounds && C.rounds[0] && C.rounds[0].prompt) || C.prompt || 'رتّب بالترتيب الصح')}" maxlength="120"></div>
        <textarea data-text rows="8" placeholder="العنصر الأول&#10;العنصر التاني&#10;...">${esc((C.rounds || [{ items: C.items || [] }]).map((r) => (r.items || []).join('\n')).join('\n\n'))}</textarea>
        <button type="button" class="btn btn-sm btn-ghost" data-split style="margin-top:.4rem">✂ قسّم جملة لكلمات</button>`;
    else if (t.id === 'sort') body = `<div class="gx-ed-rows" data-list>${(C.groups && C.groups.length ? C.groups : [{}, {}]).map(sortGroup).join('')}</div><button type="button" class="btn btn-sm btn-outline" data-add>+ مجموعة</button>`;
    else if (t.id === 'fill') body = `<textarea data-text rows="7" placeholder="مثلًا: [الحمد] لله رب [العالمين]">${esc(C.text || '')}</textarea>
        <div class="gx-row" style="margin-top:.5rem"><div class="form-group"><label>طريقة اللعب</label><select data-mode><option value="choose" ${C.mode !== 'reveal' ? 'selected' : ''}>يختار من الكلمات</option><option value="reveal" ${C.mode === 'reveal' ? 'selected' : ''}>يقول الكلمة وانت تظهرها</option></select></div>
        <div class="form-group"><label>لو مفيش أقواس: الصعوبة</label><select data-level><option value="easy">سهل</option><option value="medium" selected>متوسط</option><option value="hard">صعب</option></select></div></div>
        <label class="ls-check" style="margin-top:.4rem"><input type="checkbox" data-quran ${C.quran ? 'checked' : ''}> النص آيات قرآن (خط المصحف)</label>`;
    else body = `<textarea data-text rows="8" placeholder="كل واحد في سطر">${esc((t.id === 'letters' ? C.words : C.items || []).join('\n'))}</textarea>`;

    modal(game ? 'تعديل اللعبة' : `لعبة جديدة: ${t.name}`, `
        <p class="gx-help gx-help-ic">${gi(t.id, { size: 30 })}<span>${esc(help)}</span></p>
        <div class="form-group"><label>اسم اللعبة</label><input type="text" data-title value="${esc(g.title)}" maxlength="120" placeholder="مثلًا: مراجعة سورة النبأ"></div>
        ${body}
        <div class="gx-actions"><button type="button" class="btn btn-outline" data-try>${gi('play', { tile: false, size: 15 })} جرّبها</button><button type="button" class="btn btn-primary" data-save>احفظ</button></div>`, (m, close) => {
        const list = m.querySelector('[data-list]');
        m.addEventListener('click', (e) => { const d = e.target.closest('[data-del]'); if (d) { const row = d.closest('[data-pair],[data-q],[data-grp],[data-tf]'); if (row && list.children.length > 1) row.remove(); } });
        const add = m.querySelector('[data-add]');
        if (add) add.addEventListener('click', () => {
            const tpl = t.id === 'quiz' ? qBlock({}) : t.id === 'truefalse' ? tfRow({}) : t.id === 'sort' ? sortGroup({}) : pairRows([['', '']]);
            list.insertAdjacentHTML('beforeend', tpl);
            const inp = list.lastElementChild.querySelector('input,textarea'); if (inp) inp.focus();
        });
        const split = m.querySelector('[data-split]');
        if (split) split.addEventListener('click', () => { const ta = m.querySelector('[data-text]'); ta.value = ta.value.split(/\s+/).filter(Boolean).join('\n'); });
        const collect = () => {
            const title = m.querySelector('[data-title]').value.trim() || t.name;
            let content = {};
            if (t.id === 'quiz') {
                content.questions = [...m.querySelectorAll('[data-q]')].map((b) => {
                    const opts = [...b.querySelectorAll('.opt')].slice(1).map((o) => ({ v: o.querySelector('[data-o]').value.trim(), ans: o.querySelector('[data-ans]').checked }));
                    const valid = opts.filter((o) => o.v);
                    const ansIdx = Math.max(0, valid.findIndex((o) => o.ans));
                    return { q: b.querySelector('[data-qq]').value.trim(), options: valid.map((o) => o.v), answer: ansIdx };
                }).filter((q) => q.q && q.options.length >= 2);
                content.timer = Number(m.querySelector('[data-timer]').value) || 0;
            } else if (t.id === 'truefalse') {
                content.items = [...m.querySelectorAll('[data-tf]')].map((r) => ({ q: r.querySelector('input').value.trim(), a: r.querySelector('select').value === '1' })).filter((x) => x.q);
            } else if (['match', 'memory', 'flash'].includes(t.id)) {
                const pairs = [...m.querySelectorAll('[data-pair]')].map((r) => [...r.querySelectorAll('input')].map((i) => i.value.trim())).filter((p) => p[0] && (p[1] || t.id === 'flash'));
                if (t.id === 'flash') content.cards = pairs; else content.pairs = pairs;
            } else if (t.id === 'order') {
                const prompt = m.querySelector('[data-prompt]').value.trim();
                content.rounds = m.querySelector('[data-text]').value.split(/\n\s*\n/).map((blk) => ({ prompt, items: lines(blk) })).filter((r) => r.items.length >= 2);
            } else if (t.id === 'sort') {
                content.groups = [...m.querySelectorAll('[data-grp]')].map((b) => ({ name: b.querySelector('[data-gn]').value.trim(), items: lines(b.querySelector('[data-gi]').value) })).filter((x) => x.name && x.items.length);
            } else if (t.id === 'fill') {
                content = { text: m.querySelector('[data-text]').value.trim(), mode: m.querySelector('[data-mode]').value, level: m.querySelector('[data-level]').value, quran: m.querySelector('[data-quran]').checked };
            } else if (t.id === 'letters') content.words = lines(m.querySelector('[data-text]').value);
            else content.items = lines(m.querySelector('[data-text]').value);
            return { ...g, title, content, subject: content.quran ? 'quran' : (g.subject || '') };
        };
        m.querySelector('[data-try]').addEventListener('click', () => openGame(collect()));
        m.querySelector('[data-save]').addEventListener('click', async (e) => {
            const b = e.currentTarget; const out = collect();
            b.disabled = true;
            try {
                const r = await api.hub('game_save', { id: out.id || undefined, title: out.title, template: out.template, subject: out.subject, content: out.content });
                close(); toast.ok('اتحفظت في ألعابك ✓');
                if (onSaved) onSaved(r.game);
            } catch (err) { b.disabled = false; toast.err(err); }
        });
    });
}

/** لينك الطالب (يلعب من موبايله من غير تسجيل) */
export async function shareGame(game) {
    ensureUiCss();
    try {
        const r = await api.hub('game_share', { id: game.id });
        game.share_code = r.share_code;
        const url = `${location.origin}/play.html?g=${r.share_code}`;
        const wa = `https://wa.me/?text=${encodeURIComponent(`لعبة "${game.title}"\nالعب من هنا: ${url}`)}`;
        modal('شارك اللعبة مع الطالب', `<p class="gx-help">الطالب يفتح اللينك ويلعب من موبايله على طول (من غير تسجيل). ينفع واجب بعد الحصة كمان.</p>
            <div class="gx-share"><input type="text" readonly value="${esc(url)}" aria-label="لينك اللعبة"><button type="button" class="btn btn-sm" data-copy>نسخ</button></div>
            <div class="gx-actions"><a class="btn btn-primary" href="${wa}" target="_blank" rel="noopener">ابعته واتساب</a></div>`, (m) => {
            m.querySelector('[data-copy]').addEventListener('click', async () => { try { await navigator.clipboard.writeText(url); } catch (e) { m.querySelector('input').select(); document.execCommand('copy'); } toast.ok('اتنسخ ✓'); });
        });
    } catch (err) { toast.err(err); }
}

export { TEMPLATES, templateOf, openGame, PACKS };
