/**
 * whiteboard.js — v29: السبورة الافتراضية (صفحات بيضا/مربعات/سطور/سبورة خضرا)
 *
 * • بتفتح من الحصة أو من جوه الكتاب (زرار "صفحة بيضا" أو حرف W) في أي وقت.
 * • كل صفحة بتتحفظ تلقائيًا لكل طالب/مجموعة (lesson-tools)، وترجع زي ما هي الحصة الجاية.
 * • تقدر تصدّر الصفحة صورة وتبعتها للطالب.
 */
import { api } from './api.js?v=30';
import { ErrorHandler } from './utils.js?v=30';
import { icon } from './icons.js?v=30';
import { W, InkLayer, InkController, ToolDock, handleInkKey, BOARD_BGS, boardBgSvg, isDarkBg, renderItem, LaserPointer, confirmIn } from './annotate.js?v=30';

const RATIO = 0.625;   // 16:10
const H = W * RATIO;
const BOARD_TOOLS = ['pen', 'hl', 'temp', 'eraser', 'line', 'arrow', 'rect', 'ellipse', 'text', 'stamp', 'move', 'laser'];

let current = null;

function ownerKey(owner) {
    if (owner && owner.student_id) return 's:' + owner.student_id;
    if (owner && owner.group_id) return 'g:' + owner.group_id;
    return 't';
}
const lsKey = (owner) => 'tm_board_local:' + ownerKey(owner);

/**
 * @param {object} o
 * @param {{student_id?:string, group_id?:string}} [o.owner]
 * @param {string} [o.title] مثلًا: "سبورة يوسف"
 * @param {boolean} [o.blank] يفتح على صفحة فاضية (true) أو آخر صفحة (false)
 * @param {{src:string, w:number, h:number}} [o.image] صورة تتحط على السبورة (قص من الكتاب)
 * @param {() => void} [o.onClose]
 */
export function openWhiteboard(o = {}) {
    if (current && !current.closed) {
        if (o.image) current.addImage(o.image);
        else if (o.blank) current.blankPage();
        return current;
    }
    current = new Whiteboard(o);
    return current;
}
export function isWhiteboardOpen() { return !!(current && !current.closed); }

class Whiteboard {
    constructor({ owner = {}, title = 'السبورة', blank = true, image = null, onClose } = {}) {
        this.owner = owner;
        this.title = title;
        this.onClose = onClose || (() => {});
        this.pages = [];          // [{ page, bg, items, saved }]
        this.idx = 0;
        this.local = false;
        this.closed = false;
        this._build();
        this.ctrl = new InkController({ onSave: (layer) => this._save(layer), onToolChange: () => this._syncTool() });
        this.ctrl.setTool('pen');
        this.dock = new ToolDock(this.root.querySelector('.wb-dockwrap'), this.ctrl, {
            tools: BOARD_TOOLS,
            onClear: () => this.clearPage(),
            className: 'wb-dock'
        });
        this.laser = new LaserPointer(this.stage, this.root);
        this._bind();
        this._load(blank, image);
        try { window.tmTrack && window.tmTrack('whiteboard_opened', { owner: ownerKey(owner)[0] }); } catch (e) { /* تجاهل */ }
    }

