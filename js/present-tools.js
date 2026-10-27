/**
 * present-tools.js — v29: أدوات المدرس جوه الكتاب وقت الشرح
 *
 * • الكتابة على الصفحة: قلم، هايلايتر، ممحاة، أشكال، نص، علامات (بتتحفظ لكل طالب ولكل صفحة)
 * • العرض: زوم على جزء، عدسة مكبرة، ليزر، كشاف، مسطرة القراءة، ملء الشاشة، شاشة سودا
 * • "صفحة بيضا" (السبورة) في أي وقت، وقص جزء من الكتاب للسبورة
 * • أزرار الكيبورد لكل ده (بتشتغل والكيبورد عربي برضه)
 */
import { icon } from './icons.js?v=30';
import { W, InkLayer, InkController, ToolDock, handleInkKey, LaserPointer, confirmIn } from './annotate.js?v=30';
import { openWhiteboard, isWhiteboardOpen } from './whiteboard.js?v=30';

const DRAW_TYPES = ['pdf', 'docx', 'pptx', 'image'];
const BOOK_TOOLS = ['hand', 'pen', 'hl', 'temp', 'eraser', 'line', 'arrow', 'rect', 'ellipse', 'text', 'stamp', 'move', 'laser', 'magnifier', 'zoomarea', 'spotlight', 'ruler', 'snip'];
const VIEW_TOOLS = ['laser', 'magnifier', 'zoomarea', 'spotlight', 'ruler', 'snip'];
const DOCK_KEY = 'tm_pt_dock_v1';

const SHORTCUTS = [
    ['التنقل', [['← →  أو  PageUp / PageDown', 'الصفحة الجاية / اللي فاتت'], ['Space / Shift+Space', 'صفحة لقدام / لورا'], ['Home / End', 'أول / آخر صفحة'], ['G', 'روح لصفحة رقم...']]],
    ['التكبير', [['+ / -', 'تكبير / تصغير'], ['0', 'الحجم الأصلي'], ['Ctrl + عجلة الماوس', 'تكبير مكان الماوس'], ['Z', 'زوم على جزء (ارسم مستطيل)'], ['M', 'عدسة مكبرة'], ['Esc', 'رجوع من الزوم']]],
    ['الشرح', [['L', 'مؤشر ليزر'], ['S', 'كشاف (تغميق الباقي)'], ['R', 'مسطرة القراءة'], ['F', 'ملء الشاشة'], ['B', 'شاشة سودا'], ['W', 'صفحة بيضا (السبورة)'], ['X', 'قص جزء للسبورة']]],
    ['الكتابة', [['P', 'قلم'], ['H', 'هايلايتر'], ['Q', 'قلم مؤقت'], ['E', 'ممحاة'], ['A', 'سهم'], ['T', 'كتابة'], ['K', 'علامات ✓ ✗'], ['V', 'تحريك اللي اترسم'], ['1 - 7', 'الألوان'], ['[  ]', 'السُمك / حجم الكشاف'], ['Ctrl+Z / Ctrl+Y', 'رجوع / إعادة'], ['C', 'امسح رسم الصفحة']]]
];

export class PresentTools {
    /** @param {import('./book-viewer.js').BookViewer} viewer */
    constructor(viewer) {
        this.v = viewer;
        this.layers = new Map();       // page → InkLayer
        this.saved = new Map();        // page → items (من الخادم)
        this.zoomStack = [];
        this.local = false;
        this.ownerName = viewer.ownerName || '';
        this.ctrl = new InkController({ onSave: (l) => this._save(l), onToolChange: (t) => this._onTool(t) });
        this.laser = new LaserPointer(viewer.stage, viewer.root);
        this._buildUi();
        this._bind();
        this._loadInk();
    }

    get type() { return this.v.book.file_type; }
    get canDraw() { return this.v.mode !== 'text' && DRAW_TYPES.includes(this.type) && !!(this.v.adapter && this.v.adapter.pageEls); }

