/**
 * book-viewer.js - عارض الكتاب الكامل بصيغته الأصلية (بيفتح لما تضغط على الكتاب)
 *
 *   PDF        → PDF.js (صفحات بتتحمّل عند الحاجة فقط، مع طبقة نص للتحديد والنسخ)
 *   Word       → docx-preview (نفس تنسيق الملف)
 *   PowerPoint → pptx-preview
 *   صورة/نص    → عرض مباشر
 *   "النص المستخرج" → بديل نصي من الفهرس (مفيد للكتب الممسوحة ولو تعذّر العرض الأصلي)
 *
 * + زر شات صغير بيفتح نافذة أسئلة عن الكتاب ده بالذات، والاستشهادات فيها بتفتح مكانها هنا.
 */

import { icon } from './icons.js?v=6';
import { CONFIG } from './config.js?v=6';
import { loadPdfJs, pdfDocumentParams, loadDocxPreview, loadPptxPreview, loadJsZip, loadStyle, CDN } from './book-libs.js?v=6';
import { detectDir } from './book-chunker.js?v=6';
import { BookChat } from './book-chat.js?v=6';

const ZOOM_STEPS = [0.5, 0.67, 0.8, 1, 1.25, 1.5, 2, 2.5, 3];
const TYPE_LABEL = { pdf: 'PDF', docx: 'Word', pptx: 'PowerPoint', txt: 'نص', image: 'صورة' };
const MAX_RENDERED_PAGES = 8;

const reduceMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

function errText(err) {
    if (!err) return 'حدث خطأ غير متوقع';
    if (err.error && err.error.message) return err.error.message;
    return err.message || 'حدث خطأ غير متوقع';
}

// ---------------------------------------------------------------------------
// تحديد نص داخل الصفحة (لفتح مكان الاستشهاد في Word / النص / طبقة نص الـ PDF)
// ---------------------------------------------------------------------------

/** تطبيع للمقارنة: يشيل التشكيل والتطويل ويوحّد الألف/الياء ويسيب حروف وأرقام فقط */
function fold(str) {
    let s = '';
    const map = [];
    let prevSpace = true;
    const src = String(str);
    for (let i = 0; i < src.length; i++) {
        const norm = src[i].normalize('NFKC');
        for (const ch0 of norm) {
            let ch = ch0.toLowerCase();
            if (/[\u064B-\u065F\u0670\u0640\u200B-\u200F\u202A-\u202E\u00AD]/.test(ch)) continue;
            if (/[أإآٱ]/.test(ch)) ch = 'ا';
            else if (ch === 'ى') ch = 'ي';
            if (/[\p{L}\p{N}]/u.test(ch)) { s += ch; map.push(i); prevSpace = false; }
            else if (!prevSpace) { s += ' '; map.push(i); prevSpace = true; }
        }
    }
    return { s, map };
}

export function clearMarks(root) {
    for (const m of Array.from(root.querySelectorAll('mark.bv-mark'))) {
        const parent = m.parentNode;
        while (m.firstChild) parent.insertBefore(m.firstChild, m);
        parent.removeChild(m);
        parent.normalize();
    }
}

/** بيلوّن أول ظهور للمقتطف داخل root ويرجّع أول mark (أو null) */
export function highlightSnippet(root, snippet) {
    if (!root || !snippet) return null;
    clearMarks(root);
    const doc = root.ownerDocument;
    const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
        acceptNode: (n) => (n.nodeValue && n.parentElement && !/^(SCRIPT|STYLE)$/.test(n.parentElement.tagName) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT)
    });
    let full = '';
    const segs = [];
    while (walker.nextNode()) {
        const node = walker.currentNode;
        segs.push({ node, start: full.length, end: full.length + node.nodeValue.length });
        full += node.nodeValue + '\n';
    }
    if (!segs.length) return null;
    const { s, map } = fold(full);
    const needle = fold(snippet).s.trim();
    if (needle.length < 8) return null;
    const windows = [];
    const words = needle.split(' ');
    windows.push(needle.slice(0, 90));
    if (needle.length > 130) windows.push(needle.slice(45, 135));
    if (words.length > 8) windows.push(words.slice(0, 8).join(' '));
    if (words.length > 5) windows.push(words.slice(0, 5).join(' '));
    let idx = -1; let len = 0;
    for (const w of windows) {
        const w2 = w.trim();
        if (w2.length < 8) continue;
        idx = s.indexOf(w2);
        if (idx >= 0) { len = w2.length; break; }
    }
    if (idx < 0) return null;
    const rawStart = map[idx];
    const rawEnd = map[idx + len - 1] + 1;
    let first = null;
    for (let i = segs.length - 1; i >= 0; i--) {
        const sg = segs[i];
        if (sg.end <= rawStart || sg.start >= rawEnd) continue;
        const a = Math.max(rawStart, sg.start) - sg.start;
        const b = Math.min(rawEnd, sg.end) - sg.start;
        if (b <= a) continue;
        let mid = sg.node;
        if (a > 0) mid = mid.splitText(a);
        if (b - a < mid.nodeValue.length) mid.splitText(b - a);
        const mark = doc.createElement('mark');
        mark.className = 'bv-mark';
        mid.parentNode.insertBefore(mark, mid);
        mark.appendChild(mid);
        first = mark;
    }
    return first;
}

// ---------------------------------------------------------------------------
// العارض
// ---------------------------------------------------------------------------

