/**
 * book-chat.js - شات "اسأل الكتاب" (نافذة صغيرة عائمة جوه عارض الكتاب)
 *
 * تجربة الكتابة والمحادثة:
 *  - الإرسال بـ Enter (Shift+Enter سطر جديد؛ على الموبايل Enter بيعمل سطر جديد)، مع حماية من الـ IME
 *  - مربع الكتابة بيتمسح فورًا لما تبعت، وبيرجع لو ضغت "إيقاف" أو حصل خطأ (مافيش سؤال بيضيع)
 *  - إجابات Markdown منسّقة + استشهادات [مصدر N] تتحول لأزرار تفتح مكانها في الكتاب
 *  - ظهور تدريجي للإجابة (يمكن تخطّيه بنقرة)، نسخ الإجابة، إعادة المحاولة، محادثة جديدة
 *  - المحادثة بتتحفظ لكل كتاب طول الجلسة، وبتتبعت كسياق لأسئلة المتابعة
 *  - سؤال عن "الصفحة الحالية" اللي بتقرأها (PDF / PowerPoint / صورة)
 */

import { CONFIG } from './config.js?v=11';
import { icon } from './icons.js?v=11';
import { renderMarkdown, safePrefix, extractCitationNumbers } from './md-lite.js?v=11';

const STORE_PREFIX = 'tm-bookchat:';
const MAX_STORED = 30;
const BUSY_RETRIES = 2;
const BUSY_WAIT_MS = 5500;

const prefersReducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const isCoarsePointer = () => typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
const isNarrow = () => typeof matchMedia === 'function' && matchMedia('(max-width: 720px)').matches;

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

function errCode(err) { return (err && err.error && err.error.code) || ''; }
function errMsg(err) {
    if (!err) return 'حدث خطأ غير متوقع';
    if (err.error && err.error.message) return err.error.message;
    if (err.message) return err.message;
    return 'حدث خطأ غير متوقع';
}

function wait(ms, signal) {
    return new Promise((resolve, reject) => {
        if (signal && signal.aborted) return reject(Object.assign(new Error('aborted'), { aborted: true }));
        const t = setTimeout(() => { if (signal) signal.removeEventListener('abort', onAbort); resolve(); }, ms);
        const onAbort = () => { clearTimeout(t); reject(Object.assign(new Error('aborted'), { aborted: true })); };
        if (signal) signal.addEventListener('abort', onAbort, { once: true });
    });
}

export class BookChat {
    /**
     * @param {object} o
     * @param {object} o.api
     * @param {{id:string,title:string}} o.book
     * @param {HTMLElement} o.host  العنصر اللي هتتحط فيه النافذة (position: relative/fixed)
     * @param {() => {page:number|null, supported:boolean}} [o.getPageContext]
     * @param {(source:object) => boolean|void} [o.onCite]  بيتنادى لما تضغط على استشهاد
     * @param {(open:boolean) => void} [o.onOpenChange]
     */
    constructor({ api, book, host, getPageContext, onCite, onOpenChange }) {
        this.api = api;
        this.book = book;
        this.host = host;
        this.getPageContext = getPageContext || (() => ({ page: null, supported: false }));
        this.onCite = onCite || (() => false);
        this.onOpenChange = onOpenChange || (() => {});
        this.storeKey = STORE_PREFIX + book.id;
        this.messages = [];
        this.busy = false;
        this.abortCtl = null;
        this.reveal = null;         // { msg, el, timer } للإجابة اللي بتظهر تدريجيًا
        this.isOpen = false;
        this.remaining = null;
        this.pageChipOn = false;
        this._resetArmed = null;
        this._returnFocus = null;

        this._build();
        this._load();
        this._renderAll();
        this._bindViewport();
    }