    // ------------------------------------------------------------------ الواجهة
    _buildUi() {
        const v = this.v;
        // زرار في الهيدر لإظهار/إخفاء الأدوات
        this.toggleBtn = document.createElement('button');
        this.toggleBtn.type = 'button';
        this.toggleBtn.className = 'bv-btn pt-toggle';
        this.toggleBtn.title = 'أدوات الشرح (قلم، ليزر، زوم...)';
        this.toggleBtn.innerHTML = `${icon('pen', { size: 16 })}<span>أدوات الشرح</span>`;
        const tools = v.root.querySelector('.bv-tools');
        tools.insertBefore(this.toggleBtn, tools.firstChild);

        this.wrap = document.createElement('div');
        this.wrap.className = 'pt-dockwrap';
        v.root.appendChild(this.wrap);
        this.dock = new ToolDock(this.wrap, this.ctrl, {
            tools: BOOK_TOOLS,
            onClear: () => this.clearPage(),
            className: 'pt-dock',
            extra: [
                { id: 'board', ic: 'board', label: 'صفحة بيضا (السبورة)', key: 'W', text: 'صفحة بيضا', wide: true, onClick: () => this.openBoard() },
                { id: 'present', ic: 'maximize', label: 'ملء الشاشة للعرض', key: 'F', onClick: () => this.togglePresent(), active: () => this.presenting },
                { id: 'black', ic: 'moon', label: 'شاشة سودا', key: 'B', onClick: () => this.toggleBlack() },
                { id: 'help', ic: 'keyboard', label: 'أزرار الكيبورد', key: '?', onClick: () => this.toggleHelp() },
                { id: 'hide', ic: 'chevronDown', label: 'إخفاء الأدوات', onClick: () => this.setDock(false) }
            ]
        });
        this.statusEl = document.createElement('div');
        this.statusEl.className = 'pt-status pt-toastmsg';
        this.statusEl.setAttribute('aria-live', 'polite');
        this.statusEl.hidden = true;
        v.root.appendChild(this.statusEl);

        // رجوع من الزوم
        this.backChip = document.createElement('button');
        this.backChip.type = 'button';
        this.backChip.className = 'pt-chip pt-back';
        this.backChip.hidden = true;
        this.backChip.innerHTML = `${icon('minimize', { size: 15 })} رجوع للحجم العادي <kbd>Esc</kbd>`;
        v.root.appendChild(this.backChip);

        // تنبيه: الكيبورد مش شغال لأن المدرس ضاغط على نافذة تانية (Meet)
        this.focusHint = document.createElement('button');
        this.focusHint.type = 'button';
        this.focusHint.className = 'pt-chip pt-focus';
        this.focusHint.hidden = true;
        this.focusHint.innerHTML = `${icon('keyboard', { size: 15 })} اضغط هنا عشان أزرار الكيبورد تشتغل على الكتاب`;
        v.root.appendChild(this.focusHint);

        // طبقات العرض (كشاف / مسطرة / شاشة سودا / اختيار مستطيل / عدسة)
        this.fx = document.createElement('div');
        this.fx.className = 'pt-fx';
        v.root.appendChild(this.fx);
        // على الموبايل الأدوات مقفولة في الأول (المساحة صغيرة) وبتتفتح من زرار "أدوات الشرح"
        let open = !window.matchMedia('(max-width: 640px)').matches;
        try { const v = localStorage.getItem(DOCK_KEY); if (v !== null) open = v !== '0'; } catch (e) { /* تجاهل */ }
        this.setDock(open);
    }

    setDock(open) {
        this.dockOpen = open;
        this.wrap.hidden = !open;
        this.toggleBtn.classList.toggle('is-active', open);
        this.v.root.classList.toggle('pt-open', open);
        try { localStorage.setItem(DOCK_KEY, open ? '1' : '0'); } catch (e) { /* تجاهل */ }
        if (!open) this.ctrl.setTool(null);
    }

