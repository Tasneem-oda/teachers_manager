/**
 * mushaf.js — v35: المصحف الشريف (مصحف المدينة برواية حفص) كمصحف حقيقي مش ككتاب عادي
 *
 * • 604 صفحة بنفس سطور وترتيب المصحف المطبوع (خطوط مجمّع الملك فهد QCF4 — كل كلمة في مكانها زي الورق).
 * • صفحة واحدة على الموبايل، وصفحتين جنب بعض على الشاشات الكبيرة (الفردية يمين زي المصحف الورق).
 * • تقليب بالسحب أو الأسهم أو الكيبورد، فهرس السور والأجزاء، علامات، آخر صفحة وقفت عندها، ووضع ليلي.
 * • لو خطوط المصحف ماتحمّلتش (نت ضعيف): بيعرض نفس الصفحة بالنص العثماني تلقائيًا.
 */

const QCF_BASES = ['https://cdn.jsdelivr.net/npm/quran-qcf4@1.1.0', 'https://cdn.jsdelivr.net/gh/MohamadHajjRabee/quran-qcf4@main'];
const TEXT_API = 'https://api.alquran.cloud/v1/page';
const LS = 'tm_mushaf_v1';
const TOTAL = 604;

export const SURAHS = 'الفاتحة البقرة آل_عمران النساء المائدة الأنعام الأعراف الأنفال التوبة يونس هود يوسف الرعد إبراهيم الحجر النحل الإسراء الكهف مريم طه الأنبياء الحج المؤمنون النور الفرقان الشعراء النمل القصص العنكبوت الروم لقمان السجدة الأحزاب سبأ فاطر يس الصافات ص الزمر غافر فصلت الشورى الزخرف الدخان الجاثية الأحقاف محمد الفتح الحجرات ق الذاريات الطور النجم القمر الرحمن الواقعة الحديد المجادلة الحشر الممتحنة الصف الجمعة المنافقون التغابن الطلاق التحريم الملك القلم الحاقة المعارج نوح الجن المزمل المدثر القيامة الإنسان المرسلات النبأ النازعات عبس التكوير الانفطار المطففين الانشقاق البروج الطارق الأعلى الغاشية الفجر البلد الشمس الليل الضحى الشرح التين العلق القدر البينة الزلزلة العاديات القارعة التكاثر العصر الهمزة الفيل قريش الماعون الكوثر الكافرون النصر المسد الإخلاص الفلق الناس'.split(' ').map((s) => s.replace(/_/g, ' '));
export const SURAH_PAGE = [1, 2, 50, 77, 106, 128, 151, 177, 187, 208, 221, 235, 249, 255, 262, 267, 282, 293, 305, 312, 322, 332, 342, 350, 359, 367, 377, 385, 396, 404, 411, 415, 418, 428, 434, 440, 446, 453, 458, 467, 477, 483, 489, 496, 499, 502, 507, 511, 515, 518, 520, 523, 526, 528, 531, 534, 537, 542, 545, 549, 551, 553, 554, 556, 558, 560, 562, 564, 566, 568, 570, 572, 574, 575, 577, 578, 580, 582, 583, 585, 586, 587, 587, 589, 590, 591, 591, 592, 593, 594, 595, 595, 596, 596, 597, 597, 598, 598, 599, 599, 600, 600, 601, 601, 601, 602, 602, 602, 603, 603, 603, 604, 604, 604];
export const JUZ_PAGE = [1, 22, 42, 62, 82, 102, 121, 142, 162, 182, 201, 222, 242, 262, 282, 302, 322, 342, 362, 382, 402, 422, 442, 462, 482, 502, 522, 542, 562, 582];
const JUZ_NAMES = ['الم', 'سيقول', 'تلك الرسل', 'لن تنالوا', 'والمحصنات', 'لا يحب الله', 'وإذا سمعوا', 'ولو أننا', 'قال الملأ', 'واعلموا', 'يعتذرون', 'وما من دابة', 'وما أبرئ', 'ربما', 'سبحان', 'قال ألم', 'اقترب', 'قد أفلح', 'وقال الذين', 'أمن خلق', 'اتل ما أوحي', 'ومن يقنت', 'وما لي', 'فمن أظلم', 'إليه يرد', 'حم', 'قال فما خطبكم', 'قد سمع', 'تبارك', 'عم'];