    _build() {
        const root = document.createElement('div');
        root.className = 'wb';
        root.setAttribute('role', 'dialog');
        root.setAttribute('aria-modal', 'true');
        root.setAttribute('aria-label', this.title);
        root.innerHTML = `
            <header class="wb-head">
                <button type="button" class="bv-btn wb-close" data-act="close" title="رجوع (Esc)" aria-label="قفل السبورة">${icon('x', { size: 18 })}</button>
                <div class="wb-title"><h2>${icon('board', { size: 17 })} <span></span></h2><small class="wb-save" aria-live="polite"></small></div>
                <div class="wb-pager">
                    <button type="button" class="bv-btn" data-act="prev" title="الصفحة اللي فاتت" aria-label="الصفحة اللي فاتت">${icon('chevronRight', { size: 17 })}</button>
                    <span class="wb-pnum"></span>
                    <button type="button" class="bv-btn" data-act="next" title="الصفحة الجاية" aria-label="الصفحة الجاية">${icon('chevronLeft', { size: 17 })}</button>
                </div>
                <div class="wb-actions">
                    <button type="button" class="bv-btn wb-new" data-act="new" title="صفحة بيضا جديدة (N)">${icon('filePlus', { size: 17 })}<span>صفحة جديدة</span></button>
                    <div class="ink-pop-wrap"><button type="button" class="bv-btn" data-act="bgmenu" title="شكل الصفحة" aria-label="شكل الصفحة">${icon('image', { size: 17 })}<span class="wb-hide-sm">الخلفية</span></button>
                        <div class="ink-pop wb-bgpop" hidden>${BOARD_BGS.map((b) => `<button type="button" class="wb-bg" data-bg="${b.id}"><i class="wb-bg-sw wb-bg-${b.id}"></i>${b.name}</button>`).join('')}</div></div>
                    <button type="button" class="bv-btn" data-act="share" title="ابعت الصفحة كصورة" aria-label="ابعت الصفحة كصورة">${icon('share', { size: 17 })}<span class="wb-hide-sm">ابعتها صورة</span></button>
                    <button type="button" class="bv-btn" data-act="delete" title="احذف الصفحة دي" aria-label="احذف الصفحة دي">${icon('trash', { size: 17 })}</button>
                    <button type="button" class="bv-btn wb-hide-sm" data-act="fullscreen" title="ملء الشاشة (F)" aria-label="ملء الشاشة">${icon('maximize', { size: 17 })}</button>
                </div>
            </header>
            <div class="wb-stage"><div class="wb-page"><div class="wb-loading">جاري تحميل السبورة...</div></div></div>
            <div class="wb-dockwrap"></div>`;
        root.querySelector('.wb-title span').textContent = this.title;
        // v29.1: لو الكتاب مفتوح ملء الشاشة، السبورة لازم تتفتح جواه (وإلا مش هتظهر)
        (document.fullscreenElement || document.body).appendChild(root);
        this.root = root;
        this.stage = root.querySelector('.wb-stage');
        this.pageEl = root.querySelector('.wb-page');
        this.saveEl = root.querySelector('.wb-save');
        this._prevOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        this._fit();
    }

    _fit() {
        const r = this.stage.getBoundingClientRect();
        const pad = r.width < 600 ? 10 : 28;
        const w = Math.max(200, Math.min(r.width - pad * 2, (r.height - pad * 2) / RATIO));
        this.pageEl.style.width = `${Math.floor(w)}px`;
        this.pageEl.style.height = `${Math.floor(w * RATIO)}px`;
    }