    _bind() {
        const v = this.v;
        this.toggleBtn.addEventListener('click', () => this.setDock(!this.dockOpen));
        this.backChip.addEventListener('click', () => this.zoomBack());
        this.focusHint.addEventListener('click', () => { this.focusHint.hidden = true; v.stage.focus({ preventScroll: true }); });
        this._blur = () => { if (!v.closed && !isWhiteboardOpen()) this.focusHint.hidden = false; };
        this._focus = () => { this.focusHint.hidden = true; };
        window.addEventListener('blur', this._blur);
        window.addEventListener('focus', this._focus);
        // Ctrl + عجلة الماوس (أو قرص التاتش باد) = تكبير مكان الماوس
        this._wheelAcc = 0;
        this._wheel = (e) => {
            if (this.ctrl.tool === 'magnifier' && e.shiftKey) { e.preventDefault(); this._lensFactor(e.deltaY < 0 ? 0.25 : -0.25); return; }
            if ((this.ctrl.tool === 'spotlight' || this.ctrl.tool === 'ruler') && e.shiftKey) { e.preventDefault(); this._fxSize(e.deltaY < 0 ? 1 : -1); return; }
            if (!e.ctrlKey) return;
            e.preventDefault();
            this._wheelAcc += e.deltaY;
            if (Math.abs(this._wheelAcc) < 40) return;
            const dir = this._wheelAcc < 0 ? 1 : -1;
            this._wheelAcc = 0;
            const z = Math.max(0.5, Math.min(6, v.zoom * (dir > 0 ? 1.2 : 1 / 1.2)));
            this.zoomAround(z, e.clientX, e.clientY);
        };
        v.stage.addEventListener('wheel', this._wheel, { passive: false });
        this._fsChange = () => {
            this.presenting = document.fullscreenElement === v.root;
            v.root.classList.toggle('bv-present', this.presenting);
            this.dock.refresh();
            setTimeout(() => { if (v._onResize) v._onResize(); if (this.ctrl.tool) this._fxSetup(this.ctrl.tool); }, 120);
        };
        document.addEventListener('fullscreenchange', this._fsChange);
        this._stageMove = (e) => this._fxMove(e);
        v.stage.addEventListener('pointermove', this._stageMove);
        // على الموبايل: الكشاف والمسطرة والعدسة بيمشوا مع الصباع
        v.stage.addEventListener('pointerdown', this._stageMove);
        v.stage.addEventListener('touchmove', this._stageMove, { passive: true });
    }

    // ------------------------------------------------------------------ الرسم على الصفحات
    _ownerKey() {
        const o = this.v.owner || {};
        return o.student_id ? 's:' + o.student_id : o.group_id ? 'g:' + o.group_id : 't';
    }
    _lsKey() { return `tm_book_ink:${this.v.book.id}:${this._ownerKey()}`; }

    async _loadInk() {
        if (!DRAW_TYPES.includes(this.type)) return;
        try {
            const rows = await this.v.api.boardList('book', this.v.owner || {}, this.v.book.id);
            rows.forEach((r) => this.saved.set(Number(r.page), (r.data && r.data.items) || []));
        } catch (e) {
            const code = e && e.error && e.error.code;
            this.local = true;
            try { const loc = JSON.parse(localStorage.getItem(this._lsKey()) || '{}'); Object.entries(loc).forEach(([p, items]) => this.saved.set(Number(p), items)); } catch (er) { /* تجاهل */ }
            if (code === 'NOT_READY') this._status('الرسم شغال بس بيتحفظ على الجهاز ده بس (lesson-tools لسه ماتفعّلش)', 'warn', 6000);
        }
        if (this.v.closed) return;
        this.onRender();
    }

    /** بعد أي عرض للكتاب (أول مرة / إعادة المحاولة / الرجوع من النص المستخرج) */
    onRender() {
        this.layers.forEach((l) => { this.ctrl.detach(l); l.destroy(); });
        this.layers.clear();
        this.zoomStack = [];
        this.backChip.hidden = true;
        const drawOk = this.canDraw;
        this.wrap.classList.toggle('pt-nodraw', !drawOk);
        if (!drawOk) { if (this.ctrl.tool && !VIEW_TOOLS.includes(this.ctrl.tool)) this.ctrl.setTool(null); return; }
        // الصفحات اللي عليها رسم محفوظ بتظهر على طول
        for (const [p, items] of this.saved) if (items && items.length) this._layer(p);
        if (this.ctrl.tool && !VIEW_TOOLS.includes(this.ctrl.tool)) this._ensureAll();
    }
    onTextMode() {
        this.layers.forEach((l) => { this.ctrl.detach(l); l.destroy(); });
        this.layers.clear();
        this.wrap.classList.add('pt-nodraw');
        if (this.ctrl.tool && !['laser', 'spotlight', 'ruler'].includes(this.ctrl.tool)) this.ctrl.setTool(null);
    }

    _pageEls() { try { return (this.v.adapter && this.v.adapter.pageEls && this.v.adapter.pageEls()) || []; } catch (e) { return []; } }

    _layer(page) {
        if (this.layers.has(page)) return this.layers.get(page);
        const host = this._pageEls()[page - 1];
        if (!host) return null;
        if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
        const layer = new InkLayer(host, { key: page, ctrl: this.ctrl, items: this.saved.get(page) || [] });
        this.layers.set(page, layer);
        this.ctrl.attach(layer);
        return layer;
    }
    _ensureAll() { this._pageEls().forEach((el, i) => this._layer(i + 1)); }