const ar = (n) => String(n).replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[d]);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad3 = (n) => String(n).padStart(3, '0');

export const surahOfPage = (p) => { let s = 0; for (let i = 0; i < 114; i++) if (SURAH_PAGE[i] <= p) s = i; return s + 1; };
export const juzOfPage = (p) => { let j = 0; for (let i = 0; i < 30; i++) if (JUZ_PAGE[i] <= p) j = i; return j + 1; };

const state = (() => { try { return Object.assign({ page: 1, marks: [], mode: 'qcf', night: false }, JSON.parse(localStorage.getItem(LS) || '{}')); } catch (e) { return { page: 1, marks: [], mode: 'qcf', night: false }; } })();
const save = () => { try { localStorage.setItem(LS, JSON.stringify(state)); } catch (e) { /* تجاهل */ } };

// ------------------------------------------------------------------ البيانات
const pageCache = new Map();
const fontsLoaded = new Set();
let qcfBase = null;

async function fetchJson(url, ms = 15000) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), ms);
    try {
        const r = await fetch(url, { signal: ctl.signal });
        if (!r.ok) throw new Error(String(r.status));
        return await r.json();
    } finally { clearTimeout(t); }
}

async function qcfPage(n) {
    const bases = qcfBase ? [qcfBase] : QCF_BASES;
    let last = null;
    for (const b of bases) {
        try { const j = await fetchJson(`${b}/pages/${pad3(n)}.json`); qcfBase = b; return j; } catch (e) { last = e; }
    }
    throw last || new Error('qcf');
}

function fontFile(font) { return /QBSML/i.test(font) ? 'QCF4_QBSML' : `${font}_W`; }

async function ensureFont(font) {
    if (!font || fontsLoaded.has(font)) return true;
    const base = qcfBase || QCF_BASES[0];
    const f = new FontFace(font, `url(${base}/fonts-woff2/${fontFile(font)}.woff2) format("woff2"), url(${base}/fonts/${fontFile(font)}.ttf) format("truetype")`, { display: 'block' });
    await Promise.race([f.load(), new Promise((_, rej) => setTimeout(() => rej(new Error('font timeout')), 20000))]);
    document.fonts.add(f);
    fontsLoaded.add(font);
    return true;
}

async function textPage(n) {
    const j = await fetchJson(`${TEXT_API}/${n}/quran-uthmani`);
    if (!j || j.code !== 200 || !j.data) throw new Error('text');
    return j.data.ayahs || [];
}

/** بيجيب الصفحة جاهزة للرسم: {kind:'qcf', lines} أو {kind:'text', ayahs} */
async function loadPage(n, mode = state.mode) {
    const key = `${mode}:${n}`;
    if (pageCache.has(key)) return pageCache.get(key);
    const p = (async () => {
        if (mode === 'qcf') {
            try {
                const j = await qcfPage(n);
                const fonts = new Set();
                (j.lines || []).forEach((l) => (l.words || []).forEach((w) => w.font && fonts.add(w.font)));
                if (j.font) fonts.add(j.font);
                await Promise.all([...fonts].map(ensureFont));
                return { kind: 'qcf', data: j };
            } catch (e) {
                // خطوط المصحف ماتحمّلتش: النص العثماني لنفس الصفحة
                return { kind: 'text', data: await textPage(n), fallback: true };
            }
        }
        return { kind: 'text', data: await textPage(n) };
    })();
    pageCache.set(key, p);
    p.catch(() => pageCache.delete(key));
    return p;
}

