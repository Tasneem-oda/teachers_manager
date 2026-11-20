/**
 * games-page.js — v33: صفحة "ألعاب الحصة"
 */
import { Auth } from './auth.js?v=45';
import { renderSidebar, renderTopHeader } from './sidebar.js?v=45';
import { api } from './api.js?v=45';
import { ErrorHandler } from './utils.js?v=45';
import { setupGamesUi, ensureUiCss, mountQuranBuilder, packsHtml, packGame, openEditor, shareGame, openGame, TEMPLATES, templateOf, modal } from './games/ui.js?v=45';
import { gi } from './games/gicons.js?v=45';

// v34: أيقونات الصفحة نفسها (بدل الإيموجي)
document.querySelectorAll('[data-gi]').forEach((el) => { el.innerHTML = gi(el.dataset.gi, { tile: el.dataset.tile !== '0', size: Number(el.dataset.size) || 28 }); el.style.display = 'inline-flex'; el.style.verticalAlign = 'middle'; });

const $ = (id) => document.getElementById(id);
// v34: تصنيفات ألعاب المدرسين
export const GAME_CATS = [['quran', 'قرآن'], ['tajweed', 'تجويد'], ['arabic', 'لغة عربية'], ['foundation', 'تأسيس وحروف'], ['islamic', 'تربية إسلامية'], ['other', 'أخرى']];
const catName = (c) => (GAME_CATS.find((x) => x[0] === c) || GAME_CATS[GAME_CATS.length - 1])[1];
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function initGamesPage() {
    renderSidebar('games');
    renderTopHeader({ title: 'ألعاب الحصة', subtitle: 'ألعاب تفاعلية للقرآن واللغة العربية', showSearch: false });
    setupGamesUi({ api, toast: { ok: (m) => ErrorHandler.showSuccess(m), err: (e) => ErrorHandler.showError(typeof e === 'string' ? e : ErrorHandler.getErrorMessage(e)) } });
    ensureUiCss();

    let games = [];
    let hubOk = true;
    let pubGames = [];
    let pubOk = true;
    let pubCat = '';
    let pubQ = '';
    const myPub = new Map();   // source_game_id → { status, review_note }
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
            const ps = myPub.get(g.id);
            const badge = !ps ? '' : ps.status === 'approved' ? '<span class="gx-badge ok">منشورة للمدرسين ✓</span>'
                : ps.status === 'pending' ? '<span class="gx-badge wait">في المراجعة</span>'
                : `<span class="gx-badge no" title="${esc(ps.review_note || '')}">مااتنشرتش${ps.review_note ? `: ${esc(ps.review_note)}` : ''}</span>`;
            return `<div class="gx-card" data-gid="${g.id}"><div class="hd"><span class="em">${gi(t.id, { size: 42 })}</span><div><b>${esc(g.title)}</b><br><small>${esc(t.name)}${g.plays ? ` · اتلعبت ${g.plays} مرة` : ''}</small></div></div>
                ${badge}
                <div class="ac"><button type="button" class="btn btn-primary" data-ga="play">${gi('play', { tile: false, size: 15 })} العب</button>
                ${pubOk ? `<button type="button" class="btn btn-ghost icon" data-ga="publish" title="${ps && ps.status === 'approved' ? 'منشورة للمدرسين' : ps && ps.status === 'pending' ? 'في المراجعة' : 'انشرها لكل المدرسين'}" aria-label="نشر للمدرسين">${gi('globe', { tile: false, size: 17 })}</button>` : ''}
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
        else if (b.dataset.ga === 'publish') openPublish(g);
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

    // ------------------------------------------------------------ v34: نشر لعبة لكل المدرسين (بعد المراجعة)
    function openPublish(g) {
        const ps = myPub.get(g.id);
        if (ps && ps.status === 'pending') {
            modal('اللعبة في المراجعة', `<p class="gx-help">«${esc(g.title)}» مستنية المراجعة، وأول ما تتراجع هيوصلك إشعار. لو عدّلت فيها، اسحب الطلب وابعتها تاني.</p>
                <div class="gx-actions"><button type="button" class="btn btn-outline" data-x>اسحب الطلب</button><button type="button" class="btn btn-primary" data-close>تمام</button></div>`, (m, close) => {
                m.querySelector('[data-close]').addEventListener('click', close);
                m.querySelector('[data-x]').addEventListener('click', async () => { try { await api.hub('game_unpublish', { id: g.id }); myPub.delete(g.id); close(); renderMine(); ErrorHandler.showSuccess('اتسحب الطلب'); } catch (err) { ErrorHandler.showError(ErrorHandler.getErrorMessage(err)); } });
            });
            return;
        }
        const approved = ps && ps.status === 'approved';
        const guess = /quran|قرآن/i.test(g.subject || '') || (g.content && g.content.quran) ? 'quran' : 'other';
        modal(approved ? 'لعبتك منشورة للمدرسين' : 'انشرها لكل المدرسين', `
            <p class="gx-help">${approved ? 'اللعبة ظاهرة في "ألعاب المدرسين". لو عدّلت فيها تقدر تبعت النسخة الجديدة للمراجعة (القديمة تفضل ظاهرة لحد ما الجديدة تتوافق).' : 'زمايلك المدرسين هيقدروا يلعبوها مع طلابهم ويحفظوها عندهم. اللعبة بتتراجع الأول قبل ما تظهر، وهيوصلك إشعار بالنتيجة.'}</p>
            <div class="form-group"><label>اسم اللعبة</label><input type="text" data-t maxlength="120" value="${esc(g.title)}"></div>
            <div class="form-group"><label>وصف قصير <small>(اختياري)</small></label><textarea data-d rows="2" maxlength="600" placeholder="مثلًا: مراجعة أحكام النون الساكنة للمستوى المتوسط"></textarea></div>
            <div class="form-group"><label>التصنيف</label><select data-c>${GAME_CATS.map(([v, l]) => `<option value="${v}" ${v === guess ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
            <label class="gx-check"><input type="checkbox" data-n checked> اكتب اسمي على اللعبة</label>
            <div class="gx-actions">
                <button type="button" class="btn btn-primary" data-send>${gi('globe', { tile: false, size: 16 })} ${approved ? 'ابعت النسخة الجديدة للمراجعة' : 'ابعتها للمراجعة'}</button>
                ${approved ? '<button type="button" class="btn btn-outline" data-un>شيلها من ألعاب المدرسين</button>' : ''}
            </div>`, (m, close) => {
            const send = m.querySelector('[data-send]');
            send.addEventListener('click', async () => {
                if (send.disabled) return;
                send.disabled = true;
                try {
                    await api.hub('game_publish', { id: g.id, title: m.querySelector('[data-t]').value.trim(), description: m.querySelector('[data-d]').value.trim(), category: m.querySelector('[data-c]').value, show_name: m.querySelector('[data-n]').checked });
                    myPub.set(g.id, { status: 'pending' });
                    close(); renderMine();
                    ErrorHandler.showSuccess('اتبعتت للمراجعة ✓ هيوصلك إشعار أول ما تتنشر');
                    track('game_publish_requested', { template: g.template });
                } catch (err) { send.disabled = false; ErrorHandler.showError(ErrorHandler.getErrorMessage(err)); }
            });
            const un = m.querySelector('[data-un]');
            if (un) un.addEventListener('click', async () => {
                if (!confirm('تشيل اللعبة من ألعاب المدرسين؟')) return;
                try { await api.hub('game_unpublish', { id: g.id }); myPub.delete(g.id); close(); renderMine(); loadPublic(true); ErrorHandler.showSuccess('اتشالت من ألعاب المدرسين'); } catch (err) { ErrorHandler.showError(ErrorHandler.getErrorMessage(err)); }
            });
        });
    }

    // ------------------------------------------------------------ v34: ألعاب المدرسين
    $('pub-cats').innerHTML = [['', 'الكل'], ...GAME_CATS].map(([v, l]) => `<button type="button" class="lib2-chip ${v === '' ? 'is-on' : ''}" data-pc="${v}">${l}</button>`).join('');
    $('pub-cats').addEventListener('click', (e) => {
        const c = e.target.closest('[data-pc]'); if (!c) return;
        pubCat = c.dataset.pc;
        $('pub-cats').querySelectorAll('[data-pc]').forEach((b) => b.classList.toggle('is-on', b === c));
        loadPublic();
    });
    let qTimer = null;
    $('pub-q').addEventListener('input', (e) => { clearTimeout(qTimer); qTimer = setTimeout(() => { pubQ = e.target.value.trim(); loadPublic(); }, 350); });

    function renderPublic() {
        const box = $('public-games');
        if (!pubOk) { box.innerHTML = '<div class="lib2-empty">ألعاب المدرسين هتشتغل قريب إن شاء الله.</div>'; return; }
        if (!pubGames.length) {
            box.innerHTML = `<div class="lib2-empty"><span class="em">${gi('globe', { size: 56 })}</span>${pubQ || pubCat ? 'مفيش ألعاب بالبحث ده.' : 'لسه مفيش ألعاب منشورة. كن أول واحد: اضغط على علامة الكرة الأرضية جنب أي لعبة من ألعابك.'}</div>`;
            return;
        }
        box.innerHTML = `<div class="gx-cards">${pubGames.map((g) => {
            const t = templateOf(g.template);
            return `<div class="gx-card" data-pid="${g.id}"><div class="hd"><span class="em">${gi(t.id, { size: 42 })}</span><div><b>${esc(g.title)}</b><br><small>${esc(catName(g.category))} · ${esc(t.name)}</small></div></div>
                ${g.description ? `<p class="gx-desc">${esc(g.description)}</p>` : ''}
                <small class="gx-by">${g.mine ? 'لعبتك ✓' : g.teacher_name ? `من أ. ${esc(g.teacher_name)}` : 'من مدرس في البرنامج'}${g.uses ? ` · اتحفظت ${g.uses} مرة` : ''}</small>
                <div class="ac"><button type="button" class="btn btn-primary" data-pa="play">${gi('play', { tile: false, size: 15 })} العب</button>
                ${g.mine ? '' : `<button type="button" class="btn btn-ghost" data-pa="copy">${gi('star', { tile: false, size: 15 })} احفظها في ألعابي</button>`}</div></div>`;
        }).join('')}</div>`;
    }
    $('public-games').addEventListener('click', async (e) => {
        const b = e.target.closest('[data-pa]'); const card = e.target.closest('[data-pid]');
        if (!b || !card) return;
        const g = pubGames.find((x) => x.id === card.dataset.pid); if (!g) return;
        if (b.dataset.pa === 'play') {
            track('game_played', { template: g.template, kind: 'teachers' });
            openGame({ title: g.title, template: g.template, subject: g.subject, content: g.content }, { onFinish: () => { api.hub('game_public_played', { public_id: g.id }).catch(() => {}); } });
        } else if (b.dataset.pa === 'copy') {
            if (b.disabled) return; b.disabled = true;
            try {
                const r = await api.hub('game_copy', { public_id: g.id });
                if (r && r.game) { games.unshift(r.game); renderMine(); }
                g.uses = (g.uses || 0) + 1; b.textContent = 'اتحفظت ✓';
                ErrorHandler.showSuccess('اتحفظت في ألعابك ✓ تقدر تعدّل فيها براحتك');
                track('game_copied', { template: g.template });
            } catch (err) { b.disabled = false; ErrorHandler.showError(ErrorHandler.getErrorMessage(err)); }
        }
    });
    async function loadPublic(fresh = false) {
        try {
            const r = await api.hub('games_public_list', { category: pubCat, q: pubQ }, fresh ? { fresh: true } : {});
            pubGames = (r && r.games) || [];
            myPub.clear();
            ((r && r.mine) || []).forEach((x) => myPub.set(x.source_game_id, x));
            pubOk = true;
        } catch (err) {
            const code = err && err.error && err.error.code;
            if (err && (err.status === 404 || code === 'DB_ERROR' || code === 'INVALID' || err.status === 503)) pubOk = false;
            pubGames = [];
        }
        renderPublic();
        renderMine();
    }

    (async () => {
        const authInfo = await Auth.requireAuth();
        if (!authInfo) return;
        try { games = (await api.hub('games_list')).games || []; }
        catch (err) { if (err && (err.status === 404 || (err.error && err.error.code === 'DB_ERROR'))) hubOk = false; }
        $('btn-new-game').hidden = !hubOk;
        renderMine();
        await loadPublic();
        if (location.hash === '#public') document.getElementById('public').scrollIntoView({ behavior: 'smooth', block: 'start' });
    })();
}
