/**
 * books-page.js - منطق صفحة "📚 مكتبتي"
 *   - قائمة الكتب + الضغط على الكتاب بيفتحه كاملًا بصيغته الأصلية (book-viewer.js)
 *   - رفع كتاب جديد (PDF / Word / PowerPoint / نص / صورة) ومعالجته في المتصفح مع نسبة تقدّم حقيقية
 *   - إعادة معالجة الكتب المتعثّرة، إدارة الوصول، و"اسأل مصادرك" العام
 */

import { CONFIG } from './config.js?v=10';
import { Auth } from './auth.js?v=10';
import { renderSidebar, renderTopHeader } from './sidebar.js?v=10';
import { icon } from './icons.js?v=10';
import { api } from './api.js?v=10';
import { ErrorHandler, Formatters } from './utils.js?v=10';
import { detectFileType, processBook } from './book-processor.js?v=10';
import { openBookViewer } from './book-viewer.js?v=10';
import { renderMarkdown, extractCitationNumbers } from './md-lite.js?v=10';

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

export function initBooksPage() {
    renderSidebar('books');
    renderTopHeader({ title: 'مكتبتي', subtitle: 'مصادر التدريس الخاصة بك', showSearch: false });
    $('ic-add-source').innerHTML = icon('plus', { size: 15 });
    $('ic-ask').innerHTML = icon('sparkles', { size: 17 });

    let books = [];
    let allStudents = [];
    let pollTimer = null;
    let accessModalBookId = null;
    const active = new Map();      // bookId -> { ctl, percent, message, stage }
    let viewer = null;

    document.querySelectorAll('.close-modal').forEach((btn) => {
        btn.addEventListener('click', (e) => {
            const modal = e.target.closest('.modal');
            if (modal) modal.classList.remove('active');
        });
    });

    // ------------------------------------------------------------------ عرض القائمة
    const typeLabel = (b) => TYPE_LABEL[b.file_type] || b.file_type;

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

    function cardHtml(b) {
        const st = effectiveStatus(b);
        const live = active.get(b.id);
        const scopeLabel = (b.student_ids && b.student_ids.length > 0) ? `متاح لـ ${b.student_ids.length} طالب محدد` : 'متاح لكل الطلاب';
        const unit = b.file_type === 'pptx' ? 'شريحة' : 'صفحة';
        const canOpen = !!b.storage_path && st !== 'uploading';
        let body = '';
        if (st === 'ready') {
            body = `<p class="book-meta">${b.chapter_count ? `${b.chapter_count} فصلًا · ` : ''}${b.page_count || '؟'} ${unit}${b.is_scanned ? ' · كتاب مصوّر' : ''}</p>`;
        } else if (st === 'processing' || (st === 'uploading' && live)) {
            body = progressHtml(b, live);
        } else if (st === 'failed') {
            body = `<p class="book-error-text">${esc(b.error_message || 'حدث خطأ أثناء التحليل')}</p>`;
        } else if (st === 'stalled') {
            body = `<p class="book-error-text">${b.status === 'uploading' ? 'الرفع لم يكتمل.' : 'المعالجة توقفت (ربما اتقفلت الصفحة).'} اضغط "إعادة المعالجة" لإكمالها.</p>`;
        }
        const reprocess = (st === 'failed' || st === 'stalled')
            ? `<button type="button" class="btn" data-action="reprocess">${icon('refresh', { size: 13 })} إعادة المعالجة</button>` : '';
        const openBtn = canOpen ? `<button type="button" class="btn btn-primary" data-action="open">${icon('bookOpen', { size: 14 })} فتح الكتاب</button>` : '';
        const askBtn = st === 'ready' ? `<button type="button" class="btn btn-muted" data-action="ask">${icon('messageSquare', { size: 14 })} اسأل</button>` : '';
        return `
            <div class="book-card ${canOpen ? 'is-openable' : ''}" data-book-id="${b.id}" ${canOpen ? `tabindex="0" role="button" aria-label="فتح الكتاب ${esc(b.title)}"` : ''}>
                <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:0.4rem;">
                    <div class="book-icon">${icon(b.file_type === 'image' ? 'image' : 'bookOpen', { size: 20 })}</div>
                    <div style="display:flex; gap:0.35rem;">
                        <button type="button" class="book-icon-btn" data-action="manage" title="إدارة الاستخدام" aria-label="إدارة الاستخدام">${icon('users', { size: 14 })}</button>
                        <button type="button" class="book-icon-btn danger" data-action="delete" title="حذف" aria-label="حذف">${icon('trash', { size: 14 })}</button>
                    </div>
                </div>
                <p class="book-title">${esc(b.title)}</p>
                <div class="book-tags">
                    <span class="book-type-tag">${esc(typeLabel(b))}</span>
                    <span class="book-status-badge status-${st}">${STATUS_LABELS[st] || esc(st)}</span>
                </div>
                ${body}
                <span class="book-scope-tag">${scopeLabel}</span>
                <div class="book-card-actions">${reprocess}${openBtn}${askBtn}</div>
            </div>`;
    }

    function renderBooks() {
        const section = $('books-section');
        if (books.length === 0) {
            section.innerHTML = '<div class="card"><div class="empty-state">لسه مفيش أي مصادر مرفوعة. ابدأ بإضافة كتاب أو مذكرة.</div></div>';
            return;
        }
        section.innerHTML = `<div class="books-grid">${books.map(cardHtml).join('')}</div>`;
    }

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

    // ------------------------------------------------------------------ أحداث القائمة
    async function handleCardAction(action, book) {
        if (action === 'delete') {
            if (active.has(book.id)) { ErrorHandler.showError('الكتاب بيتعالج حاليًا. اضغط "إلغاء" الأول.'); return; }
            if (!confirm(`هل تريد حذف "${book.title}"؟ هيتم حذف كل ما يرتبط به.`)) return;
            try {
                const res = await api.deleteBook(book.id);
                if (res && res.storage_path) await api.deleteBookFile(res.storage_path);
                ErrorHandler.showSuccess('تم حذف المصدر');
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

    $('books-section').addEventListener('click', (e) => {
        const btn = e.target.closest('button[data-action]');
        const card = e.target.closest('.book-card');
        if (!card) return;
        const book = books.find((b) => b.id === card.dataset.bookId);
        if (!book) return;
        if (btn) { e.stopPropagation(); handleCardAction(btn.dataset.action, book); return; }
        if (card.classList.contains('is-openable')) openBook(book, { opener: card });
    });
    $('books-section').addEventListener('keydown', (e) => {
        if ((e.key === 'Enter' || e.key === ' ') && e.target.classList && e.target.classList.contains('book-card')) {
            e.preventDefault();
            const book = books.find((b) => b.id === e.target.dataset.bookId);
            if (book) openBook(book, { opener: e.target });
        }
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
        return viewer;
    }

    // ------------------------------------------------------------------ تحميل القائمة
    function needsPolling() {
        return books.some((b) => (b.status === 'processing' || b.status === 'uploading') && !active.has(b.id) && effectiveStatus(b) !== 'stalled');
    }

    async function loadBooks() {
        try {
            const data = await api.listBooks();
            books = data.books || [];
            renderBooks();
        } catch (error) {
            $('books-section').innerHTML = `<div class="card"><div class="empty-state">تعذّر تحميل المكتبة: ${esc(ErrorHandler.getErrorMessage(error))}</div></div>`;
        }
        if (pollTimer) clearTimeout(pollTimer);
        if (needsPolling()) pollTimer = setTimeout(loadBooks, 4000);
    }

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
            await loadBooks();
        }
    }

    // ------------------------------------------------------------------ رفع مصدر جديد
    const MAX_BYTES = CONFIG.BOOKS_SETTINGS.MAX_FILE_MB * 1024 * 1024;

    $('btn-add-source').addEventListener('click', () => {
        $('upload-form').reset();
        $('upload-detected').textContent = '';
        $('upload-progress').classList.remove('is-on');
        $('upload-submit-btn').disabled = false;
        $('upload-modal').classList.add('active');
    });

    $('upload-file-input').addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const type = detectFileType(file);
        $('upload-detected').textContent = type ? `النوع: ${TYPE_LABEL[type]} · ${(file.size / 1048576).toFixed(1)} MB` : 'نوع الملف غير مدعوم';
        $('upload-detected').style.color = type ? 'var(--text-secondary)' : 'var(--danger)';
        if (!$('upload-title-input').value) $('upload-title-input').value = file.name.replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ');
    });

    $('upload-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const file = $('upload-file-input').files[0];
        const title = $('upload-title-input').value.trim();
        const submitBtn = $('upload-submit-btn');
        const progress = $('upload-progress');
        const progressText = $('upload-progress-text');

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
                throw new Error('تعذّر إنشاء المصدر: ' + ErrorHandler.getErrorMessage(err) + ' — تأكد إنك حدّثت n8n/create-book-source.json ونفّذت n8n/BOOKS_LIBRARY_V2_MIGRATION.sql.');
            }
            bookId = createRes.book_id;

            progressText.textContent = 'جاري رفع الملف...';
            try {
                await api.uploadBookFile(createRes.storage_path, file);
            } catch (err) {
                throw new Error('تعذّر رفع الملف إلى التخزين: ' + ErrorHandler.getErrorMessage(err) + ' — تأكد إنك نفّذت ملفات SQL في Supabase (بينشئ bucket اسمه teacher-books).');
            }

            $('upload-modal').classList.remove('active');
            const book = { id: bookId, title, file_name: file.name, file_type: fileType, storage_path: createRes.storage_path, status: 'uploading', updated_at: new Date().toISOString(), progress: 0 };
            books.unshift(book);
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
            const data = await api.getStudents(1, 500);
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

    // ------------------------------------------------------------------ اسأل مصادرك (كل الكتب)
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
    })();

    return { openBook, closeViewer() { if (viewer) viewer.close(); }, get books() { return books; }, loadBooks };
}