// ------------------------------------------------------------------ الرسم
function lineWords(l) { return Array.isArray(l.words) ? l.words : []; }

function renderQcf(j, n) {
    const lines = (j.lines || []).slice().sort((a, b) => (a.line || a.line_number || 0) - (b.line || b.line_number || 0));
    return lines.map((l) => {
        const ws = lineWords(l);
        const header = ws.length && ws.every((w) => w.type === 'surah_header');
        const basm = ws.length && ws.every((w) => w.type === 'bismillah');
        if (header) {
            const sura = ws[0].sura || ws[0].surah || '';
            return `<div class="ms-line ms-head" data-sura="${esc(sura)}"><span class="ms-hframe">${ws.map((w) => `<span style="font-family:'${esc(w.font)}'">${esc(w.char || '')}</span>`).join('')}</span><span class="ms-hname">سورة ${esc(SURAHS[(Number(sura) || 1) - 1] || '')}</span></div>`;
        }
        const center = basm || ws.length <= 3 || (n <= 2);
        return `<div class="ms-line ${center ? 'ms-center' : ''} ${basm ? 'ms-basm' : ''}">${ws.map((w) => `<span class="ms-w ${w.type === 'end' ? 'ms-end' : ''}" style="font-family:'${esc(w.font)}'" ${w.verse_key ? `data-vk="${esc(w.verse_key)}"` : ''} title="${esc(w.text || '')}">${esc(w.char || '')}</span>`).join('')}</div>`;
    }).join('');
}

function renderText(ayahs) {
    let out = '';
    let cur = '';
    const flush = () => { if (cur) { out += `<p class="ms-tx">${cur}</p>`; cur = ''; } };
    ayahs.forEach((a) => {
        const s = a.surah || {};
        let txt = String(a.text || '');
        if (a.numberInSurah === 1) {
            flush();
            out += `<div class="ms-line ms-head ms-head-tx"><span class="ms-hname">سورة ${esc(SURAHS[(s.number || 1) - 1] || '')}</span></div>`;
            if (s.number !== 1 && s.number !== 9) {
                const words = txt.split(/\s+/);
                if (words.length > 4) { txt = words.slice(4).join(' '); }
                out += '<div class="ms-basm-tx">بِسۡمِ ٱللَّهِ ٱلرَّحۡمَٰنِ ٱلرَّحِيمِ</div>';
            }
        }
        cur += `${esc(txt)} <span class="ms-num">﴿${ar(a.numberInSurah)}﴾</span> `;
    });
    flush();
    return out;
}

/** لو أي سطر أعرض من الصفحة (شاشة ضيقة/خط بديل): نصغّر خط الصفحة كلها بنفس النسبة عشان السطور تفضل زي المصحف */
function fit(body) {
    body.style.fontSize = '';
    let worst = 1;
    body.querySelectorAll('.ms-line:not(.ms-head)').forEach((l) => { const r = l.scrollWidth / Math.max(1, l.clientWidth); if (r > worst) worst = r; });
    if (worst > 1.01) body.style.fontSize = `${(parseFloat(getComputedStyle(body).fontSize) / worst) * 0.98}px`;
}

