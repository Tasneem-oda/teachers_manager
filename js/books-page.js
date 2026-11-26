/**
 * books-page.js - منطق صفحة "📚 مكتبتي"
 *   v35: إعادة تصميم كاملة — المكتبة بقت زي فولدرات الكمبيوتر:
 *        • فولدرات جوه فولدرات (لما السيرفر يدعمها) + مسار فوق (مكتبتي › التجويد › التحفة) + رجوع للي فوق
 *        • شجرة الفولدرات على الجنب (كمبيوتر)، وعرض شبكة أو قائمة، وترتيب بالاسم/الأحدث/النوع
 *        • سحب وإفلات: كتاب/فولدر على فولدر أو على المسار، وملف من الكمبيوتر يترفع في الفولدر المفتوح
 *        • كليك يمين (أو ضغطة طويلة على الموبايل) = قايمة الخيارات، وتحديد أكتر من حاجة ونقلها/حذفها مرة واحدة
 *        • كيبورد: Enter فتح، F2 تغيير الاسم، Delete حذف، Backspace رجوع، Ctrl+A تحديد الكل
 *        • المصحف الشريف ثابت في أول المكتبة (mushaf.html) + الكتب الجديدة ممكن تترفع على جوجل درايف المدرس
 *   - الضغط على الكتاب بيفتحه كاملًا بصيغته الأصلية (book-viewer.js)
 *   - رفع كتاب جديد ومعالجته في المتصفح مع نسبة تقدّم حقيقية، إعادة المعالجة، إدارة الوصول، و"اسأل كتبك"
 */

import { CONFIG } from './config.js?v=59';
import { Auth } from './auth.js?v=59';
import { renderSidebar, renderTopHeader } from './sidebar.js?v=59';
import { icon } from './icons.js?v=59';
import { api } from './api.js?v=59';
import { ErrorHandler, Formatters } from './utils.js?v=59';
import { detectFileType, processBook } from './book-processor.js?v=59';
import { openBookViewer } from './book-viewer.js?v=59';
import { renderMarkdown, extractCitationNumbers } from './md-lite.js?v=59';
import { CATS, catOf, guessCategory, FOLDER_COLORS, folderColor, FOLDER_ICONS, FOLDER_SUGGESTIONS } from './lib-meta.js?v=59';
import * as Drive from './gdrive.js?v=59';
import { track } from './track.js?v=59';

const $ = (id) => document.getElementById(id);
const esc = (s) => Formatters.escapeHtml(String(s == null ? '' : s));

const TYPE_LABEL = { pdf: 'PDF', docx: 'Word', pptx: 'PowerPoint', txt: 'نص', image: 'صورة' };
const STATUS_LABELS = {
    uploading: 'جاري الرفع...',
    processing: 'جارِ التحليل...',
    ready: 'جاهز ✓',
    failed: 'تعذّر التحليل',
    stalled: 'المعالجة توقفت'
};
const PREF_KEY = 'tm_lib_prefs_v2';
// ألوان الفولدر (فاتح/غامق) لشكل فولدر الكمبيوتر
const FOLDER_SHADES = { violet: ['#DCCDEB', '#B9A2D2'], green: ['#C9E8D5', '#8FCAA6'], blue: ['#CFE0F5', '#93B8E6'], orange: ['#F9D9BE', '#EDAE7A'], pink: ['#F7CDDB', '#E594B0'], gold: ['#F6E3A8', '#E2C060'], teal: ['#C6EAE5', '#82CBC1'], gray: ['#DDE1E5', '#B3BAC2'] };
const shade = (c) => FOLDER_SHADES[c] || FOLDER_SHADES.violet;

