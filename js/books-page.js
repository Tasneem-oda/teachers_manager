/**
 * books-page.js - منطق صفحة "📚 مكتبتي"
 *   v33: تصميم جديد: فولدرات خاصة بالمدرس + تصنيفات (قرآن، تجويد، تأسيس، عربي...) + بحث + ترتيب + تحديد ونقل
 *        + المكتبة العامة (كتب المدرسين بعد مراجعة صاحبة البرنامج) + نشر كتاب للعامة
 *   - الضغط على الكتاب بيفتحه كاملًا بصيغته الأصلية (book-viewer.js)
 *   - رفع كتاب جديد ومعالجته في المتصفح مع نسبة تقدّم حقيقية، إعادة المعالجة، إدارة الوصول، و"اسأل كتبك"
 */

import { CONFIG } from './config.js?v=44';
import { Auth } from './auth.js?v=44';
import { renderSidebar, renderTopHeader } from './sidebar.js?v=44';
import { icon } from './icons.js?v=44';
import { api } from './api.js?v=44';
import { ErrorHandler, Formatters } from './utils.js?v=44';
import { detectFileType, processBook } from './book-processor.js?v=44';
import { openBookViewer } from './book-viewer.js?v=44';
import { renderMarkdown, extractCitationNumbers } from './md-lite.js?v=44';
import { CATS, catOf, guessCategory, FOLDER_COLORS, folderColor, FOLDER_ICONS, FOLDER_SUGGESTIONS } from './lib-meta.js?v=44';

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
const PREF_KEY = 'tm_lib_prefs_v1';