    async _save(layer) {
        const page = layer.key;
        this.saved.set(page, layer.items.slice());
        if (this.local) { this._persistLocal(); return; }
        try {
            await this.v.api.boardSave('book', this.v.owner || {}, page, { items: layer.items, ratio: layer.ratio }, this.v.book.id);
            this._status('✓ اتحفظ الرسم', 'ok', 1500);
        } catch (e) {
            const code = e && e.error && e.error.code;
            this._persistLocal();
            if (code === 'READ_ONLY') { this._status('اشتراكك منتهي: الرسم مش بيتحفظ', 'warn', 5000); return; }
            this._status('الرسم ماتحفظش: هنحاول تاني', 'warn', 4000);
            clearTimeout(this._retry);
            this._retry = setTimeout(() => { if (!this.v.closed) this.ctrl.changed(layer); }, 8000);
        }
    }
    _persistLocal() {
        try {
            const o = {};
            for (const [p, items] of this.saved) if (items && items.length) o[p] = items;
            localStorage.setItem(this._lsKey(), JSON.stringify(o));
        } catch (e) { /* تجاهل */ }
    }
    /** رسالة جوه نافذة الكتاب (بتظهر كمان في ملء الشاشة) */
    _msg(text, kind = 'warn') { this._status(text, kind, 3500); }
    _status(text, kind, ms = 2500) {
        this.statusEl.textContent = text;
        this.statusEl.dataset.kind = kind || '';
        this.statusEl.hidden = !text;
        clearTimeout(this._st);
        this._st = setTimeout(() => { this.statusEl.hidden = true; }, ms);
    }

    async clearPage() {
        const layer = this.layers.get(this.v.page);
        if (!layer || layer.empty) { this._msg(`مفيش رسم على صفحة ${this.v.page}`); return; }
        const ok = await confirmIn(this.v.root, { title: `تمسح الرسم من صفحة ${this.v.page}؟`, message: 'تقدر ترجّعه بزرار رجوع (Ctrl+Z).', okLabel: 'امسح' });
        if (ok) { layer.clear(); this._msg('اتمسح الرسم. Ctrl+Z بيرجّعه', 'ok'); }
    }

    // ------------------------------------------------------------------ الأدوات
    _onTool(tool) {
        const v = this.v;
        if (tool && !VIEW_TOOLS.includes(tool) && tool !== 'hand') {
            if (!this.canDraw) {
                this._msg(this.v.mode === 'text' ? 'الكتابة على الكتاب بتشتغل على الملف الأصلي مش النص المستخرج.' : 'الكتابة على الصفحة مش متاحة لملفات النص. استخدم "صفحة بيضا".');
                this.ctrl.tool = null; this.dock.refresh(); return;
            }
            if (!this.dockOpen) this.setDock(true);
            this._ensureAll();
        }
        if (tool === 'magnifier' && !['pdf', 'image'].includes(this.type)) {
            this._msg('العدسة شغالة مع كتب الـ PDF والصور. استخدم "زوم على جزء" (Z) بدلها.');
            this.ctrl.tool = 'zoomarea';
            tool = 'zoomarea';
            this.dock.refresh();
        }
        if (tool === 'snip' && !['pdf', 'image'].includes(this.type)) {
            this._msg('القص للسبورة شغال مع كتب الـ PDF والصور.');
            this.ctrl.tool = null; tool = null; this.dock.refresh();
        }
        this.laser.setActive(tool === 'laser');
        v.root.dataset.ptool = tool || '';
        this._fxSetup(tool);
    }

