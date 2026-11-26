/**
 * mushaf.js — v35: المصحف الشريف (مصحف المدينة برواية حفص) كمصحف حقيقي مش ككتاب عادي
 *
 * • 604 صفحة بنفس سطور وترتيب المصحف المطبوع (خطوط مجمّع الملك فهد QCF4 — كل كلمة في مكانها زي الورق).
 * • صفحة واحدة على الموبايل، وصفحتين جنب بعض على الشاشات الكبيرة (الفردية يمين زي المصحف الورق).
 * • تقليب بالسحب أو الأسهم أو الكيبورد، فهرس السور والأجزاء، علامات، آخر صفحة وقفت عندها، ووضع ليلي.
 * • لو خطوط المصحف ماتحمّلتش (نت ضعيف): بيعرض نفس الصفحة بالنص العثماني تلقائيًا.
 * v40: أدوات الشرح كلها (نفس أدوات الكتب): قلم/هايلايتر/أشكال/كتابة/علامات/ليزر/كشاف/مسطرة/زوم على جزء/قص آيات للسبورة/
 *      ملء الشاشة/إخفاء مؤقت/السبورة + تكبير الصفحات (أزرار، Ctrl+عجلة، قرص بصباعين، ضغطتين) + بحث في الآيات والذهاب لآية.
 */
import { PresentTools } from './present-tools.js?v=59';
import { isWhiteboardOpen } from './whiteboard.js?v=59';

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
        cur += `<span class="ms-ay" data-vk="${esc(s.number)}:${esc(a.numberInSurah)}">${esc(txt)} <span class="ms-num">﴿${ar(a.numberInSurah)}﴾</span></span> `;
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

// ------------------------------------------------------------------ v40: البحث في الآيات
// عدد آيات كل سورة (للتأكد من "البقرة ٢٥٥" قبل ما نروح)
export const AYAH_COUNT = [7, 286, 200, 176, 120, 165, 206, 75, 129, 109, 123, 111, 43, 52, 99, 128, 111, 110, 98, 135, 112, 78, 118, 64, 77, 227, 93, 88, 69, 60, 34, 30, 73, 54, 45, 83, 182, 88, 75, 85, 54, 53, 89, 59, 37, 35, 38, 29, 18, 45, 60, 49, 62, 55, 78, 96, 29, 22, 24, 13, 14, 11, 11, 18, 12, 12, 30, 52, 52, 44, 28, 28, 20, 56, 40, 31, 50, 40, 46, 42, 29, 19, 36, 25, 22, 17, 19, 26, 30, 20, 15, 21, 11, 8, 8, 19, 5, 8, 8, 11, 11, 8, 3, 9, 5, 4, 7, 3, 6, 3, 5, 4, 5, 6];
const QURAN_URL = 'https://api.alquran.cloud/v1/quran/quran-simple-clean';
const AYAH_API = 'https://api.alquran.cloud/v1/ayah';
const SEARCH_API = 'https://api.alquran.cloud/v1/search';
const toEnDigits = (x) => String(x == null ? '' : x).replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d));
/** تطبيع عربي حرف بحرف (عشان نقدر نلوّن الكلمة في النص الأصلي): بيشيل التشكيل ويوحّد الهمزات والتاء المربوطة والألف المقصورة */
export function normAr(str) {
    const src = String(str == null ? '' : str);
    let out = ''; const map = [];
    for (let i = 0; i < src.length; i++) {
        let ch = src[i];
        if (/[ؐ-ًؚ-ٰٟۖ-ۭـ]/.test(ch)) continue;
        if (/[أإآٱ]/.test(ch)) ch = 'ا';
        else if (ch === 'ى' || ch === 'ئ') ch = 'ي';
        else if (ch === 'ة') ch = 'ه';
        else if (ch === 'ؤ') ch = 'و';
        else if (/\s/.test(ch)) ch = ' ';
        if (ch === ' ' && out.endsWith(' ')) continue;
        out += ch; map.push(i);
    }
    return { s: out, map };
}
const normQ = (q) => normAr(toEnDigits(q)).s.trim();
const surahNorm = SURAHS.map((n) => normQ(n));
/** "البقرة" / "سورة البقرة" / "بقره" → رقم السورة */
function findSurah(name) {
    const q = normQ(name).replace(/^سوره\s+/, '');
    if (!q) return 0;
    let i = surahNorm.findIndex((n) => n === q || n === 'ال' + q || n.replace(/^ال/, '') === q);
    if (i < 0) i = surahNorm.findIndex((n) => n.startsWith(q) || n.replace(/^ال/, '').startsWith(q));
    return i + 1;
}
/** "٢:٢٥٥" / "2 255" / "البقرة ٢٥٥" / "سورة الكهف آية ١٠" → {s, a} */
export function parseRef(q) {
    const t = toEnDigits(q).trim().replace(/\s+/g, ' ');
    let m = /^(\d{1,3})\s*[:：/\-.، ]\s*(\d{1,3})$/.exec(t);
    if (m) { const s = +m[1], a = +m[2]; return s >= 1 && s <= 114 && a >= 1 && a <= AYAH_COUNT[s - 1] ? { s, a } : null; }
    m = /^(.+?)\s*(?:اية|آية|ايه|آيه|:)?\s*(\d{1,3})$/.exec(t);
    if (m) { const s = findSurah(m[1]); const a = +m[2]; if (s && a >= 1 && a <= AYAH_COUNT[s - 1]) return { s, a }; }
    return null;
}
let quranIdx = null; let quranP = null;
async function loadQuranIndex() {
    if (quranIdx) return quranIdx;
    if (!quranP) {
        quranP = (async () => {
            let j = null;
            try { const c = await caches.open('tm-quran-v1'); const hit = await c.match(QURAN_URL); if (hit) j = await hit.json(); } catch (e) { j = null; }
            if (!j) {
                const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 45000);
                try {
                    const r = await fetch(QURAN_URL, { signal: ctl.signal });
                    if (!r.ok) throw new Error(String(r.status));
                    const copy = r.clone();
                    j = await r.json();
                    try { const c = await caches.open('tm-quran-v1'); await c.put(QURAN_URL, copy); } catch (e) { /* التخزين مش متاح */ }
                } finally { clearTimeout(t); }
            }
            const list = [];
            ((j && j.data && j.data.surahs) || []).forEach((su) => (su.ayahs || []).forEach((a) => {
                const n = normAr(a.text);
                list.push({ s: su.number, a: a.numberInSurah, p: a.page, t: a.text, n: n.s, map: n.map });
            }));
            if (!list.length) throw new Error('empty');
            quranIdx = list;
            return list;
        })();
        quranP.catch(() => { quranP = null; });
    }
    return quranP;
}
async function pageOfAyah(s, a) {
    if (quranIdx) { const x = quranIdx.find((y) => y.s === s && y.a === a); if (x && x.p) return x.p; }
    try { const j = await fetchJson(`${AYAH_API}/${s}:${a}/quran-simple-clean`); if (j && j.data && j.data.page) return j.data.page; } catch (e) { /* نستخدم بداية السورة */ }
    return SURAH_PAGE[s - 1];
}
/** بيلوّن كلمات البحث في نص الآية (النص الأصلي بهمزاته) */
function markText(item, words) {
    const ranges = [];
    words.forEach((w) => { let from = 0; let i; while (w && (i = item.n.indexOf(w, from)) >= 0) { ranges.push([item.map[i], item.map[i + w.length - 1] + 1]); from = i + w.length; } });
    if (!ranges.length) return esc(item.t);
    ranges.sort((x, y) => x[0] - y[0]);
    let out = ''; let pos = 0;
    ranges.forEach(([a, b]) => { if (a < pos) return; out += esc(item.t.slice(pos, a)) + '<mark>' + esc(item.t.slice(a, b)) + '</mark>'; pos = b; });
    return out + esc(item.t.slice(pos));
}

