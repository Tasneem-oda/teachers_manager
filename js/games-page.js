/**
 * games-page.js — v33: صفحة "ألعاب الحصة"
 */
import { Auth } from './auth.js?v=42';
import { renderSidebar, renderTopHeader } from './sidebar.js?v=42';
import { api } from './api.js?v=42';
import { ErrorHandler } from './utils.js?v=42';
import { setupGamesUi, ensureUiCss, mountQuranBuilder, packsHtml, packGame, openEditor, shareGame, openGame, TEMPLATES, templateOf, modal } from './games/ui.js?v=42';
import { gi } from './games/gicons.js?v=42';

// v34: أيقونات الصفحة نفسها (بدل الإيموجي)
document.querySelectorAll('[data-gi]').forEach((el) => { el.innerHTML = gi(el.dataset.gi, { tile: el.dataset.tile !== '0', size: Number(el.dataset.size) || 28 }); el.style.display = 'inline-flex'; el.style.verticalAlign = 'middle'; });

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function initGamesPage() {
    renderSidebar('games');
    renderTopHeader({ title: 'ألعاب الحصة', subtitle: 'ألعاب تفاعلية للقرآن واللغة العربية', showSearch: false });
    setupGamesUi({ api, toast: { ok: (m) => ErrorHandler.showSuccess(m), err: (e) => ErrorHandler.showError(typeof e === 'string' ? e : ErrorHandler.getErrorMessage(e)) } });
    ensureUiCss();

    let games = [];
    let hubOk = true;
    let packCat = '';
    const track = (n, p = {}) => { try { window.tmTrack && window.tmTrack(n, p); } catch (e) { /* تجاهل */ } };
    const play = (g) => {
        track('game_played', { template: g.template, kind: g.pack ? 'pack' : g.id ? 'mine' : 'quran' });
        openGame(g, { onFinish: () => { if (g.id) api.hub('game_played', { id: g.id }).catch(() => {}); } });
    };

    async function saveGame(g) {
        if (!hubOk) { ErrorHandler.showError('حفظ الألعاب هيشتغل قريب إن شاء الله. تقدر تلعبها دلوقتي.'); return; }
        try {
            const r = await api.hub('game_save', { title: g.title, template: g.template, subject: g.subject || '', content: g.content });
            games.unshift(r.game); renderMine();
            ErrorHandler.showSuccess('اتحفظت في ألعابك ✓');
            document.getElementById('sec-mine').scrollIntoView({ behavior: 'smooth', block: 'start' });
        } catch (err) { ErrorHandler.showError(ErrorHandler.getErrorMessage(err)); }
    }

    mountQuranBuilder($('quran-builder'), { onPlay: play, onSave: saveGame });

    const renderPacks = () => { $('packs').innerHTML = packsHtml(packCat); };
    renderPacks();
    $('packs').addEventListener('click', (e) => {
        const c = e.target.closest('[data-pcat]');
        if (c) { packCat = c.dataset.pcat; renderPacks(); return; }
        const p = e.target.closest('[data-pack-play]');
        if (p) { play(packGame(p.dataset.packPlay)); return; }
        const cp = e.target.closest('[data-pack-copy]');
        if (cp) { const g = packGame(cp.dataset.packCopy); delete g.pack; openEditor(g, g.template, (saved) => { games.unshift(saved); renderMine(); }); }
    });

    function renderMine() {
        const box = $('my-games');
        if (!hubOk) { box.innerHTML = '<div class="lib2-empty">حفظ الألعاب هيشتغل قريب إن شاء الله. جرّب الألعاب الجاهزة وألعاب القرآن دلوقتي.</div>'; return; }
        if (!games.length) {
            box.innerHTML = `<div class="lib2-empty"><span class="em">${gi('dice', { size: 56 })}</span>لسه ماعملتش لعبة. اعمل لعبة من آيات القرآن فوق واحفظها، أو اختار قالب:</div>${templatesHtml()}`;
            return;
        }
        box.innerHTML = `<div class="gx-cards">${games.map((g) => {
            const t = templateOf(g.template);
            return `<div class="gx-card" data-gid="${g.id}"><div class="hd"><span class="em">${gi(t.id, { size: 42 })}</span><div><b>${esc(g.title)}</b><br><small>${esc(t.name)}${g.plays ? ` · اتلعبت ${g.plays} مرة` : ''}</small></div></div>
                <div class="ac"><button type="button" class="btn btn-primary" data-ga="play">${gi('play', { tile: false, size: 15 })} العب</button>
                <button type="button" class="btn btn-ghost icon" data-ga="share" title="لينك للطالب" aria-label="لينك للطالب">${gi('link', { tile: false, size: 17 })}</button>
                <button type="button" class="btn btn-ghost icon" data-ga="edit" title="تعديل" aria-label="تعديل">${gi('edit', { tile: false, size: 17 })}</button>
                <button type="button" class="btn btn-ghost icon" data-ga="del" title="حذف" aria-label="حذف">${gi('trash', { tile: false, size: 17 })}</button></div></div>`;
        }).join('')}</div>`;
    }
    const templatesHtml = () => `<div class="gx-tiles" style="margin-top:.7rem">${TEMPLATES.map((t) => `<button type="button" class="gx-tile" data-new-t="${t.id}"><span class="em">${gi(t.id, { size: 40 })}</span><b>${t.name}</b><small>${t.desc}</small></button>`).join('')}</div>`;

    $('my-games').addEventListener('click', async (e) => {
        const nt = e.target.closest('[data-new-t]');
        if (nt) { openEditor(null, nt.dataset.newT, (saved) => { games.unshift(saved); renderMine(); }); return; }
        const b = e.target.closest('[data-ga]');
        const card = e.target.closest('[data-gid]');
        if (!b || !card) return;
        const g = games.find((x) => x.id === card.dataset.gid);
        if (!g) return;
        if (b.dataset.ga === 'play') play(g);
        else if (b.dataset.ga === 'share') shareGame(g);
        else if (b.dataset.ga === 'edit') openEditor(g, g.template, (saved) => { Object.assign(g, saved); renderMine(); });
        else if (b.dataset.ga === 'del') {
            if (!confirm(`تمسح لعبة "${g.title}"؟`)) return;
            try { await api.hub('game_delete', { id: g.id }); games = games.filter((x) => x.id !== g.id); renderMine(); } catch (err) { ErrorHandler.showError(ErrorHandler.getErrorMessage(err)); }
        }
    });
    $('btn-new-game').addEventListener('click', () => {
        modal('اختار شكل اللعبة', templatesHtml(), (m, close) => {
            m.addEventListener('click', (e) => { const t = e.target.closest('[data-new-t]'); if (!t) return; close(); openEditor(null, t.dataset.newT, (saved) => { games.unshift(saved); renderMine(); }); });
        });
    });

    (async () => {
        const authInfo = await Auth.requireAuth();
        if (!authInfo) return;
        try { games = (await api.hub('games_list')).games || []; }
        catch (err) { if (err && (err.status === 404 || (err.error && err.error.code === 'DB_ERROR'))) hubOk = false; }
        $('btn-new-game').hidden = !hubOk;
        renderMine();
    })();
}
