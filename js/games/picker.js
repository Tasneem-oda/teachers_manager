/**
 * games/picker.js — v33: زرار "🎮 لعبة" جوه الحصة (حصة الطالب وحصة المجموعة)
 * بيتحمّل بس لما المدرس يدوس الزرار (مايأثرش على سرعة الحصة).
 */
import { setupGamesUi, ensureUiCss, modal, mountQuranBuilder, packsHtml, packGame, openGame, templateOf } from './ui.js?v=53';
import { gi } from './gicons.js?v=53';

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/**
 * @param {{api:object, toast:object, teams?:boolean, names?:string[], subject?:string}} o
 */
export function openGamePicker(o) {
    setupGamesUi({ api: o.api, toast: o.toast });
    ensureUiCss();
    const teams = !!o.teams;
    const names = (o.names || []).filter(Boolean);
    const play = (g) => {
        try { window.tmTrack && window.tmTrack('game_played', { template: g.template, where: teams ? 'group_lesson' : 'lesson' }); } catch (e) { /* تجاهل */ }
        openGame(g, { teams, onFinish: () => { if (g.id) o.api.hub('game_played', { id: g.id }).catch(() => {}); } });
    };
    const quranFirst = !o.subject || /quran|قرآن|قران/i.test(o.subject);
    const tabs = [['mine', `${gi('star', { tile: false, size: 16 })} ألعابي`], ['quran', `${gi('quran', { tile: false, size: 16 })} من القرآن`], ['packs', `${gi('gift', { tile: false, size: 16 })} جاهزة`], ['teachers', `${gi('globe', { tile: false, size: 16 })} ألعاب المدرسين`]];
    if (names.length >= 2) tabs.push(['wheel', `${gi('wheel', { tile: false, size: 16 })} عجلة الأسماء`]);
    const first = quranFirst ? 'quran' : 'packs';
    modal('لعبة في الحصة', `
        <nav class="lib2-tabs" style="margin-bottom:.8rem">${tabs.map(([id, l]) => `<button type="button" class="lib2-tab ${id === first ? 'is-on' : ''}" data-pt="${id}">${l}</button>`).join('')}</nav>
        <div data-pane="mine" ${first === 'mine' ? '' : 'hidden'}><div class="loading">جاري التحميل...</div></div>
        <div data-pane="quran" ${first === 'quran' ? '' : 'hidden'}></div>
        <div data-pane="packs" ${first === 'packs' ? '' : 'hidden'}></div>
        <div data-pane="teachers" hidden><div class="loading">جاري التحميل...</div></div>
        ${names.length >= 2 ? `<div data-pane="wheel" hidden><p class="gx-help">العجلة هتختار طالب عشوائي من المجموعة (${names.length} طالب).</p><div class="gx-actions"><button type="button" class="btn btn-primary" data-wheel>${gi('wheel', { tile: false, size: 16 })} افتح العجلة</button></div></div>` : ''}
        <p class="gx-help" style="margin-top:.8rem">ألعاب أكتر وتعمل لعبتك من <a href="games.html" target="_blank" rel="noopener">صفحة ألعاب الحصة</a>.</p>`, (m) => {
        const pane = (id) => m.querySelector(`[data-pane="${id}"]`);
        let loadedMine = false;
        let loadedPub = false;
        // v34: ألعاب عملها مدرسين تانيين ونشروها
        async function loadPub() {
            loadedPub = true;
            try {
                const list = (await o.api.hub('games_public_list', {})).games || [];
                pane('teachers').innerHTML = list.length ? `<div class="gx-cards">${list.map((g) => `<div class="gx-card"><div class="hd"><span class="em">${gi(templateOf(g.template).id, { size: 42 })}</span><div><b>${esc(g.title)}</b><br><small>${esc(templateOf(g.template).name)}${g.teacher_name ? ` · أ. ${esc(g.teacher_name)}` : ''}</small></div></div><div class="ac"><button type="button" class="btn btn-primary" data-pub="${g.id}">${gi('play', { tile: false, size: 15 })} العب</button></div></div>`).join('')}</div>`
                    : '<div class="lib2-empty">لسه مفيش ألعاب منشورة من المدرسين.</div>';
                pane('teachers').addEventListener('click', (e) => {
                    const b = e.target.closest('[data-pub]'); if (!b) return;
                    const g = list.find((x) => x.id === b.dataset.pub); if (!g) return;
                    openGame({ title: g.title, template: g.template, subject: g.subject, content: g.content }, { teams, onFinish: () => { o.api.hub('game_public_played', { public_id: g.id }).catch(() => {}); } });
                });
            } catch (err) { pane('teachers').innerHTML = '<div class="lib2-empty">ألعاب المدرسين مش متاحة دلوقتي.</div>'; }
        }
        const show = (id) => {
            m.querySelectorAll('[data-pt]').forEach((b) => b.classList.toggle('is-on', b.dataset.pt === id));
            m.querySelectorAll('[data-pane]').forEach((p) => { p.hidden = p.dataset.pane !== id; });
            if (id === 'mine' && !loadedMine) loadMine();
            if (id === 'teachers' && !loadedPub) loadPub();
        };
        m.querySelectorAll('[data-pt]').forEach((b) => b.addEventListener('click', () => show(b.dataset.pt)));
        mountQuranBuilder(pane('quran'), { onPlay: play });
        let cat = '';
        const renderPacks = () => { pane('packs').innerHTML = packsHtml(cat).replace(/<button type="button" class="btn btn-ghost" data-pack-copy="[^"]+"[^>]*>[^<]*<\/button>/g, ''); };
        renderPacks();
        pane('packs').addEventListener('click', (e) => {
            const c = e.target.closest('[data-pcat]'); if (c) { cat = c.dataset.pcat; renderPacks(); return; }
            const p = e.target.closest('[data-pack-play]'); if (p) play(packGame(p.dataset.packPlay));
        });
        async function loadMine() {
            loadedMine = true;
            try {
                const games = (await o.api.hub('games_list')).games || [];
                pane('mine').innerHTML = games.length ? `<div class="gx-cards">${games.map((g) => `<div class="gx-card"><div class="hd"><span class="em">${gi(templateOf(g.template).id, { size: 42 })}</span><div><b>${esc(g.title)}</b><br><small>${esc(templateOf(g.template).name)}</small></div></div><div class="ac"><button type="button" class="btn btn-primary" data-my="${g.id}">${gi('play', { tile: false, size: 15 })} العب</button></div></div>`).join('')}</div>`
                    : '<div class="lib2-empty">لسه مفيش ألعاب محفوظة. جرّب "من القرآن" أو "جاهزة".</div>';
                pane('mine').addEventListener('click', (e) => { const b = e.target.closest('[data-my]'); if (b) play(games.find((g) => g.id === b.dataset.my)); });
            } catch (err) { pane('mine').innerHTML = '<div class="lib2-empty">ألعابك المحفوظة مش متاحة دلوقتي.</div>'; }
        }
        const wb = m.querySelector('[data-wheel]');
        if (wb) wb.addEventListener('click', () => play({ title: 'مين عليه الدور؟', template: 'wheel', content: { items: names } }));
        if (first === 'mine') loadMine();
    });
}