    _fxSetup(tool) {
        this.fx.innerHTML = '';
        this.fx.className = 'pt-fx';
        this.fx.style.background = '';
        this._stageBox();   // لازم مقاس الطبقة يتحدد قبل ما نرسم الدايرة/الشريط (قبل كده كانت بتظهر في مكان غلط أول مرة)
        this._lens = null;
        if (tool === 'spotlight') {
            this.fx.classList.add('pt-spot');
            this._fxR = this._fxR || 150;
            this._placeFx();
        } else if (tool === 'ruler') {
            this.fx.classList.add('pt-ruler');
            this.fx.innerHTML = '<div class="pt-band"></div>';
            this._bandH = this._bandH || 70;
            this._placeFx();
        } else if (tool === 'magnifier') {
            this.fx.classList.add('pt-lensfx');
            this.fx.innerHTML = '<div class="pt-lens" hidden><canvas></canvas><small></small></div>';
            this._lens = this.fx.querySelector('.pt-lens');
            this._lensF = this._lensF || 2.2;
            this._lensSize = 240;
        } else if (tool === 'zoomarea' || tool === 'snip') {
            this.fx.classList.add('pt-select');
            this.fx.innerHTML = `<div class="pt-sel-hint">${tool === 'snip' ? 'ارسم مستطيل حوالين الجزء اللي عايزه على السبورة' : 'ارسم مستطيل حوالين الجزء اللي عايز تكبّره (أو اضغط على مكان للتكبير ×2)'}</div><div class="pt-selrect" hidden></div>`;
            this._bindSelect(tool);
        }
        this._stageBox();
    }
    _stageBox() {
        const r = this.v.stage.getBoundingClientRect();
        Object.assign(this.fx.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
    }
    _placeFx() {
        const p = this._fxPt || (() => { const r = this.v.stage.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })();
        const r = this.fx.getBoundingClientRect();
        const x = p.x - r.left; const y = p.y - r.top;
        if (this.fx.classList.contains('pt-spot')) {
            const R = this._fxR;
            this.fx.style.background = `radial-gradient(circle ${R + 14}px at ${x}px ${y}px, rgba(0,0,0,0) 0, rgba(0,0,0,0) ${R - 6}px, rgba(10, 8, 14, 0.8) ${R + 14}px)`;
        } else if (this.fx.classList.contains('pt-ruler')) {
            const band = this.fx.querySelector('.pt-band');
            band.style.height = `${this._bandH}px`;
            band.style.top = `${Math.max(0, Math.min(r.height - this._bandH, y - this._bandH / 2))}px`;
        }
    }
    _fxSize(dir) {
        if (this.ctrl.tool === 'spotlight') { this._fxR = Math.max(60, Math.min(500, (this._fxR || 150) + dir * 20)); this._placeFx(); }
        if (this.ctrl.tool === 'ruler') { this._bandH = Math.max(28, Math.min(260, (this._bandH || 70) + dir * 10)); this._placeFx(); }
        if (this.ctrl.tool === 'magnifier') this._lensFactor(dir * 0.25);
    }
    _fxMove(e) {
        const t = this.ctrl.tool;
        const p = e.touches ? e.touches[0] : e;
        if (!p) return;
        if (t === 'spotlight' || t === 'ruler') {
            this._stageBox();   // مكان الكتاب بيتغيّر (ملء الشاشة / الشات / تدوير الموبايل)
            this._fxPt = { x: p.clientX, y: p.clientY };
            this._placeFx();
        } else if (t === 'magnifier') this._lensDraw(p.clientX, p.clientY);
    }

    // ------------------------------------------------------------------ العدسة المكبرة
    _lensFactor(d) {
        this._lensF = Math.max(1.5, Math.min(5, (this._lensF || 2.2) + d));
        if (this._lensPt) this._lensDraw(this._lensPt.x, this._lensPt.y);
    }
    _pageAt(x, y) {
        const els = this._pageEls();
        for (let i = 0; i < els.length; i++) {
            const r = els[i].getBoundingClientRect();
            if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return { el: els[i], page: i + 1, r };
        }
        return null;
    }
    _sourceOf(el) {
        if (!el) return null;
        return el.querySelector('canvas:not(.ink-laser)') || el.querySelector('img.bv-img');
    }
    _lensDraw(x, y) {
        const lens = this._lens;
        if (!lens) return;
        this._lensPt = { x, y };
        const hit = this._pageAt(x, y);
        const src = hit && this._sourceOf(hit.el);
        if (!src) { lens.hidden = true; return; }
        lens.hidden = false;
        const size = this._lensSize;
        const fr = this.fx.getBoundingClientRect();
        lens.style.left = `${x - fr.left - size / 2}px`;
        lens.style.top = `${y - fr.top - size / 2}px`;
        const cv = lens.querySelector('canvas');
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        if (cv.width !== size * dpr) { cv.width = size * dpr; cv.height = size * dpr; }
        const ctx = cv.getContext('2d');
        const sw = src.naturalWidth || src.width; const sh = src.naturalHeight || src.height;
        const kx = sw / hit.r.width; const ky = sh / hit.r.height;
        const viewW = size / this._lensF; const viewH = size / this._lensF;
        const sx = (x - hit.r.left - viewW / 2) * kx; const sy = (y - hit.r.top - viewH / 2) * ky;
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, cv.width, cv.height);
        try { ctx.drawImage(src, sx, sy, viewW * kx, viewH * ky, 0, 0, cv.width, cv.height); } catch (e) { /* الصفحة لسه بتترسم */ }
        // الرسم اللي على الصفحة يظهر جوه العدسة كمان
        const layer = this.layers.get(hit.page);
        if (layer && !layer.empty) {
            const key = layer.items.length + ':' + hit.page;
            if (this._inkKey !== key) { this._inkKey = key; this._inkImg = null; this._rasterInk(layer).then((img) => { this._inkImg = img; }); }
            if (this._inkImg) {
                const ik = this._inkImg.width / hit.r.width;
                try { ctx.drawImage(this._inkImg, (x - hit.r.left - viewW / 2) * ik, (y - hit.r.top - viewH / 2) * ik, viewW * ik, viewH * ik, 0, 0, cv.width, cv.height); } catch (e) { /* تجاهل */ }
            }
        }
        lens.querySelector('small').textContent = `×${this._lensF.toFixed(1).replace('.0', '')}`;
    }
    async _rasterInk(layer, width = 1400) {
        const svg = layer.svg.cloneNode(true);
        svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
        svg.setAttribute('width', String(width));
        svg.setAttribute('height', String(Math.round(width * layer.ratio)));
        svg.removeAttribute('class');
        const img = new Image();
        img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(svg));
        await img.decode().catch(() => {});
        return img;
    }

    // ------------------------------------------------------------------ زوم على جزء / قص للسبورة
    _bindSelect(tool) {
        const fx = this.fx;
        const rectEl = fx.querySelector('.pt-selrect');
        let start = null;
        fx.onpointerdown = (e) => {
            e.preventDefault();
            start = { x: e.clientX, y: e.clientY, id: e.pointerId };
            try { fx.setPointerCapture(e.pointerId); } catch (er) { /* تجاهل */ }
            rectEl.hidden = false;
            draw(e);
        };
        const draw = (e) => {
            if (!start) return;
            const fr = fx.getBoundingClientRect();
            const x1 = Math.min(start.x, e.clientX) - fr.left; const y1 = Math.min(start.y, e.clientY) - fr.top;
            Object.assign(rectEl.style, { left: `${x1}px`, top: `${y1}px`, width: `${Math.abs(e.clientX - start.x)}px`, height: `${Math.abs(e.clientY - start.y)}px` });
        };
        fx.onpointermove = (e) => { if (start && e.pointerId === start.id) draw(e); };
        fx.onpointerup = (e) => {
            if (!start || e.pointerId !== start.id) return;
            const s = start; start = null;
            rectEl.hidden = true;
            const box = { left: Math.min(s.x, e.clientX), top: Math.min(s.y, e.clientY), width: Math.abs(e.clientX - s.x), height: Math.abs(e.clientY - s.y) };
            if (tool === 'snip') {
                if (box.width < 20 || box.height < 20) return;
                this.snip(box);
            } else {
                this.zoomToBox(box);
            }
        };
        fx.onpointercancel = () => { start = null; rectEl.hidden = true; };
    }

    /** يكبّر المستطيل ده لحد ما يملا الشاشة */
    zoomToBox(box) {
        const v = this.v;
        const sr = v.stage.getBoundingClientRect();
        const cx = box.left + box.width / 2; const cy = box.top + box.height / 2;
        let f;
        if (box.width < 24 || box.height < 24) f = 2;          // ضغطة: تكبير ×2 مكانها
        else f = Math.min(sr.width / box.width, sr.height / box.height) * 0.92;
        const z = Math.max(v.zoom, Math.min(6, v.zoom * f));
        if (z <= v.zoom * 1.05) { this._msg('الجزء ده كبير بالفعل. ارسم مستطيل أصغر.'); return; }
        this.zoomAround(z, cx, cy, { center: true, push: true });
        this.ctrl.setTool(null);
    }

    /**
     * تكبير مع الحفاظ على النقطة (x,y) تحت الماوس (أو في نص الشاشة لو center)
     */
    zoomAround(z, x, y, { center = false, push = false } = {}) {
        const v = this.v;
        const sr = v.stage.getBoundingClientRect();
        const hit = this._pageAt(x, y);
        if (push) {
            this.zoomStack.push({ zoom: v.zoom, top: v.stage.scrollTop, left: v.stage.scrollLeft, page: v.page });
            this.backChip.hidden = false;
        }
        const ref = hit ? { el: hit.el, fx: (x - hit.r.left) / hit.r.width, fy: (y - hit.r.top) / hit.r.height } : null;
        const contentRef = !ref ? { fx: (x - sr.left + v.stage.scrollLeft) / Math.max(1, v.stage.scrollWidth), fy: (y - sr.top + v.stage.scrollTop) / Math.max(1, v.stage.scrollHeight) } : null;
        v.setZoom(z);
        const tx = center ? sr.left + sr.width / 2 : x;
        const ty = center ? sr.top + sr.height / 2 : y;
        const apply = () => {
            if (ref && ref.el.isConnected) {
                const r = ref.el.getBoundingClientRect();
                v.stage.scrollBy({ left: r.left + ref.fx * r.width - tx, top: r.top + ref.fy * r.height - ty, behavior: 'auto' });
            } else if (contentRef) {
                v.stage.scrollTop = contentRef.fy * v.stage.scrollHeight - (ty - sr.top);
            }
        };
        // العارض بيعيد ترتيب الصفحات بعد الزوم في الفريم الجاي
        requestAnimationFrame(() => requestAnimationFrame(() => { apply(); setTimeout(apply, 90); }));
    }

    zoomBack() {
        const prev = this.zoomStack.pop();
        if (!prev) { this.backChip.hidden = true; return false; }
        const v = this.v;
        v.setZoom(prev.zoom);
        const apply = () => { v.stage.scrollTop = prev.top; v.stage.scrollLeft = prev.left; };
        requestAnimationFrame(() => requestAnimationFrame(() => { apply(); setTimeout(apply, 90); }));
        this.backChip.hidden = !this.zoomStack.length;
        return true;
    }

    /** قص جزء من الصفحة (بالرسم اللي عليها) وحطه على السبورة */
    async snip(box) {
        const cx = box.left + box.width / 2; const cy = box.top + box.height / 2;
        const hit = this._pageAt(cx, cy);
        const src = hit && this._sourceOf(hit.el);
        if (!src) { this._msg('اختار جزء جوه صفحة من الكتاب.'); return; }
        const r = hit.r;
        const x1 = Math.max(box.left, r.left); const y1 = Math.max(box.top, r.top);
        const x2 = Math.min(box.left + box.width, r.right); const y2 = Math.min(box.top + box.height, r.bottom);
        if (x2 - x1 < 10 || y2 - y1 < 10) return;
        const sw = src.naturalWidth || src.width; const sh = src.naturalHeight || src.height;
        const kx = sw / r.width; const ky = sh / r.height;
        const outW = Math.min(1400, Math.round((x2 - x1) * kx));
        const outH = Math.round(outW * ((y2 - y1) / (x2 - x1)));
        const c = document.createElement('canvas');
        c.width = outW; c.height = outH;
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, outW, outH);
        try { ctx.drawImage(src, (x1 - r.left) * kx, (y1 - r.top) * ky, (x2 - x1) * kx, (y2 - y1) * ky, 0, 0, outW, outH); }
        catch (e) { this._msg('الصفحة لسه بتتحمّل. استنى ثانية وجرّب تاني.'); return; }
        const layer = this.layers.get(hit.page);
        if (layer && !layer.empty) {
            const img = await this._rasterInk(layer, 2000);
            const ik = img.width / r.width;
            try { ctx.drawImage(img, (x1 - r.left) * ik, (y1 - r.top) * ik, (x2 - x1) * ik, (y2 - y1) * ik, 0, 0, outW, outH); } catch (e) { /* تجاهل */ }
        }
        const src64 = c.toDataURL('image/jpeg', 0.86);
        this.ctrl.setTool(null);
        this.openBoard({ image: { src: src64, w: outW, h: outH } });
    }

    // ------------------------------------------------------------------ السبورة / ملء الشاشة / شاشة سودا / المساعدة
    openBoard({ image = null } = {}) {
        const v = this.v;
        const title = this.ownerName ? `سبورة ${this.ownerName}` : 'السبورة';
        openWhiteboard({ owner: v.owner || {}, title, blank: !image, image, onClose: () => { if (!v.closed) v.stage.focus({ preventScroll: true }); } });
    }
    togglePresent() {
        const root = this.v.root;
        try {
            if (document.fullscreenElement) document.exitFullscreen();
            else if (root.requestFullscreen) root.requestFullscreen();
            else { this.presenting = !this.presenting; root.classList.toggle('bv-present', this.presenting); this.dock.refresh(); }
        } catch (e) { /* تجاهل */ }
    }
    toggleBlack() {
        if (this._black) { this._black.remove(); this._black = null; return; }
        const b = document.createElement('div');
        b.className = 'pt-black';
        b.innerHTML = '<span>اضغط أي زرار للرجوع للكتاب</span>';
        b.addEventListener('click', () => this.toggleBlack());
        this.v.root.appendChild(b);
        this._black = b;
    }
    toggleHelp() {
        if (this._help) { this._help.remove(); this._help = null; return; }
        const h = document.createElement('div');
        h.className = 'pt-help';
        h.innerHTML = `<div class="pt-help-box" role="dialog" aria-label="أزرار الكيبورد">
            <div class="pt-help-head"><h3>${icon('keyboard', { size: 18 })} أزرار الكيبورد وقت الشرح</h3><button type="button" class="bv-btn" data-x aria-label="إغلاق">${icon('x', { size: 16 })}</button></div>
            <div class="pt-help-grid">${SHORTCUTS.map(([g, rows]) => `<section><h4>${g}</h4>${rows.map(([k, d]) => `<div><kbd>${k}</kbd><span>${d}</span></div>`).join('')}</section>`).join('')}</div>
            <p class="pt-help-note">الأزرار بتشتغل لما نافذة الكتاب تكون هي اللي قدامك. لو ضغطت على Meet ارجع اضغط على الكتاب. الريموت بتاع العرض (Presenter) بيقلّب الصفحات كمان.</p>
        </div>`;
        h.addEventListener('click', (e) => { if (e.target === h || e.target.closest('[data-x]')) this.toggleHelp(); });
        this.v.root.appendChild(h);
        this._help = h;
    }

    // ------------------------------------------------------------------ الكيبورد
    /** بيرجّع true لو الزرار اتعامل معاه هنا */
    onKey(e) {
        const v = this.v;
        const tag = (e.target && e.target.tagName) || '';
        if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target && e.target.isContentEditable)) return false;
        if (this._black) { e.preventDefault(); this.toggleBlack(); return true; }
        if (e.key === 'Escape') {
            if (this._help) { this.toggleHelp(); return true; }
            if (this.ctrl.tool) { this.ctrl.setTool(null); e.preventDefault(); return true; }
            if (this.zoomBack()) { e.preventDefault(); return true; }
            return false;
        }
        if (v.chat && v.chat.isOpen && v.root.querySelector('.bc-panel') && v.root.querySelector('.bc-panel').contains(e.target)) return false;
        // المسطرة: أسهم فوق/تحت بتحرّك الشريط سطر سطر
        if (this.ctrl.tool === 'ruler' && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
            e.preventDefault();
            const r = this.fx.getBoundingClientRect();
            const cur = this._fxPt || { x: r.left + r.width / 2, y: r.top + r.height / 2 };
            this._fxPt = { x: cur.x, y: Math.max(r.top, Math.min(r.bottom, cur.y + (e.key === 'ArrowDown' ? 1 : -1) * this._bandH * 0.8)) };
            this._placeFx();
            return true;
        }
        if ((e.code === 'BracketLeft' || e.code === 'BracketRight') && ['spotlight', 'ruler', 'magnifier'].includes(this.ctrl.tool)) {
            e.preventDefault(); this._fxSize(e.code === 'BracketRight' ? 1 : -1); return true;
        }
        if (this.ctrl.tool === 'magnifier' && (e.key === '+' || e.key === '=' || e.key === '-')) { e.preventDefault(); this._lensFactor(e.key === '-' ? -0.25 : 0.25); return true; }
        if (!e.ctrlKey && !e.metaKey && !e.altKey) {
            if (e.code === 'KeyF') { e.preventDefault(); this.togglePresent(); return true; }
            if (e.code === 'KeyB') { e.preventDefault(); this.toggleBlack(); return true; }
            if (e.code === 'KeyW') { e.preventDefault(); this.openBoard(); return true; }
            if (e.key === '?' || (e.code === 'Slash' && e.shiftKey)) { e.preventDefault(); this.toggleHelp(); return true; }
        }
        const drawTools = this.canDraw ? BOOK_TOOLS : VIEW_TOOLS.concat(['hand']);
        return handleInkKey(e, this.ctrl, { tools: drawTools, onClear: this.canDraw ? () => this.clearPage() : null });
    }

    onResize() { if (this.ctrl.tool) this._fxSetup(this.ctrl.tool); }

    async destroy() {
        clearTimeout(this._retry);
        try { await this.ctrl.flush(); } catch (e) { /* تجاهل */ }
        window.removeEventListener('blur', this._blur);
        window.removeEventListener('focus', this._focus);
        document.removeEventListener('fullscreenchange', this._fsChange);
        try { if (document.fullscreenElement === this.v.root) document.exitFullscreen(); } catch (e) { /* تجاهل */ }
        this.laser.destroy();
        this.dock.destroy();
    }
}