export class BookViewer {
    /**
     * @param {object} o
     * @param {object} o.api
     * @param {object} o.book  { id, title, file_type, file_name, storage_path, page_count, is_scanned, status }
     * @param {HTMLElement} [o.opener]  العنصر اللي بيرجع له الـ focus بعد الإغلاق
     * @param {() => void} [o.onClose]
     */
    constructor({ api, book, opener, onClose }) {
        this.api = api;
        this.book = book;
        this.opener = opener || null;
        this.onClose = onClose || (() => {});
        this.zoom = 1;
        this.page = 1;
        this.pageCount = null;
        this.mode = 'original';         // original | text
        this.adapter = null;            // { goToPage, applyZoom, destroy, supportsPages }
        this.buffer = null;
        this.closed = false;
        this.abort = new AbortController();
        this.textState = null;
        this._popHandled = false;

        this._build();
        this._bindEvents();
        this.chat = new BookChat({
            api, book, host: this.root,
            getPageContext: () => ({ page: this.page, supported: this._supportsPageContext() }),
            onCite: (src) => this.goToSource(src),
            onOpenChange: (open) => { this.chatBtn.classList.toggle('is-active', open); }
        });
        this.ready = this.load();
    }

    // ------------------------------------------------------------------ DOM
    _build() {
        const b = this.book;
        this.root = document.createElement('div');
        this.root.className = 'bv';
        this.root.setAttribute('role', 'dialog');
        this.root.setAttribute('aria-modal', 'true');
        this.root.setAttribute('aria-label', `عرض الكتاب: ${b.title}`);
        this.root.innerHTML = `
            <header class="bv-header">
                <button type="button" class="bv-btn" data-act="close" aria-label="إغلاق" title="إغلاق">${icon('x', { size: 18 })}</button>
                <div class="bv-title">
                    <h2></h2>
                    <p class="bv-meta"></p>
                </div>
                <div class="bv-tools">
                    <div class="bv-group bv-pager" hidden>
                        <button type="button" class="bv-btn" data-act="prev" aria-label="الصفحة السابقة" title="الصفحة السابقة">${icon('chevronRight', { size: 16 })}</button>
                        <label class="bv-pageinput"><input type="text" inputmode="numeric" aria-label="رقم الصفحة" value="1"><span class="bv-total"></span></label>
                        <button type="button" class="bv-btn" data-act="next" aria-label="الصفحة التالية" title="الصفحة التالية">${icon('chevronLeft', { size: 16 })}</button>
                    </div>
                    <div class="bv-group bv-zoom">
                        <button type="button" class="bv-btn" data-act="zoom-out" aria-label="تصغير" title="تصغير">${icon('zoomOut', { size: 16 })}</button>
                        <button type="button" class="bv-zoom-label" data-act="zoom-reset" title="إعادة الحجم الافتراضي">100%</button>
                        <button type="button" class="bv-btn" data-act="zoom-in" aria-label="تكبير" title="تكبير">${icon('zoomIn', { size: 16 })}</button>
                    </div>
                    <div class="bv-group">
                        <button type="button" class="bv-btn bv-mode" data-act="mode" aria-label="النص المستخرج" title="النص المستخرج (بديل نصي للكتاب)">${icon('textLines', { size: 16 })}<span>النص</span></button>
                        <button type="button" class="bv-btn" data-act="download" aria-label="تحميل الملف الأصلي" title="تحميل الملف الأصلي">${icon('download', { size: 16 })}</button>
                    </div>
                    <button type="button" class="bv-btn bv-chat-btn" data-act="chat" aria-label="اسأل الكتاب" title="اسأل الكتاب">${icon('messageSquare', { size: 16 })}<span>اسأل الكتاب</span></button>
                </div>
            </header>
            <div class="bv-stage" tabindex="0">
                <div class="bv-content"></div>
                <div class="bv-state" hidden></div>
            </div>`;
        this.root.querySelector('h2').textContent = b.title;
        const parts = [TYPE_LABEL[b.file_type] || b.file_type];
        if (b.page_count) parts.push(`${b.page_count} ${b.file_type === 'pptx' ? 'شريحة' : 'صفحة'}`);
        if (b.is_scanned) parts.push('كتاب مصوّر · اتقرأ بالذكاء الاصطناعي');
        this.root.querySelector('.bv-meta').textContent = parts.join(' · ');

        this.stage = this.root.querySelector('.bv-stage');
        this.content = this.root.querySelector('.bv-content');
        this.stateEl = this.root.querySelector('.bv-state');
        this.pager = this.root.querySelector('.bv-pager');
        this.pageInput = this.root.querySelector('.bv-pageinput input');
        this.totalEl = this.root.querySelector('.bv-total');
        this.zoomLabel = this.root.querySelector('.bv-zoom-label');
        this.zoomGroup = this.root.querySelector('.bv-zoom');
        this.modeBtn = this.root.querySelector('.bv-mode');
        this.chatBtn = this.root.querySelector('.bv-chat-btn');

        this._prevOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        document.body.appendChild(this.root);
    }