export function initBooksPage() {
    renderSidebar('books');
    renderTopHeader({ title: 'مكتبتي', subtitle: 'كتبك وملفاتك في فولدرات، والمكتبة العامة للمدرسين', showSearch: false });
    $('ic-add-source').innerHTML = icon('plus', { size: 16 });
    $('ic-new-folder').innerHTML = icon('folderPlus', { size: 16 });
    $('ic-search').innerHTML = icon('search', { size: 16 });
    $('ic-ask').innerHTML = icon('sparkles', { size: 17 });

    let books = [];
    let folders = [];
    let pubMap = {};          // source_book_id → {id, status, note}
    let sharedPaths = [];     // ملفات منشورة للعامة: مانمسحهاش من التخزين لو المدرس مسح الكتاب
    let hubOk = true;         // workflow app-hub متفعّل؟ (لو لأ: المكتبة بتشتغل زي الأول من غير فولدرات)
    let allStudents = [];
    let pollTimer = null;
    let accessModalBookId = null;
    const active = new Map();      // bookId -> { ctl, percent, message, stage }
    let viewer = null;
    let selecting = false;
    const selected = new Set();
    let pubBooks = null;
    let pubCat = '';

    const prefs = (() => { try { return JSON.parse(localStorage.getItem(PREF_KEY) || '{}') || {}; } catch (e) { return {}; } })();
    const savePrefs = () => { try { localStorage.setItem(PREF_KEY, JSON.stringify(prefs)); } catch (e) { /* تجاهل */ } };
    let view = prefs.view || 'all';            // all | pinned | opened | none | folder:<id>
    let cat = '';
    let query = '';
    $('lib-sort').value = prefs.sort || 'recent';

    document.querySelectorAll('.close-modal').forEach((btn) => {
        btn.addEventListener('click', (e) => {
            const modal = e.target.closest('.modal');
            if (modal) modal.classList.remove('active');
        });
    });

    // ------------------------------------------------------------------ مساعدات
    const typeLabel = (b) => TYPE_LABEL[b.file_type] || b.file_type;
    const bookCat = (b) => b.category || guessCategory(b.title) || 'other';
    const folderOf = (b) => folders.find((f) => f.id === b.folder_id) || null;
    const isShared = (b) => !!b.public_book_id || sharedPaths.includes(b.storage_path);

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
                ${live ? `<div class="book-progress-actions"><button type="button" class="btn btn-muted" data-action="cancel" style="padding:0.3rem 0.7rem; font-size:0.74rem;">إلغاء</button></div>` : ''}
            </div>`;
    }

    // ------------------------------------------------------------------ الفولدرات (الجنب)
    function countIn(v) {
        if (v === 'all') return books.length;
        if (v === 'pinned') return books.filter((b) => b.pinned).length;
        if (v === 'opened') return books.filter((b) => b.last_opened_at).length;
        if (v === 'none') return books.filter((b) => !b.folder_id).length;
        if (v.startsWith('folder:')) return books.filter((b) => b.folder_id === v.slice(7)).length;
        return 0;
    }
    function renderSide() {
        const side = $('lib-side');
        const item = (v, ic, label, color, editable) => `
            <button type="button" class="lib2-folder ${view === v ? 'is-on' : ''}" data-view="${v}" ${v.startsWith('folder:') || v === 'none' ? `data-drop="${v}"` : ''}>
                <span class="fi" style="--fc:${color || '#EFE9F5'}">${ic}</span>
                <span class="fl">${esc(label)}</span><span class="fc">${countIn(v)}</span>
                ${editable ? `<span class="fe" role="button" tabindex="0" data-edit-folder="${v.slice(7)}" title="تعديل الفولدر" aria-label="تعديل الفولدر">${icon('edit', { size: 13 })}</span>` : ''}
            </button>`;
        side.innerHTML = `
            ${item('all', '📚', 'كل الكتب', '#EFE9F5')}
            ${books.some((b) => b.pinned) ? item('pinned', '📌', 'المثبّتة', '#FAF0D2') : ''}
            ${books.some((b) => b.last_opened_at) ? item('opened', '🕘', 'آخر ما فتحته', '#E2EDF9') : ''}
            ${hubOk ? `<h4>فولدراتك</h4>${folders.map((f) => item(`folder:${f.id}`, esc(f.icon || '📁'), f.name, folderColor(f.color), true)).join('')}
            ${folders.length ? item('none', '🗂️', 'بدون فولدر', '#ECEEF0') : ''}
            <button type="button" class="lib2-folder lib2-newfolder" data-new-folder>${icon('folderPlus', { size: 16 })} فولدر جديد</button>` : ''}`;
    }

    $('lib-side').addEventListener('click', (e) => {
        const ed = e.target.closest('[data-edit-folder]');
        if (ed) { e.stopPropagation(); const f = folders.find((x) => x.id === ed.dataset.editFolder); if (f) openFolderModal(f); return; }
        if (e.target.closest('[data-new-folder]')) { openFolderModal(null); return; }
        const b = e.target.closest('[data-view]');
        if (!b) return;
        view = b.dataset.view; prefs.view = view; savePrefs();
        renderAll();
    });
    // سحب الكتاب على فولدر (كمبيوتر)
    $('lib-side').addEventListener('dragover', (e) => { const t = e.target.closest('[data-drop]'); if (t) { e.preventDefault(); t.classList.add('drop-over'); } });
    $('lib-side').addEventListener('dragleave', (e) => { const t = e.target.closest('[data-drop]'); if (t) t.classList.remove('drop-over'); });
    $('lib-side').addEventListener('drop', (e) => {
        const t = e.target.closest('[data-drop]');
        if (!t) return;
        e.preventDefault(); t.classList.remove('drop-over');
        const id = e.dataTransfer.getData('text/tm-book');
        if (id) moveBooks([id], t.dataset.drop === 'none' ? null : t.dataset.drop.slice(7));
    });

    // ------------------------------------------------------------------ التصنيفات
    function renderCats() {
        const used = new Set(books.map(bookCat));
        $('lib-cats').innerHTML = `<button type="button" class="lib2-chip ${!cat ? 'is-on' : ''}" data-cat="">الكل</button>`
            + CATS.filter((c) => used.has(c.id)).map((c) => `<button type="button" class="lib2-chip ${cat === c.id ? 'is-on' : ''}" data-cat="${c.id}">${c.em} ${c.label}</button>`).join('');
        $('lib-cats').hidden = used.size < 2;
    }
    $('lib-cats').addEventListener('click', (e) => { const c = e.target.closest('[data-cat]'); if (!c) return; cat = c.dataset.cat; renderAll(); });

    // ------------------------------------------------------------------ الكتب
    function visibleBooks() {
        let list = books.slice();
        if (view === 'pinned') list = list.filter((b) => b.pinned);
        else if (view === 'opened') list = list.filter((b) => b.last_opened_at);
        else if (view === 'none') list = list.filter((b) => !b.folder_id);
        else if (view.startsWith('folder:')) list = list.filter((b) => b.folder_id === view.slice(7));
        if (cat) list = list.filter((b) => bookCat(b) === cat);
        if (query) {
            const q = query.toLowerCase();
            list = list.filter((b) => String(b.title || '').toLowerCase().includes(q) || String(b.file_name || '').toLowerCase().includes(q));
        }
        const sort = $('lib-sort').value;
        const ts = (v) => (v ? Date.parse(v) || 0 : 0);
        list.sort((a, b) => {
            if (view === 'all' && !query && !!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
            if (sort === 'name') return String(a.title).localeCompare(String(b.title), 'ar');
            if (sort === 'opened') return ts(b.last_opened_at) - ts(a.last_opened_at) || ts(b.created_at) - ts(a.created_at);
            return ts(b.created_at) - ts(a.created_at);
        });
        return list;
    }

    function cardHtml(b) {
        const st = effectiveStatus(b);
        const live = active.get(b.id);
        const c = catOf(bookCat(b)) || catOf('other');
        const unit = b.file_type === 'pptx' ? 'شريحة' : 'صفحة';
        const uploadBroken = st === 'stalled' && b.status === 'uploading';
        const canOpen = !!b.storage_path && st !== 'uploading' && !uploadBroken && !active.has(b.id);
        const pub = pubMap[b.id];
        const f = folderOf(b);
        let extra = '';
        if (st === 'processing' || (st === 'uploading' && live)) extra = progressHtml(b, live);
        else if (st === 'failed') extra = `<p class="book-error-text">${esc(b.error_message || 'حدث خطأ أثناء التحليل')}</p>`;
        else if (uploadBroken) extra = '<p class="book-error-text">الرفع ماكملش (غالبًا النت فصل). احذف الكتاب ده وارفعه تاني.</p>';
        else if (st === 'stalled') extra = '<p class="book-error-text">المعالجة وقفت. دوس "إعادة المعالجة" عشان تكمل.</p>';
        const reprocess = (st === 'failed' || (st === 'stalled' && !uploadBroken))
            ? `<button type="button" class="btn" data-action="reprocess">${icon('refresh', { size: 13 })} <span>إعادة المعالجة</span></button>` : '';
        const openBtn = canOpen ? `<button type="button" class="btn btn-primary" data-action="open">${icon('bookOpen', { size: 14 })} <span>افتح</span></button>` : '';
        const meta = [typeLabel(b)];
        if (st === 'ready' && b.page_count) meta.push(`${b.page_count} ${unit}`);
        if (b.is_scanned) meta.push('مصوّر');
        if (b.student_ids && b.student_ids.length) meta.push(`لـ ${b.student_ids.length} طالب`);
        return `
            <article class="bk ${canOpen ? 'is-openable' : ''}" data-book-id="${b.id}" ${canOpen ? `tabindex="0" role="button" aria-label="افتح ${esc(b.title)}"` : ''} draggable="${hubOk ? 'true' : 'false'}" style="--cv:${c.cv}">
                <div class="bk-cover">
                    <span class="em" aria-hidden="true">${c.em}</span>
                    <span class="ttl" aria-hidden="true">${esc(b.title)}</span>
                    <div class="bk-flags">
                        ${b.pinned ? '<span class="bk-flag">📌</span>' : ''}
                        ${pub && pub.status === 'approved' ? '<span class="bk-flag pub">🌍 منشور</span>' : ''}
                        ${pub && pub.status === 'pending' ? '<span class="bk-flag pend">⏳ بيتراجع</span>' : ''}
                        ${b.public_book_id ? '<span class="bk-flag">🌍</span>' : ''}
                    </div>
                    ${selecting ? `<input type="checkbox" class="bk-sel" data-sel="${b.id}" ${selected.has(b.id) ? 'checked' : ''} aria-label="اختار ${esc(b.title)}">` : ''}
                </div>
                <div class="bk-body">
                    <p class="bk-title" title="${esc(b.title)}">${esc(b.title)}</p>
                    <p class="bk-meta">${meta.map(esc).join('<span class="dot">·</span>')}</p>
                    ${st !== 'ready' ? `<span class="bk-status s-${st}">${STATUS_LABELS[st] || esc(st)}</span>` : ''}
                    ${f && view === 'all' ? `<span class="bk-folder">${esc(f.icon || '📁')} ${esc(f.name)}</span>` : ''}
                    ${pub && pub.status === 'rejected' ? `<p class="book-error-text" style="font-size:.74rem">ماتنشرش${pub.note ? `: ${esc(pub.note)}` : ''}</p>` : ''}
                    ${extra}
                    <div class="bk-actions">${reprocess}${openBtn}
                        <button type="button" class="btn btn-ghost bk-more" data-action="menu" aria-label="خيارات الكتاب" title="خيارات">${icon('moreV', { size: 16 })}</button>
                    </div>
                </div>
            </article>`;
    }

    function titleOf() {
        if (view === 'pinned') return '📌 المثبّتة';
        if (view === 'opened') return '🕘 آخر ما فتحته';
        if (view === 'none') return '🗂️ بدون فولدر';
        if (view.startsWith('folder:')) { const f = folders.find((x) => x.id === view.slice(7)); return f ? `${f.icon || '📁'} ${f.name}` : 'كل الكتب'; }
        return 'كل الكتب';
    }

    function renderBooks() {
        const section = $('books-section');
        $('lib-title').textContent = titleOf() + (cat ? ` · ${catOf(cat).label}` : '');
        $('n-mine').textContent = books.length ? String(books.length) : '';
        if (books.length === 0) {
            section.innerHTML = `<div class="lib2-empty"><span class="em">📚</span>
                <b>مكتبتك لسه فاضية</b><br>ارفع المصحف، نور البيان، تحفة الأطفال، أو أي مذكرة — وافتحها في الحصة واشرح عليها.
                <br><button type="button" class="btn btn-primary" data-empty-add>${icon('plus', { size: 15 })} ارفع أول كتاب</button>
                ${hubOk ? '<button type="button" class="btn btn-outline" data-empty-public>🌍 أو خد كتاب من المكتبة العامة</button>' : ''}</div>`;
            return;
        }
        const list = visibleBooks();
        if (!list.length) {
            const inFolder = view.startsWith('folder:');
            section.innerHTML = `<div class="lib2-empty"><span class="em">${query ? '🔍' : '🗂️'}</span>
                ${query ? `مفيش كتاب اسمه "${esc(query)}"` : inFolder ? 'الفولدر ده لسه فاضي.<br>من <b>⋮</b> على أي كتاب اختار "نقل لفولدر"، أو اسحب الكتاب على الفولدر.' : 'مفيش كتب هنا.'}</div>`;
            return;
        }
        section.innerHTML = `<div class="lib2-grid">${list.map(cardHtml).join('')}</div>`;
    }

    function renderAll() { renderSide(); renderCats(); renderBooks(); renderSelbar(); }

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

    // ------------------------------------------------------------------ البحث / الترتيب / التحديد
    let searchT = null;
    $('lib-search').addEventListener('input', (e) => {
        clearTimeout(searchT);
        searchT = setTimeout(() => { query = e.target.value.trim(); renderBooks(); if (!$('tab-public').hidden) renderPublic(); }, 150);
    });
    $('lib-sort').addEventListener('change', () => { prefs.sort = $('lib-sort').value; savePrefs(); renderBooks(); });
    $('btn-select').addEventListener('click', () => { selecting = !selecting; selected.clear(); $('btn-select').textContent = selecting ? 'خلصت' : 'تحديد'; renderBooks(); renderSelbar(); });
    function renderSelbar() {
        $('lib-selbar').hidden = !selecting;
        $('btn-select').hidden = !hubOk || !books.length;
        $('sel-count').textContent = `${selected.size} مختار`;
        $('sel-move').disabled = !selected.size;
    }
    $('sel-cancel').addEventListener('click', () => { selecting = false; selected.clear(); $('btn-select').textContent = 'تحديد'; renderBooks(); renderSelbar(); });
    $('sel-move').addEventListener('click', () => { if (selected.size) openMovePicker([...selected]); });

    // ------------------------------------------------------------------ أحداث الكتب
    $('books-section').addEventListener('change', (e) => {
        const s = e.target.closest('[data-sel]');
        if (!s) return;
        if (s.checked) selected.add(s.dataset.sel); else selected.delete(s.dataset.sel);
        renderSelbar();
    });
    $('books-section').addEventListener('click', (e) => {
        if (e.target.closest('[data-empty-add]')) { $('btn-add-source').click(); return; }
        if (e.target.closest('[data-empty-public]')) { switchTab('public'); return; }
        if (e.target.closest('[data-sel]')) return;
        const btn = e.target.closest('button[data-action]');
        const card = e.target.closest('.bk');
        if (!card) return;
        const book = books.find((b) => b.id === card.dataset.bookId);
        if (!book) return;
        if (selecting) { if (selected.has(book.id)) selected.delete(book.id); else selected.add(book.id); renderBooks(); renderSelbar(); return; }
        if (btn) { e.stopPropagation(); handleCardAction(btn.dataset.action, book, btn); return; }
        if (card.classList.contains('is-openable')) openBook(book, { opener: card });
    });
    $('books-section').addEventListener('keydown', (e) => {
        if ((e.key === 'Enter' || e.key === ' ') && e.target.classList && e.target.classList.contains('bk')) {
            e.preventDefault();
            const book = books.find((b) => b.id === e.target.dataset.bookId);
            if (book) openBook(book, { opener: e.target });
        }
    });
    $('books-section').addEventListener('dragstart', (e) => {
        const card = e.target.closest('.bk');
        if (!card || !hubOk) return;
        e.dataTransfer.setData('text/tm-book', card.dataset.bookId);
        e.dataTransfer.effectAllowed = 'move';
    });

    async function handleCardAction(action, book, btn) {
        if (action === 'menu') { openMenu(book, btn); return; }
        if (action === 'delete') {
            if (active.has(book.id)) { ErrorHandler.showError('الكتاب بيتعالج حاليًا. اضغط "إلغاء" الأول.'); return; }
            const shared = isShared(book);
            if (!confirm(`تمسح "${book.title}" من مكتبتك؟${shared ? '\n(الكتاب منشور للمدرسين: هيفضل في المكتبة العامة)' : ''}`)) return;
            try {
                const res = await api.deleteBook(book.id);
                // v33: ملف منشور للعامة أو متضاف من المكتبة العامة: مانمسحوش من التخزين (بتاع مدرسين تانيين كمان)
                if (res && res.storage_path && !shared) await api.deleteBookFile(res.storage_path);
                ErrorHandler.showSuccess('اتمسح ✓');
                await loadBooks();
            } catch (error) {
                ErrorHandler.showError(ErrorHandler.getErrorMessage(error));
            }
        } else if (action === 'manage') {
            openAccessModal(book);
        } else if (action === 'open') {
            openBook(book);
        } else if (action === 'ask') {
            openBook(book, { chat: true });
        } else if (action === 'reprocess') {
            startProcessing(book, null);
        } else if (action === 'cancel') {
            const live = active.get(book.id);
            if (live) live.ctl.abort();
        }
    }

    // ------------------------------------------------------------------ قايمة ⋮
    let menuEl = null;
    function closeMenu() { if (menuEl) { menuEl.remove(); menuEl = null; document.removeEventListener('pointerdown', onDocDown, true); } }
    function onDocDown(e) { if (menuEl && !menuEl.contains(e.target)) closeMenu(); }
    function openMenu(book, anchor) {
        closeMenu();
        const st = effectiveStatus(book);
        const pub = pubMap[book.id];
        const items = [];
        if (st === 'ready') items.push(['ask', 'messageSquare', 'اسأل الكتاب']);
        if (hubOk) {
            items.push(['move', 'folder', 'نقل لفولدر']);
            items.push(['category', 'grid', 'التصنيف']);
            items.push(['pin', 'pin', book.pinned ? 'إلغاء التثبيت' : 'تثبيت فوق']);
            items.push(['rename', 'edit', 'تغيير الاسم']);
        }
        items.push(['manage', 'users', 'مين من الطلاب يستخدمه']);
        if (book.storage_path && st !== 'uploading') items.push(['download', 'download', 'تحميل الملف']);
        if (hubOk && !book.public_book_id) {
            items.push(['-']);
            if (pub && (pub.status === 'pending' || pub.status === 'approved')) items.push(['unpublish', 'globe', pub.status === 'pending' ? 'إلغاء طلب النشر' : 'شيله من المكتبة العامة']);
            else if (st === 'ready') items.push(['publish', 'globe', pub && pub.status === 'rejected' ? 'اطلب النشر تاني' : 'انشره للمدرسين (المكتبة العامة)']);
        }
        items.push(['-'], ['delete', 'trash', 'حذف', 'danger']);
        menuEl = document.createElement('div');
        menuEl.className = 'lib2-menu';
        menuEl.setAttribute('role', 'menu');
        menuEl.innerHTML = items.map((it) => it[0] === '-' ? '<hr>' : `<button type="button" role="menuitem" data-m="${it[0]}" class="${it[3] || ''}">${icon(it[1], { size: 16 })} ${esc(it[2])}</button>`).join('');
        document.body.appendChild(menuEl);
        const r = anchor.getBoundingClientRect();
        const mw = menuEl.offsetWidth, mh = menuEl.offsetHeight;
        menuEl.style.top = `${Math.max(8, Math.min(window.innerHeight - mh - 8, r.bottom + 6))}px`;
        menuEl.style.left = `${Math.max(8, Math.min(window.innerWidth - mw - 8, r.left))}px`;
        menuEl.querySelector('button').focus({ preventScroll: true });
        setTimeout(() => document.addEventListener('pointerdown', onDocDown, true), 0);
        menuEl.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeMenu(); anchor.focus(); } });
        menuEl.addEventListener('click', async (e) => {
            const b = e.target.closest('[data-m]');
            if (!b) return;
            const m = b.dataset.m;
            closeMenu();
            if (m === 'move') openMovePicker([book.id]);
            else if (m === 'category') openCategoryPicker(book);
            else if (m === 'pin') setMeta(book, { pinned: !book.pinned });
            else if (m === 'rename') { const t = prompt('الاسم الجديد للكتاب', book.title); if (t && t.trim() && t.trim() !== book.title) setMeta(book, { title: t.trim() }); }
            else if (m === 'download') downloadBook(book);
            else if (m === 'publish') openPublishModal(book);
            else if (m === 'unpublish') unpublish(book);
            else handleCardAction(m, book);
        });
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
            const url = await api.getBookFileUrl(book.storage_path, { download: book.file_name || true });
            window.open(url, '_blank', 'noopener');
        } catch (err) { ErrorHandler.showError('مقدرناش نجيب الملف دلوقتي. جرّب تاني.'); }
    }

    // ------------------------------------------------------------------ نوافذ صغيرة (فولدر / نقل / تصنيف / نشر)
    function sheet(title, inner, { onMount } = {}) {
        const m = document.createElement('div');
        m.className = 'modal active';
        m.innerHTML = `<div class="modal-content" role="dialog" aria-modal="true" aria-label="${esc(title)}" style="max-width:460px">
            <span class="close-modal" role="button" tabindex="0" aria-label="إغلاق">&times;</span><h2 style="margin-top:0">${esc(title)}</h2>${inner}</div>`;
        const close = () => { m.remove(); document.removeEventListener('keydown', onKey); };
        const onKey = (e) => { if (e.key === 'Escape') close(); };
        m.querySelector('.close-modal').addEventListener('click', close);
        m.addEventListener('mousedown', (e) => { if (e.target === m) close(); });
        document.addEventListener('keydown', onKey);
        document.body.appendChild(m);
        if (onMount) onMount(m, close);
        return { m, close };
    }

    function openFolderModal(folder) {
        const subj = String((JSON.parse(localStorage.getItem('user_profile') || '{}') || {}).subject || '').toLowerCase();
        const sugg = !folder && !folders.length ? (FOLDER_SUGGESTIONS[/arab|عرب/.test(subj) ? 'arabic' : 'quran'] || []) : [];
        let color = folder ? folder.color : 'violet';
        let ic = folder ? folder.icon : '📁';
        sheet(folder ? 'تعديل الفولدر' : 'فولدر جديد', `
            ${sugg.length ? `<p style="margin:-.3rem 0 .5rem; font-size:.82rem; color:var(--text-secondary)">اقتراحات سريعة:</p>
                <div class="lib2-cats" style="flex-wrap:wrap">${sugg.map((s) => `<button type="button" class="lib2-chip" data-sugg="${esc(s[0])}" data-ic="${s[1]}" data-c="${s[2]}">${s[1]} ${esc(s[0])}</button>`).join('')}</div>` : ''}
            <div class="form-group"><label for="fd-name">اسم الفولدر</label><input type="text" id="fd-name" maxlength="60" value="${esc(folder ? folder.name : '')}" placeholder="مثلًا: جزء عمّ"></div>
            <div class="form-group"><label>الأيقونة</label><div class="lib2-swatches" data-g="ic">${FOLDER_ICONS.map((x) => `<button type="button" data-v="${x}" class="${x === ic ? 'is-on' : ''}" aria-label="${x}">${x}</button>`).join('')}</div></div>
            <div class="form-group"><label>اللون</label><div class="lib2-swatches" data-g="c">${FOLDER_COLORS.map((x) => `<button type="button" data-v="${x.id}" class="${x.id === color ? 'is-on' : ''}" style="background:${x.c}" aria-label="لون ${x.id}"></button>`).join('')}</div></div>
            <div style="display:flex; gap:.5rem; flex-wrap:wrap; margin-top:1rem">
                <button type="button" class="btn btn-primary" data-save>${folder ? 'حفظ' : 'اعمل الفولدر'}</button>
                ${folder ? '<button type="button" class="btn btn-outline-danger" data-del>حذف الفولدر</button>' : ''}
            </div>
            ${folder ? '<p style="font-size:.76rem; color:var(--text-light); margin:.6rem 0 0">حذف الفولدر مش بيمسح الكتب اللي جواه: بيرجعوا "بدون فولدر".</p>' : ''}`, {
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
                        const r = await api.hub('folder_save', { id: folder ? folder.id : undefined, name: n, icon: ic, color });
                        if (folder) Object.assign(folder, r.folder); else { folders.push(r.folder); view = `folder:${r.folder.id}`; prefs.view = view; savePrefs(); }
                        close(); renderAll();
                        ErrorHandler.showSuccess(folder ? 'اتحفظ ✓' : 'الفولدر اتعمل ✓ دلوقتي انقل له كتبك من ⋮ أو بالسحب');
                    } catch (err) { btn.disabled = false; ErrorHandler.showError(ErrorHandler.getErrorMessage(err)); }
                };
                m.querySelector('[data-save]').addEventListener('click', save);
                name.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); save(); } });
                const del = m.querySelector('[data-del]');
                if (del) del.addEventListener('click', async () => {
                    if (!confirm(`تمسح فولدر "${folder.name}"؟ الكتب اللي جواه مش هتتمسح.`)) return;
                    try {
                        await api.hub('folder_delete', { id: folder.id });
                        folders = folders.filter((f) => f.id !== folder.id);
                        books.forEach((b) => { if (b.folder_id === folder.id) b.folder_id = null; });
                        if (view === `folder:${folder.id}`) view = 'all';
                        close(); renderAll();
                    } catch (err) { ErrorHandler.showError(ErrorHandler.getErrorMessage(err)); }
                });
            }
        });
    }

    function openMovePicker(ids) {
        if (!folders.length) {
            ErrorHandler.showSuccess('اعمل فولدر الأول ✓', 3000);
            openFolderModal(null);
            return;
        }
        sheet(ids.length > 1 ? `نقل ${ids.length} كتب لـ` : 'نقل لفولدر', `
            <div style="display:flex; flex-direction:column; gap:.3rem">
                ${folders.map((f) => `<button type="button" class="lib2-folder" data-to="${f.id}"><span class="fi" style="--fc:${folderColor(f.color)}">${esc(f.icon || '📁')}</span><span class="fl">${esc(f.name)}</span></button>`).join('')}
                <button type="button" class="lib2-folder" data-to=""><span class="fi" style="--fc:#ECEEF0">🗂️</span><span class="fl">بدون فولدر</span></button>
                <button type="button" class="lib2-folder lib2-newfolder" data-newf>${icon('folderPlus', { size: 16 })} فولدر جديد</button>
            </div>`, {
            onMount(m, close) {
                m.addEventListener('click', (e) => {
                    if (e.target.closest('[data-newf]')) { close(); openFolderModal(null); return; }
                    const b = e.target.closest('[data-to]'); if (!b) return;
                    close(); moveBooks(ids, b.dataset.to || null);
                });
            }
        });
    }

    async function moveBooks(ids, folderId) {
        const prev = new Map(ids.map((id) => [id, (books.find((b) => b.id === id) || {}).folder_id]));
        books.forEach((b) => { if (ids.includes(b.id)) b.folder_id = folderId; });
        selecting = false; selected.clear(); $('btn-select').textContent = 'تحديد';
        renderAll();
        try {
            await api.hub('book_move', { book_ids: ids, folder_id: folderId });
            const f = folders.find((x) => x.id === folderId);
            ErrorHandler.showSuccess(f ? `اتنقل لـ "${f.name}" ✓` : 'اتشال من الفولدر ✓', 2500);
        } catch (err) {
            books.forEach((b) => { if (prev.has(b.id)) b.folder_id = prev.get(b.id); });
            renderAll();
            ErrorHandler.showError(ErrorHandler.getErrorMessage(err));
        }
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
                        const r = await api.hub('public_request', { book_id: book.id, title: m.querySelector('#pb-title').value.trim(), description: m.querySelector('#pb-desc').value.trim(), category: m.querySelector('#pb-cat').value, show_name: m.querySelector('#pb-name').checked });
                        pubMap[book.id] = { id: r.id, status: 'pending' };
                        sharedPaths.push(book.storage_path);
                        close(); renderBooks();
                        ErrorHandler.showSuccess('اتبعت للمراجعة ✓ هيوصلك إشعار أول ما يتنشر', 6000);
                        try { window.tmTrack && window.tmTrack('book_publish_requested', {}); } catch (x) { /* تجاهل */ }
                    } catch (err) { b.disabled = false; ErrorHandler.showError(ErrorHandler.getErrorMessage(err)); }
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
        $('lib-search').placeholder = t === 'public' ? 'ابحث في المكتبة العامة...' : 'ابحث في كتبك...';
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
            $('n-public').textContent = lib.public_count ? String(lib.public_count) : '';
        } catch (err) {
            // workflow app-hub لسه ماتفعّلش: المكتبة تشتغل زي الأول
            if (err && (err.status === 404 || (err.error && err.error.code === 'DB_ERROR'))) hubOk = false;
        }
        $('btn-new-folder').hidden = !hubOk;
        if (view.startsWith('folder:') && !folders.some((f) => `folder:${f.id}` === view)) view = 'all';
    }

    async function loadBooks() {
        try {
            const [data] = await Promise.all([api.listBooks(), loadLibrary()]);
            books = data.books || [];
            renderAll();
        } catch (error) {
            $('books-section').innerHTML = `<div class="lib2-empty">تعذّر تحميل المكتبة: ${esc(ErrorHandler.getErrorMessage(error))}</div>`;
        }
        if (pollTimer) clearTimeout(pollTimer);
        if (needsPolling()) pollTimer = setTimeout(loadBooks, 4000);
    }
    $('btn-new-folder').addEventListener('click', () => openFolderModal(null));

    // ------------------------------------------------------------------ المعالجة
    window.addEventListener('beforeunload', (e) => {
        if (active.size > 0) { e.preventDefault(); e.returnValue = ''; }
    });

    async function startProcessing(book, file) {
        if (active.size > 0) { ErrorHandler.showError('في كتاب بيتعالج حاليًا. استنى لحد ما يخلص وبعدين كمّل.'); return; }
        const ctl = new AbortController();
        const live = { ctl, percent: 1, message: 'جاري البدء...', stage: 'start' };
        active.set(book.id, live);
        renderBooks();
        await keepScreenOn(true);
        ErrorHandler.showSuccess('خلي الصفحة دي مفتوحة والشاشة منوّرة لحد ما التحليل يخلص ✓', 6000);
        try {
            const res = await processBook({
                api, book, file, signal: ctl.signal,
                onProgress: (i) => {
                    live.percent = i.percent; live.message = i.message; live.stage = i.stage;
                    updateProgressUI(book.id);
                }
            });
            if (res.failedPages > 0) {
                ErrorHandler.showSuccess(`تم تحليل "${book.title}"، لكن تعذّرت قراءة ${res.failedPages} صفحة (ممكن تعيد المعالجة لتحسين النتيجة).`, 7000);
            } else {
                ErrorHandler.showSuccess(res.isScanned ? `تم تحليل الكتاب المصوّر "${book.title}" (اتقرأت ${res.ocrPages} صفحة) ✓` : `تم تحليل "${book.title}" ✓`);
            }
        } catch (err) {
            if (err && err.aborted) ErrorHandler.showSuccess('تم إلغاء المعالجة. تقدر تعيدها في أي وقت.');
            else ErrorHandler.showError((err && err.message) || 'تعذّرت معالجة الكتاب', 9000);
        } finally {
            active.delete(book.id);
            if (!active.size) keepScreenOn(false);
            await loadBooks();
        }
    }

    // الموبايل بيوقف الصفحة لما الشاشة تقفل أو المدرس يروح لواتساب، والتحليل يقف معاها.
    // Wake Lock بيخلي الشاشة منورة طول التحليل (لو المتصفح بيدعمه)
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
        if (document.visibilityState === 'visible' && active.size) keepScreenOn(true);   // القفل بيتفك لما الصفحة تستخبى
    });

    // ------------------------------------------------------------------ رفع مصدر جديد
    const MAX_BYTES = CONFIG.BOOKS_SETTINGS.MAX_FILE_MB * 1024 * 1024;
    $('upload-cat').innerHTML = '<option value="">تلقائي (من الاسم)</option>' + CATS.map((c) => `<option value="${c.id}">${c.em} ${c.label}</option>`).join('');

    $('btn-add-source').addEventListener('click', () => {
        $('upload-form').reset();
        pickedAny = null; $('upload-file-input').required = true;
        $('upload-detected').textContent = '';
        $('upload-progress').classList.remove('is-on');
        $('upload-submit-btn').disabled = false;
        const fsel = $('upload-folder');
        fsel.innerHTML = '<option value="">بدون فولدر</option>' + folders.map((f) => `<option value="${f.id}">${esc(f.icon || '📁')} ${esc(f.name)}</option>`).join('');
        fsel.value = view.startsWith('folder:') ? view.slice(7) : '';
        fsel.closest('div').hidden = !hubOk;
        $('upload-cat').closest('div').hidden = !hubOk;
        $('upload-modal').classList.add('active');
    });

    // v29.2: الملف ممكن ييجي من الاختيار العادي أو من زرار "اختاره من الملفات" (لموبايلات سامسونج)
    let pickedAny = null;
    const pickedFile = () => pickedAny || $('upload-file-input').files[0];
    $('upload-any-btn').addEventListener('click', () => { $('upload-file-any').value = ''; $('upload-file-any').click(); });
    $('upload-file-any').addEventListener('change', (e) => {
        const f = e.target.files[0]; if (!f) return;
        pickedAny = f;
        try { const dt = new DataTransfer(); dt.items.add(f); $('upload-file-input').files = dt.files; } catch (er) { /* متصفح قديم: pickedAny كفاية */ }
        $('upload-file-input').required = false;
        showPicked(f);
    });
    $('upload-file-input').addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        pickedAny = null;
        showPicked(file);
    });
    function showPicked(file) {
        const type = detectFileType(file);
        $('upload-detected').textContent = type ? `النوع: ${TYPE_LABEL[type]} · ${(file.size / 1048576).toFixed(1)} MB` : 'نوع الملف غير مدعوم';
        $('upload-detected').style.color = type ? 'var(--text-secondary)' : 'var(--danger)';
        if (!$('upload-title-input').value) $('upload-title-input').value = file.name.replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ');
        if (!$('upload-cat').value) { const g = guessCategory($('upload-title-input').value); if (g) $('upload-cat').value = g; }
    }

    $('upload-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const file = pickedFile();
        const title = $('upload-title-input').value.trim();
        const submitBtn = $('upload-submit-btn');
        const progress = $('upload-progress');
        const progressText = $('upload-progress-text');
        const category = $('upload-cat').value || guessCategory(title) || '';
        const folderId = $('upload-folder').value || '';

        if (!file) { ErrorHandler.showError('من فضلك اختار ملفًا'); return; }
        const fileType = detectFileType(file);
        if (!fileType) { ErrorHandler.showError('نوع الملف غير مدعوم. المدعوم: PDF، Word (.docx)، PowerPoint (.pptx)، نص (.txt)، أو صورة (JPG/PNG).'); return; }
        if (file.size > MAX_BYTES) { ErrorHandler.showError(`حجم الملف أكبر من ${CONFIG.BOOKS_SETTINGS.MAX_FILE_MB} ميجا. قسّمه لأجزاء أو اضغطه.`); return; }
        if (active.size > 0) { ErrorHandler.showError('في كتاب بيتعالج حاليًا. استنى لحد ما يخلص.'); return; }

        let bookId = null;
        try {
            submitBtn.disabled = true;
            progress.classList.add('is-on');

            progressText.textContent = 'جاري إنشاء المصدر...';
            let createRes;
            try {
                createRes = await api.createBookSource(title, file.name, fileType);
            } catch (err) {
                throw new Error('تعذّر إضافة الكتاب: ' + ErrorHandler.getErrorMessage(err));
            }
            bookId = createRes.book_id;

            progressText.textContent = 'جاري رفع الملف...';
            try {
                await api.uploadBookFile(createRes.storage_path, file);
            } catch (err) {
                throw new Error('تعذّر رفع الملف: ' + ErrorHandler.getErrorMessage(err) + ' — اتأكد من النت وجرّب تاني.');
            }

            $('upload-modal').classList.remove('active');
            const book = { id: bookId, title, file_name: file.name, file_type: fileType, storage_path: createRes.storage_path, status: 'uploading', updated_at: new Date().toISOString(), created_at: new Date().toISOString(), progress: 0, category: category || null, folder_id: folderId || null };
            books.unshift(book);
            // v33: التصنيف والفولدر (بيتحفظوا في الخلفية؛ لو فشلوا الكتاب نفسه سليم)
            if (hubOk && (category || folderId)) {
                (async () => {
                    try {
                        if (category) await api.hub('book_meta', { book_id: bookId, category });
                        if (folderId) await api.hub('book_move', { book_id: bookId, folder_id: folderId });
                    } catch (er) { /* تجاهل */ }
                })();
            }
            startProcessing(book, file);   // بيشتغل في الخلفية (مع شريط تقدّم في بطاقة الكتاب)
        } catch (error) {
            // فشل بعد إنشاء صف الكتاب: نمسحه بدل ما يفضل عالق
            if (bookId) {
                try { await api.deleteBook(bookId); } catch (cleanupErr) { /* تجاهل */ }
                await loadBooks();
            }
            ErrorHandler.showError(error.message || ErrorHandler.getErrorMessage(error), 9000);
        } finally {
            submitBtn.disabled = false;
            progress.classList.remove('is-on');
        }
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
        if (new URLSearchParams(location.search).get('tab') === 'public') switchTab('public');
    })();

    return { openBook, closeViewer() { if (viewer) viewer.close(); }, get books() { return books; }, loadBooks, switchTab };
}