    _bind() {
        this.root.addEventListener('click', (e) => {
            const b = e.target.closest('[data-act]');
            if (b) {
                const a = b.dataset.act;
                if (a === 'close') this.close();
                else if (a === 'prev') this.go(this.idx - 1);
                else if (a === 'next') this.go(this.idx + 1);
                else if (a === 'new') this.blankPage(true);
                else if (a === 'bgmenu') { const p = this.root.querySelector('.wb-bgpop'); p.hidden = !p.hidden; }
                else if (a === 'share') this.sharePage();
                else if (a === 'delete') this.deletePage();
                else if (a === 'fullscreen') this.toggleFullscreen();
                return;
            }
            const bg = e.target.closest('[data-bg]');
            if (bg) { this.setBg(bg.dataset.bg); this.root.querySelector('.wb-bgpop').hidden = true; }
        });
        this._onKey = (e) => {
            if (this.closed) return;
            const tag = (e.target && e.target.tagName) || '';
            if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target && e.target.isContentEditable)) return;
            if (document.querySelector('.ink-confirm')) return;   // رسالة تأكيد مفتوحة: هي اللي بترد على الكيبورد
            e.stopImmediatePropagation();
            if (e.key === 'Escape') { e.preventDefault(); if (this.ctrl.tool && this.ctrl.tool !== 'pen') this.ctrl.setTool('pen'); else this.close(); return; }
            if (handleInkKey(e, this.ctrl, { tools: BOARD_TOOLS, onClear: () => this.clearPage() })) return;
            if (e.ctrlKey || e.metaKey || e.altKey) return;
            if (e.code === 'KeyN' || e.code === 'KeyW') { e.preventDefault(); this.blankPage(true); return; }
            if (e.code === 'KeyF') { e.preventDefault(); this.toggleFullscreen(); return; }
            if (e.key === 'ArrowLeft' || e.key === 'PageDown') { e.preventDefault(); this.go(this.idx + 1); return; }
            if (e.key === 'ArrowRight' || e.key === 'PageUp') { e.preventDefault(); this.go(this.idx - 1); return; }
        };
        // بيشتغل قبل أي اختصار تاني في الصفحة (الكتاب/الحصة)
        window.addEventListener('keydown', this._onKey, true);
        this._onResize = () => { clearTimeout(this._rt); this._rt = setTimeout(() => this._fit(), 120); };
        window.addEventListener('resize', this._onResize);
        this._unload = (e) => { if (this.ctrl && this.ctrl.hasPending) { this.ctrl.flush(); e.preventDefault(); e.returnValue = ''; } };
        window.addEventListener('beforeunload', this._unload);
    }

    _syncTool() {
        if (this.laser) this.laser.setActive(this.ctrl.tool === 'laser');
        this.stage.dataset.tool = this.ctrl.tool || '';
    }

    async _load(blank, image) {
        let pages = [];
        try {
            const rows = await api.boardList('board', this.owner);
            pages = rows.map((r) => ({ page: Number(r.page), bg: (r.data && r.data.bg) || 'white', items: (r.data && r.data.items) || [], saved: true }));
        } catch (e) {
            const code = e && e.error && e.error.code;
            this.local = true;
            try { pages = JSON.parse(localStorage.getItem(lsKey(this.owner)) || '[]'); } catch (er) { pages = []; }
            this._status(code === 'NOT_READY' ? 'السبورة شغالة بس مش بتتحفظ على الخادم (lesson-tools لسه ماتفعّلش)' : 'مفيش نت: الرسم بيتحفظ على الجهاز ده بس', 'warn');
        }
        if (this.closed) return;
        this.pages = pages.sort((a, b) => a.page - b.page);
        if (!this.pages.length) this.pages.push({ page: 1, bg: 'white', items: [], saved: false });
        this.idx = this.pages.length - 1;
        if (blank && this.pages[this.idx].items.length) this.pages.push({ page: this.pages[this.idx].page + 1, bg: this.pages[this.idx].bg, items: [], saved: false });
        this.idx = this.pages.length - 1;
        this._show();
        if (image) this.addImage(image);
    }

    _show() {
        const pg = this.pages[this.idx];
        if (this.layer) { this.ctrl.detach(this.layer); this.layer.destroy(); this.layer = null; }
        this.pageEl.innerHTML = '';
        const bg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        bg.setAttribute('class', 'wb-bgsvg');
        bg.setAttribute('viewBox', `0 0 ${W} ${H}`);
        bg.setAttribute('preserveAspectRatio', 'none');
        bg.appendChild(boardBgSvg(pg.bg || 'white', H));
        this.pageEl.appendChild(bg);
        this.pageEl.classList.toggle('is-dark', isDarkBg(pg.bg));
        this.layer = new InkLayer(this.pageEl, { key: pg.page, ratio: RATIO, ctrl: this.ctrl, items: pg.items });
        this.ctrl.attach(this.layer);
        this.layer.sync();
        // على السبورة الغامقة: لو اللون أسود نخليه أبيض تلقائيًا (والعكس)
        if (isDarkBg(pg.bg) && this.ctrl.color === '#1F1F1F') this.ctrl.setColor('#FFFFFF');
        if (!isDarkBg(pg.bg) && this.ctrl.color === '#FFFFFF') this.ctrl.setColor('#1F1F1F');
        this.root.querySelector('.wb-pnum').textContent = `صفحة ${this.idx + 1} من ${this.pages.length}`;
        this.root.querySelector('[data-act="prev"]').disabled = this.idx === 0;
        this.root.querySelector('[data-act="next"]').disabled = this.idx >= this.pages.length - 1;
        this.root.querySelectorAll('[data-bg]').forEach((b) => b.classList.toggle('is-on', b.dataset.bg === (pg.bg || 'white')));
    }

    go(i) {
        if (i < 0 || i >= this.pages.length || i === this.idx) return;
        this._stash();
        this.idx = i;
        this._show();
    }
    _stash() { if (this.layer) this.pages[this.idx].items = this.layer.items; }

    /** صفحة بيضا جديدة (لو آخر صفحة فاضية بنروحلها بدل ما نعمل واحدة جديدة) */
    blankPage(explicit = false) {
        this._stash();
        const last = this.pages[this.pages.length - 1];
        if (!last.items.length) { this.idx = this.pages.length - 1; this._show(); if (explicit) this._toast('دي صفحة بيضا فاضية بالفعل'); return; }
        this.pages.push({ page: last.page + 1, bg: (this.pages[this.idx] || last).bg || 'white', items: [], saved: false });
        this.idx = this.pages.length - 1;
        this._show();
    }

    setBg(bg) {
        const pg = this.pages[this.idx];
        this._stash();
        pg.bg = bg;
        this._show();
        this.ctrl.changed(this.layer);
    }

    addImage({ src, w, h }) {
        if (!src) return;
        this._stash();
        const pg = this.pages[this.idx];
        if (pg.items.length) this.blankPage();
        const maxW = W * 0.86; const maxH = H * 0.86;
        const s = Math.min(maxW / (w || maxW), maxH / (h || maxH), 3);
        const w2 = Math.round((w || maxW) * s); const h2 = Math.round((h || maxH) * s);
        this.layer.add({ t: 'img', src, x: Math.round((W - w2) / 2), y: Math.round((H - h2) / 2), w2, h2 });
        this.ctrl.setTool('pen');
        this._toast('الجزء اتحط على السبورة: اشرح عليه براحتك');
    }

    async clearPage() {
        if (!this.layer || this.layer.empty) return;
        const ok = await confirmIn(this.root, { title: 'تمسح كل اللي على الصفحة دي؟', message: 'تقدر ترجّعه بزرار "رجوع" (Ctrl+Z).', okLabel: 'امسح' });
        if (ok) { this.layer.clear(); this._status('اتمسحت الصفحة. Ctrl+Z بيرجّعها', 'ok'); }
    }

    async deletePage() {
        const pg = this.pages[this.idx];
        if (this.pages.length === 1 && !pg.items.length) { this._toast('الصفحة فاضية ومفيش غيرها: مفيش حاجة تتحذف'); return; }
        const ok = await confirmIn(this.root, { title: `تحذف صفحة ${this.idx + 1}؟`, message: 'الصفحة هتتمسح نهائيًا.', okLabel: 'احذف الصفحة' });
        if (!ok) return;
        if (pg.saved && !this.local) {
            try { await api.boardDelete('board', this.owner, pg.page); } catch (e) { this._toast(ErrorHandler.getErrorMessage(e), 'warn'); return; }
        }
        this.pages.splice(this.idx, 1);
        if (!this.pages.length) this.pages.push({ page: pg.page + 1, bg: 'white', items: [], saved: false });
        this.idx = Math.min(this.idx, this.pages.length - 1);
        this._persistLocal();
        this._show();
    }

    async _save(layer) {
        const pg = this.pages.find((p) => p.page === layer.key);
        if (!pg) return;
        pg.items = layer.items;
        if (this.local) { this._persistLocal(); this._status('اتحفظ على الجهاز', 'ok'); return; }
        this._status('جاري الحفظ...', '');
        try {
            await api.boardSave('board', this.owner, pg.page, { bg: pg.bg || 'white', items: pg.items, ratio: RATIO });
            pg.saved = true;
            this._status('✓ اتحفظ', 'ok');
        } catch (e) {
            this._status('ماتحفظش: هنحاول تاني', 'warn');
            try { localStorage.setItem(lsKey(this.owner) + ':unsaved', JSON.stringify(this.pages)); } catch (er) { /* تجاهل */ }
            clearTimeout(this._retry);
            this._retry = setTimeout(() => { if (!this.closed) this.ctrl.changed(layer); }, 6000);
            const code = e && e.error && e.error.code;
            if (code === 'READ_ONLY') { this._status('اشتراكك منتهي: الرسم مش بيتحفظ', 'warn'); clearTimeout(this._retry); }
        }
    }
    _persistLocal() {
        if (!this.local) return;
        try { localStorage.setItem(lsKey(this.owner), JSON.stringify(this.pages.filter((p) => p.items.length))); } catch (e) { /* المساحة خلصت */ }
    }
    /** رسالة جوه السبورة (بتظهر كمان في ملء الشاشة) */
    _toast(text, kind = 'ok') {
        if (!this._toastEl) { this._toastEl = document.createElement('div'); this._toastEl.className = 'pt-status pt-toastmsg wb-toast'; this.root.appendChild(this._toastEl); }
        const t = this._toastEl;
        t.textContent = text; t.dataset.kind = kind; t.hidden = false;
        clearTimeout(this._tt); this._tt = setTimeout(() => { t.hidden = true; }, 3500);
    }
    _status(text, kind) {
        this.saveEl.textContent = text;
        this.saveEl.dataset.kind = kind || '';
        clearTimeout(this._st);
        if (kind === 'ok') this._st = setTimeout(() => { this.saveEl.textContent = ''; }, 2500);
    }

    /** الصفحة كصورة PNG (للإرسال للطالب) */
    async pageBlob() {
        this._stash();
        const pg = this.pages[this.idx];
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
        svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
        svg.setAttribute('width', String(W * 2));
        svg.setAttribute('height', String(H * 2));
        svg.appendChild(boardBgSvg(pg.bg || 'white', H));
        pg.items.forEach((it) => svg.appendChild(renderItem(it)));
        const xml = new XMLSerializer().serializeToString(svg);
        const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(xml);
        const img = new Image();
        await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });
        const c = document.createElement('canvas');
        c.width = W * 2; c.height = H * 2;
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        return await new Promise((res) => c.toBlob(res, 'image/png'));
    }

    async sharePage() {
        let blob;
        try { blob = await this.pageBlob(); } catch (e) { this._toast('مقدرناش نعمل صورة للصفحة دي.', 'warn'); return; }
        if (!blob) return;
        const name = `${this.title.replace(/\s+/g, '-')}-صفحة-${this.idx + 1}.png`;
        const file = new File([blob], name, { type: 'image/png' });
        try {
            if (navigator.canShare && navigator.canShare({ files: [file] })) {
                await navigator.share({ files: [file], title: this.title, text: 'شرح الحصة' });
                return;
            }
        } catch (e) { if (e && e.name === 'AbortError') return; }
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = name;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 30000);
        this._toast('اتنزّلت صورة الصفحة: ابعتها للطالب على واتساب');
    }

    toggleFullscreen() {
        try {
            if (document.fullscreenElement) document.exitFullscreen();
            else if (this.root.requestFullscreen) this.root.requestFullscreen();
        } catch (e) { /* تجاهل */ }
    }

    async close() {
        if (this.closed) return;
        this.closed = true;
        try { if (this._ta) this._ta.blur(); } catch (e) { /* تجاهل */ }
        const active = document.activeElement;
        if (active && active.classList && active.classList.contains('ink-text-input')) active.blur();
        this._stash();
        this.ctrl.flush();
        this._persistLocal();
        try { if (document.fullscreenElement === this.root) document.exitFullscreen(); } catch (e) { /* تجاهل */ }
        window.removeEventListener('keydown', this._onKey, true);
        window.removeEventListener('resize', this._onResize);
        window.removeEventListener('beforeunload', this._unload);
        clearTimeout(this._retry);
        if (this.laser) this.laser.destroy();
        if (this.dock) this.dock.destroy();
        this.root.remove();
        document.body.style.overflow = this._prevOverflow;
        if (current === this) current = null;
        this.onClose();
    }
}