    _bindEvents() {
        this.root.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-act]');
            if (!btn) return;
            const act = btn.dataset.act;
            if (act === 'close') this.close();
            else if (act === 'prev') this.goToPage(this.page - 1);
            else if (act === 'next') this.goToPage(this.page + 1);
            else if (act === 'zoom-in') this.stepZoom(1);
            else if (act === 'zoom-out') this.stepZoom(-1);
            else if (act === 'zoom-reset') this.setZoom(1);
            else if (act === 'mode') this.toggleMode();
            else if (act === 'download') this.download();
            else if (act === 'chat') this.chat.toggle();
            else if (act === 'retry') this.load();
            else if (act === 'text-fallback') this.showTextMode();
        });
        this.pageInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); this.goToPage(parseInt(this.pageInput.value, 10) || this.page); this.stage.focus({ preventScroll: true }); }
            e.stopPropagation();
        });
        this.pageInput.addEventListener('focus', () => this.pageInput.select());
        this.pageInput.addEventListener('blur', () => { this.pageInput.value = String(this.page); });

        this._onKey = (e) => {
            if (this.closed) return;
            const tag = (e.target && e.target.tagName) || '';
            const typing = tag === 'INPUT' || tag === 'TEXTAREA' || (e.target && e.target.isContentEditable);
            if (e.key === 'Escape') {
                e.preventDefault();
                // لو الـ focus جوه الشات هو بيقفل نفسه ويوقّف الحدث، وهنا (خارجه) نقفله إحنا
                if (this.chat.isOpen) this.chat.close(); else this.close();
            } else if (!typing && !e.ctrlKey && !e.metaKey && !e.altKey) {
                if (e.key === 'ArrowLeft' || e.key === 'PageDown') { if (this.pager.hidden) return; e.preventDefault(); this.goToPage(this.page + 1); }
                else if (e.key === 'ArrowRight' || e.key === 'PageUp') { if (this.pager.hidden) return; e.preventDefault(); this.goToPage(this.page - 1); }
                else if (e.key === '+' || e.key === '=') { e.preventDefault(); this.stepZoom(1); }
                else if (e.key === '-') { e.preventDefault(); this.stepZoom(-1); }
            }
        };
        document.addEventListener('keydown', this._onKey);

        this._onResize = () => {
            clearTimeout(this._resizeTimer);
            this._resizeTimer = setTimeout(() => { if (this.adapter && this.adapter.onResize) this.adapter.onResize(); }, 150);
        };
        window.addEventListener('resize', this._onResize);

        this._onScroll = () => {
            if (this._navLock) { this._lockNav(); return; }   // تمرير برمجي شغال: نستنى يخلص
            if (this._scrollTick) return;
            this._scrollTick = requestAnimationFrame(() => {
                this._scrollTick = null;
                if (this.adapter && this.adapter.onScroll) this.adapter.onScroll();
            });
        };
        this.stage.addEventListener('scroll', this._onScroll, { passive: true });

        // زر الرجوع في الموبايل يقفل العارض بدل ما يخرج من الصفحة
        try {
            history.pushState({ bookViewer: this.book.id }, '');
            this._onPop = () => { this._popHandled = true; this.close(); };
            window.addEventListener('popstate', this._onPop);
        } catch (e) { /* تجاهل */ }
    }

    // ------------------------------------------------------------------ الحالات (تحميل / خطأ)
    _showLoading(message, percent) {
        this.stateEl.hidden = false;
        this.content.hidden = true;
        this.stateEl.innerHTML = `
            <div class="bv-card" role="status">
                <div class="bv-spinner" aria-hidden="true"></div>
                <p class="bv-card-title"></p>
                <div class="bv-progress"><i></i></div>
            </div>`;
        this.stateEl.querySelector('.bv-card-title').textContent = message;
        this._setProgress(percent);
    }

    _setProgress(percent) {
        const bar = this.stateEl.querySelector('.bv-progress i');
        const wrap = this.stateEl.querySelector('.bv-progress');
        if (!bar || !wrap) return;
        if (percent == null) { wrap.classList.add('is-indeterminate'); bar.style.width = ''; }
        else { wrap.classList.remove('is-indeterminate'); bar.style.width = `${Math.max(2, Math.min(100, percent))}%`; }
    }

    _showError(message, { canRetry = true, textFallback = true } = {}) {
        this.stateEl.hidden = false;
        this.content.hidden = true;
        this.stateEl.innerHTML = `
            <div class="bv-card bv-card-error" role="alert">
                <div class="bv-card-icon">${icon('warning', { size: 26 })}</div>
                <p class="bv-card-title">تعذّر عرض الكتاب</p>
                <p class="bv-card-sub"></p>
                <div class="bv-card-actions">
                    ${canRetry ? '<button type="button" class="bv-action" data-act="retry">إعادة المحاولة</button>' : ''}
                    ${textFallback && this.book.status === 'ready' ? '<button type="button" class="bv-action bv-action-ghost" data-act="text-fallback">عرض النص المستخرج</button>' : ''}
                    <button type="button" class="bv-action bv-action-ghost" data-act="download">تحميل الملف</button>
                </div>
            </div>`;
        this.stateEl.querySelector('.bv-card-sub').textContent = message;
    }

    _showContent() {
        this.stateEl.hidden = true;
        this.stateEl.innerHTML = '';
        this.content.hidden = false;
    }

    // ------------------------------------------------------------------ التحميل والعرض
    async load() {
        if (this.closed) return;
        this._loading = true;
        try { await this._load(); } finally { this._loading = false; }
    }

    async _load() {
        this._destroyAdapter();
        this.mode = 'original';
        this.modeBtn.querySelector('span').textContent = 'النص';
        this.modeBtn.setAttribute('aria-pressed', 'false');
        this._showLoading('جاري تحميل الكتاب...', 0);
        try {
            if (!this.buffer) {
                const res = await this.api.fetchBookFile(this.book.storage_path, {
                    signal: this.abort.signal,
                    onProgress: (loaded, total) => {
                        if (this.closed) return;
                        this._setProgress(total ? (loaded / total) * 100 : null);
                    }
                });
                this.buffer = res.buffer;
                this.contentType = res.contentType || '';
            }
            if (this.closed) return;
            this._showLoading('جاري تجهيز العرض...', null);
            await this._renderOriginal();
            if (this.closed) return;
            this._showContent();
            this._afterRender();
        } catch (err) {
            if (this.closed || (err && err.aborted)) return;
            console.error('[BookViewer]', err);
            this._destroyAdapter();
            this._showError(errText(err));
        }
    }

    async _renderOriginal() {
        const t = this.book.file_type;
        this.content.innerHTML = '';
        this.content.className = `bv-content bv-type-${t}`;
        if (t === 'pdf') this.adapter = await this._pdfAdapter();
        else if (t === 'docx') this.adapter = await this._docxAdapter();
        else if (t === 'pptx') this.adapter = await this._pptxAdapter();
        else if (t === 'image') this.adapter = this._imageAdapter();
        else if (t === 'txt') this.adapter = this._txtAdapter();
        else throw new Error('نوع ملف غير مدعوم للعرض');
    }

    _afterRender() {
        const a = this.adapter;
        this.pageCount = a && a.pageCount ? a.pageCount : null;
        this.pager.hidden = !(this.pageCount && this.pageCount > 1);
        this.totalEl.textContent = this.pageCount ? `/ ${this.pageCount}` : '';
        this.zoomGroup.hidden = false;
        this.setZoom(this.zoom, true);
        this.page = 1;
        this.pageInput.value = '1';
        this.chat.refreshContext();
        if (!this.chat.isOpen) this.stage.focus({ preventScroll: true });   // ماناخدش الـ focus من الشات وإنت بتكتب
    }

    _destroyAdapter() {
        if (this.adapter && this.adapter.destroy) { try { this.adapter.destroy(); } catch (e) { /* تجاهل */ } }
        this.adapter = null;
        this.content.innerHTML = '';
    }

    // ------------------------------------------------------------------ التنقل والتكبير
    _setPage(n) {
        if (n === this.page) return;
        this.page = n;
        if (document.activeElement !== this.pageInput) this.pageInput.value = String(n);
        this.chat.refreshContext();
    }

    /** بيقفل تحديث رقم الصفحة من التمرير لحد ما الحركة تخلص (scrollend أو مهلة قصيرة بعد آخر scroll) */
    _lockNav() {
        this._navLock = true;
        clearTimeout(this._navTimer);
        this._navTimer = setTimeout(() => { this._navLock = false; if (this.adapter && this.adapter.onScroll) this.adapter.onScroll(); }, 250);
    }

    goToPage(n, opts = {}) {
        if (!this.adapter || !this.adapter.goToPage) return false;
        const max = this.pageCount || 1;
        const target = Math.max(1, Math.min(max, Math.round(n) || 1));
        this._setPage(target);
        this.pageInput.value = String(target);
        this._lockNav();
        this.adapter.goToPage(target, opts);
        return true;
    }

    stepZoom(dir) {
        let idx = ZOOM_STEPS.findIndex((z) => Math.abs(z - this.zoom) < 0.01);
        if (idx < 0) idx = ZOOM_STEPS.reduce((best, z, i) => (Math.abs(z - this.zoom) < Math.abs(ZOOM_STEPS[best] - this.zoom) ? i : best), 0);
        const next = Math.max(0, Math.min(ZOOM_STEPS.length - 1, idx + dir));
        this.setZoom(ZOOM_STEPS[next]);
    }

    setZoom(z, silent) {
        this.zoom = z;
        this.zoomLabel.textContent = `${Math.round(z * 100)}%`;
        if (this.adapter && this.adapter.applyZoom) this.adapter.applyZoom(z, !!silent);
    }

    download() {
        const name = this.book.file_name || this.book.title;
        this.api.getBookFileUrl(this.book.storage_path, { expiresIn: 300, download: name }).then((url) => {
            const a = document.createElement('a');
            a.href = url; a.download = name; a.rel = 'noopener';
            document.body.appendChild(a); a.click(); a.remove();
        }).catch((err) => alert('تعذّر تحميل الملف: ' + errText(err)));
    }

    // ------------------------------------------------------------------ الاستشهادات
    _supportsPageContext() {
        if (this.mode === 'text') return false;
        const t = this.book.file_type;
        return !!(this.adapter && (t === 'pdf' || t === 'pptx' || t === 'image'));
    }

    /** بيفتح مكان المصدر (استشهاد من الشات) - بيرجّع true لو قدر يروح له */
    goToSource(src) {
        if (!src) return false;
        // الكتاب لسه بيتحمّل: نستنى يخلص وبعدين نروح للمكان (بدل ما نحوّل للنص المستخرج بدري)
        if (this._loading && this.ready) {
            this.ready.then(() => { if (!this.closed) this.goToSource(src); });
            return true;
        }
        if (this.mode === 'text') return this._textGoTo(src.page, src.excerpt);
        const t = this.book.file_type;
        if ((t === 'pdf' || t === 'pptx') && src.page && this.adapter) {
            return this.goToPage(src.page, { excerpt: src.excerpt, flash: true });
        }
        if ((t === 'docx' || t === 'txt') && src.excerpt && this.adapter && this.adapter.findText) {
            const ok = this.adapter.findText(src.excerpt);
            if (ok) return true;
        }
        // مالقيناش مكان دقيق في الملف الأصلي: نعرض النص المستخرج عند المقطع ده
        if (src.excerpt || src.page) {
            this.showTextMode().then(() => this._textGoTo(src.page, src.excerpt));
            return true;
        }
        return false;
    }

    // ------------------------------------------------------------------ PDF
    async _pdfAdapter() {
        const pdfjs = await loadPdfJs();
        loadStyle(CDN.pdfViewerCss);
        const pdf = await pdfjs.getDocument(pdfDocumentParams({ data: new Uint8Array(this.buffer).slice() })).promise;
        const n = pdf.numPages;
        const first = await pdf.getPage(1);
        const base = first.getViewport({ scale: 1 });
        first.cleanup();

        const host = document.createElement('div');
        host.className = 'bv-pdf';
        this.content.appendChild(host);
        const els = [];
        for (let i = 1; i <= n; i++) {
            const el = document.createElement('div');
            el.className = 'bv-page';
            el.dataset.page = String(i);
            el.innerHTML = '<span class="bv-page-num"></span>';
            el.querySelector('.bv-page-num').textContent = String(i);
            host.appendChild(el);
            els.push(el);
        }

        const st = { scale: 1, rendered: new Map(), pending: new Set(), pumping: false, baseW: base.width, baseH: base.height, sized: new Set() };
        const self = this;

        const fitScale = () => {
            const avail = Math.max(240, this.stage.clientWidth - (this.stage.clientWidth < 600 ? 16 : 40));
            return Math.max(0.2, Math.min(avail, 1000) / st.baseW);
        };
        const sizeAll = () => {
            for (let i = 0; i < n; i++) {
                if (st.sized.has(i)) continue;
                els[i].style.width = `${st.baseW * st.scale}px`;
                els[i].style.height = `${st.baseH * st.scale}px`;
            }
        };
        const evict = (keepNear) => {
            if (st.rendered.size <= MAX_RENDERED_PAGES) return;
            const order = Array.from(st.rendered.keys()).sort((a, b) => Math.abs(b - keepNear) - Math.abs(a - keepNear));
            while (st.rendered.size > MAX_RENDERED_PAGES && order.length) {
                const p = order.shift();
                if (Math.abs(p - keepNear) <= 1) break;
                unrender(p);
            }
        };
        const unrender = (p) => {
            const r = st.rendered.get(p);
            if (!r) return;
            try { r.task && r.task.cancel(); } catch (e) { /* تجاهل */ }
            try { r.textLayer && r.textLayer.cancel(); } catch (e) { /* تجاهل */ }
            const el = els[p - 1];
            el.querySelectorAll('canvas, .textLayer').forEach((x) => x.remove());
            el._textReady = null;
            st.rendered.delete(p);
        };
        const renderPage = async (p) => {
            const cur = st.rendered.get(p);
            if (cur && cur.scale === st.scale) return;
            if (cur) unrender(p);
            const rec = { scale: st.scale, task: null, textLayer: null, cancelled: false };
            st.rendered.set(p, rec);
            const el = els[p - 1];
            const page = await pdf.getPage(p);
            if (self.closed || st.rendered.get(p) !== rec) return;
            const vp = page.getViewport({ scale: st.scale });
            el.style.width = `${vp.width}px`;
            el.style.height = `${vp.height}px`;
            st.sized.add(p - 1);
            el.style.setProperty('--scale-factor', String(vp.scale));

            let dpr = Math.min(window.devicePixelRatio || 1, 2);
            const pixels = vp.width * vp.height * dpr * dpr;
            if (pixels > 16e6) dpr = Math.sqrt(16e6 / (vp.width * vp.height));
            const canvas = document.createElement('canvas');
            canvas.width = Math.floor(vp.width * dpr);
            canvas.height = Math.floor(vp.height * dpr);
            canvas.style.width = `${vp.width}px`;
            canvas.style.height = `${vp.height}px`;
            const ctx = canvas.getContext('2d');
            const task = page.render({ canvasContext: ctx, viewport: vp, transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : null });
            rec.task = task;
            try { await task.promise; } catch (e) { if (e && e.name === 'RenderingCancelledException') return; throw e; }
            if (self.closed || st.rendered.get(p) !== rec) return;
            el.insertBefore(canvas, el.firstChild);

            const tlDiv = document.createElement('div');
            tlDiv.className = 'textLayer';
            el.appendChild(tlDiv);
            el._textReady = (async () => {
                try {
                    const tl = new pdfjs.TextLayer({ textContentSource: page.streamTextContent(), container: tlDiv, viewport: vp });
                    rec.textLayer = tl;
                    await tl.render();
                } catch (e) { /* طبقة النص اختيارية */ }
                page.cleanup();
            })();
            evict(self.page);
        };
        const pump = async () => {
            if (st.pumping) return;
            st.pumping = true;
            try {
                while (st.pending.size && !self.closed) {
                    const cur = self.page;
                    const p = Array.from(st.pending).sort((a, b) => Math.abs(a - cur) - Math.abs(b - cur))[0];
                    st.pending.delete(p);
                    try { await renderPage(p); } catch (e) { console.warn('[pdf] render failed for page', p, e); }
                }
            } finally { st.pumping = false; }
        };
        const io = new IntersectionObserver((entries) => {
            for (const en of entries) {
                const p = parseInt(en.target.dataset.page, 10);
                if (en.isIntersecting) { st.pending.add(p); } else { st.pending.delete(p); }
            }
            pump();
        }, { root: this.stage, rootMargin: '120% 0px' });
        els.forEach((el) => io.observe(el));

        const topOf = (el) => el.getBoundingClientRect().top - this.stage.getBoundingClientRect().top + this.stage.scrollTop;
        const currentPage = () => {
            const probe = this.stage.scrollTop + this.stage.clientHeight * 0.35;
            let lo = 0, hi = n - 1, ans = 0;
            while (lo <= hi) {
                const mid = (lo + hi) >> 1;
                if (topOf(els[mid]) <= probe) { ans = mid; lo = mid + 1; } else hi = mid - 1;
            }
            return ans + 1;
        };

        const adapter = {
            pageCount: n,
            supportsPages: true,
            applyZoom: (z) => {
                st.scale = fitScale() * z;
                st.sized.clear();
                for (const p of Array.from(st.rendered.keys())) unrender(p);
                sizeAll();
                requestAnimationFrame(() => {
                    this.stage.scrollTop = topOf(els[this.page - 1]) - 12;   // الصفحة الحالية وقت التنفيذ (مش وقت الاستدعاء)
                    // نحرّك الـ observer: الصفحات الظاهرة تتعمل لها render
                    els.forEach((el) => { io.unobserve(el); io.observe(el); });
                });
            },
            onResize: () => adapter.applyZoom(this.zoom),
            onScroll: () => { this._setPage(currentPage()); },
            goToPage: async (p, opts = {}) => {
                const el = els[p - 1];
                if (!el) return;
                this.stage.scrollTo({ top: topOf(el) - 12, behavior: reduceMotion() ? 'auto' : 'smooth' });
                st.pending.add(p); pump();
                if (opts.flash || opts.excerpt) {
                    el.classList.add('bv-flash');
                    setTimeout(() => el.classList.remove('bv-flash'), 1800);
                }
                if (opts.excerpt) {
                    // ننتظر الـ render + طبقة النص ثم نلوّن الجملة
                    for (let i = 0; i < 40 && !el._textReady; i++) await new Promise((r) => setTimeout(r, 100));
                    if (el._textReady) {
                        await el._textReady;
                        const tl = el.querySelector('.textLayer');
                        const mark = tl && highlightSnippet(tl, opts.excerpt);
                        if (mark) setTimeout(() => { if (tl) clearMarks(tl); }, 5000);
                    }
                }
            },
            destroy: () => { io.disconnect(); for (const p of Array.from(st.rendered.keys())) unrender(p); try { pdf.destroy(); } catch (e) { /* تجاهل */ } }
        };
        st.scale = fitScale();
        sizeAll();
        return adapter;
    }

    // ------------------------------------------------------------------ Word
    async _docxAdapter() {
        const docx = await loadDocxPreview();
        const host = document.createElement('div');
        host.className = 'bv-docx-host';
        const styleHost = document.createElement('div');
        this.content.appendChild(styleHost);
        this.content.appendChild(host);
        await docx.renderAsync(this.buffer.slice(0), host, styleHost, {
            className: 'docx', inWrapper: true, breakPages: true, ignoreLastRenderedPageBreak: false,
            renderHeaders: true, renderFooters: true, renderFootnotes: true, useBase64URL: true
        });
        const wrapper = host.querySelector('.docx-wrapper') || host;
        const pages = () => Array.from(host.querySelectorAll('section.docx'));
        const pageW = () => { const p = pages()[0]; return p ? p.getBoundingClientRect().width / (this._docxScale || 1) : 794; };
        const useZoomProp = typeof CSS !== 'undefined' && CSS.supports && CSS.supports('zoom', '1');
        const apply = (z) => {
            const avail = Math.max(240, this.stage.clientWidth - 24);
            const fit = Math.min(1, avail / (pageW() || 794));
            const total = fit * z;
            this._docxScale = total;
            if (useZoomProp) { wrapper.style.zoom = String(total); wrapper.style.transform = ''; host.style.height = ''; }
            else {
                wrapper.style.transformOrigin = 'top center';
                wrapper.style.transform = `scale(${total})`;
                host.style.height = `${wrapper.scrollHeight * total}px`;
            }
        };
        const topOf = (el) => el.getBoundingClientRect().top - this.stage.getBoundingClientRect().top + this.stage.scrollTop;
        const adapter = {
            get pageCount() { return pages().length || null; },
            supportsPages: true,
            applyZoom: (z) => apply(z),
            onResize: () => apply(this.zoom),
            onScroll: () => {
                const ps = pages(); if (!ps.length) return;
                const probe = this.stage.scrollTop + this.stage.clientHeight * 0.35;
                let ans = 0;
                ps.forEach((p, i) => { if (topOf(p) <= probe) ans = i; });
                this._setPage(ans + 1);
            },
            goToPage: (p) => { const el = pages()[p - 1]; if (el) this.stage.scrollTo({ top: topOf(el) - 12, behavior: reduceMotion() ? 'auto' : 'smooth' }); },
            findText: (snippet) => {
                const mark = highlightSnippet(host, snippet);
                if (!mark) return false;
                mark.scrollIntoView({ block: 'center', behavior: reduceMotion() ? 'auto' : 'smooth' });
                setTimeout(() => clearMarks(host), 5000);
                return true;
            },
            destroy: () => {}
        };
        return adapter;
    }

    // ------------------------------------------------------------------ PowerPoint
    async _pptxAdapter() {
        const lib = await loadPptxPreview();
        const JSZip = await loadJsZip();
        let ratio = 9 / 16;
        let count = 0;
        try {
            const zip = await JSZip.loadAsync(this.buffer.slice(0));
            const xml = await zip.file('ppt/presentation.xml').async('string');
            const m = xml.match(/<p:sldSz[^>]*\bcx="(\d+)"[^>]*\bcy="(\d+)"/) || xml.match(/<p:sldSz[^>]*\bcy="(\d+)"[^>]*\bcx="(\d+)"/);
            if (m) {
                const a = parseInt(m[1], 10), b = parseInt(m[2], 10);
                if (a > 0 && b > 0) ratio = /cx="\d+"[^>]*cy=/.test(m[0]) ? b / a : a / b;
            }
            count = Object.keys(zip.files).filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f)).length;
        } catch (e) { /* نستخدم القيم الافتراضية */ }

        const host = document.createElement('div');
        host.className = 'bv-pptx-host';
        this.content.appendChild(host);
        const width = Math.max(280, Math.min(960, this.stage.clientWidth - 24));
        const previewer = lib.init(host, { width, height: Math.round(width * ratio), mode: 'list' });
        await previewer.preview(this.buffer.slice(0));

        const slideEls = () => {
            let found = Array.from(host.querySelectorAll('.pptx-preview-slide-wrapper'));
            if (found.length) return found;
            // بديل: أول عنصر أبناؤه بعدد الشرائح
            const all = [host, ...host.querySelectorAll('div')];
            const cand = all.find((el) => el.children.length === count && count > 1);
            return cand ? Array.from(cand.children) : [];
        };
        const topOf = (el) => el.getBoundingClientRect().top - this.stage.getBoundingClientRect().top + this.stage.scrollTop;
        const useZoomProp = typeof CSS !== 'undefined' && CSS.supports && CSS.supports('zoom', '1');
        const adapter = {
            get pageCount() { return slideEls().length || count || null; },
            supportsPages: true,
            applyZoom: (z) => {
                const avail = Math.max(240, this.stage.clientWidth - 24);
                const fit = Math.min(1, avail / width);
                if (useZoomProp) host.style.zoom = String(fit * z);
                else { host.style.transformOrigin = 'top center'; host.style.transform = `scale(${fit * z})`; }
            },
            onResize: () => adapter.applyZoom(this.zoom),
            onScroll: () => {
                const ps = slideEls(); if (!ps.length) return;
                const probe = this.stage.scrollTop + this.stage.clientHeight * 0.35;
                let ans = 0;
                ps.forEach((p, i) => { if (topOf(p) <= probe) ans = i; });
                this._setPage(ans + 1);
            },
            goToPage: (p, opts = {}) => {
                const el = slideEls()[p - 1];
                if (!el) return;
                this.stage.scrollTo({ top: topOf(el) - 12, behavior: reduceMotion() ? 'auto' : 'smooth' });
                el.classList.add('bv-flash');
                setTimeout(() => el.classList.remove('bv-flash'), 1800);
            },
            findText: (snippet) => {
                const mark = highlightSnippet(host, snippet);
                if (!mark) return false;
                mark.scrollIntoView({ block: 'center' });
                setTimeout(() => clearMarks(host), 5000);
                return true;
            },
            destroy: () => { try { previewer.destroy && previewer.destroy(); } catch (e) { /* تجاهل */ } }
        };
        return adapter;
    }

    // ------------------------------------------------------------------ صورة
    _imageAdapter() {
        const ext = ((this.book.file_name || '').split('.').pop() || '').toLowerCase();
        const mime = this.contentType && this.contentType.startsWith('image/') ? this.contentType : (ext === 'jpg' ? 'image/jpeg' : `image/${ext || 'jpeg'}`);
        const url = URL.createObjectURL(new Blob([this.buffer], { type: mime }));
        const img = document.createElement('img');
        img.className = 'bv-img';
        img.alt = this.book.title;
        img.src = url;
        img.draggable = false;
        const wrap = document.createElement('div');
        wrap.className = 'bv-img-wrap';
        wrap.appendChild(img);
        this.content.appendChild(wrap);
        return {
            pageCount: 1, supportsPages: false,
            applyZoom: (z) => { img.style.width = `${z * 100}%`; img.style.maxWidth = z <= 1 ? '100%' : 'none'; },
            destroy: () => URL.revokeObjectURL(url)
        };
    }

    // ------------------------------------------------------------------ نص عادي
    _txtAdapter() {
        let text;
        try { text = new TextDecoder('utf-8', { fatal: true }).decode(this.buffer); } catch (e) { text = new TextDecoder('windows-1256').decode(this.buffer); }
        const el = document.createElement('div');
        el.className = 'bv-txt';
        // كل فقرة بتحدد اتجاهها لوحدها (عربي/إنجليزي مختلطين في نفس الملف)
        const paras = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').split(/\n{2,}/);
        const frag = document.createDocumentFragment();
        for (const ptxt of paras) {
            if (!ptxt.trim()) continue;
            const p = document.createElement('p');
            p.dir = 'auto';
            p.textContent = ptxt;
            frag.appendChild(p);
        }
        el.appendChild(frag);
        this.content.appendChild(el);
        return {
            pageCount: 1, supportsPages: false,
            applyZoom: (z) => { el.style.fontSize = `${1 * z}rem`; },
            findText: (snippet) => {
                const mark = highlightSnippet(el, snippet);
                if (!mark) return false;
                mark.scrollIntoView({ block: 'center' });
                setTimeout(() => clearMarks(el), 5000);
                return true;
            },
            destroy: () => {}
        };
    }

    // ------------------------------------------------------------------ النص المستخرج (من الفهرس)
    toggleMode() {
        if (this.mode === 'text') this.load(); else this.showTextMode();
    }

    async showTextMode() {
        if (this.mode === 'text' && this.textState && this.textState.ready) return;
        this._destroyAdapter();
        this.mode = 'text';
        this.modeBtn.querySelector('span').textContent = 'الأصل';
        this.modeBtn.setAttribute('aria-label', 'الملف الأصلي');
        this.modeBtn.setAttribute('aria-pressed', 'true');
        this.pager.hidden = true;
        this.zoomGroup.hidden = false;
        this._showLoading('جاري تحميل النص المستخرج...', null);
        this.content.className = 'bv-content bv-type-text';
        try {
            const chunks = [];
            let offset = 0;
            let total = Infinity;
            while (offset < total) {
                const res = await this.api.getBookContent(this.book.id, offset, 300, { signal: this.abort.signal });
                const got = res.chunks || [];
                total = res.total || 0;
                chunks.push(...got);
                offset += got.length;
                if (!got.length) break;
                if (total) this._setProgress((offset / total) * 100);
            }
            if (this.closed) return;
            if (!chunks.length) {
                this._showError(this.book.status === 'ready' ? 'لا يوجد نص مفهرس لهذا الكتاب.' : 'الكتاب لسه بيتعالج، النص هيظهر بعد ما يخلص.', { canRetry: false, textFallback: false });
                this.mode = 'original';
                return;
            }
            this._buildTextView(chunks);
            this._showContent();
        } catch (err) {
            if (this.closed || (err && err.aborted)) return;
            this._showError(errText(err), { canRetry: false, textFallback: false });
        }
    }

    _buildTextView(chunks) {
        const wrap = document.createElement('article');
        wrap.className = 'bv-text';
        const pages = new Map();
        let prev = '';
        for (const c of chunks) {
            let txt = c.content;
            // نشيل التداخل (overlap) اللي بيتكرر أول كل مقطع
            const nl = txt.indexOf('\n');
            if (nl >= 40 && prev.trimEnd().endsWith(txt.slice(0, nl).trim())) txt = txt.slice(nl + 1);
            prev = c.content;
            const key = c.page || 0;
            if (!pages.has(key)) pages.set(key, []);
            pages.get(key).push({ text: txt, chapter: c.chapter });
        }
        const keys = Array.from(pages.keys()).sort((a, b) => a - b);
        this.textPages = keys.filter((k) => k > 0);
        for (const k of keys) {
            const sec = document.createElement('section');
            sec.className = 'bv-tpage';
            if (k) sec.dataset.page = String(k);
            const head = document.createElement('div');
            head.className = 'bv-tpage-head';
            head.textContent = k ? `صفحة ${k}` : 'نص';
            sec.appendChild(head);
            let lastChapter = null;
            for (const item of pages.get(k)) {
                if (item.chapter && item.chapter !== lastChapter) {
                    const h = document.createElement('h3');
                    h.textContent = item.chapter;
                    sec.appendChild(h);
                    lastChapter = item.chapter;
                }
                const p = document.createElement('p');
                p.textContent = item.text;
                p.dir = detectDir(item.text) === 'rtl' ? 'rtl' : 'ltr';
                sec.appendChild(p);
            }
            wrap.appendChild(sec);
        }
        this.content.appendChild(wrap);
        this.textState = { ready: true, wrap };
        this.textEl = wrap;
        const hasPages = this.textPages.length > 1;
        this.pageCount = hasPages ? Math.max(...this.textPages) : null;
        this.pager.hidden = !hasPages;
        this.totalEl.textContent = this.pageCount ? `/ ${this.pageCount}` : '';
        this.page = 1;
        this.pageInput.value = '1';
        this.adapter = {
            pageCount: this.pageCount,
            supportsPages: hasPages,
            applyZoom: (z) => { wrap.style.fontSize = `${1 * z}rem`; },
            onScroll: () => {
                if (!hasPages) return;
                const probe = this.stage.scrollTop + this.stage.clientHeight * 0.35;
                let ans = this.textPages[0];
                for (const sec of wrap.querySelectorAll('.bv-tpage[data-page]')) {
                    const top = sec.getBoundingClientRect().top - this.stage.getBoundingClientRect().top + this.stage.scrollTop;
                    if (top <= probe) ans = parseInt(sec.dataset.page, 10);
                }
                this._setPage(ans);
            },
            goToPage: (p) => this._textGoTo(p),
            destroy: () => { this.textState = null; }
        };
        this.setZoom(this.zoom, true);
        this.chat.refreshContext();
    }

    _textGoTo(page, excerpt) {
        if (!this.textEl) return false;
        let target = null;
        if (page) {
            const pages = this.textPages || [];
            if (pages.length) {
                const best = pages.reduce((b, p) => (Math.abs(p - page) < Math.abs(b - page) ? p : b), pages[0]);
                target = this.textEl.querySelector(`.bv-tpage[data-page="${best}"]`);
            }
        }
        let mark = null;
        if (excerpt) mark = highlightSnippet(target || this.textEl, excerpt) || (target ? highlightSnippet(this.textEl, excerpt) : null);
        const scrollTo = mark || target;
        if (!scrollTo) return false;
        scrollTo.scrollIntoView({ block: mark ? 'center' : 'start', behavior: reduceMotion() ? 'auto' : 'smooth' });
        if (mark) setTimeout(() => clearMarks(this.textEl), 5000);
        else { target.classList.add('bv-flash'); setTimeout(() => target.classList.remove('bv-flash'), 1800); }
        return true;
    }

    // ------------------------------------------------------------------ الإغلاق
    close() {
        if (this.closed) return;
        this.closed = true;
        this.abort.abort();
        document.removeEventListener('keydown', this._onKey);
        window.removeEventListener('resize', this._onResize);
        if (this._onPop) window.removeEventListener('popstate', this._onPop);
        clearTimeout(this._resizeTimer);
        clearTimeout(this._navTimer);
        if (this.chat) this.chat.destroy();
        this._destroyAdapter();
        this.root.remove();
        document.body.style.overflow = this._prevOverflow;
        // لو اتقفل بزر ✕ مش بزر الرجوع: نشيل الـ state اللي ضفناه في history
        if (!this._popHandled) { try { if (history.state && history.state.bookViewer === this.book.id) history.back(); } catch (e) { /* تجاهل */ } }
        if (this.opener && this.opener.focus && document.contains(this.opener)) { try { this.opener.focus({ preventScroll: true }); } catch (e) { /* تجاهل */ } }
        this.onClose();
    }
}

/** اختصار: فتح عارض كتاب */
export function openBookViewer(opts) {
    return new BookViewer(opts);
}