// ------------------------------------------------------------------ الواجهة
export function mountMushaf(root, { onBack } = {}) {
    root.classList.add('ms-root');
    root.innerHTML = `
        <header class="ms-bar">
            <button type="button" class="ms-ib" data-a="back" aria-label="رجوع">‹</button>
            <button type="button" class="ms-title" data-a="index" aria-label="فهرس السور"><b data-t="surah">الفاتحة</b><small data-t="juz">الجزء ١</small></button>
            <span class="ms-sp"></span>
            <button type="button" class="ms-ib" data-a="mark" aria-label="علامة على الصفحة دي" title="علامة">🔖</button>
            <button type="button" class="ms-ib" data-a="index" aria-label="الفهرس" title="الفهرس">☰</button>
            <button type="button" class="ms-ib" data-a="settings" aria-label="الإعدادات" title="الإعدادات">⚙</button>
        </header>
        <main class="ms-stage" tabindex="0" aria-label="صفحات المصحف">
            <button type="button" class="ms-nav ms-next" data-a="next" aria-label="الصفحة اللي بعدها">‹</button>
            <div class="ms-spread" data-spread></div>
            <button type="button" class="ms-nav ms-prev" data-a="prev" aria-label="الصفحة اللي قبلها">›</button>
        </main>
        <footer class="ms-foot">
            <button type="button" class="ms-ib" data-a="prev" aria-label="الصفحة اللي قبلها">›</button>
            <label class="ms-go">صفحة <input type="number" min="1" max="${TOTAL}" inputmode="numeric" data-go aria-label="رقم الصفحة"> من ${ar(TOTAL)}</label>
            <button type="button" class="ms-ib" data-a="next" aria-label="الصفحة اللي بعدها">‹</button>
        </footer>
        <aside class="ms-drawer" data-drawer hidden>
            <div class="ms-dhead"><div class="ms-dtabs" role="tablist"><button type="button" class="on" data-dt="s">السور</button><button type="button" data-dt="j">الأجزاء</button><button type="button" data-dt="m">العلامات</button></div>
                <button type="button" class="ms-ib" data-a="close-drawer" aria-label="قفل">✕</button></div>
            <input type="search" class="ms-dsearch" placeholder="ابحث عن سورة…" data-dsearch aria-label="ابحث عن سورة">
            <div class="ms-dlist" data-dlist></div>
        </aside>
        <div class="ms-pop" data-pop hidden>
            <b>عرض المصحف</b>
            <label><input type="radio" name="ms-mode" value="qcf"> مصحف المدينة (زي المطبوع بالظبط)</label>
            <label><input type="radio" name="ms-mode" value="text"> نص عثماني (أخف على النت الضعيف)</label>
            <label><input type="checkbox" data-night> الوضع الليلي</label>
        </div>`;
    const $ = (s) => root.querySelector(s);
    const spread = $('[data-spread]');
    const stage = $('.ms-stage');
    let token = 0;

    const twoUp = () => window.innerWidth >= 1000 && window.innerWidth > window.innerHeight * 1.15;
    const pagesFor = (p) => {
        if (!twoUp()) return [p];
        const right = p % 2 ? p : p - 1;
        return [right, right + 1].filter((x) => x >= 1 && x <= TOTAL);
    };

    function size() {
        const bar = 112;
        const H = Math.max(320, window.innerHeight - bar - 16);
        const n = twoUp() ? 2 : 1;
        const W = Math.min((window.innerWidth - (n === 2 ? 120 : 24)) / n, H * 0.66);
        root.style.setProperty('--pw', `${Math.floor(W)}px`);
        root.style.setProperty('--ph', `${Math.floor(Math.min(H, W / 0.66))}px`);
    }

    function header(p) {
        const s = surahOfPage(p);
        $('[data-t="surah"]').textContent = `سورة ${SURAHS[s - 1]}`;
        $('[data-t="juz"]').textContent = `الجزء ${ar(juzOfPage(p))} · صفحة ${ar(p)}`;
        $('[data-go]').value = p;
        $('[data-a="mark"]').classList.toggle('on', state.marks.includes(p));
    }

    async function show(p, dir = 0) {
        p = Math.max(1, Math.min(TOTAL, Number(p) || 1));
        state.page = p; save();
        header(p);
        const my = ++token;
        const list = pagesFor(p);
        spread.innerHTML = list.map((n) => `<article class="ms-page ${n % 2 ? 'odd' : 'even'}" data-p="${n}"><div class="ms-frame"><div class="ms-body"><div class="ms-load"><span class="ms-spin"></span></div></div><div class="ms-pno">${ar(n)}</div></div></article>`).join('');
        if (dir) { spread.classList.remove('ms-in-l', 'ms-in-r'); void spread.offsetWidth; spread.classList.add(dir > 0 ? 'ms-in-l' : 'ms-in-r'); }
        await Promise.all(list.map(async (n) => {
            const body = spread.querySelector(`[data-p="${n}"] .ms-body`);
            try {
                const pg = await loadPage(n);
                if (my !== token || !body) return;
                body.classList.toggle('qcf', pg.kind === 'qcf');
                body.classList.toggle('tx', pg.kind === 'text');
                body.innerHTML = pg.kind === 'qcf' ? renderQcf(pg.data, n) : renderText(pg.data);
                if (pg.kind === 'qcf') fit(body);
                if (pg.fallback) body.insertAdjacentHTML('beforeend', '<p class="ms-note">بنعرض النص العثماني لأن خطوط المصحف ماتحمّلتش</p>');
            } catch (e) {
                if (my === token && body) body.innerHTML = `<div class="ms-err"><p>الصفحة ماتحمّلتش 📶</p><button type="button" class="ms-btn" data-retry="${n}">جرّب تاني</button></div>`;
            }
        }));
        // تحميل اللي جاي مسبقًا
        const nxt = list[list.length - 1] + 1;
        [nxt, nxt + 1, list[0] - 1].filter((x) => x >= 1 && x <= TOTAL).forEach((x) => loadPage(x).catch(() => {}));
        try { window.tmTrack && window.tmTrack('mushaf_page', { page: p }); } catch (e) { /* تجاهل */ }
    }

    const step = () => (twoUp() ? 2 : 1);
    const next = () => { const l = pagesFor(state.page); if (l[l.length - 1] < TOTAL) show(l[l.length - 1] + 1, 1); };
    const prev = () => { const l = pagesFor(state.page); if (l[0] > 1) show(Math.max(1, l[0] - step()), -1); };

    // الفهرس
    let dtab = 's';
    function renderDrawer() {
        const q = String($('[data-dsearch]').value || '').trim();
        $('[data-dsearch]').hidden = dtab !== 's';
        let html = '';
        if (dtab === 's') {
            html = SURAHS.map((n, i) => ({ n, i })).filter((x) => !q || x.n.includes(q) || String(x.i + 1) === q)
                .map((x) => `<button type="button" class="ms-di ${surahOfPage(state.page) === x.i + 1 ? 'on' : ''}" data-page="${SURAH_PAGE[x.i]}"><span class="ms-dn">${ar(x.i + 1)}</span><span class="ms-dt">سورة ${esc(x.n)}</span><small>ص ${ar(SURAH_PAGE[x.i])}</small></button>`).join('');
        } else if (dtab === 'j') {
            html = JUZ_PAGE.map((p, i) => `<button type="button" class="ms-di ${juzOfPage(state.page) === i + 1 ? 'on' : ''}" data-page="${p}"><span class="ms-dn">${ar(i + 1)}</span><span class="ms-dt">الجزء ${ar(i + 1)} <small>(${JUZ_NAMES[i]})</small></span><small>ص ${ar(p)}</small></button>`).join('');
        } else {
            html = state.marks.length ? state.marks.slice().sort((a, b) => a - b).map((p) => `<button type="button" class="ms-di" data-page="${p}"><span class="ms-dn">🔖</span><span class="ms-dt">سورة ${esc(SURAHS[surahOfPage(p) - 1])}</span><small>ص ${ar(p)}</small></button>`).join('')
                : '<p class="ms-empty">لسه مفيش علامات. اضغط 🔖 فوق عشان تعلّم على الصفحة.</p>';
        }
        $('[data-dlist]').innerHTML = html;
        root.querySelectorAll('[data-dt]').forEach((b) => b.classList.toggle('on', b.dataset.dt === dtab));
        const on = $('[data-dlist] .on'); if (on) on.scrollIntoView({ block: 'center' });
    }
    const openDrawer = () => { $('[data-drawer]').hidden = false; renderDrawer(); };
    const closeDrawer = () => { $('[data-drawer]').hidden = true; stage.focus({ preventScroll: true }); };

    root.addEventListener('click', (e) => {
        const a = e.target.closest('[data-a]');
        const pg = e.target.closest('[data-page]');
        const r = e.target.closest('[data-retry]');
        if (r) { pageCache.delete(`${state.mode}:${r.dataset.retry}`); show(state.page); return; }
        if (pg) { closeDrawer(); show(Number(pg.dataset.page)); return; }
        const dt = e.target.closest('[data-dt]');
        if (dt) { dtab = dt.dataset.dt; renderDrawer(); return; }
        if (!a) { if (!e.target.closest('[data-pop]')) $('[data-pop]').hidden = true; return; }
        const act = a.dataset.a;
        if (act === 'next') next();
        else if (act === 'prev') prev();
        else if (act === 'index') openDrawer();
        else if (act === 'close-drawer') closeDrawer();
        else if (act === 'back') { if (onBack) onBack(); else history.length > 1 ? history.back() : (location.href = 'books.html'); }
        else if (act === 'mark') {
            const i = state.marks.indexOf(state.page);
            if (i >= 0) state.marks.splice(i, 1); else state.marks.push(state.page);
            save(); header(state.page);
        } else if (act === 'settings') {
            const pop = $('[data-pop]');
            pop.hidden = !pop.hidden;
            pop.querySelectorAll('[name="ms-mode"]').forEach((x) => { x.checked = x.value === state.mode; });
            pop.querySelector('[data-night]').checked = !!state.night;
        }
    });
    $('[data-pop]').addEventListener('change', (e) => {
        if (e.target.name === 'ms-mode') { state.mode = e.target.value; save(); show(state.page); }
        if (e.target.matches('[data-night]')) { state.night = e.target.checked; save(); root.classList.toggle('ms-night', state.night); }
    });
    $('[data-dsearch]').addEventListener('input', renderDrawer);
    const go = $('[data-go]');
    go.addEventListener('change', () => show(go.value));
    go.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); show(go.value); go.blur(); } });

    // الكيبورد: في المصحف العربي "اللي بعده" ناحية الشمال
    root.addEventListener('keydown', (e) => {
        if (e.target.matches('input')) return;
        if (e.key === 'ArrowLeft' || e.key === 'PageDown' || e.key === ' ') { e.preventDefault(); next(); }
        else if (e.key === 'ArrowRight' || e.key === 'PageUp') { e.preventDefault(); prev(); }
        else if (e.key === 'Escape') { closeDrawer(); $('[data-pop]').hidden = true; }
    });
    // السحب: من اليمين للشمال = الصفحة اللي بعدها (زي تقليب المصحف)
    let sx = 0, sy = 0, st = 0;
    stage.addEventListener('touchstart', (e) => { const t = e.touches[0]; sx = t.clientX; sy = t.clientY; st = Date.now(); }, { passive: true });
    stage.addEventListener('touchend', (e) => {
        const t = e.changedTouches[0];
        const dx = t.clientX - sx, dy = t.clientY - sy;
        if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.4 && Date.now() - st < 800) { if (dx > 0) next(); else prev(); }
    }, { passive: true });

    let rz = null;
    window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { size(); show(state.page); }, 150); });
    root.classList.toggle('ms-night', !!state.night);
    size();
    const qp = Number(new URLSearchParams(location.search).get('page'));
    const qs = Number(new URLSearchParams(location.search).get('surah'));
    show(qs >= 1 && qs <= 114 ? SURAH_PAGE[qs - 1] : (qp || state.page || 1));
    stage.focus({ preventScroll: true });
    return { show, next, prev, get page() { return state.page; } };
}