// ------------------------------------------------------------------ الواجهة
const MS_TOOLS = ['hand', 'pen', 'hl', 'temp', 'eraser', 'line', 'arrow', 'rect', 'ellipse', 'text', 'stamp', 'move', 'laser', 'zoomarea', 'spotlight', 'ruler', 'snip'];
const ZMIN = 1, ZMAX = 4;

export function mountMushaf(root, { onBack, owner: ownerIn, ownerName: ownerNameIn } = {}) {
    const qsp = new URLSearchParams(location.search);
    const owner = ownerIn || (qsp.get('student_id') ? { student_id: qsp.get('student_id') } : qsp.get('group_id') ? { group_id: qsp.get('group_id') } : {});
    const ownerName = ownerNameIn || qsp.get('name') || '';
    root.classList.add('ms-root');
    root.innerHTML = `
        <header class="ms-bar">
            <button type="button" class="ms-ib" data-a="back" aria-label="رجوع" title="رجوع">‹</button>
            <button type="button" class="ms-title" data-a="index" aria-label="فهرس السور"><b data-t="surah">الفاتحة</b><small data-t="juz">الجزء ١</small></button>
            <span class="ms-sp"></span>
            <div class="bv-tools ms-tools"></div>
            <button type="button" class="ms-ib" data-a="search" aria-label="ابحث في الآيات" title="ابحث في الآيات (/)"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg></button>
            <button type="button" class="ms-ib" data-a="mark" aria-label="علامة على الصفحة دي" title="علامة">🔖</button>
            <button type="button" class="ms-ib ms-hide-xs" data-a="index" aria-label="الفهرس" title="الفهرس">☰</button>
            <button type="button" class="ms-ib" data-a="settings" aria-label="الإعدادات" title="الإعدادات">⚙</button>
        </header>
        <div class="ms-mid">
            <main class="ms-stage" tabindex="0" aria-label="صفحات المصحف">
                <div class="ms-spread" data-spread></div>
            </main>
            <button type="button" class="ms-nav ms-next" data-a="next" aria-label="الصفحة اللي بعدها">‹</button>
            <button type="button" class="ms-nav ms-prev" data-a="prev" aria-label="الصفحة اللي قبلها">›</button>
        </div>
        <footer class="ms-foot">
            <button type="button" class="ms-ib" data-a="prev" aria-label="الصفحة اللي قبلها" title="اللي قبلها">›</button>
            <label class="ms-go"><span class="ms-hide-xs">صفحة</span> <input type="number" min="1" max="${TOTAL}" inputmode="numeric" data-go aria-label="رقم الصفحة"> <span>من ${ar(TOTAL)}</span></label>
            <button type="button" class="ms-ib" data-a="next" aria-label="الصفحة اللي بعدها" title="اللي بعدها">‹</button>
            <div class="ms-zoom" role="group" aria-label="تكبير الصفحة">
                <button type="button" class="ms-ib" data-a="zoom-out" aria-label="تصغير" title="تصغير (-)">−</button>
                <button type="button" class="ms-zl" data-a="zoom-reset" title="الحجم العادي (0)">١٠٠٪</button>
                <button type="button" class="ms-ib" data-a="zoom-in" aria-label="تكبير" title="تكبير (+) — أو Ctrl + عجلة الماوس، أو بصباعين">+</button>
            </div>
        </footer>
        <aside class="ms-drawer" data-drawer hidden>
            <div class="ms-dhead"><div class="ms-dtabs" role="tablist"><button type="button" class="on" data-dt="s">السور</button><button type="button" data-dt="j">الأجزاء</button><button type="button" data-dt="a">الآيات</button><button type="button" data-dt="m">العلامات</button></div>
                <button type="button" class="ms-ib" data-a="close-drawer" aria-label="قفل">✕</button></div>
            <input type="search" class="ms-dsearch" placeholder="ابحث عن سورة…" data-dsearch aria-label="ابحث عن سورة" autocomplete="off">
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
    let zoom = 1;
    let hlKey = null;
    let tools = null;

    const twoUp = () => window.innerWidth >= 1000 && window.innerWidth > window.innerHeight * 1.15 && !(tools && tools.dockOpen && window.innerWidth < 1180);
    const pagesFor = (p) => {
        if (!twoUp()) return [p];
        const right = p % 2 ? p : p - 1;
        return [right, right + 1].filter((x) => x >= 1 && x <= TOTAL);
    };

    function size() {
        const sr = stage.getBoundingClientRect();
        const availW = (sr.width || window.innerWidth) - 16;
        const H = Math.max(300, (sr.height || window.innerHeight - 112) - 16);
        const n = twoUp() ? 2 : 1;
        const gutter = n === 2 && window.innerWidth >= 1000 ? 112 : 8;
        const W = Math.max(200, Math.min((availW - gutter) / n, H * 0.66));
        const ph = Math.min(H, W / 0.66);
        root.style.setProperty('--pw', `${Math.floor(W * zoom)}px`);
        root.style.setProperty('--ph', `${Math.floor(ph * zoom)}px`);
        root.classList.toggle('ms-zoomed', zoom > 1.01);
    }
    const refitAll = () => spread.querySelectorAll('.ms-body.qcf').forEach(fit);

    function setZoom(z, silent) {
        zoom = Math.max(ZMIN, Math.min(ZMAX, Math.round((Number(z) || 1) * 100) / 100));
        V.zoom = zoom;
        $('.ms-zl').textContent = `${ar(Math.round(zoom * 100))}٪`;
        size();
        refitAll();
        if (!silent && zoom <= 1.01) { stage.scrollTop = 0; stage.scrollLeft = 0; }
    }
    const zoomStep = (dir) => {
        const z = dir > 0 ? zoom * 1.25 : zoom / 1.25;
        const r = stage.getBoundingClientRect();
        if (tools) tools.zoomAround(Math.max(ZMIN, Math.min(ZMAX, z)), r.left + r.width / 2, r.top + r.height / 2); else setZoom(z);
    };

    function header(p) {
        const s = surahOfPage(p);
        $('[data-t="surah"]').textContent = `سورة ${SURAHS[s - 1]}`;
        $('[data-t="juz"]').textContent = `الجزء ${ar(juzOfPage(p))} · صفحة ${ar(p)}`;
        $('[data-go]').value = p;
        $('[data-a="mark"]').classList.toggle('on', state.marks.includes(p));
    }

    function applyHighlight(scroll) {
        spread.querySelectorAll('.ms-hl').forEach((x) => x.classList.remove('ms-hl'));
        if (!hlKey) return;
        const els = spread.querySelectorAll(`[data-vk="${hlKey}"]`);
        els.forEach((x) => x.classList.add('ms-hl'));
        if (scroll && els[0] && zoom > 1.01) { try { els[0].scrollIntoView({ block: 'center', inline: 'center' }); } catch (e) { /* تجاهل */ } }
    }

    // ------------------------------------------------------------------ v41: تقليب ورق طبيعي
    // الورقة بتتلف حوالين كعب المصحف (زي الورق بالظبط): ضهرها بيبان وهي بتتقلب، وعليها ظل بيتغيّر مع اللفّة،
    // وظل خفيف على الصفحة اللي تحتها. على الموبايل الورقة بتمشي مع الصباع ولو سبتها قبل النص بترجع مكانها.
    const reduceMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    const FLIP_MS = 640;
    let flip = null;   // { wrap, anims, done, manual }
    const canFlip = () => !reduceMotion() && zoom <= 1.01 && typeof Element !== 'undefined' && !!Element.prototype.animate;
    function endFlip() {
        if (!flip) return;
        const f = flip; flip = null;
        try { f.anims.forEach((a) => a.cancel()); } catch (e) { /* تجاهل */ }
        f.wrap.remove();
        spread.classList.remove('ms-flipping');
    }
    /** نسخة من الصفحات اللي ظاهرة دلوقتي (قبل ما تتغيّر) بمكانها جوه الـ spread */
    function snapOld() {
        const sr = spread.getBoundingClientRect();
        return Array.from(spread.querySelectorAll('.ms-page')).map((el) => {
            const r = el.getBoundingClientRect();
            const c = el.cloneNode(true);
            c.querySelectorAll('.ms-hl').forEach((x) => x.classList.remove('ms-hl'));
            return { p: Number(el.dataset.p), el: c, x: r.left - sr.left, y: r.top - sr.top, w: r.width, h: r.height };
        });
    }
    const place = (el, b) => Object.assign(el.style, { left: `${b.x}px`, top: `${b.y}px`, width: `${b.w}px`, height: `${b.h}px` });
    const blankPaper = () => { const d = document.createElement('div'); d.className = 'ms-page ms-paper-back'; return d; };
    function face(cls, content) {
        const f = document.createElement('div');
        f.className = `ms-face ${cls}`;
        if (content) f.appendChild(content);
        const sh = document.createElement('i'); sh.className = 'ms-fshade'; f.appendChild(sh);
        return f;
    }
    /**
     * بيبني الورقة اللي بتتقلب. dir>0 = الصفحة اللي بعدها (الورقة بتتلف لليمين حوالين كعبها اليمين)،
     * dir<0 = اللي قبلها (عكسها). olds = نسخة الصفحات القديمة، والجديدة موجودة خلاص في الـ spread تحت.
     */
    function buildFlip(olds, dir, manual) {
        endFlip();
        const news = Array.from(spread.querySelectorAll('.ms-page'));
        if (!olds.length || !news.length) return null;
        const two = olds.length === 2 && news.length === 2;
        const wrap = document.createElement('div');
        wrap.className = 'ms-flipwrap';
        const leaf = document.createElement('div');
        leaf.className = 'ms-leaf';
        let leafBox, origin, from, to, front, back, under = null;
        const newClone = (i) => { const c = news[i].cloneNode(true); c.classList.add('ms-clone'); return c; };
        const sr = spread.getBoundingClientRect();
        const boxOf = (el) => { const r = el.getBoundingClientRect(); return { x: r.left - sr.left, y: r.top - sr.top, w: r.width, h: r.height }; };
        if (dir > 0) {
            if (two) {   // الصفحة الشمال بتتقلب على اليمين، وضهرها هو الصفحة اليمين الجديدة
                const L = olds[1], R = olds[0];
                under = R; leafBox = L; origin = 'right center'; from = 0; to = 180;
                front = L.el; back = newClone(0);
            } else {     // صفحة واحدة: بتتلف من حرفها الشمال لحد ما تختفي على اليمين
                const O = olds[0];
                leafBox = O; origin = 'right center'; from = 0; to = 180;
                front = O.el; back = blankPaper();
            }
        } else {
            if (two) {   // الصفحة اليمين بترجع على الشمال، وضهرها هو الصفحة الشمال الجديدة
                const L = olds[1], R = olds[0];
                under = L; leafBox = R; origin = 'left center'; from = 0; to = -180;
                front = R.el; back = newClone(1);
            } else {     // صفحة واحدة: الصفحة اللي قبلها بتيجي من اليمين وتنزل فوق
                const O = olds[0];
                under = O; leafBox = boxOf(news[0]); origin = 'right center'; from = 180; to = 0;
                front = newClone(0); back = blankPaper();
            }
        }
        if (under) { const u = under.el; u.classList.add('ms-under'); place(u, under); wrap.appendChild(u); }
        place(leaf, leafBox);
        leaf.style.transformOrigin = origin;
        leaf.dataset.o = origin.startsWith('right') ? 'r' : 'l';
        wrap.classList.toggle('two', two);
        const ff = face('ms-front', front);
        const bf = face('ms-back', back);
        leaf.appendChild(ff); leaf.appendChild(bf);
        // ظل الورقة على الصفحة اللي تحتها (ناحية الكعب)
        const cast = document.createElement('i');
        cast.className = `ms-cast ${(dir > 0) ? 'to-r' : 'to-l'}`;
        place(cast, two ? { x: 0, y: leafBox.y, w: sr.width, h: leafBox.h } : leafBox);
        wrap.appendChild(cast);
        wrap.appendChild(leaf);
        spread.appendChild(wrap);
        spread.classList.add('ms-flipping');
        const ease = manual ? 'linear' : 'cubic-bezier(.35,.05,.25,1)';
        const opts = { duration: FLIP_MS, easing: ease, fill: 'both' };
        const mid = (from + to) / 2;
        // صفحة واحدة: النص التاني من اللفّة بيبقى برّه الصفحة، فبنخلّي الجزء اللي باين (لحد ٩٠°) ياخد معظم الوقت
        const mo = two ? 0.5 : (from === 0 ? 0.68 : 0.32);
        const persp = two ? 2400 : 1600;
        const anims = [
            leaf.animate([
                { transform: `perspective(${persp}px) rotateY(${from}deg)` },
                { transform: `perspective(${persp}px) rotateY(${mid}deg) scale(1.012)`, offset: mo },
                { transform: `perspective(${persp}px) rotateY(${to}deg)` }
            ], opts),
            ff.querySelector('.ms-fshade').animate(from === 0 ? [{ opacity: 0 }, { opacity: 0.6, offset: mo }, { opacity: 0.6 }] : [{ opacity: 0.6 }, { opacity: 0.6, offset: mo }, { opacity: 0 }], opts),
            bf.querySelector('.ms-fshade').animate([{ opacity: 0.55 }, { opacity: 0.4, offset: mo }, { opacity: 0 }], opts),
            cast.animate([{ opacity: 0 }, { opacity: 1, offset: mo }, { opacity: 0 }], opts)
        ];
        const f = { wrap, anims, manual, back: bf, two, dir };
        f.done = Promise.all(anims.map((a) => a.finished)).catch(() => {});
        if (manual) anims.forEach((a) => a.pause());
        flip = f;
        return f;
    }
    /** بعد ما الصفحات الجديدة تتحمّل: نسخها اللي على الورقة (وش أو ضهر) تاخد المحتوى الحقيقي بدل علامة التحميل */
    function refreshFlipBack() {
        if (!flip) return;
        flip.wrap.querySelectorAll('.ms-clone[data-p]').forEach((cl) => {
            const src = spread.querySelector(`:scope > .ms-page[data-p="${cl.dataset.p}"]`);
            if (src) { const c = src.cloneNode(true); c.classList.add('ms-clone'); cl.replaceWith(c); }
        });
    }

    async function show(p, dir = 0, { hl = null, manual = false } = {}) {
        p = Math.max(1, Math.min(TOTAL, Number(p) || 1));
        if (hl !== null) hlKey = hl || null;
        else if (!pagesFor(p).includes(state.page)) hlKey = null;
        state.page = p; save();
        header(p);
        const my = ++token;
        const list = pagesFor(p);
        if (tools) { try { tools.ctrl.flush(); } catch (e) { /* تجاهل */ } }
        endFlip();
        const olds = dir && canFlip() ? snapOld() : null;
        spread.innerHTML = list.map((n) => `<article class="ms-page ${n % 2 ? 'odd' : 'even'}" data-p="${n}"><div class="ms-frame"><div class="ms-body"><div class="ms-load"><span class="ms-spin"></span></div></div><div class="ms-pno">${ar(n)}</div></div></article>`).join('');
        stage.scrollTop = 0;
        if (tools) tools.onRender();
        let f = null;
        if (olds) {
            // بنستنى المحتوى الجديد شوية (عادة متحمّل مسبقًا) عشان ضهر الورقة يبان مكتوب
            f = buildFlip(olds, dir, manual);
            if (f && !manual) f.anims.forEach((a) => a.pause());
        }
        const loaded = Promise.all(list.map(async (n) => {
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
        if (f && !manual) {
            await Promise.race([loaded, new Promise((r) => setTimeout(r, 380))]);
            if (flip === f) { refreshFlipBack(); f.anims.forEach((a) => a.play()); f.done.then(() => { if (flip === f) endFlip(); }); }
        }
        await loaded;
        if (flip && flip === f) refreshFlipBack();
        if (my === token) applyHighlight(true);
        // تحميل اللي جاي مسبقًا
        const nxt = list[list.length - 1] + 1;
        [nxt, nxt + 1, list[0] - 1].filter((x) => x >= 1 && x <= TOTAL).forEach((x) => loadPage(x).catch(() => {}));
        try { window.tmTrack && window.tmTrack('mushaf_page', { page: p }); } catch (e) { /* تجاهل */ }
    }

    const step = () => (twoUp() ? 2 : 1);
    /** الصفحة اللي هنروحلها في اتجاه معيّن (أو null لو مفيش) */
    const targetOf = (dir) => { const l = pagesFor(state.page); if (dir > 0) return l[l.length - 1] < TOTAL ? l[l.length - 1] + 1 : null; return l[0] > 1 ? Math.max(1, l[0] - step()) : null; };
    const next = () => { const l = pagesFor(state.page); if (l[l.length - 1] < TOTAL) show(l[l.length - 1] + 1, 1); };
    const prev = () => { const l = pagesFor(state.page); if (l[0] > 1) show(Math.max(1, l[0] - step()), -1); };
    async function goAyah(s, a) {
        const p = await pageOfAyah(s, a);
        await show(p, 0, { hl: `${s}:${a}` });
    }

    // ------------------------------------------------------------------ الفهرس + البحث
    let dtab = 's';
    let searchTimer = null;
    let searchSeq = 0;
    const PH = { s: 'ابحث عن سورة… (أو اكتب: البقرة ٢٥٥)', a: 'كلمة من الآية، أو: البقرة ٢٥٥، أو ٢:٢٥٥' };
    function renderDrawer() {
        const inp = $('[data-dsearch]');
        const q = String(inp.value || '').trim();
        inp.hidden = !(dtab === 's' || dtab === 'a');
        inp.placeholder = PH[dtab] || '';
        inp.setAttribute('aria-label', PH[dtab] || 'بحث');
        root.querySelectorAll('[data-dt]').forEach((b) => { b.classList.toggle('on', b.dataset.dt === dtab); b.setAttribute('aria-selected', b.dataset.dt === dtab ? 'true' : 'false'); });
        const listEl = $('[data-dlist]');
        if (dtab === 'a') { renderAyahSearch(q); return; }
        let html = '';
        if (dtab === 's') {
            const ref = q ? parseRef(q) : null;
            if (ref) html += `<button type="button" class="ms-di ms-ref" data-ayah="${ref.s}:${ref.a}"><span class="ms-dn">↵</span><span class="ms-dt">روح لـ سورة ${esc(SURAHS[ref.s - 1])} — آية ${ar(ref.a)}</span></button>`;
            const nq = normQ(q).replace(/^سوره\s+/, '');
            html += SURAHS.map((n, i) => ({ n, i })).filter((x) => !nq || surahNorm[x.i].includes(nq) || surahNorm[x.i].replace(/^ال/, '').startsWith(nq) || String(x.i + 1) === toEnDigits(q))
                .map((x) => `<button type="button" class="ms-di ${surahOfPage(state.page) === x.i + 1 ? 'on' : ''}" data-page="${SURAH_PAGE[x.i]}"><span class="ms-dn">${ar(x.i + 1)}</span><span class="ms-dt">سورة ${esc(x.n)} <small>${ar(AYAH_COUNT[x.i])} آية</small></span><small>ص ${ar(SURAH_PAGE[x.i])}</small></button>`).join('');
            if (!html) html = `<p class="ms-empty">مفيش سورة بالاسم ده.<br><button type="button" class="ms-linkbtn" data-dt="a">دوّر على «${esc(q)}» في الآيات</button></p>`;
        } else if (dtab === 'j') {
            html = JUZ_PAGE.map((p, i) => `<button type="button" class="ms-di ${juzOfPage(state.page) === i + 1 ? 'on' : ''}" data-page="${p}"><span class="ms-dn">${ar(i + 1)}</span><span class="ms-dt">الجزء ${ar(i + 1)} <small>(${JUZ_NAMES[i]})</small></span><small>ص ${ar(p)}</small></button>`).join('');
        } else {
            html = state.marks.length ? state.marks.slice().sort((a, b) => a - b).map((p) => `<button type="button" class="ms-di" data-page="${p}"><span class="ms-dn">🔖</span><span class="ms-dt">سورة ${esc(SURAHS[surahOfPage(p) - 1])}</span><small>ص ${ar(p)}</small></button>`).join('')
                : '<p class="ms-empty">لسه مفيش علامات. اضغط 🔖 فوق عشان تعلّم على الصفحة.</p>';
        }
        listEl.innerHTML = html;
        const on = listEl.querySelector('.on'); if (on && !q) on.scrollIntoView({ block: 'center' });
    }
    function renderAyahSearch(q) {
        const listEl = $('[data-dlist]');
        const my = ++searchSeq;
        const ref = q ? parseRef(q) : null;
        const refHtml = ref ? `<button type="button" class="ms-di ms-ref" data-ayah="${ref.s}:${ref.a}"><span class="ms-dn">↵</span><span class="ms-dt">روح لـ سورة ${esc(SURAHS[ref.s - 1])} — آية ${ar(ref.a)}</span></button>` : '';
        const words = /^[\d\s:：/\-.،]+$/.test(toEnDigits(q)) ? [] : normQ(q).split(' ').filter((w) => w.length >= 2 && !/^\d+$/.test(w));
        if (!words.length) {
            listEl.innerHTML = refHtml + (ref ? '' : '<p class="ms-empty">اكتب كلمة أو أكتر من الآية (من غير تشكيل)، أو اسم السورة ورقم الآية زي «البقرة ٢٥٥».<br>الضغط على النتيجة بيفتح الصفحة ويلوّن الآية.</p>');
            return;
        }
        // النتايج القديمة بتتشال فورًا (Enter بعد الكتابة على طول كان بيفتح نتيجة البحث اللي قبله)
        listEl.innerHTML = refHtml + (quranIdx ? '<p class="ms-empty ms-more">…</p>' : '<div class="ms-load ms-load-sm"><span class="ms-spin"></span><p>بنجهّز البحث في القرآن (مرة واحدة بس)…</p></div>');
        clearTimeout(searchTimer);
        searchTimer = setTimeout(async () => {
            let items = null; let api = false;
            try {
                const idx = await loadQuranIndex();
                items = [];
                for (const it of idx) { if (words.every((w) => it.n.includes(w))) { items.push(it); if (items.length >= 80) break; } }
            } catch (e) {
                // الملف الكبير ماتحمّلش: بحث سريع من الخادم
                try {
                    const j = await fetchJson(`${SEARCH_API}/${encodeURIComponent(q)}/all/quran-simple-clean`, 15000);
                    api = true;
                    items = ((j && j.data && j.data.matches) || []).slice(0, 80).map((m) => { const n = normAr(m.text); return { s: m.surah && m.surah.number, a: m.numberInSurah, p: null, t: m.text, n: n.s, map: n.map }; });
                } catch (er) { items = null; }
            }
            if (my !== searchSeq || dtab !== 'a') return;
            if (!items) { listEl.innerHTML = refHtml + '<div class="ms-empty">البحث محتاج نت أول مرة.<br><button type="button" class="ms-btn" data-research>جرّب تاني</button></div>'; return; }
            const more = items.length >= 80 ? '<p class="ms-empty ms-more">بنعرض أول ٨٠ نتيجة. زوّد كلمة عشان تقرّب البحث.</p>' : '';
            listEl.innerHTML = refHtml + (items.length ? `<p class="ms-count">${ar(items.length)}${items.length >= 80 ? '+' : ''} نتيجة</p>` + items.map((it) => `<button type="button" class="ms-di ms-ayr" data-ayah="${it.s}:${it.a}" ${it.p ? `data-ap="${it.p}"` : ''}><span class="ms-ayt">${markText(it, words)}</span><small>سورة ${esc(SURAHS[it.s - 1] || '')} · آية ${ar(it.a)}${it.p ? ` · ص ${ar(it.p)}` : ''}</small></button>`).join('') + more
                : (ref ? '' : '<p class="ms-empty">مفيش آية فيها الكلام ده. جرّب كلمة تانية أو من غير «ال».</p>'));
            if (api) listEl.insertAdjacentHTML('beforeend', '<p class="ms-empty ms-more">نتايج من الخادم (البحث الكامل هيشتغل لما النت يكون أحسن)</p>');
        }, quranIdx ? 120 : 30);
    }
    const openDrawer = (tab) => {
        if (tab && tab !== dtab) { dtab = tab; $('[data-dsearch]').value = ''; }
        $('[data-drawer]').hidden = false;
        $('[data-pop]').hidden = true;
        renderDrawer();
        if ((dtab === 'a' || dtab === 's') && window.matchMedia('(min-width: 700px)').matches) { try { $('[data-dsearch]').focus({ preventScroll: true }); } catch (e) { /* تجاهل */ } }
        if (dtab === 'a') loadQuranIndex().then(() => { if (!$('[data-drawer]').hidden && dtab === 'a') renderDrawer(); }).catch(() => {});
    };
    const closeDrawer = () => { $('[data-drawer]').hidden = true; stage.focus({ preventScroll: true }); };

    // ------------------------------------------------------------------ أدوات الشرح (نفس أدوات الكتب)
    const V = {
        root, stage, owner, ownerName, mode: 'original', closed: false, zoom: 1,
        book: { id: 'mushaf', title: 'المصحف الشريف', file_type: 'mushaf' },
        get page() { return state.page; },
        // الرسم على المصحف بيتحفظ على الجهاز ده (لكل طالب/مجموعة لوحده)
        api: { boardList: async () => { throw { error: { code: 'LOCAL' } }; }, boardSave: async () => ({ ok: true }) },
        adapter: { pageEls: () => { const arr = []; spread.querySelectorAll('.ms-page').forEach((el) => { arr[Number(el.dataset.p) - 1] = el; }); return arr; } },
        toolsConfig: { draw: true, magnifier: false, tools: MS_TOOLS, dockKey: 'tm_ms_dock_v1' },
        setZoom: (z, silent) => setZoom(z, silent),
        initialNight: !!state.night,
        onNight: (on) => { state.night = !!on; save(); root.classList.toggle('ms-night', state.night); },
        snipRegion: (box) => snipRegion(box),
        _onResize: () => { size(); refitAll(); }
    };

    /** قص آيات للسبورة: بنرسم الكلمات اللي جوه المستطيل بنفس خط المصحف على صورة */
    async function snipRegion(box) {
        const inBox = (r) => { const cx = r.left + r.width / 2, cy = r.top + r.height / 2; return cx >= box.left && cx <= box.left + box.width && cy >= box.top && cy <= box.top + box.height; };
        const els = Array.from(spread.querySelectorAll('.ms-body.qcf .ms-w, .ms-body.qcf .ms-hframe > span')).filter((el) => inBox(el.getBoundingClientRect()));
        if (!els.length) return null;
        const rs = els.map((el) => el.getBoundingClientRect());
        const u = { l: Math.min(...rs.map((r) => r.left)), t: Math.min(...rs.map((r) => r.top)), r: Math.max(...rs.map((r) => r.right)), b: Math.max(...rs.map((r) => r.bottom)) };
        const pad = 14;
        const w0 = u.r - u.l + pad * 2, h0 = u.b - u.t + pad * 2;
        const k = Math.max(1, Math.min(4, 1400 / w0));
        const c = document.createElement('canvas');
        c.width = Math.round(w0 * k); c.height = Math.round(h0 * k);
        const ctx = c.getContext('2d');
        const paper = getComputedStyle(root).getPropertyValue('--ms-paper').trim() || '#FFFBF0';
        ctx.fillStyle = state.night ? '#FFFBF0' : paper;
        ctx.fillRect(0, 0, c.width, c.height);
        try { await document.fonts.ready; } catch (e) { /* تجاهل */ }
        els.forEach((el, i) => {
            const r = rs[i];
            const cs = getComputedStyle(el);
            const fs = parseFloat(cs.fontSize) * k;
            ctx.font = `${fs}px ${cs.fontFamily}`;
            ctx.fillStyle = el.classList.contains('ms-end') ? '#8A6A1E' : (el.closest('.ms-hframe') ? '#1F4D3A' : '#1B1B1B');
            ctx.textAlign = 'center';
            ctx.direction = 'rtl';
            const m = ctx.measureText(el.textContent);
            const asc = m.fontBoundingBoxAscent, desc = m.fontBoundingBoxDescent;
            const cx = (r.left + r.width / 2 - u.l + pad) * k;
            if (asc != null && desc != null) {
                ctx.textBaseline = 'alphabetic';
                const top = (r.top - u.t + pad) * k;
                const h = r.height * k;
                ctx.fillText(el.textContent, cx, top + (h - (asc + desc)) / 2 + asc);
            } else {
                ctx.textBaseline = 'middle';
                ctx.fillText(el.textContent, cx, (r.top + r.height / 2 - u.t + pad) * k);
            }
        });
        return { src: c.toDataURL('image/png'), w: c.width, h: c.height };
    }

    // ------------------------------------------------------------------ الأحداث
    root.addEventListener('click', (e) => {
        const a = e.target.closest('[data-a]');
        const pg = e.target.closest('[data-page]');
        const ay = e.target.closest('[data-ayah]');
        const r = e.target.closest('[data-retry]');
        if (e.target.closest('[data-research]')) { renderDrawer(); return; }
        if (r) { pageCache.delete(`${state.mode}:${r.dataset.retry}`); show(state.page); return; }
        if (ay) {
            const [s, n] = ay.dataset.ayah.split(':').map(Number);
            closeDrawer();
            if (ay.dataset.ap) show(Number(ay.dataset.ap), 0, { hl: `${s}:${n}` }); else goAyah(s, n);
            return;
        }
        if (pg) { closeDrawer(); show(Number(pg.dataset.page), 0, { hl: '' }); return; }
        const dt = e.target.closest('[data-dt]');
        if (dt) {
            const keep = dt.classList.contains('ms-linkbtn') ? $('[data-dsearch]').value : '';
            if (dt.dataset.dt !== dtab) { dtab = dt.dataset.dt; $('[data-dsearch]').value = keep; }
            renderDrawer();
            if (dtab === 'a') loadQuranIndex().then(() => { if (dtab === 'a' && !$('[data-drawer]').hidden) renderDrawer(); }).catch(() => {});
            return;
        }
        if (!a) { if (!e.target.closest('[data-pop]')) $('[data-pop]').hidden = true; return; }
        const act = a.dataset.a;
        if (act === 'next') next();
        else if (act === 'prev') prev();
        else if (act === 'index') openDrawer(dtab === 'a' ? 's' : dtab);
        else if (act === 'search') openDrawer('a');
        else if (act === 'close-drawer') closeDrawer();
        else if (act === 'zoom-in') zoomStep(1);
        else if (act === 'zoom-out') zoomStep(-1);
        else if (act === 'zoom-reset') setZoom(1);
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
        if (e.target.matches('[data-night]')) { V.onNight(e.target.checked); if (tools) { tools.night = state.night; tools.dock.refresh(); } }
    });
    $('[data-dsearch]').addEventListener('input', renderDrawer);
    $('[data-dsearch]').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { const first = $('[data-dlist] [data-ayah], [data-dlist] [data-page]'); if (first) { e.preventDefault(); first.click(); } }
    });
    const go = $('[data-go]');
    go.addEventListener('change', () => show(go.value, 0, { hl: '' }));
    go.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); show(go.value, 0, { hl: '' }); go.blur(); } });

    // الكيبورد: في المصحف العربي "اللي بعده" ناحية الشمال (على الصفحة كلها، مش لما المصحف عليه الـ focus بس)
    document.addEventListener('keydown', (e) => {
        if (isWhiteboardOpen()) return;
        const typing = e.target && e.target.matches && e.target.matches('input, textarea, [contenteditable="true"], [contenteditable=""]');
        if (!$('[data-drawer]').hidden) { if (e.key === 'Escape') { e.preventDefault(); closeDrawer(); } return; }
        if (typing) return;
        if (tools && tools.onKey(e)) return;
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        if (e.key === 'ArrowLeft' || e.key === 'PageDown' || e.key === ' ') { e.preventDefault(); next(); }
        else if (e.key === 'ArrowRight' || e.key === 'PageUp') { e.preventDefault(); prev(); }
        else if (e.key === 'Home') { e.preventDefault(); show(1, -1, { hl: '' }); }
        else if (e.key === 'End') { e.preventDefault(); show(TOTAL, 1, { hl: '' }); }
        else if (e.key === '+' || e.key === '=') { e.preventDefault(); zoomStep(1); }
        else if (e.key === '-') { e.preventDefault(); zoomStep(-1); }
        else if (e.code === 'Digit0' || e.code === 'Numpad0') { e.preventDefault(); setZoom(1); }
        else if (e.key === '/' || e.code === 'Slash') { e.preventDefault(); openDrawer('a'); }
        else if (e.code === 'KeyG') { e.preventDefault(); go.focus(); go.select(); }
        else if (e.code === 'KeyI') { e.preventDefault(); openDrawer('s'); }
        else if (e.key === 'Escape') { $('[data-pop]').hidden = true; if (zoom > 1.01) setZoom(1); else if (hlKey) { hlKey = null; applyHighlight(); } }
    });
    // ضغطتين على الصفحة: تكبير ×٢ مكانها (وضغطتين تاني ترجّع الحجم العادي)
    stage.addEventListener('dblclick', (e) => {
        if (tools && tools.ctrl.tool) return;
        if (zoom > 1.01) setZoom(1); else if (tools) tools.zoomAround(2, e.clientX, e.clientY); else setZoom(2);
    });
    // السحب: من اليمين للشمال = الصفحة اللي بعدها (زي تقليب المصحف) — ومع التكبير أو الرسم السحب بيحرّك الصفحة بس
    let sx = 0, sy = 0, st = 0, pinch = null, multi = false;
    const dist = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    // الورقة بتمشي مع الصباع: من اليمين للشمال = اللي بعدها، والعكس = اللي قبلها
    let drag = null;   // { dir, from, f, w }
    stage.addEventListener('touchstart', (e) => {
        if (e.touches.length === 2) { multi = true; pinch = { d: dist(e.touches), z: zoom }; if (drag) cancelDrag(); return; }
        if (e.touches.length === 1) { multi = false; const t = e.touches[0]; sx = t.clientX; sy = t.clientY; st = Date.now(); }
    }, { passive: true });
    function cancelDrag() {
        const d = drag; drag = null;
        if (!d || !d.f) return;
        d.f.anims.forEach((a) => { a.playbackRate = -1.6; a.play(); });
        d.f.done.then(() => { if (flip === d.f) { endFlip(); show(d.from, 0); } });
    }
    stage.addEventListener('touchmove', (e) => {
        if (pinch || multi || e.touches.length !== 1 || zoom > 1.01 || (tools && tools.ctrl.tool) || !canFlip()) return;
        const t = e.touches[0];
        const dx = t.clientX - sx, dy = t.clientY - sy;
        if (!drag) {
            if (Math.abs(dx) < 14 || Math.abs(dx) < Math.abs(dy) * 1.3) return;
            const dir = dx > 0 ? 1 : -1;
            const target = targetOf(dir);
            if (!target) return;
            drag = { dir, from: state.page, f: null, w: Math.max(200, spread.getBoundingClientRect().width * (twoUp() ? 0.5 : 1)) };
            show(target, dir, { manual: true });
            drag.f = flip;
        }
        if (drag && drag.f) {
            const prog = Math.max(0.02, Math.min(0.98, (drag.dir > 0 ? dx : -dx) / (drag.w * 1.15)));
            drag.f.anims.forEach((a) => { a.currentTime = prog * FLIP_MS; });
            drag.prog = prog;
        }
    }, { passive: true });
    let pinchRaf = 0;
    stage.addEventListener('touchmove', (e) => {
        if (!pinch || e.touches.length !== 2) return;
        e.preventDefault();
        const z = Math.max(ZMIN, Math.min(ZMAX, pinch.z * (dist(e.touches) / Math.max(1, pinch.d))));
        const cx = (e.touches[0].clientX + e.touches[1].clientX) / 2, cy = (e.touches[0].clientY + e.touches[1].clientY) / 2;
        cancelAnimationFrame(pinchRaf);
        pinchRaf = requestAnimationFrame(() => { if (tools) tools.zoomAround(z, cx, cy); else setZoom(z); });
    }, { passive: false });
    stage.addEventListener('touchend', (e) => {
        if (pinch) { if (e.touches.length < 2) pinch = null; return; }
        if (drag) {
            const d = drag;
            const t = e.changedTouches[0];
            const fast = Date.now() - st < 350 && Math.abs(t.clientX - sx) > 40;
            if (!d.f) { drag = null; return; }
            if ((d.prog || 0) > 0.33 || fast) {
                drag = null;
                d.f.anims.forEach((a) => { a.playbackRate = 1.4; a.play(); });
                d.f.done.then(() => { if (flip === d.f) endFlip(); });
            } else cancelDrag();
            return;
        }
        if (multi || zoom > 1.01 || (tools && tools.ctrl.tool)) return;
        const t = e.changedTouches[0];
        const dx = t.clientX - sx, dy = t.clientY - sy;
        if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.4 && Date.now() - st < 800) { if (dx > 0) next(); else prev(); }
    }, { passive: true });

    let rz = null;
    let lastTwo = twoUp();
    window.addEventListener('resize', () => {
        clearTimeout(rz);
        rz = setTimeout(() => { size(); const two = twoUp(); if (two !== lastTwo) { lastTwo = two; show(state.page); } else refitAll(); }, 150);
    });
    root.classList.toggle('ms-night', !!state.night);

    // أدوات الشرح: الزرار في الشريط الأخضر، والأدوات عمود جنب المصحف (أو شريط تحت على الموبايل)
    try {
        tools = new PresentTools(V);
        V.tools = tools;
        $('.ms-mid').insertBefore(tools.wrap, stage);
        const origSetDock = tools.setDock.bind(tools);
        tools.setDock = (open) => { origSetDock(open); requestAnimationFrame(() => { size(); const two = twoUp(); if (two !== lastTwo) { lastTwo = two; show(state.page); } else refitAll(); }); };
    } catch (e) { console.warn('[mushaf] tools', e); tools = null; }

    size();
    lastTwo = twoUp();
    const qp = Number(qsp.get('page'));
    const qs = Number(qsp.get('surah'));
    const qa = Number(qsp.get('ayah'));
    if (qs >= 1 && qs <= 114 && qa >= 1) goAyah(qs, qa);
    else show(qs >= 1 && qs <= 114 ? SURAH_PAGE[qs - 1] : (qp || state.page || 1));
    stage.focus({ preventScroll: true });
    return { show, next, prev, goAyah, setZoom, get zoom() { return zoom; }, get page() { return state.page; }, get tools() { return tools; } };
}