    // ------------------------------------------------------------------ DOM
    _build() {
        const maxLen = CONFIG.BOOKS_SETTINGS.MAX_QUESTION_CHARS;
        this.fab = document.createElement('button');
        this.fab.type = 'button';
        this.fab.className = 'bc-fab';
        this.fab.setAttribute('aria-label', 'اسأل الكتاب');
        this.fab.innerHTML = `${icon('messageSquare', { size: 20 })}<span>اسأل الكتاب</span>`;
        this.fab.addEventListener('click', () => this.open());

        this.panel = document.createElement('section');
        this.panel.className = 'bc-panel';
        this.panel.setAttribute('role', 'dialog');
        this.panel.setAttribute('aria-label', 'اسأل الكتاب');
        this.panel.hidden = true;
        this.panel.innerHTML = `
            <header class="bc-head">
                <div class="bc-head-title">
                    <span class="bc-head-icon">${icon('sparkles', { size: 18 })}</span>
                    <div>
                        <h3>اسأل الكتاب</h3>
                        <p class="bc-book-title"></p>
                    </div>
                </div>
                <div class="bc-head-actions">
                    <button type="button" class="bc-icon-btn" data-act="reset" title="محادثة جديدة" aria-label="محادثة جديدة">${icon('rotateCcw', { size: 16 })}</button>
                    <button type="button" class="bc-icon-btn" data-act="close" title="إغلاق" aria-label="إغلاق">${icon('x', { size: 17 })}</button>
                </div>
            </header>
            <div class="bc-main">
                <div class="bc-body" role="log" aria-live="polite" aria-relevant="additions"></div>
                <button type="button" class="bc-jump" hidden aria-label="انزل لآخر رسالة">${icon('arrowDown', { size: 16 })}</button>
            </div>
            <div class="bc-ctx" hidden>
                <label class="bc-ctx-label"><input type="checkbox" class="bc-ctx-check"> <span class="bc-ctx-text"></span></label>
            </div>
            <form class="bc-composer" autocomplete="off">
                <textarea class="bc-input" rows="1" maxlength="${maxLen}" placeholder="اكتب سؤالك عن الكتاب..." aria-label="سؤالك عن الكتاب" enterkeyhint="send"></textarea>
                <button type="submit" class="bc-send" aria-label="إرسال">${icon('send', { size: 18 })}</button>
                <button type="button" class="bc-stop" aria-label="إيقاف" hidden>${icon('stop', { size: 16 })}</button>
            </form>
            <div class="bc-foot"><span class="bc-count"></span><span class="bc-quota"></span></div>
        `;
        this.panel.querySelector('.bc-book-title').textContent = this.book.title || '';

        this.bodyEl = this.panel.querySelector('.bc-body');
        this.inputEl = this.panel.querySelector('.bc-input');
        this.sendBtn = this.panel.querySelector('.bc-send');
        this.stopBtn = this.panel.querySelector('.bc-stop');
        this.jumpBtn = this.panel.querySelector('.bc-jump');
        this.formEl = this.panel.querySelector('.bc-composer');
        this.ctxEl = this.panel.querySelector('.bc-ctx');
        this.ctxCheck = this.panel.querySelector('.bc-ctx-check');
        this.ctxText = this.panel.querySelector('.bc-ctx-text');
        this.countEl = this.panel.querySelector('.bc-count');
        this.quotaEl = this.panel.querySelector('.bc-quota');
        this.resetBtn = this.panel.querySelector('[data-act="reset"]');

        this.host.appendChild(this.fab);
        this.host.appendChild(this.panel);

        this.panel.querySelector('[data-act="close"]').addEventListener('click', () => this.close());
        this.resetBtn.addEventListener('click', () => this._onResetClick());
        this.formEl.addEventListener('submit', (e) => { e.preventDefault(); this.send(); });
        this.stopBtn.addEventListener('click', () => this.stop());
        this.jumpBtn.addEventListener('click', () => this._scrollToBottom(true));
        this.ctxCheck.addEventListener('change', () => { this.pageChipOn = this.ctxCheck.checked; });
        this.bodyEl.addEventListener('scroll', () => this._onScroll(), { passive: true });
        this.bodyEl.addEventListener('click', (e) => this._onBodyClick(e));

        this.inputEl.addEventListener('input', () => { this._autoGrow(); this._updateCount(); this._saveDraft(); });
        this.inputEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && !isCoarsePointer()) {
                e.preventDefault();
                this.send();
            } else if (e.key === 'Escape') {
                e.stopPropagation();
                this.close();
            }
        });
        this.panel.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') { e.stopPropagation(); this.close(); }
        });
        this.inputEl.value = this._loadDraft();
        this._updateCount();
        // ملحوظة: مانحسبش ارتفاع مربع الكتابة هنا - النافذة لسه مخفية (scrollHeight = 0)
        // وده كان بيخلي المربع ينهار لشريط رفيع أول ما تتفتح. بنحسبه في open().
    }

    _bindViewport() {
        // على الموبايل: النافذة بتتبع الشاشة المرئية فعليًا (ارتفاعها + إزاحتها من أعلى الصفحة)،
        // فلما الكيبورد يظهر مربع الكتابة وزر الإرسال يفضلوا فوقه بدل ما يستخبوا تحته
        const vv = window.visualViewport;
        if (!vv) return;
        this._vvLayout = () => {
            this.panel.style.setProperty('--bc-vh', `${Math.round(vv.height)}px`);
            this.panel.style.setProperty('--bc-top', `${Math.max(0, Math.round(vv.offsetTop))}px`);
        };
        this._vvHandler = () => {
            this._vvLayout();
            if (this.isOpen && document.activeElement === this.inputEl) this._scrollToBottom(false);
        };
        vv.addEventListener('resize', this._vvHandler);
        vv.addEventListener('scroll', this._vvLayout);
        this._vvLayout();
    }

    destroy() {
        if (this.abortCtl) this.abortCtl.abort();
        this._stopReveal(false);
        if (window.visualViewport && this._vvHandler) {
            window.visualViewport.removeEventListener('resize', this._vvHandler);
            window.visualViewport.removeEventListener('scroll', this._vvLayout);
        }
        this.fab.remove();
        this.panel.remove();
    }

    // ------------------------------------------------------------------ فتح/غلق
    open() {
        if (this.isOpen) return;
        this._returnFocus = document.activeElement;
        this.isOpen = true;
        this.panel.hidden = false;
        this.fab.hidden = true;
        this._refreshContextChip();
        this._autoGrow();          // دلوقتي النافذة ظاهرة فالقياس صحيح
        this._scrollToBottom(false);
        setTimeout(() => { try { this.inputEl.focus({ preventScroll: true }); } catch (e) { /* تجاهل */ } }, 30);
        this.onOpenChange(true);
    }

    close() {
        if (!this.isOpen) return;
        this.isOpen = false;
        this.panel.hidden = true;
        this.fab.hidden = false;
        this.onOpenChange(false);
        const rf = this._returnFocus;
        this._returnFocus = null;
        if (rf && rf.focus && document.contains(rf)) { try { rf.focus({ preventScroll: true }); } catch (e) { /* تجاهل */ } }
    }

    toggle() { this.isOpen ? this.close() : this.open(); }

    /** بيتنادى من العارض لما الصفحة الحالية تتغير */
    refreshContext() {
        if (this.messages.length === 0 && !this.busy) this._renderAll();   // اقتراحات "الصفحة الحالية" بتعتمد على نوع الكتاب
        if (this.isOpen) this._refreshContextChip();
    }

    _refreshContextChip() {
        const ctx = this.getPageContext() || {};
        if (ctx.supported && ctx.page) {
            this.ctxEl.hidden = false;
            this.ctxText.textContent = `اسأل عن الصفحة الحالية (${ctx.page})`;
        } else {
            this.ctxEl.hidden = true;
            this.ctxCheck.checked = false;
            this.pageChipOn = false;
        }
    }

    // ------------------------------------------------------------------ التخزين
    _load() {
        try {
            const raw = sessionStorage.getItem(this.storeKey);
            const arr = raw ? JSON.parse(raw) : [];
            this.messages = Array.isArray(arr)
                ? arr.filter((m) => m && ['user', 'assistant', 'error'].includes(m.role) && typeof m.text === 'string').slice(-MAX_STORED)
                : [];
        } catch (e) { this.messages = []; }
    }

    _save() {
        try {
            const keep = this.messages.filter((m) => !m.pending).slice(-MAX_STORED)
                .map(({ id, role, text, sources, ts, question }) => ({ id, role, text, sources, ts, question }));
            sessionStorage.setItem(this.storeKey, JSON.stringify(keep));
        } catch (e) { /* التخزين ممتلئ أو ممنوع - مش مشكلة */ }
    }

    _saveDraft() { try { sessionStorage.setItem(this.storeKey + ':draft', this.inputEl.value); } catch (e) { /* تجاهل */ } }
    _loadDraft() { try { return sessionStorage.getItem(this.storeKey + ':draft') || ''; } catch (e) { return ''; } }

    // ------------------------------------------------------------------ العرض
    _renderAll() {
        this.bodyEl.innerHTML = '';
        if (this.messages.length === 0) this._renderEmpty();
        for (const m of this.messages) this.bodyEl.appendChild(this._buildMessage(m));
        this._updateResetState();
    }

    _renderEmpty() {
        const ctx = this.getPageContext() || {};
        const suggestions = [
            { label: 'لخّص لي الكتاب في نقاط', q: 'لخّص لي محتوى هذا الكتاب في نقاط رئيسية.' },
            { label: 'أهم المفاهيم في الكتاب', q: 'ما أهم المفاهيم والمصطلحات في هذا الكتاب؟ اشرحها باختصار.' },
            { label: 'أسئلة تدريبية للطلاب', q: 'اقترح 5 أسئلة تدريبية متنوعة من هذا الكتاب مع إجاباتها.' }
        ];
        if (ctx.supported) suggestions.unshift({ label: 'اشرح الصفحة الحالية', q: 'اشرح لي محتوى الصفحة الحالية ببساطة.', page: true });
        const box = document.createElement('div');
        box.className = 'bc-empty';
        box.innerHTML = `
            <div class="bc-empty-icon">${icon('bookOpen', { size: 26 })}</div>
            <p class="bc-empty-title">اسأل أي حاجة عن الكتاب</p>
            <p class="bc-empty-sub">الإجابة بتيجي من الكتاب نفسه، ومعاها رقم الصفحة اللي تقدر تضغط عليه.</p>
            <div class="bc-suggest"></div>`;
        const wrap = box.querySelector('.bc-suggest');
        for (const s of suggestions) {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'bc-chip';
            b.textContent = s.label;
            b.addEventListener('click', () => this.send(s.q, { page: !!s.page }));
            wrap.appendChild(b);
        }
        this.bodyEl.appendChild(box);
    }

    _buildMessage(m, { deferText = false } = {}) {
        const wrap = document.createElement('div');
        wrap.className = `bc-msg bc-${m.role === 'assistant' ? 'ai' : m.role === 'user' ? 'user' : 'err'}`;
        wrap.dataset.id = m.id;
        const bubble = document.createElement('div');
        bubble.className = 'bc-bubble';
        wrap.appendChild(bubble);

        if (m.role === 'user') {
            bubble.textContent = m.text;
        } else if (m.role === 'error') {
            bubble.textContent = m.text;
            if (m.question) {
                const retry = document.createElement('button');
                retry.type = 'button';
                retry.className = 'bc-retry';
                retry.dataset.act = 'retry';
                retry.innerHTML = `${icon('refresh', { size: 13 })} إعادة المحاولة`;
                wrap.appendChild(retry);
            }
        } else if (m.pending) {
            wrap.classList.add('bc-pending');
            bubble.innerHTML = `<span class="bc-dots" aria-hidden="true"><i></i><i></i><i></i></span><span class="bc-pending-text"></span>`;
            bubble.querySelector('.bc-pending-text').textContent = m.status || 'جاري البحث في الكتاب...';
            bubble.setAttribute('aria-label', 'جاري تجهيز الإجابة');
        } else {
            bubble.classList.add('bc-md');
            if (!deferText) bubble.innerHTML = renderMarkdown(m.text);
            this._appendAnswerExtras(wrap, m);
        }
        return wrap;
    }

    _appendAnswerExtras(wrap, m) {
        const tools = document.createElement('div');
        tools.className = 'bc-tools';
        const cited = extractCitationNumbers(m.text).filter((n) => m.sources && m.sources[n - 1]);
        if (cited.length) {
            const row = document.createElement('div');
            row.className = 'bc-srcs';
            for (const n of cited) {
                const s = m.sources[n - 1];
                const b = document.createElement('button');
                b.type = 'button';
                b.className = 'bc-src';
                b.dataset.n = String(n);
                b.dataset.act = 'cite';
                b.title = s.chapter ? String(s.chapter) : '';
                b.innerHTML = `${icon('bookOpen', { size: 12 })}<span></span>`;
                b.querySelector('span').textContent = s.page ? `صفحة ${s.page}` : (s.chapter ? String(s.chapter).slice(0, 24) : `مصدر ${n}`);
                row.appendChild(b);
            }
            tools.appendChild(row);
        }
        const copy = document.createElement('button');
        copy.type = 'button';
        copy.className = 'bc-tool';
        copy.dataset.act = 'copy';
        copy.setAttribute('aria-label', 'نسخ الإجابة');
        copy.title = 'نسخ الإجابة';
        copy.innerHTML = icon('copy', { size: 14 });
        tools.appendChild(copy);
        wrap.appendChild(tools);
    }

    _onBodyClick(e) {
        const target = e.target.closest('button');
        if (!target) {
            // نقرة على إجابة بتظهر تدريجيًا = عرضها كاملة فورًا
            if (this.reveal && e.target.closest('.bc-msg') === this.reveal.el) this._stopReveal(true);
            return;
        }
        const msgEl = target.closest('.bc-msg');
        const msg = msgEl ? this.messages.find((m) => m.id === msgEl.dataset.id) : null;

        if (target.classList.contains('bc-cite') || target.dataset.act === 'cite') {
            const n = parseInt(target.dataset.n, 10);
            const src = msg && msg.sources && msg.sources[n - 1];
            if (src) this._cite(src);
        } else if (target.dataset.act === 'copy' && msg) {
            this._copy(msg.text, target);
        } else if (target.dataset.act === 'retry' && msg && msg.question) {
            this.messages = this.messages.filter((m) => m.id !== msg.id);
            // نشيل رسالة السؤال القديمة اللي قبل الخطأ عشان مايتكررش
            const last = this.messages[this.messages.length - 1];
            if (last && last.role === 'user' && last.text === msg.question) this.messages.pop();
            this._renderAll();
            this.send(msg.question, { page: !!msg.withPage });
        }
    }

    _cite(src) {
        let navigated = false;
        try { navigated = !!this.onCite(src); } catch (e) { navigated = false; }
        // على الموبايل النافذة بتغطي الشاشة كلها: نقفلها عشان يظهر مكان الاستشهاد
        if (navigated && isNarrow()) this.close();
    }

    async _copy(text, btn) {
        let ok = false;
        try { await navigator.clipboard.writeText(text); ok = true; } catch (e) {
            try {
                const ta = document.createElement('textarea');
                ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
                document.body.appendChild(ta); ta.select();
                ok = document.execCommand('copy');
                ta.remove();
            } catch (e2) { ok = false; }
        }
        const old = btn.innerHTML;
        btn.innerHTML = ok ? icon('check', { size: 14 }) : icon('warning', { size: 14 });
        btn.classList.toggle('is-done', ok);
        setTimeout(() => { btn.innerHTML = old; btn.classList.remove('is-done'); }, 1400);
    }

    // ------------------------------------------------------------------ التمرير
    _nearBottom() {
        const b = this.bodyEl;
        return b.scrollHeight - b.scrollTop - b.clientHeight < 80;
    }

    _scrollToBottom(smooth) {
        const b = this.bodyEl;
        b.scrollTo({ top: b.scrollHeight, behavior: smooth && !prefersReducedMotion() ? 'smooth' : 'auto' });
        this.jumpBtn.hidden = true;
    }

    _onScroll() {
        this.jumpBtn.hidden = this._nearBottom();
    }

    _autoGrow() {
        const t = this.inputEl;
        t.style.height = 'auto';
        const content = t.scrollHeight;
        if (!content || !t.offsetParent) { t.style.height = ''; return; }   // النافذة مخفية: الـ CSS (min-height) يحدد الارتفاع
        const border = t.offsetHeight - t.clientHeight;
        t.style.height = Math.max(44, Math.min(content + border, 132)) + 'px';
    }

    _updateCount() {
        const max = CONFIG.BOOKS_SETTINGS.MAX_QUESTION_CHARS;
        const len = this.inputEl.value.length;
        this.countEl.textContent = len > max * 0.8 ? `${len}/${max}` : '';
        this.countEl.classList.toggle('is-limit', len >= max);
    }

    _setBusy(busy) {
        this.busy = busy;
        this.sendBtn.hidden = busy;
        this.stopBtn.hidden = !busy;
        this.panel.classList.toggle('is-busy', busy);
        this._updateResetState();
    }

    _updateResetState() {
        this.resetBtn.disabled = this.messages.length === 0 && !this.busy;
    }

    // ------------------------------------------------------------------ الإرسال
    _historyForRequest() {
        const limit = CONFIG.BOOKS_SETTINGS.HISTORY_MESSAGES;
        return this.messages
            .filter((m) => (m.role === 'user' || m.role === 'assistant') && !m.pending)
            .slice(-limit)
            .map((m) => ({ role: m.role, text: m.text.slice(0, 1200) }));
    }

    /**
     * @param {string} [textArg] سؤال جاهز (اقتراح/إعادة محاولة). لو مفيش بنقرأ من مربع الكتابة
     * @param {{page?:boolean}} [opts]
     */
    async send(textArg, opts = {}) {
        if (this.busy) return;
        const fromInput = typeof textArg !== 'string';
        const text = (fromInput ? this.inputEl.value : textArg).trim();
        if (!text) return;
        if (text.length > CONFIG.BOOKS_SETTINGS.MAX_QUESTION_CHARS) return;
        this._stopReveal(true);

        const ctx = this.getPageContext() || {};
        const withPage = !!(opts.page || (this.pageChipOn && ctx.supported)) && !!ctx.supported && !!ctx.page;
        const page = withPage ? ctx.page : null;

        // نمسح مربع الكتابة فورًا (والسؤال محفوظ عندنا لو حصل خطأ/إيقاف)
        if (fromInput) {
            this.inputEl.value = '';
            this._autoGrow();
            this._updateCount();
            this._saveDraft();
        }

        const history = this._historyForRequest();
        const userMsg = { id: uid(), role: 'user', text, ts: Date.now() };
        const pending = { id: uid(), role: 'assistant', text: '', pending: true, status: 'جاري البحث في الكتاب...' };
        if (this.messages.length === 0) this.bodyEl.innerHTML = '';
        this.messages.push(userMsg, pending);
        const userEl = this._buildMessage(userMsg);
        const pendingEl = this._buildMessage(pending);
        this.bodyEl.appendChild(userEl);
        this.bodyEl.appendChild(pendingEl);
        this._scrollToBottom(false);
        this._setBusy(true);

        const ctl = new AbortController();
        this.abortCtl = ctl;
        const setStatus = (s) => {
            pending.status = s;
            const t = pendingEl.querySelector('.bc-pending-text');
            if (t) t.textContent = s;
        };

        let res = null;
        let error = null;
        try {
            for (let attempt = 0; ; attempt++) {
                try {
                    res = await this.api.askSources(text, { bookId: this.book.id, history, page, signal: ctl.signal });
                    break;
                } catch (err) {
                    if (err && (err.aborted || err.name === 'AbortError')) throw err;
                    if (errCode(err) === 'BUSY' && attempt < BUSY_RETRIES) {
                        setStatus('النظام مشغول لحظة... هنعيد المحاولة تلقائيًا');
                        await wait(BUSY_WAIT_MS, ctl.signal);
                        setStatus('جاري البحث في الكتاب...');
                        continue;
                    }
                    throw err;
                }
            }
        } catch (err) {
            error = err;
        }

        // إيقاف يدوي: نرجّع السؤال لمربع الكتابة ونشيل الرسايل
        if (error && (error.aborted || error.name === 'AbortError')) {
            this.messages = this.messages.filter((m) => m !== userMsg && m !== pending);
            userEl.remove(); pendingEl.remove();
            if (fromInput && !this.inputEl.value.trim()) {
                this.inputEl.value = text;
                this._autoGrow(); this._updateCount(); this._saveDraft();
            }
            if (this.messages.length === 0) this._renderAll();
            this._setBusy(false);
            this.abortCtl = null;
            if (this.isOpen) this.inputEl.focus({ preventScroll: true });
            return;
        }

        const idx = this.messages.indexOf(pending);
        if (error) {
            const code = errCode(error);
            const message = code === 'DAILY_LIMIT' || code === 'BUSY' || code === 'VALIDATION_ERROR'
                ? errMsg(error)
                : (errMsg(error) || 'تعذّر الحصول على إجابة. حاول مرة أخرى.');
            const errMessage = { id: uid(), role: 'error', text: message, question: code === 'DAILY_LIMIT' ? null : text, withPage: withPage, ts: Date.now() };
            if (idx >= 0) this.messages[idx] = errMessage;
            const el = this._buildMessage(errMessage);
            pendingEl.replaceWith(el);
        } else {
            const answer = String((res && res.answer) || '').trim() || 'لم أستطع إيجاد إجابة.';
            const aiMsg = {
                id: uid(), role: 'assistant', text: answer,
                sources: Array.isArray(res && res.sources) ? res.sources : [], ts: Date.now()
            };
            if (res && res.truncated) aiMsg.text += '\n\n_(الإجابة طويلة واتقطعت — اطلب "كمّل" لو محتاج باقي الشرح.)_';
            if (typeof (res && res.remaining) === 'number') { this.remaining = res.remaining; this._renderQuota(); }
            if (idx >= 0) this.messages[idx] = aiMsg;
            const el = this._buildMessage(aiMsg, { deferText: true });   // النص هيتملى تدريجيًا
            pendingEl.replaceWith(el);
            this._startReveal(aiMsg, el);
        }
        this._save();
        this._setBusy(false);
        this.abortCtl = null;
        this._scrollToBottom(false);
        if (this.isOpen && !isCoarsePointer()) this.inputEl.focus({ preventScroll: true });
    }

    stop() {
        if (this.abortCtl) this.abortCtl.abort();
    }

    _renderQuota() {
        this.quotaEl.textContent = this.remaining != null ? `متبقٍ ${this.remaining} سؤال اليوم` : '';
    }

    // ------------------------------------------------------------------ الظهور التدريجي للإجابة
    _startReveal(msg, el) {
        const bubble = el.querySelector('.bc-bubble');
        const tools = el.querySelector('.bc-tools');
        const full = msg.text;
        if (prefersReducedMotion() || full.length < 80) {
            bubble.innerHTML = renderMarkdown(full);
            if (tools) tools.hidden = false;
            return;
        }
        if (tools) tools.hidden = true;
        const duration = Math.min(2200, Math.max(500, full.length * 9));
        const start = performance.now();
        const state = { msg, el, bubble, tools, full, timer: null };
        this.reveal = state;
        const tick = () => {
            if (this.reveal !== state) return;
            const f = Math.min(1, (performance.now() - start) / duration);
            const n = Math.ceil(full.length * f);
            bubble.innerHTML = renderMarkdown(safePrefix(full, n));
            if (this._nearBottom() || f === 1) this.bodyEl.scrollTop = this.bodyEl.scrollHeight;
            if (f >= 1) { this._stopReveal(true); return; }
            state.timer = setTimeout(tick, 40);
        };
        tick();
    }

    _stopReveal(showFull) {
        const r = this.reveal;
        if (!r) return;
        this.reveal = null;
        if (r.timer) clearTimeout(r.timer);
        if (showFull && r.bubble) {
            const wasNear = this._nearBottom();
            r.bubble.innerHTML = renderMarkdown(r.full);
            if (r.tools) r.tools.hidden = false;
            // ظهور أزرار المصادر/النسخ بيزوّد الارتفاع: لو كنت تحت خالص نكمل نزول عشان مايتقصّوش
            if (wasNear && this.isOpen) this.bodyEl.scrollTop = this.bodyEl.scrollHeight;
        }
    }

    // ------------------------------------------------------------------ محادثة جديدة
    _onResetClick() {
        if (this.busy || this.messages.length === 0) return;
        if (this._resetArmed) {
            clearTimeout(this._resetArmed);
            this._resetArmed = null;
            this.resetBtn.classList.remove('is-armed');
            this.resetBtn.title = 'محادثة جديدة';
            this.reset();
            return;
        }
        // ضغطتين للتأكيد (أخف من نافذة confirm)
        this.resetBtn.classList.add('is-armed');
        this.resetBtn.title = 'اضغط مرة تانية لمسح المحادثة';
        this._resetArmed = setTimeout(() => {
            this._resetArmed = null;
            this.resetBtn.classList.remove('is-armed');
            this.resetBtn.title = 'محادثة جديدة';
        }, 3000);
    }

    reset() {
        this._stopReveal(false);
        this.messages = [];
        this._save();
        this._renderAll();
        if (this.isOpen) this.inputEl.focus({ preventScroll: true });
    }
}