export function initBooksPage() {
    renderSidebar('books');
    renderTopHeader({ title: 'مكتبتي', subtitle: 'كتبك وملفاتك في فولدرات زي الكمبيوتر، والمصحف، والمكتبة العامة', showSearch: false });
    $('ic-add-source').innerHTML = icon('plus', { size: 16 });
    $('ic-search').innerHTML = icon('search', { size: 16 });
    $('ic-ask').innerHTML = icon('sparkles', { size: 17 });
    $('fx-up').innerHTML = icon('chevronRight', { size: 18 });
    $('btn-select').innerHTML = icon('check', { size: 18 });

    let books = [];
    let folders = [];
    let pubMap = {};          // source_book_id → {id, status, note}
    let sharedPaths = [];     // ملفات منشورة للعامة: مانمسحهاش من التخزين لو المدرس مسح الكتاب
    let hubOk = true;         // workflow app-hub متفعّل؟ (لو لأ: المكتبة بتشتغل زي الأول من غير فولدرات)
    let features = [];        // v35: مزايا السيرفر (nesting = فولدرات جوه فولدرات، book_storage = جوجل درايف)
    let allStudents = [];
    let pollTimer = null;
    let accessModalBookId = null;
    const active = new Map();      // bookId -> { ctl, percent, message, stage }
    let viewer = null;
    let selecting = false;
    const selected = new Set();    // "b:<id>" أو "f:<id>"
    let pubBooks = null;
    let pubCat = '';
    let loaded = false;

    const prefs = (() => { try { return JSON.parse(localStorage.getItem(PREF_KEY) || '{}') || {}; } catch (e) { return {}; } })();
    const savePrefs = () => { try { localStorage.setItem(PREF_KEY, JSON.stringify(prefs)); } catch (e) { /* تجاهل */ } };
    // مكانك: فولدر (null = أول المكتبة) أو مكان خاص (pinned | recent)
    let loc = prefs.loc || { f: null };
    let query = '';
    let layout = prefs.layout || 'grid';
    $('lib-sort').value = prefs.sort || 'name';
    const expanded = new Set(prefs.expanded || []);

    document.querySelectorAll('.close-modal').forEach((btn) => {
        btn.addEventListener('click', (e) => {
            const modal = e.target.closest('.modal');
            if (modal) modal.classList.remove('active');
        });
    });

    // ------------------------------------------------------------------ مساعدات
    const nesting = () => features.includes('nesting');
    const driveReady = () => Drive.driveAvailable() && features.includes('book_storage');
    const typeLabel = (b) => TYPE_LABEL[b.file_type] || b.file_type;
    const bookCat = (b) => b.category || guessCategory(b.title) || 'other';
    const folderById = (id) => folders.find((f) => f.id === id) || null;
    const parentOf = (f) => (nesting() && f && f.parent_id && folderById(f.parent_id) ? f.parent_id : null);
    const kidsOf = (id) => folders.filter((f) => parentOf(f) === (id || null));
    const booksIn = (id) => books.filter((b) => (b.folder_id && folderById(b.folder_id) ? b.folder_id : null) === (id || null));
    const isShared = (b) => !!b.public_book_id || sharedPaths.includes(b.storage_path);
    const pathOf = (id) => { const out = []; let f = folderById(id); let guard = 0; while (f && guard++ < 30) { out.unshift(f); f = folderById(parentOf(f)); } return out; };
    const descendants = (id) => { const out = []; const walk = (x) => kidsOf(x).forEach((k) => { out.push(k.id); walk(k.id); }); walk(id); return out; };
    const countDeep = (id) => booksIn(id).length + descendants(id).reduce((n, d) => n + booksIn(d).length, 0);
    const goTo = (l) => { loc = l; prefs.loc = l; savePrefs(); selected.clear(); renderAll(); window.scrollTo({ top: 0, behavior: 'smooth' }); };
    const inFolder = () => !loc.s;
    const curFolder = () => (loc.s ? null : (loc.f && folderById(loc.f) ? loc.f : null));

    function effectiveStatus(b) {
        if (active.has(b.id)) return 'processing';
        if ((b.status === 'processing' || b.status === 'uploading') && b.updated_at) {
            const mins = (Date.now() - Date.parse(b.updated_at)) / 60000;
            const limit = b.status === 'uploading' ? 5 : CONFIG.BOOKS_SETTINGS.STALE_PROCESSING_MINUTES;
            if (mins > limit) return 'stalled';
        }
        return b.status;
    }

    function progressHtml(b, live) {
        const pct = live ? live.percent : (b.progress || 0);
        const msg = live ? live.message : (b.status === 'uploading' ? 'جاري رفع الملف...' : 'بيتعالج في نافذة تانية...');
        return `
            <div class="book-progress" data-progress-for="${b.id}">
                <div class="book-progress-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><i style="width:${pct}%"></i></div>
                <div class="book-progress-text">${esc(msg)} ${pct ? `(${pct}%)` : ''}</div>
                ${live ? `<button type="button" class="fx-mini" data-action="cancel" title="إيقاف التحليل" aria-label="إيقاف التحليل">✕</button>` : ''}
            </div>`;
    }

    // ------------------------------------------------------------------ الجنب: اختصارات + شجرة
    function renderSide() {
        const side = $('fx-side');
        const nav = (l, ic, label, n, extra = '') => {
            const on = (l.s && loc.s === l.s) || (!l.s && !loc.s && (l.f || null) === curFolder());
            return `<button type="button" class="fx-nav ${on ? 'is-on' : ''}" data-go='${JSON.stringify(l)}' ${extra}><span class="fx-fi">${ic}</span><span>${esc(label)}</span>${n != null ? `<span class="n">${n}</span>` : ''}</button>`;
        };
        const node = (f) => {
            const kids = kidsOf(f.id);
            const open = expanded.has(f.id);
            const on = !loc.s && curFolder() === f.id;
            return `<div class="fx-node" data-drop-f="${f.id}">
                <div class="fx-row ${on ? 'is-on' : ''}">
                    <button type="button" class="fx-tog ${open ? 'open' : ''} ${kids.length ? '' : 'empty'}" data-tog="${f.id}" aria-label="${open ? 'اقفل' : 'افتح'} ${esc(f.name)}" aria-expanded="${open}">◀</button>
                    <button type="button" class="fx-nav" data-go='${JSON.stringify({ f: f.id })}'><span class="fx-fi" style="--fc:${folderColor(f.color)}">${esc(f.icon || '📁')}</span><span>${esc(f.name)}</span><span class="n">${countDeep(f.id) || ''}</span></button>
                </div>
                ${kids.length && open ? `<div class="fx-kids">${sortFolders(kids).map(node).join('')}</div>` : ''}
            </div>`;
        };
        side.innerHTML = `
            <a class="fx-nav" href="mushaf.html"><span class="fx-fi" style="--fc:#DDEFE6">📖</span><span>المصحف الشريف</span></a>
            ${nav({ f: null }, '🏠', 'مكتبتي', books.length, `data-drop-f=""`)}
            ${books.some((b) => b.pinned) ? nav({ s: 'pinned' }, '📌', 'المثبّتة', books.filter((b) => b.pinned).length) : ''}
            ${books.some((b) => b.last_opened_at) ? nav({ s: 'recent' }, '🕘', 'آخر ما فتحته', null) : ''}
            ${hubOk && folders.length ? `<h4>الفولدرات</h4><div class="fx-tree">${sortFolders(kidsOf(null)).map(node).join('')}</div>` : ''}
            ${hubOk ? `<button type="button" class="fx-nav" data-new-folder><span class="fx-fi">${icon('folderPlus', { size: 14 })}</span><span>فولدر جديد</span></button>` : ''}
            ${storageCard()}`;
    }
    function storageCard() {
        if (!driveReady()) return '';
        if (Drive.driveConnected()) {
            return `<div class="fx-store">☁️ <b>جوجل درايف متوصّل</b><br>${Drive.driveEmail() ? `${esc(Drive.driveEmail())}<br>` : ''}${Drive.drivePreferred() ? 'الكتب الجديدة بتترفع على الدرايف بتاعك.' : 'الكتب الجديدة على تخزين البرنامج.'}
                <button type="button" class="btn btn-sm btn-outline" data-drive="settings">إعدادات التخزين</button></div>`;
        }
        return `<div class="fx-store">☁️ <b>خزّن كتبك على جوجل درايف بتاعك</b><br>الملفات تفضل ملكك وعلى مساحتك، والبرنامج يشوف بس الكتب اللي انت رفعتها منه.
            <button type="button" class="btn btn-sm btn-primary" data-drive="connect">وصّل جوجل درايف</button></div>`;
    }

    $('fx-side').addEventListener('click', (e) => {
        const tog = e.target.closest('[data-tog]');
        if (tog) { const id = tog.dataset.tog; if (expanded.has(id)) expanded.delete(id); else expanded.add(id); prefs.expanded = [...expanded]; savePrefs(); renderSide(); return; }
        if (e.target.closest('[data-new-folder]')) { openFolderModal(null, curFolder()); return; }
        const dv = e.target.closest('[data-drive]');
        if (dv) { if (dv.dataset.drive === 'connect') connectDriveFlow(); else openDriveSettings(); return; }
        const g = e.target.closest('[data-go]');
        if (g) { const l = JSON.parse(g.dataset.go); if (l.f) pathOf(l.f).forEach((f) => expanded.add(f.id)); goTo(l); }
    });

    // ------------------------------------------------------------------ المسار فوق
    function renderCrumbs() {
        const cr = $('fx-crumbs');
        let parts = [`<button type="button" data-go='{"f":null}' data-drop-f="">🏠 مكتبتي</button>`];
        if (query) parts.push(`<span class="sep">‹</span><button type="button">🔍 نتايج "${esc(query)}"</button>`);
        else if (loc.s === 'pinned') parts.push('<span class="sep">‹</span><button type="button">📌 المثبّتة</button>');
        else if (loc.s === 'recent') parts.push('<span class="sep">‹</span><button type="button">🕘 آخر ما فتحته</button>');
        else pathOf(curFolder()).forEach((f) => parts.push(`<span class="sep">‹</span><button type="button" data-go='${JSON.stringify({ f: f.id })}' data-drop-f="${f.id}">${esc(f.icon || '📁')} ${esc(f.name)}</button>`));
        cr.innerHTML = parts.join('');
        cr.scrollLeft = -cr.scrollWidth;
        $('fx-up').disabled = !query && !loc.s && !curFolder();
    }
    $('fx-crumbs').addEventListener('click', (e) => { const g = e.target.closest('[data-go]'); if (g) { clearSearch(); goTo(JSON.parse(g.dataset.go)); } });
    function goUp() {
        if (query) { clearSearch(); renderAll(); return; }
        if (loc.s) { goTo({ f: null }); return; }
        const f = folderById(curFolder());
        if (f) goTo({ f: parentOf(f) });
    }
    $('fx-up').addEventListener('click', goUp);
    function clearSearch() { query = ''; $('lib-search').value = ''; }

    // ------------------------------------------------------------------ المحتوى
    function sortFolders(list) { return list.slice().sort((a, b) => String(a.name).localeCompare(String(b.name), 'ar')); }
    function sortBooks(list) {
        const sort = $('lib-sort').value;
        const ts = (v) => (v ? Date.parse(v) || 0 : 0);
        return list.slice().sort((a, b) => {
            if (!!a.pinned !== !!b.pinned && !query) return a.pinned ? -1 : 1;
            if (sort === 'recent') return ts(b.created_at) - ts(a.created_at);
            if (sort === 'opened') return ts(b.last_opened_at) - ts(a.last_opened_at) || ts(b.created_at) - ts(a.created_at);
            if (sort === 'type') return String(a.file_type).localeCompare(String(b.file_type)) || String(a.title).localeCompare(String(b.title), 'ar');
            return String(a.title).localeCompare(String(b.title), 'ar', { numeric: true });
        });
    }
    function visible() {
        if (query) {
            const q = query.toLowerCase();
            return {
                folders: sortFolders(folders.filter((f) => String(f.name).toLowerCase().includes(q))),
                books: sortBooks(books.filter((b) => `${b.title} ${b.file_name || ''}`.toLowerCase().includes(q)))
            };
        }
        if (loc.s === 'pinned') return { folders: [], books: sortBooks(books.filter((b) => b.pinned)) };
        if (loc.s === 'recent') return { folders: [], books: books.filter((b) => b.last_opened_at).sort((a, b) => Date.parse(b.last_opened_at) - Date.parse(a.last_opened_at)).slice(0, 30) };
        const id = curFolder();
        return { folders: sortFolders(kidsOf(id)), books: sortBooks(booksIn(id)) };
    }

    // v35.4: كل العناصر بنفس الهيكل والمقاس (أيقونة ← اسم سطرين ← تفاصيل ← سطر حالة ثابت) عشان الشبكة تبقى على استقامة واحدة
    const fmtDate = (v) => { const t = Date.parse(v || ''); return t ? new Date(t).toLocaleDateString('ar-EG-u-nu-latn', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Africa/Cairo' }) : '—'; };
    function folderTile(f) {
        const [l, d] = shade(f.color);
        const n = countDeep(f.id);
        const sub = kidsOf(f.id).length;
        const k = `f:${f.id}`;
        const where = query && parentOf(f) ? pathOf(parentOf(f)).map((x) => x.name).join(' ‹ ') : '';
        const meta = [sub ? `${sub} فولدر` : '', n ? `${n} كتاب` : (sub ? '' : 'فاضي')].filter(Boolean).join(' · ');
        return `<div class="fx-tile fx-folder ${selected.has(k) ? 'is-sel' : ''}" data-k="${k}" data-drop-f="${f.id}" tabindex="0" role="button" draggable="${hubOk}" aria-label="فولدر ${esc(f.name)}، فيه ${n} كتاب">
            <span class="fx-check" aria-hidden="true">✓</span>
            <div class="fx-ico"><div class="fx-folder-ic" style="--fl:${l};--fd:${d}"><span class="em">${esc(f.icon && f.icon !== '📁' ? f.icon : '')}</span></div></div>
            <div class="fx-txt"><div class="fx-name" title="${esc(f.name)}">${esc(f.name)}</div><div class="fx-meta">${esc(where ? `📁 ${where}` : meta)}</div></div>
            <div class="fx-col c-type">فولدر</div><div class="fx-col c-size">${esc(meta || '—')}</div><div class="fx-col c-date">${esc(fmtDate(f.created_at))}</div>
            <div class="fx-foot"></div>
            <button type="button" class="fx-more" data-more aria-label="خيارات ${esc(f.name)}">${icon('moreV', { size: 16 })}</button>
        </div>`;
    }

    function bookTile(b) {
        const st = effectiveStatus(b);
        const live = active.get(b.id);
        const c = catOf(bookCat(b)) || catOf('other');
        const unit = b.file_type === 'pptx' ? 'شريحة' : 'صفحة';
        const uploadBroken = st === 'stalled' && b.status === 'uploading';
        const canOpen = !!b.storage_path && st !== 'uploading' && !uploadBroken && !active.has(b.id);
        const pub = pubMap[b.id];
        const k = `b:${b.id}`;
        // سطر الحالة (ارتفاعه ثابت في كل البطاقات)
        let foot = '';
        if (st === 'processing' || (st === 'uploading' && live)) foot = progressHtml(b, live);
        else if (st === 'failed') foot = `<span class="fx-fs bad" title="${esc(b.error_message || '')}">تعذّر التحليل</span><button type="button" class="fx-mini" data-action="reprocess" title="إعادة المعالجة" aria-label="إعادة معالجة ${esc(b.title)}">${icon('refresh', { size: 14 })}</button>`;
        else if (uploadBroken) foot = '<span class="fx-fs bad">الرفع ماكملش — امسحه وارفعه تاني</span>';
        else if (st === 'stalled') foot = `<span class="fx-fs bad">المعالجة وقفت</span><button type="button" class="fx-mini" data-action="reprocess" title="كمّل المعالجة" aria-label="كمّل معالجة ${esc(b.title)}">${icon('refresh', { size: 14 })}</button>`;
        else if (st !== 'ready') foot = `<span class="fx-fs">${STATUS_LABELS[st] || esc(st)}</span>`;
        else if (pub && pub.status === 'rejected') foot = `<span class="fx-fs bad" title="${esc(pub.note || '')}">ماتنشرش${pub.note ? `: ${esc(pub.note)}` : ''}</span>`;
        const size = st === 'ready' && b.page_count ? `${b.page_count} ${unit}` : '';
        const meta = [typeLabel(b), size, b.is_scanned ? 'مصوّر' : ''].filter(Boolean);
        const where = query || loc.s ? pathOf(b.folder_id).map((x) => x.name).join(' ‹ ') : '';
        const badges = [
            b.pinned ? '<span class="fx-badge" title="مثبّت">📌</span>' : '',
            Drive.isGdrivePath(b.storage_path) ? '<span class="fx-badge drive" title="على جوجل درايف بتاعك">☁️</span>' : '',
            pub && pub.status === 'approved' ? '<span class="fx-badge pub" title="منشور في المكتبة العامة">🌍</span>' : '',
            pub && pub.status === 'pending' ? '<span class="fx-badge pend" title="طلب النشر بيتراجع">⏳</span>' : '',
            b.public_book_id ? '<span class="fx-badge" title="من المكتبة العامة">🌍</span>' : '',
            b.student_ids && b.student_ids.length ? `<span class="fx-badge" title="لطلاب محددين">👤${b.student_ids.length}</span>` : ''
        ].join('');
        return `<div class="fx-tile fx-book ${selected.has(k) ? 'is-sel' : ''} ${canOpen ? 'is-openable' : ''}" data-k="${k}" data-book-id="${b.id}" tabindex="0" role="button" draggable="${hubOk}" aria-label="${esc(b.title)}">
            <span class="fx-check" aria-hidden="true">✓</span>
            <div class="fx-badges">${badges}</div>
            <div class="fx-ico"><div class="fx-book-ic" style="--cv:${c.cv}"><span class="em">${c.em}</span><span class="ty">${esc(TYPE_LABEL[b.file_type] === 'PowerPoint' ? 'PPT' : typeLabel(b))}</span></div></div>
            <div class="fx-txt"><div class="fx-name" title="${esc(b.title)}">${esc(b.title)}</div><div class="fx-meta">${esc(where ? `📁 ${where}` : meta.join(' · '))}</div></div>
            <div class="fx-col c-type">${esc(typeLabel(b))}</div><div class="fx-col c-size">${esc(size || '—')}</div><div class="fx-col c-date">${esc(fmtDate(b.created_at))}</div>
            <div class="fx-foot ${foot ? 'on' : ''}">${foot}</div>
            <button type="button" class="fx-more" data-more aria-label="خيارات ${esc(b.title)}">${icon('moreV', { size: 16 })}</button>
        </div>`;
    }

    function mushafTile() {
        return `<a class="fx-tile mushaf" href="mushaf.html" aria-label="المصحف الشريف">
            <div class="fx-ico"><div class="fx-book-ic"><span class="ms-t">۞</span></div></div>
            <div class="fx-txt"><div class="fx-name">المصحف الشريف</div><div class="fx-meta">مصحف المدينة · حفص</div></div>
            <div class="fx-col c-type">مصحف</div><div class="fx-col c-size">604 صفحة</div><div class="fx-col c-date">—</div>
            <div class="fx-foot"></div>
        </a>`;
    }
    const listHead = () => `<div class="fx-lhead" aria-hidden="true"><span class="h-name">الاسم</span><span class="c-type">النوع</span><span class="c-size">الحجم</span><span class="c-date">اتضاف</span><span class="h-act"></span></div>`;

    function renderBooks() {
        const section = $('books-section');
        $('n-mine').textContent = books.length ? String(books.length) : '';
        $('fx').classList.toggle('selecting', selecting);
        $('fx-main').classList.toggle('fx-list', layout === 'list');
        $('fx-view').innerHTML = icon(layout === 'list' ? 'grid' : 'list', { size: 18 });
        $('fx-view').title = layout === 'list' ? 'عرض شبكة' : 'عرض قائمة';
        $('btn-select').classList.toggle('is-on', selecting);
        if (!loaded) return;
        const v = visible();
        const atRoot = !query && !loc.s && !curFolder();
        if (!books.length && !folders.length) {
            section.innerHTML = `${atRoot ? `<div class="fx-grid">${mushafTile()}</div>` : ''}<div class="fx-empty"><span class="em">📚</span>
                <b>مكتبتك لسه فاضية</b><br>ارفع نور البيان، تحفة الأطفال، أو أي مذكرة — أو اسحب الملف من الكمبيوتر وافلته هنا.
                <br><button type="button" class="btn btn-primary" data-empty-add>${icon('plus', { size: 15 })} ارفع أول كتاب</button>
                ${hubOk ? `<button type="button" class="btn btn-outline" data-empty-folder>${icon('folderPlus', { size: 15 })} اعمل فولدر</button><button type="button" class="btn btn-outline" data-empty-public>🌍 خد كتاب من المكتبة العامة</button>` : ''}</div>`;
            $('fx-status').textContent = '';
            return;
        }
        let html = '';
        if (layout === 'list' && (v.folders.length || v.books.length || atRoot)) html += listHead();
        if (v.folders.length) html += `<div class="fx-sec">الفولدرات</div><div class="fx-grid">${v.folders.map(folderTile).join('')}</div>`;
        if (v.books.length || atRoot) html += `${v.folders.length || atRoot ? `<div class="fx-sec">${atRoot ? 'الكتب والملفات' : 'الملفات'}</div>` : ''}<div class="fx-grid">${atRoot ? mushafTile() : ''}${v.books.map(bookTile).join('')}</div>`;
        if (!v.folders.length && !v.books.length) {
            html = `<div class="fx-empty"><span class="em">${query ? '🔍' : '📂'}</span>${query ? `مفيش حاجة اسمها "${esc(query)}"` : loc.s ? 'مفيش هنا حاجة لسه.' : `الفولدر ده فاضي.<br>اسحب كتب عليه، أو <button type="button" class="btn btn-sm btn-primary" data-empty-add>ارفع كتاب هنا</button>${nesting() ? ' <button type="button" class="btn btn-sm btn-outline" data-empty-folder>فولدر جوّاه</button>' : ''}`}</div>`;
        }
        section.innerHTML = html;
        const nf = v.folders.length, nb = v.books.length;
        $('fx-status').textContent = [nf ? `${nf} فولدر` : '', nb ? `${nb} كتاب` : ''].filter(Boolean).join(' · ') + (hubOk && !('ontouchstart' in window) ? '  —  كليك يمين على أي حاجة للخيارات، واسحب الكتب على الفولدرات' : '');
    }

    function renderAll() { renderSide(); renderCrumbs(); renderBooks(); renderSelbar(); }

    /** تحديث شريط التقدّم فقط (من غير إعادة رسم القائمة) */
    function updateProgressUI(bookId) {
        const live = active.get(bookId);
        const wrap = document.querySelector(`[data-progress-for="${bookId}"]`);
        if (!live || !wrap) return;
        const bar = wrap.querySelector('.book-progress-bar');
        bar.querySelector('i').style.width = `${live.percent}%`;
        bar.setAttribute('aria-valuenow', String(live.percent));
        wrap.querySelector('.book-progress-text').textContent = `${live.message} (${live.percent}%)`;
    }

    // ------------------------------------------------------------------ البحث / الترتيب / العرض / التحديد
    let searchT = null;
    $('lib-search').addEventListener('input', (e) => {
        clearTimeout(searchT);
        searchT = setTimeout(() => { query = e.target.value.trim(); renderCrumbs(); renderBooks(); if (!$('tab-public').hidden) renderPublic(); }, 150);
    });
    $('lib-sort').addEventListener('change', () => { prefs.sort = $('lib-sort').value; savePrefs(); renderBooks(); });
    $('fx-view').addEventListener('click', () => { layout = layout === 'list' ? 'grid' : 'list'; prefs.layout = layout; savePrefs(); renderBooks(); });
    const setSelecting = (on) => { selecting = on; if (!on) selected.clear(); renderBooks(); renderSelbar(); };
    $('btn-select').addEventListener('click', () => setSelecting(!selecting));
    function renderSelbar() {
        $('lib-selbar').hidden = !selecting && !selected.size;
        $('btn-select').hidden = !hubOk || (!books.length && !folders.length);
        $('sel-count').textContent = selected.size ? `${selected.size} مختار` : 'اختار الحاجات';
        $('sel-move').disabled = !selected.size;
        $('sel-del').disabled = !selected.size;
    }
    $('sel-cancel').addEventListener('click', () => setSelecting(false));
    $('sel-all').addEventListener('click', () => { const v = visible(); v.folders.forEach((f) => selected.add(`f:${f.id}`)); v.books.forEach((b) => selected.add(`b:${b.id}`)); selecting = true; renderBooks(); renderSelbar(); });
    $('sel-move').addEventListener('click', () => { if (selected.size) openMovePicker([...selected]); });
    $('sel-del').addEventListener('click', () => { if (selected.size) deleteItems([...selected]); });

    // ------------------------------------------------------------------ زرار "جديد"
    $('btn-new').addEventListener('click', (e) => {
        const items = [['upload', 'upload', 'ارفع كتاب أو ملف']];
        if (hubOk) items.push(['folder', 'folderPlus', curFolder() && nesting() ? 'فولدر جديد هنا' : 'فولدر جديد']);
        items.push(['-'], ['public', 'globe', 'خد كتاب من المكتبة العامة'], ['mushaf', 'bookOpen', 'افتح المصحف الشريف']);
        showMenu(items, e.currentTarget, (m) => {
            if (m === 'upload') openUpload();
            else if (m === 'folder') openFolderModal(null, curFolder());
            else if (m === 'public') switchTab('public');
            else if (m === 'mushaf') location.href = 'mushaf.html';
        });
    });
    $('btn-add-source').addEventListener('click', () => openUpload());
    $('btn-new-folder').addEventListener('click', () => openFolderModal(null, curFolder()));

    // ------------------------------------------------------------------ أحداث العناصر (ضغط / كليك يمين / ضغطة طويلة / كيبورد)
    const itemOf = (k) => (k.startsWith('f:') ? { kind: 'f', f: folderById(k.slice(2)) } : { kind: 'b', b: books.find((x) => x.id === k.slice(2)) });
    let lastClicked = null;
    function toggleSel(k, range) {
        if (range && lastClicked) {
            const keys = [...$('books-section').querySelectorAll('[data-k]')].map((x) => x.dataset.k);
            const a = keys.indexOf(lastClicked), b = keys.indexOf(k);
            if (a >= 0 && b >= 0) keys.slice(Math.min(a, b), Math.max(a, b) + 1).forEach((x) => selected.add(x));
        } else if (selected.has(k)) selected.delete(k); else selected.add(k);
        lastClicked = k;
        if (!selected.size && selecting) { /* يفضل وضع التحديد مفتوح */ }
        renderBooks(); renderSelbar();
    }
    function openItem(k, tile) {
        const it = itemOf(k);
        if (it.kind === 'f' && it.f) { expanded.add(it.f.id); pathOf(it.f.id).forEach((p) => expanded.add(p.id)); clearSearch(); goTo({ f: it.f.id }); return; }
        if (it.b && tile && tile.classList.contains('is-openable')) openBook(it.b, { opener: tile });
    }
    let longPressFired = false;
    $('books-section').addEventListener('click', (e) => {
        if (e.target.closest('[data-empty-add]')) { openUpload(); return; }
        if (e.target.closest('[data-empty-folder]')) { openFolderModal(null, curFolder()); return; }
        if (e.target.closest('[data-empty-public]')) { switchTab('public'); return; }
        const tile = e.target.closest('[data-k]');
        if (!tile) { if (!selecting && selected.size && !e.target.closest('.fx-tile')) { selected.clear(); renderBooks(); renderSelbar(); } return; }
        if (longPressFired) { longPressFired = false; e.preventDefault(); return; }
        const k = tile.dataset.k;
        const act = e.target.closest('[data-action]');
        if (act) { e.stopPropagation(); const it = itemOf(k); if (it.b) handleCardAction(act.dataset.action, it.b, act); return; }
        if (e.target.closest('[data-more]')) { e.stopPropagation(); openContext(k, e.target.closest('[data-more]')); return; }
        if (selecting || e.ctrlKey || e.metaKey || e.shiftKey) { toggleSel(k, e.shiftKey); return; }
        openItem(k, tile);
    });
    $('books-section').addEventListener('contextmenu', (e) => {
        const tile = e.target.closest('[data-k]');
        if (!tile || !hubOk) return;
        e.preventDefault();
        openContext(tile.dataset.k, { x: e.clientX, y: e.clientY });
    });
    // ضغطة طويلة على الموبايل = قايمة الخيارات
    let lpTimer = null, lpStart = null;
    $('books-section').addEventListener('touchstart', (e) => {
        const tile = e.target.closest('[data-k]');
        if (!tile || e.target.closest('[data-more],[data-action]')) return;
        const t = e.touches[0]; lpStart = { x: t.clientX, y: t.clientY };
        lpTimer = setTimeout(() => { longPressFired = true; try { navigator.vibrate && navigator.vibrate(15); } catch (er) { /* تجاهل */ } openContext(tile.dataset.k, { x: lpStart.x, y: lpStart.y }); }, 520);
    }, { passive: true });
    const lpCancel = (e) => { if (!lpTimer) return; if (e.type === 'touchmove') { const t = e.touches[0]; if (Math.hypot(t.clientX - lpStart.x, t.clientY - lpStart.y) < 10) return; } clearTimeout(lpTimer); lpTimer = null; };
    ['touchend', 'touchmove', 'touchcancel'].forEach((ev) => $('books-section').addEventListener(ev, lpCancel, { passive: true }));

    $('books-section').addEventListener('keydown', (e) => {
        const tile = e.target.closest && e.target.closest('[data-k]');
        if (!tile || e.target !== tile) return;
        const k = tile.dataset.k;
        if (e.key === 'Enter') { e.preventDefault(); openItem(k, tile); }
        else if (e.key === ' ') { e.preventDefault(); toggleSel(k); }
        else if (e.key === 'F2') { e.preventDefault(); renameItem(k); }
        else if (e.key === 'Delete') { e.preventDefault(); deleteItems(selected.size ? [...selected] : [k]); }
        else if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) { e.preventDefault(); openContext(k, tile.querySelector('[data-more]') || tile); }
        else if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
            const all = [...$('books-section').querySelectorAll('[data-k]')];
            const i = all.indexOf(tile);
            const cols = layout === 'list' ? 1 : Math.max(1, Math.round(tile.parentElement.clientWidth / tile.offsetWidth));
            const d = { ArrowLeft: 1, ArrowRight: -1, ArrowDown: cols, ArrowUp: -cols }[e.key];
            const n = all[i + d]; if (n) { e.preventDefault(); n.focus(); }
        }
    });
    document.addEventListener('keydown', (e) => {
        if ($('tab-mine').hidden || e.target.closest('input,textarea,select,[contenteditable],.modal.active,.bv-root')) return;
        if (document.querySelector('.modal.active')) return;
        if (e.key === 'Backspace' || (e.altKey && e.key === 'ArrowUp')) { e.preventDefault(); goUp(); }
        else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') { e.preventDefault(); $('sel-all').click(); }
        else if (e.key === 'Escape' && (selecting || selected.size)) setSelecting(false);
        else if (e.key === 'Delete' && selected.size) deleteItems([...selected]);
    });

    // ------------------------------------------------------------------ السحب والإفلات (جوه البرنامج + ملفات من الكمبيوتر)
    let dragKeys = null;
    document.addEventListener('dragstart', (e) => {
        const tile = e.target.closest && e.target.closest('#books-section [data-k]');
        if (!tile || !hubOk) return;
        const k = tile.dataset.k;
        dragKeys = selected.has(k) ? [...selected] : [k];
        e.dataTransfer.setData('text/tm-items', JSON.stringify(dragKeys));
        e.dataTransfer.effectAllowed = 'move';
        tile.classList.add('dragging');
    });
    document.addEventListener('dragend', () => { dragKeys = null; document.querySelectorAll('.dragging,.drop-over').forEach((x) => x.classList.remove('dragging', 'drop-over')); $('fx-main').classList.remove('dropping'); });
    const isFileDrag = (e) => !dragKeys && e.dataTransfer && [...(e.dataTransfer.types || [])].includes('Files');
    const dropTarget = (e) => e.target.closest && e.target.closest('[data-drop-f]');
    $('tab-mine').addEventListener('dragover', (e) => {
        if (isFileDrag(e)) {
            e.preventDefault();
            const f = folderById(curFolder());
            $('fx-drop-t').textContent = `افلت الملف هنا عشان يترفع في ${f ? `"${f.name}"` : 'مكتبتك'}`;
            $('fx-main').classList.add('dropping');
            return;
        }
        const t = dropTarget(e);
        document.querySelectorAll('.drop-over').forEach((x) => { if (x !== t) x.classList.remove('drop-over'); });
        if (t && dragKeys && canDropInto(dragKeys, t.dataset.dropF || null)) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; t.classList.add('drop-over'); }
    });
    $('tab-mine').addEventListener('dragleave', (e) => {
        if (e.target === $('fx-main') || !$('fx-main').contains(e.relatedTarget)) $('fx-main').classList.remove('dropping');
        const t = dropTarget(e); if (t && !t.contains(e.relatedTarget)) t.classList.remove('drop-over');
    });
    $('tab-mine').addEventListener('drop', (e) => {
        $('fx-main').classList.remove('dropping');
        if (isFileDrag(e)) {
            e.preventDefault();
            const files = [...(e.dataTransfer.files || [])];
            if (files.length) openUpload(files);
            return;
        }
        const t = dropTarget(e);
        if (!t || !dragKeys) return;
        e.preventDefault(); t.classList.remove('drop-over');
        moveItems(dragKeys, t.dataset.dropF || null);
    });
    function canDropInto(keys, folderId) {
        return keys.every((k) => {
            if (k.startsWith('b:')) { const b = books.find((x) => x.id === k.slice(2)); return b && (b.folder_id || null) !== folderId; }
            const id = k.slice(2);
            if (!nesting()) return false;
            if (id === folderId) return false;
            if (folderId && descendants(id).includes(folderId)) return false;
            return (parentOf(folderById(id)) || null) !== folderId;
        });
    }

    // ------------------------------------------------------------------ قايمة الخيارات (كليك يمين / ⋮)
    let menuEl = null;
    function closeMenu() { if (menuEl) { menuEl.remove(); menuEl = null; document.removeEventListener('pointerdown', onDocDown, true); } }
    function onDocDown(e) { if (menuEl && !menuEl.contains(e.target)) closeMenu(); }
    function showMenu(items, anchor, onPick) {
        closeMenu();
        menuEl = document.createElement('div');
        menuEl.className = 'lib2-menu';
        menuEl.setAttribute('role', 'menu');
        menuEl.innerHTML = items.map((it) => it[0] === '-' ? '<hr>' : `<button type="button" role="menuitem" data-m="${it[0]}" class="${it[3] || ''}">${icon(it[1], { size: 16 })} ${esc(it[2])}</button>`).join('');
        document.body.appendChild(menuEl);
        const mw = menuEl.offsetWidth, mh = menuEl.offsetHeight;
        let x, y;
        if (anchor && anchor.getBoundingClientRect) { const r = anchor.getBoundingClientRect(); x = r.left; y = r.bottom + 6; } else { x = anchor.x - mw; y = anchor.y; }
        menuEl.style.top = `${Math.max(8, Math.min(window.innerHeight - mh - 8, y))}px`;
        menuEl.style.left = `${Math.max(8, Math.min(window.innerWidth - mw - 8, x))}px`;
        menuEl.querySelector('button').focus({ preventScroll: true });
        setTimeout(() => document.addEventListener('pointerdown', onDocDown, true), 0);
        menuEl.addEventListener('keydown', (e) => {
            const bs = [...menuEl.querySelectorAll('button')]; const i = bs.indexOf(document.activeElement);
            if (e.key === 'Escape') { closeMenu(); if (anchor && anchor.focus) anchor.focus(); }
            else if (e.key === 'ArrowDown') { e.preventDefault(); (bs[i + 1] || bs[0]).focus(); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); (bs[i - 1] || bs[bs.length - 1]).focus(); }
        });
        menuEl.addEventListener('click', (e) => { const b = e.target.closest('[data-m]'); if (!b) return; closeMenu(); onPick(b.dataset.m); });
    }
    function openContext(k, anchor) {
        if (selected.size > 1 && selected.has(k)) {
            showMenu([['move', 'folder', `نقل ${selected.size} حاجات`], ['-'], ['delete', 'trash', `حذف ${selected.size} حاجات`, 'danger']], anchor, (m) => { if (m === 'move') openMovePicker([...selected]); else deleteItems([...selected]); });
            return;
        }
        const it = itemOf(k);
        if (it.kind === 'f' && it.f) {
            const f = it.f;
            const items = [['open', 'folder', 'افتح'], ['rename', 'edit', 'تغيير الاسم'], ['style', 'grid', 'اللون والأيقونة']];
            if (nesting()) items.push(['newin', 'folderPlus', 'فولدر جوّاه'], ['move', 'folder', 'نقل لفولدر تاني']);
            items.push(['upload', 'upload', 'ارفع كتاب جوّاه'], ['-'], ['delete', 'trash', 'حذف الفولدر', 'danger']);
            showMenu(items, anchor, (m) => {
                if (m === 'open') openItem(k);
                else if (m === 'rename') renameItem(k);
                else if (m === 'style') openFolderModal(f);
                else if (m === 'newin') openFolderModal(null, f.id);
                else if (m === 'move') openMovePicker([k]);
                else if (m === 'upload') openUpload(null, 0, f.id);
                else if (m === 'delete') deleteItems([k]);
            });
            return;
        }
        if (it.b) openMenu(it.b, anchor);
    }
    function openMenu(book, anchor) {
        const st = effectiveStatus(book);
        const pub = pubMap[book.id];
        const items = [];
        if (book.storage_path && st !== 'uploading' && !active.has(book.id)) items.push(['open', 'bookOpen', 'افتح']);
        if (st === 'ready') items.push(['ask', 'messageSquare', 'اسأل الكتاب']);
        if (hubOk) {
            items.push(['move', 'folder', 'نقل لفولدر']);
            items.push(['rename', 'edit', 'تغيير الاسم']);
            items.push(['category', 'grid', 'التصنيف']);
            items.push(['pin', 'pin', book.pinned ? 'إلغاء التثبيت' : 'تثبيت فوق']);
        }
        items.push(['manage', 'users', 'مين من الطلاب يستخدمه']);
        if (book.storage_path && st !== 'uploading') items.push(['download', 'download', 'تحميل الملف']);
        if (driveReady() && Drive.driveConnected() && book.storage_path && !Drive.isGdrivePath(book.storage_path) && !book.public_book_id && st !== 'uploading') items.push(['todrive', 'upload', 'انقله لجوجل درايف بتاعي']);
        if (hubOk && !book.public_book_id) {
            items.push(['-']);
            if (pub && (pub.status === 'pending' || pub.status === 'approved')) items.push(['unpublish', 'globe', pub.status === 'pending' ? 'إلغاء طلب النشر' : 'شيله من المكتبة العامة']);
            else if (st === 'ready') items.push(['publish', 'globe', pub && pub.status === 'rejected' ? 'اطلب النشر تاني' : 'انشره للمدرسين (المكتبة العامة)']);
        }
        items.push(['-'], ['delete', 'trash', 'حذف', 'danger']);
        showMenu(items, anchor, (m) => {
            if (m === 'move') openMovePicker([`b:${book.id}`]);
            else if (m === 'category') openCategoryPicker(book);
            else if (m === 'pin') setMeta(book, { pinned: !book.pinned });
            else if (m === 'rename') renameItem(`b:${book.id}`);
            else if (m === 'download') downloadBook(book);
            else if (m === 'publish') openPublishModal(book);
            else if (m === 'unpublish') unpublish(book);
            else if (m === 'todrive') moveBookToDrive(book);
            else if (m === 'delete') deleteItems([`b:${book.id}`]);
            else handleCardAction(m, book);
        });
    }

    async function handleCardAction(action, book) {
        if (action === 'menu') { openMenu(book, document.activeElement); return; }
        if (action === 'manage') openAccessModal(book);
        else if (action === 'open') openBook(book);
        else if (action === 'ask') openBook(book, { chat: true });
        else if (action === 'reprocess') startProcessing(book, null);
        else if (action === 'cancel') {
            const live = active.get(book.id);
            if (!live) return;
            const yes = await askConfirm({ title: 'توقف التحليل؟', text: `"${book.title}" هيفضل في مكتبتك، بس تحليله هيقف. تقدر تكمّله بعدين من "إعادة المعالجة".`, ok: 'أيوه، وقّف', cancel: 'لأ، كمّل' });
            if (yes && active.get(book.id)) live.ctl.abort();
        }
    }

    function renameItem(k) {
        const it = itemOf(k);
        if (it.kind === 'f' && it.f) {
            const t = prompt('الاسم الجديد للفولدر', it.f.name);
            if (t && t.trim() && t.trim() !== it.f.name) saveFolder(it.f, { name: t.trim().slice(0, 60) });
        } else if (it.b) {
            const t = prompt('الاسم الجديد للكتاب', it.b.title);
            if (t && t.trim() && t.trim() !== it.b.title) setMeta(it.b, { title: t.trim() });
        }
    }

    async function deleteItems(keys) {
        const fs = keys.filter((k) => k.startsWith('f:')).map((k) => folderById(k.slice(2))).filter(Boolean);
        const bs = keys.filter((k) => k.startsWith('b:')).map((k) => books.find((b) => b.id === k.slice(2))).filter(Boolean);
        if (bs.some((b) => active.has(b.id))) { ErrorHandler.showError('في كتاب بيتعالج حاليًا. اضغط "إلغاء" الأول.'); return; }
        const parts = [];
        if (fs.length) parts.push(fs.length === 1 ? `فولدر "${fs[0].name}"` : `${fs.length} فولدرات`);
        if (bs.length) parts.push(bs.length === 1 ? `"${bs[0].title}"` : `${bs.length} كتب`);
        const note = fs.length ? '\n(الكتب اللي جوه الفولدرات مش هتتمسح: هترجع للفولدر اللي فوق)' : '';
        const sharedNote = bs.some(isShared) ? '\n(الكتب المنشورة هتفضل في المكتبة العامة)' : '';
        if (!confirm(`تمسح ${parts.join(' و')}؟${note}${sharedNote}`)) return;
        let ok = 0;
        for (const b of bs) {
            try {
                const shared = isShared(b);
                const res = await api.deleteBook(b.id);
                if (res && res.storage_path && !shared) await api.deleteBookFile(res.storage_path);
                else if (Drive.isGdrivePath(b.storage_path)) await api.deleteBookFile(b.storage_path);
                ok++;
            } catch (err) { ErrorHandler.showError(ErrorHandler.getErrorMessage(err)); }
        }
        for (const f of fs) {
            try {
                const parent = parentOf(f);
                // الكتب والفولدرات اللي جوّاه بتطلع للي فوق قبل الحذف (عشان مايتوهوش)
                const inside = booksIn(f.id).map((b) => b.id);
                if (inside.length) await api.hub('book_move', { book_ids: inside, folder_id: parent });
                if (nesting()) for (const kid of kidsOf(f.id)) await api.hub('folder_save', { id: kid.id, name: kid.name, icon: kid.icon, color: kid.color, parent_id: parent });
                await api.hub('folder_delete', { id: f.id });
                ok++;
                if (curFolder() === f.id) loc = { f: parent };
            } catch (err) { ErrorHandler.showError(ErrorHandler.getErrorMessage(err)); }
        }
        selected.clear(); selecting = false;
        if (ok) ErrorHandler.showSuccess('اتمسح ✓');
        await loadBooks();
    }

    // ------------------------------------------------------------------ الفولدرات (عمل / تعديل / نقل)
    async function saveFolder(folder, data) {
        try {
            const r = await api.hub('folder_save', { id: folder.id, name: folder.name, icon: folder.icon, color: folder.color, ...(nesting() ? { parent_id: parentOf(folder) } : {}), ...data });
            Object.assign(folder, (r && r.folder) || data);
            renderAll();
        } catch (err) { ErrorHandler.showError(ErrorHandler.getErrorMessage(err)); }
    }

    function openFolderModal(folder, parentId = null) {
        if (!folder && parentId && !nesting()) parentId = null;
        const subj = String((JSON.parse(localStorage.getItem('user_profile') || '{}') || {}).subject || '').toLowerCase();
        const sugg = !folder && !folders.length ? (FOLDER_SUGGESTIONS[/arab|عرب/.test(subj) ? 'arabic' : 'quran'] || []) : [];
        let color = folder ? folder.color : 'violet';
        let ic = folder ? folder.icon : '📁';
        const parentName = parentId ? (folderById(parentId) || {}).name : '';
        sheet(folder ? 'تعديل الفولدر' : parentName ? `فولدر جديد جوه "${parentName}"` : 'فولدر جديد', `
            ${sugg.length ? `<p style="margin:-.3rem 0 .5rem; font-size:.82rem; color:var(--text-secondary)">اقتراحات سريعة:</p>
                <div class="lib2-cats" style="flex-wrap:wrap">${sugg.map((s) => `<button type="button" class="lib2-chip" data-sugg="${esc(s[0])}" data-ic="${s[1]}" data-c="${s[2]}">${s[1]} ${esc(s[0])}</button>`).join('')}</div>` : ''}
            <div class="form-group"><label for="fd-name">اسم الفولدر</label><input type="text" id="fd-name" maxlength="60" value="${esc(folder ? folder.name : '')}" placeholder="مثلًا: جزء عمّ"></div>
            <div class="form-group"><label>الأيقونة</label><div class="lib2-swatches" data-g="ic">${FOLDER_ICONS.map((x) => `<button type="button" data-v="${x}" class="${x === ic ? 'is-on' : ''}" aria-label="${x}">${x}</button>`).join('')}</div></div>
            <div class="form-group"><label>اللون</label><div class="lib2-swatches" data-g="c">${FOLDER_COLORS.map((x) => `<button type="button" data-v="${x.id}" class="${x.id === color ? 'is-on' : ''}" style="background:${x.c}" aria-label="لون ${x.id}"></button>`).join('')}</div></div>
            <div style="display:flex; gap:.5rem; flex-wrap:wrap; margin-top:1rem">
                <button type="button" class="btn btn-primary" data-save>${folder ? 'حفظ' : 'اعمل الفولدر'}</button>
                ${folder ? '<button type="button" class="btn btn-outline-danger" data-del>حذف الفولدر</button>' : ''}
            </div>
            ${folder ? '<p style="font-size:.76rem; color:var(--text-light); margin:.6rem 0 0">حذف الفولدر مش بيمسح الكتب اللي جواه: بيرجعوا للفولدر اللي فوق.</p>' : ''}`, {
            onMount(m, close) {
                const name = m.querySelector('#fd-name');
                setTimeout(() => name.focus(), 50);
                m.querySelectorAll('.lib2-swatches').forEach((g) => g.addEventListener('click', (e) => {
                    const b = e.target.closest('[data-v]'); if (!b) return;
                    g.querySelectorAll('button').forEach((x) => x.classList.toggle('is-on', x === b));
                    if (g.dataset.g === 'ic') ic = b.dataset.v; else color = b.dataset.v;
                }));
                m.querySelectorAll('[data-sugg]').forEach((b) => b.addEventListener('click', () => {
                    name.value = b.dataset.sugg; ic = b.dataset.ic; color = b.dataset.c;
                    m.querySelectorAll('[data-g="ic"] button').forEach((x) => x.classList.toggle('is-on', x.dataset.v === ic));
                    m.querySelectorAll('[data-g="c"] button').forEach((x) => x.classList.toggle('is-on', x.dataset.v === color));
                }));
                const save = async () => {
                    const n = name.value.trim();
                    if (!n) { name.focus(); return; }
                    const btn = m.querySelector('[data-save]'); btn.disabled = true;
                    try {
                        const body = { id: folder ? folder.id : undefined, name: n, icon: ic, color };
                        if (nesting()) body.parent_id = folder ? parentOf(folder) : parentId;
                        const r = await api.hub('folder_save', body);
                        if (folder) Object.assign(folder, r.folder);
                        else {
                            const nf = Object.assign({ parent_id: parentId }, r.folder);
                            folders.push(nf);
                            if (parentId) expanded.add(parentId);
                        }
                        close(); renderAll();
                        ErrorHandler.showSuccess(folder ? 'اتحفظ ✓' : 'الفولدر اتعمل ✓ اسحب الكتب عليه أو افتحه وارفع جوّاه', 3500);
                    } catch (err) { btn.disabled = false; ErrorHandler.showError(ErrorHandler.getErrorMessage(err)); }
                };
                m.querySelector('[data-save]').addEventListener('click', save);
                name.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); save(); } });
                const del = m.querySelector('[data-del]');
                if (del) del.addEventListener('click', () => { close(); deleteItems([`f:${folder.id}`]); });
            }
        });
    }

    /** نافذة النقل: شجرة الفولدرات كلها (زي "نقل إلى" في الكمبيوتر) */
    function openMovePicker(keys) {
        if (!folders.length && !keys.some((k) => k.startsWith('b:'))) return;
        const movingF = keys.filter((k) => k.startsWith('f:')).map((k) => k.slice(2));
        const blocked = new Set(movingF.flatMap((id) => [id, ...descendants(id)]));
        let target = curFolder();
        const row = (f, depth) => `<button type="button" data-to="${f.id}" style="padding-inline-start:${0.5 + depth * 1.1}rem" ${blocked.has(f.id) ? 'disabled' : ''} class="${target === f.id ? 'is-on' : ''}"><span class="fx-fi" style="--fc:${folderColor(f.color)}">${esc(f.icon || '📁')}</span>${esc(f.name)}</button>`;
        const tree = (id, depth) => sortFolders(kidsOf(id)).map((f) => row(f, depth) + tree(f.id, depth + 1)).join('');
        const n = keys.length;
        sheet(n > 1 ? `نقل ${n} حاجات لـ` : 'نقل لـ', `
            <div class="fx-pick" data-pick>
                <button type="button" data-to="" class="${!target ? 'is-on' : ''}"><span class="fx-fi">🏠</span>مكتبتي (أول المكتبة)</button>
                ${tree(null, 1)}
            </div>
            <div style="display:flex; gap:.5rem; flex-wrap:wrap; margin-top:.8rem">
                <button type="button" class="btn btn-primary" data-ok>انقل هنا</button>
                ${hubOk ? `<button type="button" class="btn btn-outline" data-newf>${icon('folderPlus', { size: 15 })} فولدر جديد</button>` : ''}
            </div>`, {
            onMount(m, close) {
                m.querySelector('[data-pick]').addEventListener('click', (e) => {
                    const b = e.target.closest('[data-to]'); if (!b || b.disabled) return;
                    target = b.dataset.to || null;
                    m.querySelectorAll('[data-to]').forEach((x) => x.classList.toggle('is-on', x === b));
                });
                m.querySelector('[data-pick]').addEventListener('dblclick', (e) => { const b = e.target.closest('[data-to]'); if (b && !b.disabled) { close(); moveItems(keys, b.dataset.to || null); } });
                m.querySelector('[data-ok]').addEventListener('click', () => { close(); moveItems(keys, target); });
                const nb = m.querySelector('[data-newf]');
                if (nb) nb.addEventListener('click', () => { close(); openFolderModal(null, target); });
            }
        });
    }

    async function moveItems(keys, folderId) {
        const bIds = keys.filter((k) => k.startsWith('b:')).map((k) => k.slice(2));
        const fIds = keys.filter((k) => k.startsWith('f:')).map((k) => k.slice(2)).filter((id) => nesting() && id !== folderId && !(folderId && descendants(id).includes(folderId)));
        const prevB = new Map(bIds.map((id) => [id, (books.find((b) => b.id === id) || {}).folder_id]));
        const prevF = new Map(fIds.map((id) => [id, (folderById(id) || {}).parent_id]));
        books.forEach((b) => { if (bIds.includes(b.id)) b.folder_id = folderId; });
        folders.forEach((f) => { if (fIds.includes(f.id)) f.parent_id = folderId; });
        selecting = false; selected.clear();
        if (folderId) expanded.add(folderId);
        renderAll();
        try {
            if (bIds.length) await api.hub('book_move', { book_ids: bIds, folder_id: folderId });
            for (const id of fIds) { const f = folderById(id); await api.hub('folder_save', { id, name: f.name, icon: f.icon, color: f.color, parent_id: folderId }); }
            const f = folderById(folderId);
            ErrorHandler.showSuccess(f ? `اتنقل لـ "${f.name}" ✓` : 'اتنقل لأول المكتبة ✓', 2500);
        } catch (err) {
            books.forEach((b) => { if (prevB.has(b.id)) b.folder_id = prevB.get(b.id); });
            folders.forEach((f) => { if (prevF.has(f.id)) f.parent_id = prevF.get(f.id); });
            renderAll();
            ErrorHandler.showError(ErrorHandler.getErrorMessage(err));
        }
    }

    async function setMeta(book, data) {
        const before = { ...book };
        Object.assign(book, data);
        renderAll();
        try { await api.hub('book_meta', { book_id: book.id, ...data }); }
        catch (err) { Object.assign(book, before); renderAll(); ErrorHandler.showError(ErrorHandler.getErrorMessage(err)); }
    }

    async function downloadBook(book) {
        try {
            if (Drive.isGdrivePath(book.storage_path)) { await Drive.driveFileUrl(book.storage_path, { download: book.file_name || `${book.title}.${book.file_type || 'pdf'}` }); return; }
            const url = await api.getBookFileUrl(book.storage_path, { download: book.file_name || true });
            window.open(url, '_blank', 'noopener');
        } catch (err) { ErrorHandler.showError('مقدرناش نجيب الملف دلوقتي. جرّب تاني.'); }
    }

    // ------------------------------------------------------------------ نوافذ صغيرة (فولدر / نقل / تصنيف / نشر)
    function sheet(title, inner, { onMount } = {}) {
        const m = document.createElement('div');
        m.className = 'modal active';
        m.innerHTML = `<div class="modal-content" role="dialog" aria-modal="true" aria-label="${esc(title)}" style="max-width:460px">
            <button type="button" class="close-modal" aria-label="قفل">&times;</button><h2 style="margin-top:0">${esc(title)}</h2>${inner}</div>`;
        const close = () => { m.remove(); document.removeEventListener('keydown', onKey); };
        const onKey = (e) => { if (e.key === 'Escape') close(); };
        m.querySelector('.close-modal').addEventListener('click', close);
        m.addEventListener('mousedown', (e) => { if (e.target === m) close(); });
        document.addEventListener('keydown', onKey);
        document.body.appendChild(m);
        if (onMount) onMount(m, close);
        return { m, close };
    }

    function openCategoryPicker(book) {
        const cur = bookCat(book);
        sheet('تصنيف الكتاب', `<div class="lib2-cats" style="flex-wrap:wrap">${CATS.map((c) => `<button type="button" class="lib2-chip ${c.id === cur ? 'is-on' : ''}" data-c="${c.id}">${c.em} ${c.label}</button>`).join('')}</div>`, {
            onMount(m, close) { m.addEventListener('click', (e) => { const b = e.target.closest('[data-c]'); if (!b) return; close(); setMeta(book, { category: b.dataset.c }); }); }
        });
    }

    function openPublishModal(book) {
        const cur = bookCat(book);
        sheet('انشر الكتاب للمدرسين', `
            <p style="margin:-.3rem 0 .8rem; font-size:.86rem; line-height:1.8; color:var(--text-secondary)">
                الكتاب هيتبعت للمراجعة الأول، ولما يتوافق عليه هيظهر في <b>المكتبة العامة</b> وأي مدرس يقدر يضيفه لمكتبته.
                <br>✔ انشر بس الكتب اللي من حقك تشاركها (مش كتب عليها حقوق نشر).</p>
            <div class="form-group"><label for="pb-title">الاسم اللي هيظهر</label><input type="text" id="pb-title" maxlength="200" value="${esc(book.title)}"></div>
            <div class="form-group"><label for="pb-desc">وصف قصير <small>(اختياري)</small></label><textarea id="pb-desc" maxlength="600" rows="3" placeholder="مثلًا: ملخص أحكام النون الساكنة بأمثلة من جزء عمّ، مناسب للأطفال"></textarea></div>
            <div class="form-group"><label for="pb-cat">التصنيف</label><select id="pb-cat">${CATS.map((c) => `<option value="${c.id}" ${c.id === cur ? 'selected' : ''}>${c.em} ${c.label}</option>`).join('')}</select></div>
            <label class="ls-check"><input type="checkbox" id="pb-name" checked> اكتب اسمي على الكتاب (رفعه: ...)</label>
            <div style="display:flex; gap:.5rem; margin-top:1rem"><button type="button" class="btn btn-primary" data-send>ابعته للمراجعة</button></div>`, {
            onMount(m, close) {
                m.querySelector('[data-send]').addEventListener('click', async (e) => {
                    const b = e.currentTarget; b.disabled = true;
                    try {
                        const req = { book_id: book.id, title: m.querySelector('#pb-title').value.trim(), description: m.querySelector('#pb-desc').value.trim(), category: m.querySelector('#pb-cat').value, show_name: m.querySelector('#pb-name').checked };
                        // v35: كتاب على جوجل درايف المدرس: المدرسين التانيين مش هيقدروا يفتحوه من هناك، فبنرفع نسخة على تخزين البرنامج للمكتبة العامة
                        if (Drive.isGdrivePath(book.storage_path)) {
                            b.textContent = 'جاري تجهيز نسخة للمكتبة العامة...';
                            const { buffer, contentType } = await api.fetchBookFile(book.storage_path);
                            const sess = await window.supabaseClient.auth.getSession();
                            const uid = sess && sess.data && sess.data.session ? sess.data.session.user.id : 'public';
                            const safe = String(book.file_name || 'book').replace(/[^\w.\-]+/g, '_').slice(-80);
                            req.storage_path = `${uid}/public/${Date.now().toString(36)}-${safe}`;
                            await api.uploadBookFile(req.storage_path, new File([buffer], safe, { type: contentType || 'application/octet-stream' }));
                        }
                        const r = await api.hub('public_request', req);
                        pubMap[book.id] = { id: r.id, status: 'pending' };
                        sharedPaths.push(req.storage_path || book.storage_path);
                        close(); renderBooks();
                        ErrorHandler.showSuccess('اتبعت للمراجعة ✓ هيوصلك إشعار أول ما يتنشر', 6000);
                        try { window.tmTrack && window.tmTrack('book_publish_requested', {}); } catch (x) { /* تجاهل */ }
                    } catch (err) { b.disabled = false; b.textContent = 'ابعته للمراجعة'; ErrorHandler.showError(ErrorHandler.getErrorMessage(err)); }
                });
            }
        });
    }

    async function unpublish(book) {
        const pub = pubMap[book.id];
        if (!confirm(pub && pub.status === 'approved' ? 'تشيل الكتاب من المكتبة العامة؟ المدرسين اللي ضافوه هيفضل عندهم.' : 'تلغي طلب النشر؟')) return;
        try {
            await api.hub('public_cancel', { book_id: book.id });
            delete pubMap[book.id];
            await loadLibrary();
            renderBooks();
            ErrorHandler.showSuccess('تم ✓');
        } catch (err) { ErrorHandler.showError(ErrorHandler.getErrorMessage(err)); }
    }

    // ------------------------------------------------------------------ التبويبات
    function switchTab(t) {
        document.querySelectorAll('.lib2-tab[data-tab]').forEach((b) => { const on = b.dataset.tab === t; b.classList.toggle('is-on', on); b.setAttribute('aria-selected', String(on)); });
        $('tab-mine').hidden = t !== 'mine';
        $('tab-public').hidden = t !== 'public';
        $('lib-search').placeholder = t === 'public' ? 'ابحث في المكتبة العامة...' : 'ابحث في كل كتبك وفولدراتك...';
        const sb = $('lib-search').closest('.fx-search');
        if (t === 'public') { $('tab-public').prepend(sb); sb.style.maxWidth = 'none'; sb.style.marginBottom = '.7rem'; } else { $('fx-crumbs').after(sb); sb.style.maxWidth = ''; sb.style.marginBottom = ''; }
        try { history.replaceState(null, '', t === 'public' ? '?tab=public' : location.pathname); } catch (e) { /* تجاهل */ }
        if (t === 'public') loadPublic();
    }
    document.querySelectorAll('.lib2-tab[data-tab]').forEach((b) => b.addEventListener('click', () => switchTab(b.dataset.tab)));

    // ------------------------------------------------------------------ المكتبة العامة
    async function loadPublic(force = false) {
        if (!hubOk) { $('pub-section').innerHTML = '<div class="lib2-empty"><span class="em">🌍</span>المكتبة العامة هتشتغل قريب إن شاء الله.</div>'; return; }
        if (pubBooks && !force) { renderPublic(); return; }
        $('pub-section').innerHTML = '<div class="loading">جاري التحميل...</div>';
        try {
            const r = await api.hub('public_list', {}, force ? { fresh: true } : {});
            pubBooks = r.books || [];
            $('n-public').textContent = pubBooks.length ? String(pubBooks.length) : '';
            renderPublic();
        } catch (err) {
            $('pub-section').innerHTML = `<div class="lib2-empty">مقدرناش نحمّل المكتبة العامة: ${esc(ErrorHandler.getErrorMessage(err))}</div>`;
        }
    }
    function renderPublic() {
        if (!pubBooks) return;
        const used = new Set(pubBooks.map((b) => b.category || 'other'));
        $('pub-cats').innerHTML = `<button type="button" class="lib2-chip ${!pubCat ? 'is-on' : ''}" data-pc="">الكل</button>`
            + CATS.filter((c) => used.has(c.id)).map((c) => `<button type="button" class="lib2-chip ${pubCat === c.id ? 'is-on' : ''}" data-pc="${c.id}">${c.em} ${c.label}</button>`).join('');
        let list = pubBooks.filter((b) => !pubCat || (b.category || 'other') === pubCat);
        if (query) { const q = query.toLowerCase(); list = list.filter((b) => `${b.title} ${b.description || ''}`.toLowerCase().includes(q)); }
        if (!pubBooks.length) { $('pub-section').innerHTML = '<div class="lib2-empty"><span class="em">🌱</span>لسه مفيش كتب منشورة. كن أول مدرس يشارك كتاب مفيد: من ⋮ على الكتاب ← "انشره للمدرسين".</div>'; return; }
        if (!list.length) { $('pub-section').innerHTML = '<div class="lib2-empty"><span class="em">🔍</span>مفيش نتايج.</div>'; return; }
        $('pub-section').innerHTML = `<div class="lib2-grid">${list.map((b) => {
            const c = catOf(b.category) || catOf('other');
            return `<article class="bk pubcard" data-pub="${b.id}" style="--cv:${c.cv}">
                <div class="bk-cover"><span class="em" aria-hidden="true">${c.em}</span><span class="ttl" aria-hidden="true">${esc(b.title)}</span>
                    <div class="bk-flags">${b.downloads ? `<span class="bk-flag">⬇ ${b.downloads}</span>` : ''}</div></div>
                <div class="bk-body">
                    <p class="bk-title" title="${esc(b.title)}">${esc(b.title)}</p>
                    ${b.description ? `<p class="bk-meta" style="display:block; line-height:1.6">${esc(b.description)}</p>` : ''}
                    <small>${[TYPE_LABEL[b.file_type] || b.file_type, b.page_count ? `${b.page_count} صفحة` : '', b.uploader ? `رفعه: ${esc(b.uploader)}` : ''].filter(Boolean).join(' · ')}</small>
                    <div class="bk-actions">
                        ${b.in_library || b.mine ? `<button type="button" class="btn btn-ghost" disabled>✓ ${b.mine ? 'كتابك' : 'في مكتبتك'}</button>` : `<button type="button" class="btn btn-primary" data-pa="add">${icon('plus', { size: 14 })} <span>أضف لمكتبتي</span></button>`}
                        <button type="button" class="btn btn-ghost bk-more" data-pa="download" title="تحميل الملف" aria-label="تحميل الملف">${icon('download', { size: 16 })}</button>
                    </div>
                </div></article>`;
        }).join('')}</div>`;
    }
    $('pub-cats').addEventListener('click', (e) => { const c = e.target.closest('[data-pc]'); if (!c) return; pubCat = c.dataset.pc; renderPublic(); });
    $('pub-section').addEventListener('click', async (e) => {
        const b = e.target.closest('[data-pa]');
        const card = e.target.closest('[data-pub]');
        if (!b || !card) return;
        const pb = (pubBooks || []).find((x) => x.id === card.dataset.pub);
        if (!pb) return;
        b.disabled = true;
        try {
            if (b.dataset.pa === 'add') {
                const r = await api.hub('public_add', { public_id: pb.id });
                pb.in_library = true;
                renderPublic();
                await loadBooks();
                ErrorHandler.showSuccess(r.indexed === false ? 'اتضاف لمكتبتك ✓ (دوس "إعادة المعالجة" مرة عشان تقدر تسأله)' : 'اتضاف لمكتبتك ✓', 5000);
                try { window.tmTrack && window.tmTrack('public_book_added', {}); } catch (x) { /* تجاهل */ }
            } else {
                const r = await api.hub('public_download', { public_id: pb.id });
                const url = await api.getBookFileUrl(r.storage_path, { download: r.file_name || true });
                window.open(url, '_blank', 'noopener');
                b.disabled = false;
            }
        } catch (err) { b.disabled = false; ErrorHandler.showError(ErrorHandler.getErrorMessage(err)); }
    });

    // ------------------------------------------------------------------ فتح الكتاب
    function openBook(book, { chat = false, source = null, opener = null } = {}) {
        if (viewer) return viewer;
        if (!book.storage_path) { ErrorHandler.showError('ملف الكتاب غير متاح.'); return null; }
        viewer = openBookViewer({
            api, book, opener: opener || document.activeElement,
            onClose: () => { viewer = null; }
        });
        if (chat) viewer.chat.open();
        if (source) viewer.ready.then(() => { if (viewer) viewer.goToSource(source); });
        if (hubOk) {
            book.last_opened_at = new Date().toISOString();
            api.hub('book_meta', { book_id: book.id, opened: true }).catch(() => { /* تجاهل */ });
        }
        return viewer;
    }

    // ------------------------------------------------------------------ تحميل القائمة
    function needsPolling() {
        return books.some((b) => (b.status === 'processing' || b.status === 'uploading') && !active.has(b.id) && effectiveStatus(b) !== 'stalled');
    }

    async function loadLibrary() {
        if (!hubOk) return;
        try {
            const lib = await api.hub('library', {}, { fresh: true });
            folders = lib.folders || [];
            pubMap = lib.public || {};
            sharedPaths = lib.shared_paths || [];
            features = Array.isArray(lib.features) ? lib.features : [];
            $('n-public').textContent = lib.public_count ? String(lib.public_count) : '';
        } catch (err) {
            // workflow app-hub لسه ماتفعّلش: المكتبة تشتغل زي الأول
            if (err && (err.status === 404 || (err.error && err.error.code === 'DB_ERROR'))) hubOk = false;
        }
        if (curFolder() === null && loc.f && !loc.s) loc = { f: null };
    }

    async function loadBooks() {
        try {
            const [data] = await Promise.all([api.listBooks(), loadLibrary()]);
            books = data.books || [];
            loaded = true;
            renderAll();
        } catch (error) {
            $('books-section').innerHTML = `<div class="fx-empty">تعذّر تحميل المكتبة: ${esc(ErrorHandler.getErrorMessage(error))}</div>`;
        }
        if (pollTimer) clearTimeout(pollTimer);
        if (needsPolling()) pollTimer = setTimeout(loadBooks, 4000);
    }

    // ------------------------------------------------------------------ جوجل درايف
    async function connectDriveFlow() {
        try {
            const r = await Drive.connectDrive();
            ErrorHandler.showSuccess(`جوجل درايف اتوصّل ✓${r.email ? ` (${r.email})` : ''} الكتب الجديدة هتترفع عليه`, 5000);
            try { window.tmTrack && window.tmTrack('gdrive_connected', {}); } catch (e) { /* تجاهل */ }
            renderSide();
        } catch (err) { ErrorHandler.showError(ErrorHandler.getErrorMessage(err)); }
    }
    function openDriveSettings() {
        const onDrive = books.filter((b) => Drive.isGdrivePath(b.storage_path)).length;
        const onApp = books.filter((b) => b.storage_path && !Drive.isGdrivePath(b.storage_path) && !b.public_book_id).length;
        sheet('تخزين الكتب', `
            <p style="margin:-.3rem 0 .7rem; font-size:.86rem; line-height:1.8; color:var(--text-secondary)">☁️ متوصّل بـ <b>${esc(Drive.driveEmail() || 'جوجل درايف')}</b><br>
            على الدرايف: <b>${onDrive}</b> كتاب · على تخزين البرنامج: <b>${onApp}</b> كتاب<br><span data-quota></span></p>
            <label class="ls-check"><input type="checkbox" data-pref ${Drive.drivePreferred() ? 'checked' : ''}> ارفع الكتب الجديدة على جوجل درايف بتاعي</label>
            <div style="display:flex; gap:.5rem; flex-wrap:wrap; margin-top:1rem">
                ${onApp ? `<button type="button" class="btn btn-primary" data-all>انقل كل كتبي (${onApp}) للدرايف</button>` : ''}
                <button type="button" class="btn btn-outline-danger" data-off>افصل جوجل درايف</button>
            </div>
            <p style="font-size:.74rem; color:var(--text-light); margin:.7rem 0 0; line-height:1.7">البرنامج بيشوف بس الملفات اللي اترفعت منه (في فولدر "Teachers Manager - كتبي")، ومايقدرش يشوف باقي ملفاتك.
            لو فصلت الدرايف، الكتب اللي عليه هتفضل في مكتبتك بس هتحتاج توصّله تاني عشان تفتحها.</p>`, {
            onMount(m, close) {
                Drive.driveQuota().then((q) => { const el = m.querySelector('[data-quota]'); if (el && q.limit) el.textContent = `مساحة الدرايف: ${(q.used / 1073741824).toFixed(1)} من ${(q.limit / 1073741824).toFixed(0)} جيجا`; }).catch(() => {});
                m.querySelector('[data-pref]').addEventListener('change', (e) => { Drive.setDrivePreferred(e.target.checked); renderSide(); });
                m.querySelector('[data-off]').addEventListener('click', () => { if (!confirm('تفصل جوجل درايف؟')) return; Drive.disconnectDrive(); close(); renderSide(); });
                const all = m.querySelector('[data-all]');
                if (all) all.addEventListener('click', async () => { close(); for (const b of books.filter((x) => x.storage_path && !Drive.isGdrivePath(x.storage_path) && !x.public_book_id)) { if (!(await moveBookToDrive(b, { quiet: true }))) break; } ErrorHandler.showSuccess('خلصنا نقل الكتب ✓'); renderAll(); });
            }
        });
    }
    /** نقل كتاب موجود من تخزين البرنامج للدرايف */
    async function moveBookToDrive(book, { quiet = false } = {}) {
        if (isShared(book)) { if (!quiet) ErrorHandler.showError('الكتاب ده منشور في المكتبة العامة، فبيفضل على تخزين البرنامج.'); return true; }
        try {
            if (!quiet) ErrorHandler.showSuccess(`جاري نقل "${book.title}" لجوجل درايف...`, 3000);
            const { buffer, contentType } = await api.fetchBookFile(book.storage_path);
            const file = new File([buffer], book.file_name || `${book.title}.${book.file_type || 'pdf'}`, { type: contentType || 'application/octet-stream' });
            const oldPath = book.storage_path;
            const path = await Drive.uploadToDrive(file, { name: file.name });
            try { await api.setBookStorage(book.id, path, { file_size: file.size }); }
            catch (err) { await Drive.deleteFromDrive(path); throw err; }
            book.storage_path = path;
            await api.deleteBookFile(oldPath);
            if (!quiet) { ErrorHandler.showSuccess('اتنقل لجوجل درايف ✓'); renderBooks(); }
            return true;
        } catch (err) { ErrorHandler.showError(`"${book.title}": ${ErrorHandler.getErrorMessage(err)}`); return false; }
    }

    // ------------------------------------------------------------------ v35.2: الرفع — نافذة اختيار الملفات + لوحة الرفع (نسبة/سرعة/وقت باقي) + التحليل
    const MAX_BYTES = CONFIG.BOOKS_SETTINGS.MAX_FILE_MB * 1024 * 1024;
    const DRIVE_MAX_BYTES = 300 * 1024 * 1024;
    const useDriveUpload = () => driveReady() && Drive.driveConnected() && (document.querySelector('input[name="upload-store"]:checked') || {}).value === 'drive';
    const fmtSize = (b) => (b >= 1048576 ? `${(b / 1048576).toFixed(b >= 10485760 ? 0 : 1)} ميجا` : `${Math.max(1, Math.round(b / 1024))} ك.ب`);
    const fmtTime = (s) => (!isFinite(s) || s <= 0 ? '' : s < 60 ? `${Math.ceil(s)} ثانية` : `${Math.ceil(s / 60)} دقيقة`);
    const TYPE_SHORT = { pdf: 'PDF', docx: 'DOC', pptx: 'PPT', txt: 'TXT', image: 'IMG' };

    /** نافذة تأكيد (بدل confirm() اللي شكلها مش مفهوم على الموبايل) */
    function askConfirm({ title, text, ok = 'أيوه', cancel = 'لأ', danger = true, icon: ic = '⚠️' }) {
        return new Promise((resolve) => {
            const el = document.createElement('div');
            el.className = 'tm-confirm';
            el.setAttribute('role', 'alertdialog');
            el.setAttribute('aria-modal', 'true');
            el.innerHTML = `<div><h3>${ic} ${esc(title)}</h3><p>${esc(text)}</p><div class="row">
                <button type="button" class="btn btn-outline" data-c="0">${esc(cancel)}</button>
                <button type="button" class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-c="1">${esc(ok)}</button></div></div>`;
            const done = (v) => { el.remove(); document.removeEventListener('keydown', onKey, true); resolve(v); };
            const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); done(false); } };
            el.addEventListener('click', (e) => { const b = e.target.closest('[data-c]'); if (b) done(b.dataset.c === '1'); else if (e.target === el) done(false); });
            document.addEventListener('keydown', onKey, true);
            document.body.appendChild(el);
            el.querySelector('[data-c="0"]').focus();
        });
    }

    // ---------- نافذة اختيار الملفات
    let picked = [];   // {id, file, type, title, cat, err}
    let pickSeq = 0;
    $('upload-cat').innerHTML = '<option value="">تلقائي من الاسم</option>' + CATS.map((c) => `<option value="${c.id}">${c.em} ${c.label}</option>`).join('');
    function folderOptions() {
        const out = ['<option value="">🏠 أول المكتبة</option>'];
        const walk = (id, depth) => sortFolders(kidsOf(id)).forEach((f) => { out.push(`<option value="${f.id}">${'— '.repeat(depth)}${esc(f.icon || '📁')} ${esc(f.name)}</option>`); walk(f.id, depth + 1); });
        walk(null, 0);
        return out.join('');
    }
    const maxFor = () => (useDriveUpload() ? DRIVE_MAX_BYTES : MAX_BYTES);
    function validate(p) {
        if (!p.type) return 'نوع الملف ده مش مدعوم';
        if (p.file.size > maxFor()) return useDriveUpload() ? 'أكبر من ٣٠٠ ميجا — قسّمه لأجزاء' : `أكبر من ${CONFIG.BOOKS_SETTINGS.MAX_FILE_MB} ميجا${driveReady() && Drive.driveConnected() ? ' — اختار "جوجل درايف" تحت' : ' — قسّمه أو اضغطه'}`;
        if (!p.file.size) return 'الملف فاضي';
        return '';
    }
    function addFiles(list) {
        const arr = [...(list || [])];
        for (const f of arr) {
            if (picked.some((p) => p.file.name === f.name && p.file.size === f.size)) continue;
            const type = detectFileType(f);
            const title = f.name.replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ').trim().slice(0, 200);
            picked.push({ id: ++pickSeq, file: f, type, title, cat: guessCategory(title) || '' });
        }
        renderPicked();
    }
    function renderPicked() {
        picked.forEach((p) => { p.err = validate(p); });
        const box = $('up-files');
        box.innerHTML = picked.map((p) => `<div class="up-file ${p.err ? 'bad' : ''}" data-pid="${p.id}">
            <span class="up-fic ${p.err ? 'bad' : p.type}">${esc(TYPE_SHORT[p.type] || '؟')}</span>
            <div class="up-fmain">
                <input type="text" value="${esc(p.title)}" maxlength="200" aria-label="اسم الكتاب" data-ptitle ${p.err ? 'disabled' : ''}>
                <div class="up-fmeta"><span>${esc(fmtSize(p.file.size))}</span><span>·</span><span>${esc(TYPE_LABEL[p.type] || p.file.name.split('.').pop())}</span>
                    ${p.err ? `<span class="err">${esc(p.err)}</span>` : `<select data-pcat aria-label="التصنيف"><option value="">تصنيف تلقائي</option>${CATS.map((c) => `<option value="${c.id}" ${p.cat === c.id ? 'selected' : ''}>${c.em} ${c.label}</option>`).join('')}</select>`}</div>
            </div>
            <button type="button" class="up-frm" data-prm aria-label="شيل ${esc(p.title)}" title="شيل">✕</button>
        </div>`).join('');
        const ok = picked.filter((p) => !p.err);
        $('upload-modal').classList.toggle('has-files', picked.length > 0);
        $('up-opts').hidden = !picked.length || !hubOk;
        $('upload-cat').closest('.up-opt').hidden = ok.length > 1;   // لأكتر من ملف: التصنيف من كل ملف
        const total = ok.reduce((n, p) => n + p.file.size, 0);
        $('up-sum').textContent = picked.length ? `${ok.length} ملف · ${fmtSize(total)}${picked.length > ok.length ? ` · ${picked.length - ok.length} مش هيترفع` : ''}` : '';
        const btn = $('upload-submit-btn');
        btn.disabled = !ok.length;
        btn.textContent = ok.length > 1 ? `ارفع ${ok.length} ملفات` : 'ارفع';
        $('up-limit').textContent = useDriveUpload() ? 'تقدر تختار أكتر من ملف · لحد ٣٠٠ ميجا للملف على جوجل درايف' : `تقدر تختار أكتر من ملف · لحد ${CONFIG.BOOKS_SETTINGS.MAX_FILE_MB} ميجا للملف`;
    }
    $('up-files').addEventListener('input', (e) => { const r = e.target.closest('[data-pid]'); const p = r && picked.find((x) => String(x.id) === r.dataset.pid); if (p && e.target.matches('[data-ptitle]')) p.title = e.target.value; });
    $('up-files').addEventListener('change', (e) => { const r = e.target.closest('[data-pid]'); const p = r && picked.find((x) => String(x.id) === r.dataset.pid); if (p && e.target.matches('[data-pcat]')) p.cat = e.target.value; });
    $('up-files').addEventListener('click', (e) => { const b = e.target.closest('[data-prm]'); if (!b) return; picked = picked.filter((x) => String(x.id) !== b.closest('[data-pid]').dataset.pid); renderPicked(); });
    $('upload-file-input').addEventListener('change', (e) => { addFiles(e.target.files); e.target.value = ''; });
    $('upload-any-btn').addEventListener('click', () => { $('upload-file-any').value = ''; $('upload-file-any').click(); });
    $('upload-file-any').addEventListener('change', (e) => { addFiles(e.target.files); e.target.value = ''; });
    document.querySelectorAll('input[name="upload-store"]').forEach((r) => r.addEventListener('change', renderPicked));
    const drop = $('up-drop');
    drop.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('upload-file-input').click(); } });
    ['dragenter', 'dragover'].forEach((ev) => $('upload-modal').addEventListener(ev, (e) => { if ([...(e.dataTransfer.types || [])].includes('Files')) { e.preventDefault(); drop.classList.add('over'); } }));
    $('upload-modal').addEventListener('dragleave', (e) => { if (!$('upload-modal').contains(e.relatedTarget)) drop.classList.remove('over'); });
    $('upload-modal').addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('over'); addFiles(e.dataTransfer.files); });

    function openUpload(files = null, _more = 0, folderId) {
        picked = [];
        $('upload-folder').innerHTML = folderOptions();
        $('upload-folder').value = folderId !== undefined ? (folderId || '') : (curFolder() || '');
        $('upload-cat').value = '';
        const st = $('upload-storage');
        st.hidden = !(driveReady() && Drive.driveConnected());
        if (!st.hidden) {
            document.querySelector(`input[name="upload-store"][value="${Drive.drivePreferred() ? 'drive' : 'app'}"]`).checked = true;
            $('upload-drive-email').textContent = Drive.driveEmail() ? `على ${Drive.driveEmail()} · لحد ٣٠٠ ميجا` : 'الملف ملكك وعلى مساحتك';
            $('upload-app-limit').textContent = `لحد ${CONFIG.BOOKS_SETTINGS.MAX_FILE_MB} ميجا للملف`;
        }
        const m = $('upload-modal');
        m.classList.add('active'); m.setAttribute('aria-hidden', 'false');
        if (files) addFiles(files instanceof File ? [files] : files); else renderPicked();
        setTimeout(() => drop.focus({ preventScroll: true }), 60);
    }
    async function closeUpload({ force = false } = {}) {
        if (!force && picked.some((p) => !p.err)) {
            const yes = await askConfirm({ title: 'تقفل من غير ما ترفع؟', text: `اخترت ${picked.filter((p) => !p.err).length} ملف ولسه مارفعتهمش.`, ok: 'أيوه، اقفل', cancel: 'لأ، كمّل', icon: '📁' });
            if (!yes) return;
        }
        picked = [];
        const m = $('upload-modal');
        m.classList.remove('active'); m.setAttribute('aria-hidden', 'true');
    }
    $('up-close').addEventListener('click', () => closeUpload());
    $('up-cancel').addEventListener('click', () => closeUpload());
    $('upload-modal').addEventListener('mousedown', (e) => { if (e.target === $('upload-modal')) closeUpload(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && $('upload-modal').classList.contains('active') && !document.querySelector('.tm-confirm')) closeUpload(); });

    $('upload-submit-btn').addEventListener('click', () => {
        const ok = picked.filter((p) => !p.err);
        if (!ok.length) return;
        const folderId = $('upload-folder').value || '';
        const oneCat = ok.length === 1 ? ($('upload-cat').value || ok[0].cat) : '';
        const toDrive = useDriveUpload();
        ok.forEach((p) => enqueue({ file: p.file, type: p.type, title: (p.title || p.file.name).trim().slice(0, 200) || p.file.name, category: (ok.length === 1 ? oneCat : p.cat) || guessCategory(p.title) || '', folderId, toDrive }));
        closeUpload({ force: true });
    });

    // ---------- لوحة الرفع (طابور: ملف ورا التاني — رفع وبعده تحليل)
    const queue = [];   // {qid, file, type, title, category, folderId, toDrive, state, pct, loaded, speed, eta, msg, error, ctl, bookId, drivePath}
    let qSeq = 0;
    let running = false;
    const qBusy = () => queue.some((q) => ['wait', 'create', 'upload', 'process'].includes(q.state));
    function enqueue(item) {
        queue.push({ qid: ++qSeq, state: 'wait', pct: 0, ...item });
        $('uq').hidden = false; $('uq').classList.remove('min'); $('uq-min').textContent = '▾';
        renderQueue();
        runQueue();
    }
    function itemStatus(q) {
        if (q.state === 'wait') return ['مستني دوره...', ''];
        if (q.state === 'create') return ['بيجهّز الملف...', ''];
        if (q.state === 'upload') return [`${q.toDrive ? 'بيترفع على جوجل درايف' : 'بيترفع'} ${q.pct}%`, [`${fmtSize(q.loaded || 0)} من ${fmtSize(q.file.size)}`, q.speed ? `${fmtSize(q.speed)}/ث` : '', q.eta ? `باقي ${fmtTime(q.eta)}` : ''].filter(Boolean).join(' · ')];
        if (q.state === 'process') return [`بيتحلّل ${q.pct}%`, q.msg || ''];
        if (q.state === 'done') return [q.msg || 'خلص ✓ وجاهز في مكتبتك', ''];
        if (q.state === 'cancel') return ['اتلغى', q.msg || ''];
        return [q.error || 'ماكملش', ''];
    }
    function itemRow(q) {
        const [a, b] = itemStatus(q);
        const cls = q.state === 'done' ? 'ok' : q.state === 'fail' ? 'bad' : q.state === 'cancel' ? 'cancel' : '';
        const active = ['wait', 'create', 'upload', 'process'].includes(q.state);
        const bar = active ? `<div class="uq-prog ${q.state === 'process' ? 'proc' : ''} ${q.state === 'wait' || q.state === 'create' ? 'wait' : ''}" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${q.pct}"><i style="width:${q.pct}%"></i></div>` : '';
        const acts = active ? `<button type="button" data-uq="cancel" aria-label="إلغاء ${esc(q.title)}" title="إلغاء">✕</button>`
            : q.state === 'fail' ? `<button type="button" data-uq="retry" aria-label="حاول تاني" title="حاول تاني">↻</button><button type="button" data-uq="drop" aria-label="شيل" title="شيل">✕</button>`
            : q.state === 'done' ? `<span class="uq-done" aria-hidden="true">✓</span>` : `<button type="button" data-uq="drop" aria-label="شيل" title="شيل">✕</button>`;
        return `<div class="uq-it" data-qid="${q.qid}" data-state="${q.state}"><span class="up-fic ${q.type}">${esc(TYPE_SHORT[q.type] || '')}</span>
            <div class="uq-main"><div class="uq-name" title="${esc(q.title)}">${esc(q.title)}</div>${bar}<div class="uq-st ${cls}"><span>${esc(a)}</span>${b ? `<span>· ${esc(b)}</span>` : ''}</div></div>
            <div class="uq-act">${acts}</div></div>`;
    }
    function renderQueue() {
        if (!queue.length) { $('uq').hidden = true; return; }
        $('uq-list').innerHTML = queue.map(itemRow).join('');
        updateQueueHead();
    }
    function updateQueueHead() {
        const act = queue.filter((q) => ['wait', 'create', 'upload', 'process'].includes(q.state));
        const done = queue.filter((q) => q.state === 'done').length;
        const fail = queue.filter((q) => q.state === 'fail').length;
        // النسبة الكلية: الرفع نص الشغل والتحليل النص التاني
        const part = (q) => (q.state === 'done' || q.state === 'cancel' || q.state === 'fail' ? 100 : q.state === 'upload' ? q.pct / 2 : q.state === 'process' ? 50 + q.pct / 2 : 0);
        const overall = Math.round(queue.reduce((n, q) => n + part(q), 0) / queue.length);
        $('uq-bar').style.width = `${act.length ? overall : 100}%`;
        if (act.length) {
            const cur = act.find((q) => q.state !== 'wait');
            $('uq-title').textContent = `${cur && cur.state === 'process' ? 'بيتحلّل' : 'جاري الرفع'} · ${done + 1} من ${queue.length}`;
            $('uq-sub').textContent = `${overall}% · خلّي الصفحة مفتوحة لحد ما يخلص`;
        } else {
            $('uq-title').textContent = fail ? `خلص · ${fail} ماكملش` : `خلص رفع ${done} ${done === 1 ? 'ملف' : 'ملفات'} ✓`;
            $('uq-sub').textContent = fail ? 'اضغط ↻ عشان تحاول تاني' : 'الكتب جاهزة في مكتبتك';
        }
        $('uq-close').title = act.length ? 'إلغاء الكل' : 'قفل';
    }
    /** تحديث صف واحد بس (من غير ما الليستة كلها تترسم كل ثانية) */
    function updateItem(q) {
        const row = document.querySelector(`.uq-it[data-qid="${q.qid}"]`);
        if (!row) { renderQueue(); return; }
        const fresh = document.createElement('div'); fresh.innerHTML = itemRow(q);
        const nr = fresh.firstElementChild;
        if (row.dataset.state === q.state) {
            // نفس الحالة: نحدّث النسبة والنص بس (الأزرار تفضل زي ما هي عشان الضغطة ماتضيعش)
            const bar = row.querySelector('.uq-prog i'); const nb = nr.querySelector('.uq-prog i');
            if (bar && nb) { bar.style.width = nb.style.width; row.querySelector('.uq-prog').setAttribute('aria-valuenow', String(q.pct)); }
            row.querySelector('.uq-st').outerHTML = nr.querySelector('.uq-st').outerHTML;
            row.querySelector('.uq-name').textContent = q.title;
        } else row.replaceWith(nr);
        updateQueueHead();
    }
    $('uq-min').addEventListener('click', () => { const m = $('uq').classList.toggle('min'); $('uq-min').textContent = m ? '▴' : '▾'; $('uq-min').setAttribute('aria-label', m ? 'تكبير' : 'تصغير'); });
    $('uq-close').addEventListener('click', async () => {
        if (qBusy()) {
            const n = queue.filter((q) => ['wait', 'create', 'upload', 'process'].includes(q.state)).length;
            const yes = await askConfirm({ title: 'توقف كل الرفع؟', text: `في ${n} ملف لسه بيترفع أو بيتحلّل. الملفات اللي مارفعتش هتتلغي، واللي بيتحلّل هيقف وتقدر تكمّله بعدين.`, ok: 'أيوه، وقّف الكل', cancel: 'لأ، كمّل' });
            if (!yes) return;
            queue.forEach((q) => { if (['wait', 'create', 'upload', 'process'].includes(q.state)) cancelItem(q); });
        }
        queue.length = 0; renderQueue();
    });
    $('uq-list').addEventListener('click', async (e) => {
        const b = e.target.closest('[data-uq]'); if (!b) return;
        const q = queue.find((x) => String(x.qid) === b.closest('[data-qid]').dataset.qid); if (!q) return;
        const act = b.dataset.uq;
        if (act === 'drop') { queue.splice(queue.indexOf(q), 1); renderQueue(); return; }
        if (act === 'retry') {
            // الملف اترفع قبل كده والتحليل بس اللي فشل: نكمّل التحليل من غير ما نرفع تاني
            const bk = q.retryProcessOnly && books.find((x) => x.id === q.doneBookId);
            if (bk) {
                Object.assign(q, { state: 'process', pct: 0, error: '', msg: 'بيبدأ...', bookId: bk.id }); updateItem(q);
                const r = await startProcessing(bk, q.file, { onProgress: (i) => { q.pct = Math.round(i.percent || 0); q.msg = i.message || ''; updateItem(q); }, quiet: true });
                Object.assign(q, r.ok ? { state: 'done', pct: 100, msg: 'جاهز ✓ في مكتبتك', retryProcessOnly: false } : r.aborted ? { state: 'cancel', msg: 'التحليل وقف' } : { state: 'fail', error: `التحليل ماكملش: ${r.error}` });
                q.bookId = null; updateItem(q); return;
            }
            Object.assign(q, { state: 'wait', pct: 0, loaded: 0, error: '', msg: '', speed: 0, eta: 0, retryProcessOnly: false }); renderQueue(); runQueue(); return;
        }
        if (act === 'cancel') {
            const texts = {
                wait: ['تشيله من الرفع؟', `"${q.title}" لسه مابدأش يترفع.`, 'أيوه، شيله'],
                create: ['توقف الرفع؟', `هنوقف رفع "${q.title}".`, 'أيوه، وقّف'],
                upload: ['توقف الرفع؟', `"${q.title}" اترفع منه ${q.pct}%. لو وقّفت، اللي اترفع هيتمسح ومش هيتحفظ في مكتبتك.`, 'أيوه، وقّف الرفع'],
                process: ['توقف التحليل؟', `"${q.title}" اترفع خلاص وهيفضل في مكتبتك، بس تحليله هيقف (والسؤال من الكتاب مش هيشتغل لحد ما تكمّله). تقدر تكمّله بعدين من "إعادة المعالجة".`, 'أيوه، وقّف التحليل']
            }[q.state];
            if (!texts) return;
            const yes = await askConfirm({ title: texts[0], text: texts[1], ok: texts[2], cancel: 'لأ، كمّل' });
            if (yes && ['wait', 'create', 'upload', 'process'].includes(q.state)) cancelItem(q);
        }
    });
    function cancelItem(q) {
        if (q.state === 'wait') { q.state = 'cancel'; updateItem(q); return; }
        q.cancelled = true;
        if (q.ctl) q.ctl.abort();
        if (q.state === 'process') { const live = q.bookId && active.get(q.bookId); if (live) live.ctl.abort(); }
    }

    async function runQueue() {
        if (running) return;
        running = true;
        try {
            for (;;) {
                const q = queue.find((x) => x.state === 'wait');
                if (!q) break;
                await uploadOne(q);
            }
        } finally {
            running = false;
            if (!qBusy()) keepScreenOn(false);
            renderQueue();
        }
    }

    async function uploadOne(q) {
        q.ctl = new AbortController();
        q.cancelled = false;
        q.bookId = null; q.drivePath = null;
        await keepScreenOn(true);
        const cleanup = async () => {
            if (q.drivePath) await Drive.deleteFromDrive(q.drivePath);
            if (q.bookId) { try { await api.deleteBook(q.bookId); } catch (e) { /* تجاهل */ } books = books.filter((b) => b.id !== q.bookId); }
        };
        try {
            q.state = 'create'; q.pct = 0; updateItem(q);
            const createRes = await api.createBookSource(q.title, q.file.name, q.type);
            q.bookId = createRes.book_id;
            if (q.cancelled) throw { aborted: true };
            // ---- الرفع مع النسبة والسرعة والوقت الباقي
            q.state = 'upload'; updateItem(q);
            const t0 = Date.now();
            let lastPaint = 0;
            const onProgress = (loaded, total) => {
                q.loaded = loaded;
                q.pct = Math.min(99, Math.floor((loaded / Math.max(1, total)) * 100));
                const secs = (Date.now() - t0) / 1000;
                q.speed = secs > 0.5 ? loaded / secs : 0;
                q.eta = q.speed ? (total - loaded) / q.speed : 0;
                if (Date.now() - lastPaint > 250) { lastPaint = Date.now(); updateItem(q); }
            };
            let storagePath = createRes.storage_path;
            if (q.toDrive) {
                try {
                    q.drivePath = await Drive.uploadToDrive(q.file, { name: q.file.name, onProgress, signal: q.ctl.signal });
                    await api.setBookStorage(q.bookId, q.drivePath, { file_size: q.file.size });
                    storagePath = q.drivePath;
                } catch (err) {
                    if (err && err.aborted) throw err;
                    if (q.drivePath) { await Drive.deleteFromDrive(q.drivePath); q.drivePath = null; }
                    if (q.file.size > MAX_BYTES) throw err;
                    // الدرايف رفض (مساحة/صلاحية): نكمّل على تخزين البرنامج
                    q.toDrive = false; q.pct = 0; updateItem(q);
                    ErrorHandler.showError(`"${q.title}": مقدرناش نحفظه على جوجل درايف (${ErrorHandler.getErrorMessage(err)})، فهيترفع على تخزين البرنامج.`, 7000);
                    await api.uploadBookFileWithProgress(createRes.storage_path, q.file, { onProgress, signal: q.ctl.signal });
                }
            } else {
                await api.uploadBookFileWithProgress(createRes.storage_path, q.file, { onProgress, signal: q.ctl.signal });
            }
            q.pct = 100; q.loaded = q.file.size; updateItem(q);
            const book = { id: q.bookId, title: q.title, file_name: q.file.name, file_type: q.type, storage_path: storagePath, status: 'uploading', updated_at: new Date().toISOString(), created_at: new Date().toISOString(), progress: 0, category: q.category || null, folder_id: q.folderId || null };
            books.unshift(book);
            q.drivePath = null;   // اترفع واتسجّل: مانمسحوش لو التحليل اتلغى
            const doneId = q.bookId; q.bookId = null;
            if (hubOk && (q.category || q.folderId)) {
                try {
                    if (q.category) await api.hub('book_meta', { book_id: doneId, category: q.category });
                    if (q.folderId) await api.hub('book_move', { book_id: doneId, folder_id: q.folderId });
                } catch (er) { /* الكتاب نفسه سليم */ }
            }
            renderAll();
            // ---- التحليل
            q.state = 'process'; q.pct = 0; q.msg = 'بيبدأ...'; q.bookId = doneId; updateItem(q);
            const r = await startProcessing(book, q.file, { onProgress: (i) => { q.pct = Math.max(0, Math.min(100, Math.round(i.percent || 0))); q.msg = i.message || ''; updateItem(q); }, quiet: true });
            if (r.aborted) { q.state = 'cancel'; q.msg = 'الكتاب في مكتبتك، والتحليل وقف (تقدر تكمّله من "إعادة المعالجة")'; }
            else if (r.error) { q.state = 'fail'; q.error = `اترفع بس التحليل ماكملش: ${r.error}`; q.retryProcessOnly = true; q.doneBookId = doneId; }
            else { q.state = 'done'; q.pct = 100; q.msg = r.failedPages ? `جاهز ✓ (${r.failedPages} صفحة ماتقرتش)` : 'جاهز ✓ في مكتبتك'; }
            q.bookId = null;
            updateItem(q);
        } catch (err) {
            const aborted = !!(err && err.aborted) || q.cancelled;
            if (!aborted) reportUploadFail(q, err);
            await cleanup();
            q.state = aborted ? 'cancel' : 'fail';
            q.error = aborted ? '' : (err && err.message) || ErrorHandler.getErrorMessage(err);
            q.msg = aborted ? 'اتلغى ومااتحفظش حاجة' : '';
            q.bookId = null;
            updateItem(q);
            renderAll();
        }
    }

    // v35.6: سبب فشل الرفع بيتسجّل (نوع المشكلة + حجم الملف + نوع النت + موديل الموبايل) عشان نعرف المشكلة من غير ما نسأل المدرس
    async function reportUploadFail(q, err) {
        try {
            let model = '';
            try { const h = navigator.userAgentData && await navigator.userAgentData.getHighEntropyValues(['model']); model = (h && h.model) || ''; } catch (e) { /* تجاهل */ }
            if (!model) { const m = /Android [^;]+; ([^;)]+)[;)]/.exec(navigator.userAgent || ''); model = m && m[1] !== 'K' ? m[1] : ''; }
            const c = navigator.connection || {};
            track('book_upload_failed', {
                code: String((err && err.error && err.error.code) || (err && err.code) || 'ERR').slice(0, 20), kind: (err && err.kind) || '', status: (err && err.status) || 0,
                stage: q.state, to_drive: !!q.toDrive, size_mb: Math.round((q.file.size / 1048576) * 10) / 10, type: q.type,
                conn: c.effectiveType || '', save_data: !!c.saveData, online: navigator.onLine !== false, model: String(model).slice(0, 40)
            }, { gtm: false });
        } catch (e) { /* تجاهل */ }
    }

    // ------------------------------------------------------------------ المعالجة (التحليل)
    // الخروج من الصفحة والرفع/التحليل شغال: المتصفح بيسأل
    window.addEventListener('beforeunload', (e) => {
        if (active.size > 0 || qBusy()) { e.preventDefault(); e.returnValue = ''; }
    });
    // الضغط على أي لينك جوه البرنامج (القايمة، المصحف...) والرفع شغال: نسأل الأول
    document.addEventListener('click', async (e) => {
        const a = e.target.closest && e.target.closest('a[href]');
        if (!a || a.target === '_blank' || e.ctrlKey || e.metaKey || e.shiftKey || e.button > 0) return;
        if (!(active.size > 0 || qBusy())) return;
        const href = a.getAttribute('href') || '';
        if (href.startsWith('#') || href.startsWith('javascript:')) return;
        e.preventDefault(); e.stopPropagation();
        const yes = await askConfirm({ title: 'الرفع لسه شغال', text: 'لو خرجت من الصفحة دي، الرفع أو التحليل اللي شغال هيقف. تخرج برضه؟', ok: 'أيوه، اخرج', cancel: 'لأ، استنى' });
        if (yes) { queue.forEach((q) => { if (['wait', 'create', 'upload', 'process'].includes(q.state)) cancelItem(q); }); setTimeout(() => { location.href = a.href; }, 150); }
    }, true);

    /**
     * تحليل الكتاب (استخراج النص + OCR للمصوّر + الفهرسة)
     * @returns {Promise<{ok?:boolean, aborted?:boolean, error?:string, failedPages?:number}>}
     */
    async function startProcessing(book, file, { onProgress = null, quiet = false } = {}) {
        if (active.size > 0) { if (!quiet) ErrorHandler.showError('في كتاب بيتعالج حاليًا. استنى لحد ما يخلص وبعدين كمّل.'); return { error: 'في كتاب تاني بيتحلّل' }; }
        const ctl = new AbortController();
        const live = { ctl, percent: 1, message: 'جاري البدء...', stage: 'start' };
        active.set(book.id, live);
        renderBooks();
        await keepScreenOn(true);
        if (!quiet) ErrorHandler.showSuccess('خلي الصفحة دي مفتوحة والشاشة منوّرة لحد ما التحليل يخلص ✓', 6000);
        let out = {};
        try {
            const res = await processBook({
                api, book, file, signal: ctl.signal,
                onProgress: (i) => {
                    live.percent = i.percent; live.message = i.message; live.stage = i.stage;
                    updateProgressUI(book.id);
                    if (onProgress) onProgress(i);
                }
            });
            out = { ok: true, failedPages: res.failedPages || 0 };
            if (!quiet) {
                if (res.failedPages > 0) ErrorHandler.showSuccess(`تم تحليل "${book.title}"، لكن تعذّرت قراءة ${res.failedPages} صفحة (ممكن تعيد المعالجة لتحسين النتيجة).`, 7000);
                else ErrorHandler.showSuccess(res.isScanned ? `تم تحليل الكتاب المصوّر "${book.title}" (اتقرأت ${res.ocrPages} صفحة) ✓` : `تم تحليل "${book.title}" ✓`);
            }
        } catch (err) {
            if (err && err.aborted) { out = { aborted: true }; if (!quiet) ErrorHandler.showSuccess('تم إلغاء المعالجة. تقدر تعيدها في أي وقت.'); }
            else { out = { error: (err && err.message) || 'تعذّرت معالجة الكتاب' }; if (!quiet) ErrorHandler.showError(out.error, 9000); }
        } finally {
            active.delete(book.id);
            if (!active.size && !qBusy()) keepScreenOn(false);
            await loadBooks();
        }
        return out;
    }

    // الموبايل بيوقف الصفحة لما الشاشة تقفل أو المدرس يروح لواتساب، والتحليل يقف معاها.
    // Wake Lock بيخلي الشاشة منورة طول الرفع والتحليل (لو المتصفح بيدعمه)
    let wakeLock = null;
    async function keepScreenOn(on) {
        try {
            if (on) {
                if (!wakeLock && navigator.wakeLock) {
                    wakeLock = await navigator.wakeLock.request('screen');
                    wakeLock.addEventListener('release', () => { wakeLock = null; });
                }
            } else if (wakeLock) { await wakeLock.release(); wakeLock = null; }
        } catch (e) { /* تجاهل */ }
    }
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && (active.size || qBusy())) keepScreenOn(true);   // القفل بيتفك لما الصفحة تستخبى
    });

    // ------------------------------------------------------------------ إدارة الوصول
    async function ensureStudentsLoaded() {
        if (allStudents.length > 0) return;
        try {
            const data = await api.getAllStudents();   // كل الطلاب (الخادم بيرجّع 100 بس في الصفحة)
            allStudents = data.students || [];
        } catch (e) { allStudents = []; }
    }

    async function openAccessModal(book) {
        await ensureStudentsLoaded();
        accessModalBookId = book.id;
        $('access-book-title').textContent = book.title;
        const hasSpecific = book.student_ids && book.student_ids.length > 0;
        document.querySelector(`input[name="access-scope"][value="${hasSpecific ? 'students' : 'all'}"]`).checked = true;
        const list = $('access-student-list');
        list.innerHTML = allStudents.map((s) => `
            <label class="student-check-item">
                <input type="checkbox" value="${s.id}" ${book.student_ids && book.student_ids.includes(s.id) ? 'checked' : ''}>
                ${esc(s.name)}
            </label>`).join('') || '<p style="font-size:0.85rem; color:var(--text-secondary);">لا يوجد طلاب مسجّلين بعد.</p>';
        list.style.display = hasSpecific ? 'flex' : 'none';
        $('access-modal').classList.add('active');
    }

    document.querySelectorAll('input[name="access-scope"]').forEach((radio) => {
        radio.addEventListener('change', () => {
            $('access-student-list').style.display = document.querySelector('input[name="access-scope"]:checked').value === 'students' ? 'flex' : 'none';
        });
    });

    $('access-save-btn').addEventListener('click', async () => {
        const scope = document.querySelector('input[name="access-scope"]:checked').value;
        const studentIds = Array.from(document.querySelectorAll('#access-student-list input:checked')).map((i) => i.value);
        try {
            await api.updateBookAccess(accessModalBookId, scope, studentIds);
            $('access-modal').classList.remove('active');
            ErrorHandler.showSuccess('تم تحديث إعدادات الاستخدام');
            await loadBooks();
        } catch (error) {
            ErrorHandler.showError(ErrorHandler.getErrorMessage(error));
        }
    });

    // ------------------------------------------------------------------ اسأل كتبك (كل الكتب)
    const askInput = $('ask-input');
    const askBtn = $('btn-ask-submit');

    async function submitAsk() {
        const question = askInput.value.trim();
        if (!question || askBtn.disabled) return;
        const resultBox = $('ask-result');
        try {
            askBtn.disabled = true;
            askBtn.textContent = 'جاري البحث...';
            const res = await api.askSources(question);
            const { answer, sources } = res;
            $('ask-answer-text').innerHTML = renderMarkdown(answer);
            const cited = extractCitationNumbers(answer).filter((n) => sources && sources[n - 1]);
            const list = (sources && sources.length) ? (cited.length ? cited : sources.map((_, i) => i + 1)) : [];
            const sourcesList = $('ask-sources-list');
            sourcesList.innerHTML = list.map((n) => {
                const s = sources[n - 1];
                return `<div class="ask-source-item">
                    <span class="src-label">[مصدر ${n}] <strong>${esc(s.book_title)}</strong>${s.chapter ? ' - ' + esc(s.chapter) : ''}${s.page ? ' - صفحة ' + s.page : ''}</span>
                    <button type="button" class="btn btn-sm btn-muted" data-n="${n}">${icon('eye', { size: 12 })} فتح في الكتاب</button>
                </div>`;
            }).join('');
            const openSource = (n) => {
                const s = sources[n - 1];
                if (!s) return;
                const book = books.find((b) => b.id === s.book_id);
                if (book && book.storage_path) openBook(book, { source: s });
                else { $('source-view-title').textContent = s.book_title; $('source-view-text').textContent = s.excerpt; $('source-view-modal').classList.add('active'); }
            };
            sourcesList.querySelectorAll('button[data-n]').forEach((b) => b.addEventListener('click', () => openSource(parseInt(b.dataset.n, 10))));
            $('ask-answer-text').onclick = (e) => {
                const chip = e.target.closest('.bc-cite');
                if (chip) openSource(parseInt(chip.dataset.n, 10));
            };
            resultBox.style.display = 'block';
        } catch (error) {
            ErrorHandler.showError(ErrorHandler.getErrorMessage(error));
        } finally {
            askBtn.disabled = false;
            askBtn.textContent = 'اسأل';
        }
    }
    askBtn.addEventListener('click', submitAsk);
    askInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); submitAsk(); }
    });

    (async () => {
        const authInfo = await Auth.requireAuth();
        if (!authInfo) return;
        await loadBooks();
        const qs = new URLSearchParams(location.search);
        if (qs.get('tab') === 'public') switchTab('public');
        else if (qs.get('folder') && folderById(qs.get('folder'))) goTo({ f: qs.get('folder') });
    })();

    // v36: «مكتبتي» في الاحترافية بس: في البداية الكتب القديمة بتفضل موجودة وتتفتح، بس الرفع والإضافة مقفولين
    import('./plan.js?v=59').then(({ getTier }) => getTier()).then((tier) => {
        if (tier !== 'starter') return;
        const sec = document.getElementById('books-section');
        if (!sec || document.getElementById('lib-plan-note')) return;
        const note = document.createElement('div');
        note.id = 'lib-plan-note';
        note.className = 'lib-plan-note';
        note.innerHTML = `<span class="lp-ic">${icon('lock', { size: 16 })}</span><span class="lp-t"><b>«مكتبتي» في الباقة الاحترافية</b><small>كتبك اللي اترفعت قبل كده موجودة وتقدر تفتحها، بس رفع كتب جديدة و«اسأل كتبك» في الاحترافية.</small></span><button type="button" class="btn btn-sm" data-pro-feature data-pro-name="«مكتبتي»">اعرف أكتر</button>`;
        sec.parentNode.insertBefore(note, sec);
    }).catch(() => { /* تجاهل */ });

    return { openBook, closeViewer() { if (viewer) viewer.close(); }, get books() { return books; }, loadBooks, switchTab, goTo };
}
