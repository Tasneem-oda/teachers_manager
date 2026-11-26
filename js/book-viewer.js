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

import { icon } from './icons.js?v=58';
import { CONFIG } from './config.js?v=58';
import { loadPdfJs, pdfDocumentParams, loadDocxPreview, loadPptxPreview, loadJsZip, loadStyle, CDN, repairPdfBytes } from './book-libs.js?v=58';
import { detectDir } from './book-chunker.js?v=58';
import { BookChat } from './book-chat.js?v=58';
import { PresentTools } from './present-tools.js?v=58';

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
     * @param {number} [o.startPage]  يفتح على الصفحة دي (مثلًا: آخر صفحة وصلها الطالب)
     * @param {(page:number) => void} [o.onPageChange]
     * @param {{student_id?:string, group_id?:string}} [o.owner] v29: صاحب الرسم على الكتاب والسبورة (طالب/مجموعة)
     * @param {string} [o.ownerName] v29: اسم الطالب/المجموعة (عنوان السبورة)
     * @param {{decorate?:(v:BookViewer)=>void, pageStore?:{get:(id:string)=>number|null, set:(id:string,p:number)=>void}}} [o.inherit]
     *        v39: إعدادات بتتنقل لأي كتاب يتفتح من "كتاب كمان" (زرار "سجّل الصفحة في الحصة" وآخر صفحة لكل كتاب)
     */
    constructor({ api, book, opener, onClose, startPage, onPageChange, owner, ownerName, standalone, inherit }) {
        this.api = api;
        this.standalone = !!standalone;   // v34: صفحة reader.html (الكتاب في تاب لوحده)
        this.book = book;
        this.owner = owner || {};
        this.ownerName = ownerName || '';
        this.opener = opener || null;
        this.onClose = onClose || (() => {});
        this.inherit = inherit || null;
        const store = this.inherit && this.inherit.pageStore;
        if (!onPageChange && store && store.set) onPageChange = (p) => { try { store.set(book.id, p); } catch (e) { /* تجاهل */ } };
        if (!(Number(startPage) > 1) && store && store.get) { try { startPage = store.get(book.id) || 1; } catch (e) { /* تجاهل */ } }
        this.onPageChange = onPageChange || null;
        this.startPage = Number(startPage) > 1 ? Math.round(Number(startPage)) : 1;
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

        Shelf.beforeOpen(this);
        this._build();
        this._bindEvents();
        Shelf.add(this);
        this.chat = new BookChat({
            api, book, host: this.root,
            getPageContext: () => ({ page: this.page, supported: this._supportsPageContext() }),
            onCite: (src) => this.goToSource(src),
            onOpenChange: (open) => {
                this.chatBtn.classList.toggle('is-active', open);
                // على اللابتوب: النافذة بتاخد جنب الشاشة والكتاب بيتزحزح مكانها بدل ما تغطي جزء منه
                this.root.classList.toggle('bc-open', open);
                this._onResize();
            }
        });
        if (this.inherit && typeof this.inherit.decorate === 'function') { try { this.inherit.decorate(this); } catch (e) { console.warn('[BookViewer] decorate', e); } }
        this.ready = this.load();
        if (this.startPage > 1) {
            this.ready.then(() => { if (!this.closed && this.pageCount && this.pageCount > 1) this.goToPage(this.startPage); }).catch(() => { /* تجاهل */ });
        }
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
                    <div class="bv-group bv-multi">
                        <button type="button" class="bv-btn" data-act="another" aria-label="افتح كتاب كمان" title="افتح كتاب كمان جنبه">${icon('plus', { size: 16 })}<span class="bv-multi-t">كتاب كمان</span></button>
                        <button type="button" class="bv-btn" data-act="split" aria-label="الكتابين جنب بعض" title="الكتابين جنب بعض" hidden>${icon('grid', { size: 16 })}</button>
                        ${this.standalone ? '' : `<button type="button" class="bv-btn" data-act="newtab" aria-label="افتح في تاب جديد" title="افتح الكتاب في تاب جديد في المتصفح (بكل الأدوات)">${icon('externalLink', { size: 16 })}</button>`}
                    </div>
                </div>
            </header>
            <nav class="bv-tabs" hidden aria-label="الكتب المفتوحة"></nav>
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

        document.body.appendChild(this.root);
        this.root.addEventListener('pointerdown', () => { if (Shelf.split && Shelf.active !== this) Shelf.focus(this); }, true);
    }

    _bindEvents() {
        this.root.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-act]');
            if (!btn) return;
            // أزرار الشات (إغلاق / إعادة المحاولة / نسخ...) ليها معالجها الخاص: لو سبناها توصل هنا،
            // زر ✕ بتاع الشات كان بيقفل الكتاب كله وزر "إعادة المحاولة" كان بيعيد تحميل الكتاب
            if (btn.closest('.bc-panel')) return;
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
            else if (act === 'another') Shelf.pick(this);
            else if (act === 'newtab') this.openInNewTab();
            else if (act === 'split') Shelf.toggleSplit();
        });
        this.root.querySelector('.bv-tabs').addEventListener('click', (e) => {
            const x = e.target.closest('[data-tab-close]');
            if (x) { e.stopPropagation(); const v = Shelf.byId(x.dataset.tabClose); if (v) v.close(); return; }
            const t = e.target.closest('[data-tab]');
            if (t) { const v = Shelf.byId(t.dataset.tab); if (v) Shelf.activate(v, Shelf.split ? this : null); return; }
            if (e.target.closest('[data-tab-add]')) Shelf.pick(this);
        });
        this.pageInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); this.goToPage(parseInt(this.pageInput.value, 10) || this.page); this.stage.focus({ preventScroll: true }); }
            e.stopPropagation();
        });
        this.pageInput.addEventListener('focus', () => this.pageInput.select());
        this.pageInput.addEventListener('blur', () => { this.pageInput.value = String(this.page); });

        this._onKey = (e) => {
            if (this.closed || this.root.hidden || Shelf.active !== this || e._bvSeen) return;
            // v39: نفس الضغطة ماتتعالجش في كتابين (Esc كان بيقفل الكتاب المختار وبعده التاني اللي بقى مختار في نفس الضغطة)
            e._bvSeen = true;
            const tag = (e.target && e.target.tagName) || '';
            const typing = tag === 'INPUT' || tag === 'TEXTAREA' || (e.target && e.target.isContentEditable);
            // v29: أدوات الشرح الأول (Esc بيقفل الأداة/الزوم قبل ما يقفل الكتاب)
            if (this.tools && !typing && this.tools.onKey(e)) return;
            if (e.key === 'Escape') {
                e.preventDefault();
                if (this.root.querySelector('.bv-pick')) { this.root.querySelector('.bv-pick').remove(); return; }
                // لو الـ focus جوه الشات هو بيقفل نفسه ويوقّف الحدث، وهنا (خارجه) نقفله إحنا
                if (this.chat.isOpen) this.chat.close(); else this.close();
            } else if (!typing && !e.ctrlKey && !e.metaKey && !e.altKey) {
                if (e.key === 'ArrowLeft' || e.key === 'PageDown') { if (this.pager.hidden) return; e.preventDefault(); this.goToPage(this.page + 1); }
                else if (e.key === 'ArrowRight' || e.key === 'PageUp') { if (this.pager.hidden) return; e.preventDefault(); this.goToPage(this.page - 1); }
                else if (e.key === '+' || e.key === '=') { e.preventDefault(); this.stepZoom(1); }
                else if (e.key === '-') { e.preventDefault(); this.stepZoom(-1); }
                // v29: أزرار تنقل زيادة (Space / Home / End / G / 0)
                else if (e.code === 'Digit0' || e.code === 'Numpad0') { e.preventDefault(); this.setZoom(1); }
                else if (e.key === ' ' && !this.pager.hidden) { e.preventDefault(); this.goToPage(this.page + (e.shiftKey ? -1 : 1)); }
                else if (e.key === 'Home' && !this.pager.hidden) { e.preventDefault(); this.goToPage(1); }
                else if (e.key === 'End' && !this.pager.hidden) { e.preventDefault(); this.goToPage(this.pageCount || 1); }
                else if (e.code === 'KeyG' && !this.pager.hidden) { e.preventDefault(); this.pageInput.focus(); this.pageInput.select(); }
            }
        };
        document.addEventListener('keydown', this._onKey);

        this._onResize = () => {
            clearTimeout(this._resizeTimer);
            this._resizeTimer = setTimeout(() => { if (this.adapter && this.adapter.onResize) this.adapter.onResize(); if (this.tools) this.tools.onResize(); }, 150);
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

        // زر الرجوع في الموبايل يقفل العارض بدل ما يخرج من الصفحة (كتاب واحد بس بيسجّل: الرجوع بيقفل كل الكتب المفتوحة)
        if (!this.standalone && !Shelf.list.length) {
            try {
                history.pushState({ bookViewer: this.book.id }, '');
                this._onPop = () => { Shelf.list.slice().forEach((v) => { v._popHandled = true; v.close(); }); };
                window.addEventListener('popstate', this._onPop);
            } catch (e) { /* تجاهل */ }
        }
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
    load() {
        if (this.closed) return Promise.resolve();
        this._loading = true;
        // كل تحميل (أول مرة أو "إعادة المحاولة" أو الرجوع للأصل) ليه وعده الخاص،
        // عشان goToSource يستنى التحميل الحالي فعلًا (قبل كده كان بيلف في حلقة لا نهائية والصفحة تهنج)
        this._loadPromise = (async () => {
            try { await this._load(); } finally { this._loading = false; }
        })();
        return this._loadPromise;
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
        // v29: أدوات الشرح (قلم/ليزر/زوم/سبورة) — بتتعمل مرة واحدة وبتتحدّث مع كل عرض
        try {
            if (!this.tools) this.tools = new PresentTools(this);
            else this.tools.onRender();
        } catch (e) { console.warn('[PresentTools]', e); }
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
        if (this.onPageChange) { try { this.onPageChange(n); } catch (e) { /* تجاهل */ } }
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
        if (this._loading && this._loadPromise) {
            this._loadPromise.then(() => { if (!this.closed && !this._loading) this.goToSource(src); }).catch(() => { /* تجاهل */ });
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
        // ماتحمّلش pdf_viewer.css: قواعده العامة (.sidebar وغيرها) بتكسر تصميم البرنامج. قواعد طبقة النص متضمّنة في books.css
        const openDoc = (bytes) => pdfjs.getDocument(pdfDocumentParams({ data: new Uint8Array(bytes).slice() })).promise;
        // أول صفحة قابلة للقراءة (من أول ١٢) بتحدد المقاس الافتراضي لكل الصفحات
        const probeSize = async (doc) => {
            const lim = Math.min(doc.numPages, 12);
            for (let i = 1; i <= lim; i++) {
                try {
                    const pg = await doc.getPage(i);
                    const vp = pg.getViewport({ scale: 1 });
                    pg.cleanup();
                    return { width: vp.width, height: vp.height };
                } catch (e) { /* الصفحة دي تالفة: نجرّب اللي بعدها */ }
            }
            return null;
        };
        let pdf = null;
        let base = null;
        try {
            pdf = await openDoc(this.buffer);
            base = await probeSize(pdf);
        } catch (e) {
            if (e && e.name === 'PasswordException') throw new Error('ملف الـ PDF محمي بكلمة مرور. أزل الحماية وارفعه من جديد.');
            pdf = null;
        }
        if (!pdf || !base) {
            // الملف مابيتفتحش أو صفحاته الأولى تالفة: نجرّب نصلّح بنيته بمحلل أكثر تسامحًا
            if (pdf) { try { pdf.destroy(); } catch (e) { /* تجاهل */ } pdf = null; }
            for (const mode of ['resave', 'rebuild']) {
                try {
                    const fixed = await repairPdfBytes(this.buffer, mode);
                    const doc = await openDoc(fixed);
                    const size = await probeSize(doc);
                    if (size) {
                        pdf = doc; base = size;
                        this.buffer = fixed.buffer.slice(fixed.byteOffset, fixed.byteOffset + fixed.byteLength);
                        break;
                    }
                    try { doc.destroy(); } catch (e) { /* تجاهل */ }
                } catch (e) { /* نجرّب الطريقة اللي بعدها */ }
            }
        }
        if (!pdf || !base) {
            throw new Error('ملف الـ PDF تالف ولا يمكن عرضه. افتحه في Chrome ← Ctrl+P ← "حفظ كـ PDF" وارفع النسخة الجديدة، أو جرّب "عرض النص المستخرج".');
        }
        const n = pdf.numPages;

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
                    try { await renderPage(p); } catch (e) {
                        console.warn('[pdf] render failed for page', p, e);
                        st.rendered.delete(p);
                        if (els[p - 1]) els[p - 1].classList.add('bv-page-failed');   // صفحة تالفة في الملف: نوضّح بدل ما تفضل فاضية
                    }
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
            pageEls: () => els,
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
            pageEls: () => pages(),
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
            pageEls: () => slideEls(),
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
        // v29: الصورة جوه "صفحة" بمقاسها بالظبط (عشان الرسم عليها يفضل في مكانه مع الزوم)
        const box = document.createElement('div');
        box.className = 'bv-img-box';
        box.appendChild(img);
        wrap.appendChild(box);
        this.content.appendChild(wrap);
        let lastZ = 1;
        const apply = (z) => {
            lastZ = z;
            const nat = img.naturalWidth || 1000;
            const avail = Math.max(240, this.stage.clientWidth - 24);
            img.style.width = `${Math.round(Math.min(nat, avail) * z)}px`;
            img.style.maxWidth = 'none';
        };
        img.addEventListener('load', () => apply(lastZ));
        return {
            pageCount: 1, supportsPages: false,
            pageEls: () => [box],
            applyZoom: (z) => apply(z),
            onResize: () => apply(lastZ),
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
        if (this.tools) this.tools.onTextMode();
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

    // ------------------------------------------------------------------ v34: الكتاب في تاب لوحده في المتصفح
    openInNewTab() {
        const q = new URLSearchParams({ book: this.book.id });
        if (this.page > 1) q.set('page', String(this.page));
        if (this.owner.student_id) q.set('student_id', this.owner.student_id);
        if (this.owner.group_id) q.set('group_id', this.owner.group_id);
        if (this.ownerName) q.set('name', this.ownerName);
        try { localStorage.setItem('tm_reader_book_' + this.book.id, JSON.stringify(this.book)); } catch (e) { /* تجاهل */ }
        const w = window.open('reader.html?' + q.toString(), '_blank');
        if (w) { try { window.tmTrack && window.tmTrack('book_new_tab', {}); } catch (e) { /* تجاهل */ } }
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
        if (this.tools) { this.tools.destroy(); this.tools = null; }
        this._destroyAdapter();
        this.root.remove();
        Shelf.remove(this);
        // لو اتقفل بزر ✕ مش بزر الرجوع: نشيل الـ state اللي ضفناه في history (لما آخر كتاب يتقفل)
        if (!this._popHandled && !Shelf.list.length) { try { if (history.state && history.state.bookViewer) history.back(); } catch (e) { /* تجاهل */ } }
        if (this._onPop && Shelf.list.length) { const next = Shelf.list[0]; next._onPop = this._onPop; this._onPop = null; window.addEventListener('popstate', next._onPop); }
        // v39: في تاب الكتاب لوحده: نقفل التاب بس لما آخر كتاب يتقفل (قبل كده قفل أي كتاب كان بيقفل الكل)
        if (this.standalone && !Shelf.list.length) { try { window.close(); } catch (e) { /* تجاهل */ } setTimeout(() => { if (!window.closed) location.href = 'books.html'; }, 150); }
        if (this.opener && this.opener.focus && document.contains(this.opener)) { try { this.opener.focus({ preventScroll: true }); } catch (e) { /* تجاهل */ } }
        this.onClose();
    }
}

// ------------------------------------------------------------------ v34: أكتر من كتاب مفتوح في نفس الوقت
// تبويبات فوق الكتاب (تنقل بينهم بضغطة) + "جنب بعض" على الشاشات الكبيرة
// v39: في وضع "جنب بعض" كل نص من الشاشة ليه تبويباته: الضغط على كتاب بيفتحه في النص ده بالذات (من غير ما النصين يبدّلوا أماكنهم)،
//      والكتاب التالت بيتفتح في النص اللي طلبته منه بدل ما يقفل وضع جنب بعض، وقفل نص بيجيب كتاب تاني مكانه لو فيه.
const escH = (x) => String(x == null ? '' : x).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
/** تطبيع البحث بالعربي (أ/إ/آ = ا، ى = ي، ة = ه، من غير تشكيل) */
const normQ = (x) => String(x == null ? '' : x).toLowerCase().replace(/[ً-ٰٟـ]/g, '').replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/\s+/g, ' ').trim();
const SPLIT_MQ = '(min-width: 1000px)';
export const Shelf = {
    list: [], active: null, split: false, _overflow: null, _pair: null, _target: null,
    byId(id) { return this.list.find((v) => v._sid === id) || null; },
    canSplit() { return this.list.length > 1 && window.matchMedia(SPLIT_MQ).matches; },
    beforeOpen(v) {
        v._sid = 'b' + Math.random().toString(36).slice(2, 9);
        if (!this.list.length) { this._overflow = document.body.style.overflow; document.body.style.overflow = 'hidden'; }
    },
    add(v) {
        this.list.push(v);
        // الكتاب الجديد اتطلب من نص معيّن في وضع جنب بعض: يتفتح مكانه والنص التاني يفضل زي ما هو
        if (this.split && this._pair && this._target && this._pair.includes(this._target)) {
            this._pair = this._pair.map((x) => (x === this._target ? v : x));
            this._target = null;
            this.active = v;
            this.render();
            return;
        }
        this._target = null;
        this.activate(v);
    },
    remove(v) {
        const idx = this.list.indexOf(v);
        this.list = this.list.filter((x) => x !== v);
        if (!this.list.length) { document.body.style.overflow = this._overflow || ''; this.active = null; this.split = false; this._pair = null; return; }
        if (this.split && this._pair && this._pair.includes(v)) {
            const other = this._pair.find((x) => x !== v);
            // كتاب تالت مفتوح؟ ييجي مكان اللي اتقفل ووضع جنب بعض يفضل شغال
            const spare = this.list.filter((x) => x !== other).pop();
            if (spare && other) { this._pair = this._pair.map((x) => (x === v ? spare : x)); this.active = other; this.render(); return; }
            this.split = false;
            this.active = other || this.list[Math.max(0, idx - 1)] || this.list[0];
            this.render();
            return;
        }
        if (this.list.length < 2) this.split = false;
        if (this.active === v) this.activate(this.list[Math.min(idx, this.list.length - 1)] || this.list[0]);
        else this.render();
    },
    focus(v) { if (this.active === v) return; this.active = v; this.render(false); },
    /**
     * يعرض الكتاب ده. في وضع جنب بعض: لو هو أصلًا ظاهر في نص بنركّز عليه بس،
     * وإلا بيتعرض في النص `slotOf` (النص اللي اتضغط فيه التبويب) أو في النص اللي مش عليه التركيز.
     */
    activate(v, slotOf) {
        if (!v || v.closed) return;
        if (this.split && this._pair) {
            const pair = this._pair.filter((x) => x && !x.closed && this.list.includes(x));
            if (pair.length === 2) {
                if (!pair.includes(v)) {
                    const out = slotOf && pair.includes(slotOf) ? slotOf : (pair.find((x) => x !== this.active) || pair[0]);
                    this._pair = pair.map((x) => (x === out ? v : x));
                } else if (slotOf && slotOf !== v && pair.includes(slotOf)) {
                    this._pair = [pair[1], pair[0]];   // الكتاب ظاهر في النص التاني: النصين يبدّلوا (طلب صريح)
                }
            }
        }
        this.active = v;
        this.render();
    },
    toggleSplit() {
        if (!this.canSplit()) return;
        this.split = !this.split;
        if (this.split) {
            const other = this.list.filter((x) => x !== this.active).pop();
            // الكتاب اللي مفتوح دلوقتي يفضل على اليمين (أول القراية بالعربي)
            this._pair = [this.active, other];
        }
        this.render();
        try { window.tmTrack && window.tmTrack('book_split', { on: this.split }); } catch (e) { /* تجاهل */ }
    },
    closeAll() { this.list.slice().forEach((v) => { try { v.close(); } catch (e) { /* تجاهل */ } }); },
    render(relayout = true) {
        const many = this.list.length > 1;
        const canSplit = this.canSplit();
        if (this.split && !canSplit) this.split = false;
        const pair = this.split ? (this._pair || []).filter((x) => x && !x.closed && this.list.includes(x)) : [];
        if (this.split && pair.length < 2) this.split = false;
        if (this.active && !this.list.includes(this.active)) this.active = this.list[this.list.length - 1] || null;
        if (this.split && !pair.includes(this.active)) this.active = pair[1];
        this.list.forEach((v) => {
            const shown = this.split ? pair.includes(v) : v === this.active;
            const wasHidden = v.root.hidden;
            v.root.hidden = !shown;
            v.root.classList.toggle('bv-split', this.split && shown);
            v.root.classList.toggle('bv-split-a', this.split && pair[0] === v);
            v.root.classList.toggle('bv-split-b', this.split && pair[1] === v);
            v.root.classList.toggle('bv-focus', this.split && v === this.active);
            v.root.classList.toggle('bv-many', many);
            if (shown && wasHidden) v._needsRelayout = true;
            const tabs = v.root.querySelector('.bv-tabs');
            if (tabs) {
                tabs.hidden = !many;
                // في جنب بعض: التبويب "المختار" في كل نص هو الكتاب اللي ظاهر فيه
                const mine = this.split ? v : this.active;
                const key = many ? this.list.map((x) => x._sid + (x === mine ? '*' : '')).join('|') : '';
                if (tabs._key !== key) {
                    tabs._key = key;
                    tabs.innerHTML = many ? this.list.map((x) => `<div class="bv-tab ${x === mine ? 'on' : ''}"><button type="button" class="bv-tab-open" data-tab="${x._sid}" title="${escH(x.book.title)}" aria-current="${x === mine ? 'true' : 'false'}"><span>${escH(x.book.title)}</span></button><button type="button" class="bv-tab-x" data-tab-close="${x._sid}" aria-label="اقفل ${escH(x.book.title)}" title="اقفل الكتاب ده">${icon('x', { size: 13 })}</button></div>`).join('')
                        + `<button type="button" class="bv-tab-add" data-tab-add title="افتح كتاب كمان" aria-label="افتح كتاب كمان">${icon('plus', { size: 15 })}</button>` : '';
                    const on = tabs.querySelector('.bv-tab.on');
                    if (on && on.scrollIntoView) { try { on.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } catch (e) { /* تجاهل */ } }
                }
            }
            const sb = v.root.querySelector('[data-act="split"]');
            if (sb) {
                sb.hidden = !canSplit;
                sb.classList.toggle('is-active', this.split);
                sb.setAttribute('aria-pressed', this.split ? 'true' : 'false');
                sb.title = this.split ? 'كتاب واحد بس (اقفل جنب بعض)' : 'الكتابين جنب بعض';
            }
        });
        if (relayout) this.list.forEach((v) => { if (!v.root.hidden && v._onResize) v._onResize(); });
        else this.list.forEach((v) => { if (!v.root.hidden && v._needsRelayout && v._onResize) v._onResize(); });
        this.list.forEach((v) => { if (!v.root.hidden) v._needsRelayout = false; });
    },
    /** اختيار كتاب تاني من مكتبة المدرس */
    async pick(from) {
        const host = from.root;
        const old = host.querySelector('.bv-pick'); if (old) { old.remove(); return; }
        const box = document.createElement('div');
        box.className = 'bv-pick';
        box.innerHTML = `<div class="bv-pick-card" role="dialog" aria-modal="true" aria-label="افتح كتاب كمان"><div class="bv-pick-hd"><b>افتح كتاب كمان</b><button type="button" class="bv-btn" data-x aria-label="إغلاق">${icon('x', { size: 16 })}</button></div>
            <input type="search" class="bv-pick-q" placeholder="دوّر باسم الكتاب..." aria-label="دوّر باسم الكتاب"><div class="bv-pick-list"><p class="bv-pick-empty">جاري تحميل كتبك...</p></div>
            ${this.split ? '<p class="bv-pick-note">الكتاب هيتفتح في النص ده من الشاشة.</p>' : ''}</div>`;
        host.appendChild(box);
        const close = () => { box.remove(); document.removeEventListener('keydown', onKey, true); };
        const onKey = (e) => { if (e.key === 'Escape' && box.isConnected) { e.preventDefault(); e.stopImmediatePropagation(); close(); } };
        document.addEventListener('keydown', onKey, true);
        box.addEventListener('mousedown', (e) => { if (e.target === box) close(); });
        box.querySelector('[data-x]').addEventListener('click', close);
        const q = box.querySelector('.bv-pick-q');
        if (window.matchMedia('(min-width: 700px)').matches) { try { q.focus({ preventScroll: true }); } catch (e) { /* تجاهل */ } }
        let books = [];
        let failed = false;
        try {
            const r = await from.api.listBooks();
            // أي كتاب ملفه اترفع بيتفتح (حتى لو تحليله لسه ماخلصش أو فشل): زي "مكتبتي" بالظبط
            books = (Array.isArray(r) ? r : (r && r.books) || []).filter((b) => b && b.storage_path && b.status !== 'uploading');
        } catch (e) { books = []; failed = true; }
        if (!box.isConnected) return;
        const listEl = box.querySelector('.bv-pick-list');
        const draw = (qv) => {
            const qq = normQ(qv);
            const open = new Set(this.list.map((v) => v.book.id));
            const items = books.filter((b) => !qq || normQ(b.title).includes(qq)).slice(0, 80);
            listEl.innerHTML = items.length ? items.map((b) => `<button type="button" class="bv-pick-item" data-bid="${escH(b.id)}">${icon('bookOpen', { size: 16 })}<span>${escH(b.title)}</span>${open.has(b.id) ? '<small>مفتوح</small>' : ''}</button>`).join('')
                : `<p class="bv-pick-empty">${failed ? 'مقدرناش نجيب كتبك دلوقتي. اتأكد من النت وجرّب تاني.' : qq ? 'مفيش كتاب بالاسم ده.' : 'مفيش كتب تانية. ارفع كتبك من "مكتبتي".'}</p>`;
        };
        draw(q.value);
        q.addEventListener('input', (e) => draw(e.target.value));
        q.addEventListener('keydown', (e) => { if (e.key === 'Enter') { const first = listEl.querySelector('[data-bid]'); if (first) { e.preventDefault(); first.click(); } } });
        listEl.addEventListener('click', (e) => {
            const it = e.target.closest('[data-bid]'); if (!it) return;
            const b = books.find((x) => String(x.id) === it.dataset.bid);
            close();
            if (!b) return;
            const existing = this.list.find((v) => v.book.id === b.id && !v.closed);
            if (existing) { this.activate(existing, this.split ? from : null); return; }
            this._target = this.split ? from : null;
            openBookViewer({ api: from.api, book: b, owner: from.owner, ownerName: from.ownerName, standalone: from.standalone, inherit: from.inherit });
            try { window.tmTrack && window.tmTrack('book_second_opened', { n: this.list.length }); } catch (er) { /* تجاهل */ }
        });
    }
};
window.addEventListener('resize', () => { if (Shelf.list.length > 1) Shelf.render(false); });

/** اختصار: فتح عارض كتاب (لو الكتاب ده مفتوح بالفعل بنرجع له) */
export function openBookViewer(opts) {
    const same = opts && opts.book && Shelf.list.find((v) => v.book.id === opts.book.id && !v.closed);
    if (same) { Shelf.activate(same); return same; }
    return new BookViewer(opts);
}
