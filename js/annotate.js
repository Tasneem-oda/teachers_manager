/**
 * annotate.js — v29: محرك الرسم (السبورة + الكتابة على صفحات الكتاب)
 *
 * • InkLayer: طبقة SVG فوق صفحة (صفحة كتاب أو صفحة سبورة). الإحداثيات نسبية (العرض = 1000)
 *   عشان الرسم يفضل في مكانه مهما الزوم اتغيّر.
 * • InkController: الأداة الحالية + اللون + السُمك + رجوع/إعادة لكل الطبقات + الحفظ التلقائي.
 * • ToolDock: شريط الأدوات (قلم، هايلايتر، ممحاة، أشكال، نص، علامات، قلم مؤقت، ألوان، سُمك، رجوع/إعادة، مسح).
 */
import { icon } from './icons.js?v=29';

const NS = 'http://www.w3.org/2000/svg';
export const W = 1000;

export const COLORS = [
    { c: '#E53935', name: 'أحمر' }, { c: '#1E63D6', name: 'أزرق' }, { c: '#2E9E44', name: 'أخضر' },
    { c: '#1F1F1F', name: 'أسود' }, { c: '#F2A900', name: 'أصفر' }, { c: '#7B3FA0', name: 'بنفسجي' }, { c: '#FFFFFF', name: 'أبيض' }
];
export const SIZES = [{ v: 3, name: 'رفيع' }, { v: 6, name: 'متوسط' }, { v: 12, name: 'عريض' }];
const TEXT_SIZE = { 3: 24, 6: 34, 12: 52 };
export const STAMPS = ['✓', '✗', '★', '؟', '👍', '❤'];

const isArabic = (t) => /[؀-ۿ]/.test(String(t || ''));
let idSeq = 0;
const newId = () => `${Date.now().toString(36)}${(idSeq++).toString(36)}${Math.random().toString(36).slice(2, 5)}`;
const round = (n) => Math.round(n * 10) / 10;

// ------------------------------------------------------------------ رسم العناصر
function smoothPath(pts) {
    if (!pts.length) return '';
    if (pts.length === 1) { const [x, y] = pts[0]; return `M${x} ${y}L${x + 0.1} ${y + 0.1}`; }
    let d = `M${pts[0][0]} ${pts[0][1]}`;
    for (let i = 1; i < pts.length - 1; i++) {
        const [x0, y0] = pts[i]; const [x1, y1] = pts[i + 1];
        d += `Q${x0} ${y0} ${round((x0 + x1) / 2)} ${round((y0 + y1) / 2)}`;
    }
    const last = pts[pts.length - 1];
    return d + `L${last[0]} ${last[1]}`;
}
function el(tag, attrs) {
    const e = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs || {})) if (v !== undefined && v !== null) e.setAttribute(k, String(v));
    return e;
}
/** عنصر SVG لعنصر رسم واحد */
export function renderItem(it) {
    const g = el('g', { 'data-id': it.id });
    const stroke = it.c || '#E53935';
    const w = Number(it.w) || 6;
    if (it.t === 'pen' || it.t === 'temp') {
        g.appendChild(el('path', { d: smoothPath(it.p || []), fill: 'none', stroke, 'stroke-width': w, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
    } else if (it.t === 'hl') {
        g.appendChild(el('path', { d: smoothPath(it.p || []), fill: 'none', stroke, 'stroke-width': w * 3.2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'stroke-opacity': 0.38, class: 'ink-hl' }));
    } else if (it.t === 'line' || it.t === 'arrow') {
        const [[x1, y1], [x2, y2]] = it.p;
        g.appendChild(el('line', { x1, y1, x2, y2, stroke, 'stroke-width': w, 'stroke-linecap': 'round' }));
        if (it.t === 'arrow') {
            const ang = Math.atan2(y2 - y1, x2 - x1);
            const L = Math.max(14, w * 3.4);
            const a1 = ang + Math.PI * 0.82; const a2 = ang - Math.PI * 0.82;
            g.appendChild(el('path', { d: `M${round(x2 + L * Math.cos(a1))} ${round(y2 + L * Math.sin(a1))}L${x2} ${y2}L${round(x2 + L * Math.cos(a2))} ${round(y2 + L * Math.sin(a2))}`,
                fill: 'none', stroke, 'stroke-width': w, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
        }
    } else if (it.t === 'rect') {
        const [[x1, y1], [x2, y2]] = it.p;
        g.appendChild(el('rect', { x: Math.min(x1, x2), y: Math.min(y1, y2), width: Math.abs(x2 - x1), height: Math.abs(y2 - y1), rx: 4, fill: it.fill ? stroke : 'none', 'fill-opacity': it.fill ? 0.18 : null, stroke, 'stroke-width': w, 'stroke-linejoin': 'round' }));
    } else if (it.t === 'ellipse') {
        const [[x1, y1], [x2, y2]] = it.p;
        g.appendChild(el('ellipse', { cx: (x1 + x2) / 2, cy: (y1 + y2) / 2, rx: Math.abs(x2 - x1) / 2, ry: Math.abs(y2 - y1) / 2, fill: 'none', stroke, 'stroke-width': w }));
    } else if (it.t === 'text') {
        const fs = Number(it.fs) || 34;
        const rtl = it.dir === 'rtl';
        const t = el('text', { x: it.x, y: it.y, fill: stroke, 'font-size': fs, 'font-weight': 700, direction: rtl ? 'rtl' : 'ltr', 'text-anchor': 'start', 'dominant-baseline': 'hanging',
            'font-family': "'IBM Plex Sans Arabic', 'Segoe UI', Tahoma, Arial, sans-serif", 'paint-order': 'stroke', stroke: stroke === '#FFFFFF' ? '#1F1F1F' : '#FFFFFF', 'stroke-width': fs * 0.08, 'stroke-linejoin': 'round' });
        String(it.text || '').split('\n').forEach((line, i) => {
            const ts = el('tspan', { x: it.x, dy: i === 0 ? 0 : fs * 1.25 });
            ts.textContent = line || ' ';
            t.appendChild(ts);
        });
        g.appendChild(t);
    } else if (it.t === 'stamp') {
        const fs = Number(it.fs) || 60;
        const t = el('text', { x: it.x, y: it.y, fill: stroke, 'font-size': fs, 'font-weight': 800, 'text-anchor': 'middle', 'dominant-baseline': 'central', 'font-family': "'Segoe UI Symbol', 'Noto Color Emoji', 'Apple Color Emoji', sans-serif" });
        t.textContent = it.s || '✓';
        g.appendChild(t);
    } else if (it.t === 'img') {
        g.appendChild(el('image', { href: it.src, x: it.x, y: it.y, width: it.w2, height: it.h2, preserveAspectRatio: 'xMidYMid meet' }));
        g.appendChild(el('rect', { x: it.x, y: it.y, width: it.w2, height: it.h2, fill: 'none', stroke: '#00000022', 'stroke-width': 1 }));
    }
    return g;
}

// ------------------------------------------------------------------ تحديد مكان العنصر (للممحاة والتحريك)
function segDist(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1; const dy = y2 - y1;
    const L = dx * dx + dy * dy;
    let t = L ? ((px - x1) * dx + (py - y1) * dy) / L : 0;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}
export function itemBox(it) {
    if (it.t === 'text') {
        const fs = Number(it.fs) || 34;
        const lines = String(it.text || '').split('\n');
        const wd = Math.max(...lines.map((l) => l.length)) * fs * 0.55;
        const h = lines.length * fs * 1.25;
        return it.dir === 'rtl' ? { x: it.x - wd, y: it.y, w: wd, h } : { x: it.x, y: it.y, w: wd, h };
    }
    if (it.t === 'stamp') { const fs = Number(it.fs) || 60; return { x: it.x - fs / 2, y: it.y - fs / 2, w: fs, h: fs }; }
    if (it.t === 'img') return { x: it.x, y: it.y, w: it.w2, h: it.h2 };
    const xs = (it.p || []).map((p) => p[0]); const ys = (it.p || []).map((p) => p[1]);
    if (!xs.length) return { x: 0, y: 0, w: 0, h: 0 };
    const x = Math.min(...xs); const y = Math.min(...ys);
    return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}
export function hitItem(it, x, y, r) {
    const w = (Number(it.w) || 6) * (it.t === 'hl' ? 3.2 : 1);
    if (it.t === 'pen' || it.t === 'hl' || it.t === 'temp' || it.t === 'line' || it.t === 'arrow') {
        const p = it.p || [];
        if (p.length === 1) return Math.hypot(x - p[0][0], y - p[0][1]) <= r + w / 2;
        for (let i = 0; i < p.length - 1; i++) if (segDist(x, y, p[i][0], p[i][1], p[i + 1][0], p[i + 1][1]) <= r + w / 2) return true;
        return false;
    }
    if (it.t === 'rect') {
        const b = itemBox(it);
        const corners = [[b.x, b.y], [b.x + b.w, b.y], [b.x + b.w, b.y + b.h], [b.x, b.y + b.h]];
        for (let i = 0; i < 4; i++) { const a = corners[i]; const c = corners[(i + 1) % 4]; if (segDist(x, y, a[0], a[1], c[0], c[1]) <= r + w / 2) return true; }
        return !!it.fill && x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;
    }
    if (it.t === 'ellipse') {
        const b = itemBox(it);
        const rx = b.w / 2 || 1; const ry = b.h / 2 || 1;
        const nx = (x - (b.x + rx)) / rx; const ny = (y - (b.y + ry)) / ry;
        const d = Math.sqrt(nx * nx + ny * ny);
        return Math.abs(d - 1) * Math.min(rx, ry) <= r + w / 2;
    }
    const b = itemBox(it);
    return x >= b.x - r && x <= b.x + b.w + r && y >= b.y - r && y <= b.y + b.h + r;
}
function moveItem(it, dx, dy) {
    if (it.p) it.p = it.p.map(([x, y]) => [round(x + dx), round(y + dy)]);
    if (typeof it.x === 'number') { it.x = round(it.x + dx); it.y = round(it.y + dy); }
}

// ------------------------------------------------------------------ الطبقة
export class InkLayer {
    /**
     * @param {HTMLElement} host العنصر اللي الطبقة هتتحط فوقه (لازم position: relative)
     * @param {object} o
     * @param {string|number} o.key مفتاح الصفحة (رقم الصفحة)
     * @param {number} [o.ratio] الارتفاع/العرض (لو مش موجود بيتحسب من مقاس العنصر)
     * @param {InkController} o.ctrl
     */
    constructor(host, { key, ratio, ctrl, items }) {
        this.host = host;
        this.key = key;
        this.ctrl = ctrl;
        const r = host.getBoundingClientRect();
        this.ratio = ratio || (r.width ? r.height / r.width : 1.414);
        this.H = round(W * this.ratio);
        this.items = [];
        this.svg = el('svg', { class: 'ink-layer', viewBox: `0 0 ${W} ${this.H}`, preserveAspectRatio: 'none' });
        this.gItems = el('g', { class: 'ink-items' });
        this.gLive = el('g', { class: 'ink-live' });
        this.svg.appendChild(this.gItems);
        this.svg.appendChild(this.gLive);
        host.appendChild(this.svg);
        this._bind();
        if (items && items.length) this.setItems(items);
        this.sync();
    }

    get empty() { return !this.items.length; }

    setItems(items) {
        this.items = (items || []).filter((it) => it && it.t && it.t !== 'temp').map((it) => ({ ...it, id: it.id || newId() }));
        this.redraw();
    }
    toData() { return { items: this.items, ratio: this.ratio }; }

    redraw() {
        this.gItems.textContent = '';
        for (const it of this.items) this.gItems.appendChild(renderItem(it));
    }

    /** الطبقة بتاخد الضغطات بس لو فيه أداة رسم */
    sync() {
        const t = this.ctrl.tool;
        const active = !!t && !['laser', 'magnifier', 'zoomarea', 'spotlight', 'ruler', 'snip', 'hand'].includes(t);
        this.svg.classList.toggle('ink-active', active);
        this.svg.dataset.tool = t || '';
    }

    toLocal(e) {
        const r = this.svg.getBoundingClientRect();
        return [round(((e.clientX - r.left) / r.width) * W), round(((e.clientY - r.top) / r.height) * this.H)];
    }
    unitPx() { const r = this.svg.getBoundingClientRect(); return r.width ? W / r.width : 1; }

    add(it, record = true) {
        it.id = it.id || newId();
        this.items.push(it);
        this.gItems.appendChild(renderItem(it));
        if (record) this.ctrl.record(this, { type: 'add', items: [it] });
        this.ctrl.changed(this);
    }
    removeIds(ids, record = true) {
        const set = new Set(ids);
        const removed = this.items.filter((it) => set.has(it.id));
        if (!removed.length) return [];
        this.items = this.items.filter((it) => !set.has(it.id));
        removed.forEach((it) => { const n = this.gItems.querySelector(`[data-id="${CSS.escape(it.id)}"]`); if (n) n.remove(); });
        if (record) this.ctrl.record(this, { type: 'remove', items: removed });
        this.ctrl.changed(this);
        return removed;
    }
    clear(record = true) {
        if (!this.items.length) return;
        const all = this.items.slice();
        this.items = [];
        this.gItems.textContent = '';
        if (record) this.ctrl.record(this, { type: 'remove', items: all });
        this.ctrl.changed(this);
    }

    _bind() {
        let cur = null;
        const ctrl = this.ctrl;
        const down = (e) => {
            const tool = ctrl.tool;
            if (!this.svg.classList.contains('ink-active')) return;
            if (e.button !== undefined && e.button > 0 && e.pointerType === 'mouse') return;
            // لو فيه قلم ستايلس: اللمس بالإيد مايرسمش (عشان كف الإيد)
            if (e.pointerType === 'pen') ctrl.penSeen = true;
            if (ctrl.penSeen && e.pointerType === 'touch') return;
            e.preventDefault();
            e.stopPropagation();
            const [x, y] = this.toLocal(e);
            const color = ctrl.color;
            const w = ctrl.size;
            if (tool === 'text') { this._textInput(x, y); return; }
            if (tool === 'stamp') { this.add({ t: 'stamp', x, y, s: ctrl.stamp, c: color, fs: TEXT_SIZE[w] * 1.6 }); return; }
            try { this.svg.setPointerCapture(e.pointerId); } catch (er) { /* تجاهل */ }
            if (tool === 'eraser') {
                cur = { tool, pid: e.pointerId, removed: [] };
                this._eraseAt(x, y, cur);
                return;
            }
            if (tool === 'move') {
                const r = 8 * this.unitPx();
                const hit = [...this.items].reverse().find((it) => hitItem(it, x, y, r));
                if (!hit) return;
                cur = { tool, pid: e.pointerId, item: hit, x0: x, y0: y, dx: 0, dy: 0 };
                return;
            }
            const t = tool === 'temp' ? 'temp' : tool;
            cur = { tool, pid: e.pointerId, it: { t, c: tool === 'hl' && ctrl.color === '#1F1F1F' ? '#F2A900' : color, w, p: [[x, y]] } };
            if (['line', 'arrow', 'rect', 'ellipse'].includes(tool)) cur.it.p = [[x, y], [x, y]];
            cur.node = renderItem(cur.it);
            this.gLive.appendChild(cur.node);
        };
        const move = (e) => {
            if (!cur || e.pointerId !== cur.pid) return;
            e.preventDefault();
            const evs = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [e];
            if (cur.tool === 'eraser') { for (const ev of evs) { const [x, y] = this.toLocal(ev); this._eraseAt(x, y, cur); } return; }
            const [x, y] = this.toLocal(e);
            if (cur.tool === 'move') {
                const dx = x - cur.x0; const dy = y - cur.y0;
                cur.dx = dx; cur.dy = dy;
                const n = this.gItems.querySelector(`[data-id="${CSS.escape(cur.item.id)}"]`);
                if (n) n.setAttribute('transform', `translate(${dx} ${dy})`);
                return;
            }
            const it = cur.it;
            if (['line', 'arrow', 'rect', 'ellipse'].includes(cur.tool)) {
                let [x0, y0] = it.p[0];
                let x2 = x; let y2 = y;
                if (e.shiftKey) {
                    if (cur.tool === 'rect' || cur.tool === 'ellipse') {
                        const s = Math.max(Math.abs(x2 - x0), Math.abs(y2 - y0));
                        x2 = x0 + Math.sign(x2 - x0 || 1) * s; y2 = y0 + Math.sign(y2 - y0 || 1) * s;
                    } else {
                        const ang = Math.round(Math.atan2(y2 - y0, x2 - x0) / (Math.PI / 4)) * (Math.PI / 4);
                        const d = Math.hypot(x2 - x0, y2 - y0);
                        x2 = round(x0 + d * Math.cos(ang)); y2 = round(y0 + d * Math.sin(ang));
                    }
                }
                it.p = [[x0, y0], [x2, y2]];
            } else {
                const minD = 1.2 * this.unitPx();
                for (const ev of evs) {
                    const [px, py] = this.toLocal(ev);
                    const last = it.p[it.p.length - 1];
                    if (Math.hypot(px - last[0], py - last[1]) >= minD) it.p.push([px, py]);
                }
                if (cur.tool === 'hl' && it.p.length > 2 && !e.shiftKey) {
                    // الهايلايتر بيمشي على السطر: لو الحركة أفقية تقريبًا بنعدّلها
                    const a = it.p[0]; const b = it.p[it.p.length - 1];
                    if (Math.abs(b[1] - a[1]) < 0.12 * Math.abs(b[0] - a[0]) && it.p.length > 6) cur.straight = true; else cur.straight = false;
                }
            }
            const n = renderItem(it);
            cur.node.replaceWith(n);
            cur.node = n;
        };
        const up = (e) => {
            if (!cur || (e && e.pointerId !== cur.pid)) return;
            const c = cur; cur = null;
            try { this.svg.releasePointerCapture(c.pid); } catch (er) { /* تجاهل */ }
            if (c.tool === 'eraser') {
                if (c.removed.length) { ctrl.record(this, { type: 'remove', items: c.removed }); ctrl.changed(this); }
                return;
            }
            if (c.tool === 'move') {
                const n = this.gItems.querySelector(`[data-id="${CSS.escape(c.item.id)}"]`);
                if (n) n.removeAttribute('transform');
                if (Math.abs(c.dx) + Math.abs(c.dy) > 0.5) {
                    moveItem(c.item, c.dx, c.dy);
                    this.redraw();
                    ctrl.record(this, { type: 'move', id: c.item.id, dx: c.dx, dy: c.dy });
                    ctrl.changed(this);
                }
                return;
            }
            c.node.remove();
            const it = c.it;
            if (['line', 'arrow', 'rect', 'ellipse'].includes(c.tool)) {
                const [[x1, y1], [x2, y2]] = it.p;
                if (Math.hypot(x2 - x1, y2 - y1) < 4) return;   // ضغطة من غير سحب
            }
            if (c.straight) it.p = [it.p[0], [it.p[it.p.length - 1][0], it.p[0][1]]];
            it.p = it.p.map(([x, y]) => [round(x), round(y)]);
            if (c.tool === 'temp') {
                // القلم المؤقت: بيختفي لوحده بعد ثانيتين، ومابيتحفظش
                const n = renderItem(it);
                n.classList.add('ink-temp');
                this.gLive.appendChild(n);
                setTimeout(() => { n.classList.add('ink-fade'); setTimeout(() => n.remove(), 700); }, 1600);
                return;
            }
            this.add(it);
        };
        this.svg.addEventListener('pointerdown', down);
        this.svg.addEventListener('pointermove', move);
        this.svg.addEventListener('pointerup', up);
        this.svg.addEventListener('pointercancel', up);
        this.svg.addEventListener('lostpointercapture', up);
    }

    _eraseAt(x, y, cur) {
        const r = (8 + this.ctrl.size) * this.unitPx();
        const hits = this.items.filter((it) => hitItem(it, x, y, r));
        if (!hits.length) return;
        cur.removed.push(...this.removeIds(hits.map((h) => h.id), false));
    }

    _textInput(x, y, existing = null) {
        if (this._ta) this._ta.blur();
        const fs = TEXT_SIZE[this.ctrl.size] || 34;
        const r = this.svg.getBoundingClientRect();
        const scale = r.width / W;
        const ta = document.createElement('textarea');
        ta.className = 'ink-text-input';
        ta.dir = 'auto';
        ta.rows = 1;
        ta.placeholder = 'اكتب هنا...';
        // العربي بيتكتب من مكان الضغطة ناحية الشمال (زي ما هيترسم بعد الحفظ)
        const place = (rtl) => {
            if (rtl) { ta.style.left = 'auto'; ta.style.right = `${100 - (x / W) * 100}%`; } else { ta.style.right = 'auto'; ta.style.left = `${(x / W) * 100}%`; }
            ta.style.direction = rtl ? 'rtl' : 'ltr';
        };
        place(!existing || isArabic(existing) || !/[A-Za-z]/.test(existing));
        ta.style.top = `${(y / this.H) * 100}%`;
        ta.style.fontSize = `${Math.max(12, fs * scale)}px`;
        ta.style.color = this.ctrl.color === '#FFFFFF' ? '#1F1F1F' : this.ctrl.color;
        this.host.appendChild(ta);
        this._ta = ta;
        const color = this.ctrl.color;
        let done = false;
        const commit = () => {
            if (done) return; done = true;
            const text = ta.value.replace(/\s+$/, '');
            ta.remove(); this._ta = null;
            if (!text) return;
            const rtl = isArabic(text) || !/[A-Za-z]/.test(text);
            this.add({ t: 'text', x, y, text: text.slice(0, 500), c: color, fs, dir: rtl ? 'rtl' : 'ltr' });
        };
        ta.addEventListener('keydown', (e) => {
            e.stopPropagation();
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commit(); }
            if (e.key === 'Escape') { e.preventDefault(); ta.value = ''; commit(); }
        });
        ta.addEventListener('input', () => {
            ta.style.height = 'auto'; ta.style.height = `${ta.scrollHeight}px`;
            if (ta.value.trim()) place(isArabic(ta.value) || !/[A-Za-z]/.test(ta.value));
        });
        ta.addEventListener('blur', commit);
        setTimeout(() => ta.focus(), 0);
        if (existing) ta.value = existing;
    }

    destroy() { this.svg.remove(); if (this._ta) this._ta.remove(); }
}

// ------------------------------------------------------------------ المتحكم: الأداة + التاريخ + الحفظ
export class InkController {
    /**
     * @param {{ onSave?: (layer: InkLayer) => Promise<void>|void, onToolChange?: (tool: string|null) => void, saveDelay?: number }} o
     */
    constructor({ onSave, onToolChange, saveDelay = 1200 } = {}) {
        this.tool = null;
        this.color = COLORS[0].c;
        this.size = 6;
        this.stamp = STAMPS[0];
        this.layers = new Set();
        this.undoStack = [];
        this.redoStack = [];
        this.onSave = onSave;
        this.onToolChange = onToolChange;
        this.saveDelay = saveDelay;
        this._dirty = new Map();
        this.listeners = new Set();
    }
    attach(layer) { this.layers.add(layer); }
    detach(layer) { this.layers.delete(layer); }

    setTool(tool) {
        this.tool = tool || null;
        this.layers.forEach((l) => l.sync());
        if (this.onToolChange) this.onToolChange(this.tool);
        this.emit();
    }
    setColor(c) { this.color = c; this.emit(); }
    setSize(s) { this.size = s; this.emit(); }
    setStamp(s) { this.stamp = s; this.emit(); }
    on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
    emit() { this.listeners.forEach((fn) => { try { fn(this); } catch (e) { /* تجاهل */ } }); }

    record(layer, op) {
        this.undoStack.push({ layer, op });
        if (this.undoStack.length > 200) this.undoStack.shift();
        this.redoStack = [];
        this.emit();
    }
    _apply(layer, op, reverse) {
        if (op.type === 'add') {
            if (reverse) layer.removeIds(op.items.map((i) => i.id), false);
            else op.items.forEach((it) => layer.add(it, false));
        } else if (op.type === 'remove') {
            if (reverse) op.items.forEach((it) => layer.add(it, false));
            else layer.removeIds(op.items.map((i) => i.id), false);
        } else if (op.type === 'move') {
            const it = layer.items.find((x) => x.id === op.id);
            if (it) { moveItem(it, reverse ? -op.dx : op.dx, reverse ? -op.dy : op.dy); layer.redraw(); layer.ctrl.changed(layer); }
        }
    }
    undo() {
        const e = this.undoStack.pop();
        if (!e || !this.layers.has(e.layer)) { this.emit(); return false; }
        this._apply(e.layer, e.op, true);
        this.redoStack.push(e);
        this.emit();
        return true;
    }
    redo() {
        const e = this.redoStack.pop();
        if (!e || !this.layers.has(e.layer)) { this.emit(); return false; }
        this._apply(e.layer, e.op, false);
        this.undoStack.push(e);
        this.emit();
        return true;
    }
    get canUndo() { return this.undoStack.some((e) => this.layers.has(e.layer)); }
    get canRedo() { return this.redoStack.some((e) => this.layers.has(e.layer)); }

    changed(layer) {
        if (!this.onSave) return;
        clearTimeout(this._dirty.get(layer));
        this._dirty.set(layer, setTimeout(() => { this._dirty.delete(layer); this._save(layer); }, this.saveDelay));
    }
    async _save(layer) {
        try { await this.onSave(layer); } catch (e) { /* onSave بيعرض الخطأ */ }
    }
    /** حفظ فوري لأي صفحة لسه ماتحفظتش (قبل القفل) */
    async flush() {
        const pending = [...this._dirty.keys()];
        pending.forEach((l) => clearTimeout(this._dirty.get(l)));
        this._dirty.clear();
        await Promise.all(pending.map((l) => this._save(l)));
    }
    get hasPending() { return this._dirty.size > 0; }
}

// ------------------------------------------------------------------ شريط الأدوات
const TOOL_INFO = {
    hand: { ic: 'hand', label: 'تحريك الصفحة (من غير رسم)', key: 'Esc' },
    pen: { ic: 'pen', label: 'قلم', key: 'P' },
    hl: { ic: 'highlighter', label: 'هايلايتر', key: 'H' },
    temp: { ic: 'pen', label: 'قلم مؤقت (بيختفي لوحده)', key: 'Q' },
    eraser: { ic: 'eraser', label: 'ممحاة', key: 'E' },
    line: { ic: 'lineTool', label: 'خط', key: '' },
    arrow: { ic: 'arrowUpRight', label: 'سهم', key: 'A' },
    rect: { ic: 'square', label: 'مستطيل', key: '' },
    ellipse: { ic: 'circle', label: 'دايرة', key: '' },
    text: { ic: 'type', label: 'كتابة', key: 'T' },
    stamp: { ic: 'stamp', label: 'علامات ✓ ✗ ★', key: 'K' },
    move: { ic: 'pointer', label: 'تحريك اللي اترسم', key: 'V' },
    laser: { ic: 'laser', label: 'مؤشر ليزر', key: 'L' },
    magnifier: { ic: 'zoomIn', label: 'عدسة مكبرة', key: 'M' },
    zoomarea: { ic: 'scan', label: 'زوم على جزء (ارسم مستطيل)', key: 'Z' },
    spotlight: { ic: 'spotlight', label: 'كشاف (تغميق الباقي)', key: 'S' },
    ruler: { ic: 'ruler', label: 'مسطرة القراءة (شريط السطر)', key: 'R' },
    snip: { ic: 'scissors', label: 'قص جزء للسبورة', key: 'X' }
};
export { TOOL_INFO };

export class ToolDock {
    /**
     * @param {HTMLElement} parent
     * @param {InkController} ctrl
     * @param {{ tools: string[], extra?: Array<{id:string, ic:string, label:string, key?:string, onClick:Function, active?:()=>boolean}>, dark?: boolean, onClear?: Function, compact?: boolean }} o
     */
    constructor(parent, ctrl, { tools, extra = [], onClear, className = '' }) {
        this.ctrl = ctrl;
        this.extra = extra;
        this.root = document.createElement('div');
        this.root.className = `ink-dock ${className}`;
        this.root.setAttribute('role', 'toolbar');
        this.root.setAttribute('aria-label', 'أدوات الشرح');
        const shapes = ['line', 'arrow', 'rect', 'ellipse'].filter((t) => tools.includes(t));
        const main = tools.filter((t) => !shapes.includes(t));
        const btn = (t) => {
            const info = TOOL_INFO[t];
            return `<button type="button" class="ink-tb" data-tool="${t}" title="${info.label}${info.key ? ` (${info.key})` : ''}" aria-label="${info.label}" aria-pressed="false">${icon(info.ic, { size: 19 })}${t === 'temp' ? '<i class="ink-temp-dot"></i>' : ''}</button>`;
        };
        this.root.innerHTML = `
            <div class="ink-row">
                ${main.filter((t) => ['hand', 'pen', 'hl', 'temp', 'eraser'].includes(t)).map(btn).join('')}
                ${shapes.length ? `<div class="ink-pop-wrap"><button type="button" class="ink-tb" data-pop="shapes" title="أشكال: خط، سهم، مستطيل، دايرة" aria-label="أشكال" aria-haspopup="true">${icon('square', { size: 19 })}<i class="ink-caret"></i></button>
                    <div class="ink-pop" data-popbox="shapes" hidden>${shapes.map(btn).join('')}</div></div>` : ''}
                ${main.filter((t) => ['text', 'stamp', 'move'].includes(t)).map(btn).join('')}
                <span class="ink-sep"></span>
                <div class="ink-pop-wrap"><button type="button" class="ink-tb ink-color-btn" data-pop="colors" title="اللون (1-7)" aria-label="اللون"><i class="ink-swatch"></i></button>
                    <div class="ink-pop ink-colors" data-popbox="colors" hidden>
                        ${COLORS.map((c, i) => `<button type="button" class="ink-c" data-color="${c.c}" style="--c:${c.c}" title="${c.name} (${i + 1})" aria-label="${c.name}"></button>`).join('')}
                        <span class="ink-pop-sep"></span>
                        ${SIZES.map((s) => `<button type="button" class="ink-s" data-size="${s.v}" title="${s.name}" aria-label="سُمك ${s.name}"><i style="--s:${Math.max(3, s.v * 0.9)}px"></i></button>`).join('')}
                        <div class="ink-stamps" ${tools.includes('stamp') ? '' : 'hidden'}>${STAMPS.map((s) => `<button type="button" class="ink-st" data-stamp="${s}">${s}</button>`).join('')}</div>
                    </div></div>
                <button type="button" class="ink-tb" data-act="undo" title="رجوع (Ctrl+Z)" aria-label="رجوع">${icon('undo', { size: 19 })}</button>
                <button type="button" class="ink-tb" data-act="redo" title="إعادة (Ctrl+Y)" aria-label="إعادة">${icon('redo', { size: 19 })}</button>
                ${onClear ? `<button type="button" class="ink-tb" data-act="clear" title="امسح رسم الصفحة دي (C)" aria-label="امسح رسم الصفحة">${icon('trash', { size: 19 })}</button>` : ''}
                ${main.filter((t) => ['laser', 'magnifier', 'zoomarea', 'spotlight', 'ruler', 'snip'].includes(t)).length ? '<span class="ink-sep"></span>' : ''}
                ${main.filter((t) => ['laser', 'magnifier', 'zoomarea', 'spotlight', 'ruler', 'snip'].includes(t)).map(btn).join('')}
                ${extra.length ? '<span class="ink-sep"></span>' : ''}
                ${extra.map((x) => `<button type="button" class="ink-tb${x.wide ? ' ink-tb-wide' : ''}" data-extra="${x.id}" title="${x.label}${x.key ? ` (${x.key})` : ''}" aria-label="${x.label}">${icon(x.ic, { size: 19 })}${x.text ? `<span>${x.text}</span>` : ''}</button>`).join('')}
            </div>`;
        parent.appendChild(this.root);
        this.onClear = onClear;
        this.root.addEventListener('click', (e) => this._click(e));
        // الضغط على الشريط مايوصلش للصفحة اللي تحته
        this.root.addEventListener('pointerdown', (e) => e.stopPropagation());
        this._off = ctrl.on(() => this.refresh());
        this._docClick = (e) => { if (!this.root.contains(e.target)) this.closePops(); };
        document.addEventListener('pointerdown', this._docClick, true);
        this.refresh();
    }
    closePops() { this.root.querySelectorAll('[data-popbox]').forEach((p) => { p.hidden = true; }); }
    _click(e) {
        const pop = e.target.closest('[data-pop]');
        if (pop) {
            const box = this.root.querySelector(`[data-popbox="${pop.dataset.pop}"]`);
            const willOpen = box.hidden;
            this.closePops();
            box.hidden = !willOpen;
            return;
        }
        const t = e.target.closest('[data-tool]');
        if (t) {
            const tool = t.dataset.tool;
            this.ctrl.setTool(this.ctrl.tool === tool || tool === 'hand' ? null : tool);
            this.closePops();
            return;
        }
        const c = e.target.closest('[data-color]');
        if (c) { this.ctrl.setColor(c.dataset.color); if (!this.ctrl.tool || ['hand', 'eraser', 'move'].includes(this.ctrl.tool)) this.ctrl.setTool('pen'); return; }
        const s = e.target.closest('[data-size]');
        if (s) { this.ctrl.setSize(Number(s.dataset.size)); return; }
        const st = e.target.closest('[data-stamp]');
        if (st) { this.ctrl.setStamp(st.dataset.stamp); this.ctrl.setTool('stamp'); this.closePops(); return; }
        const a = e.target.closest('[data-act]');
        if (a) {
            if (a.dataset.act === 'undo') this.ctrl.undo();
            else if (a.dataset.act === 'redo') this.ctrl.redo();
            else if (a.dataset.act === 'clear' && this.onClear) this.onClear();
            return;
        }
        const x = e.target.closest('[data-extra]');
        if (x) { const def = this.extra.find((d) => d.id === x.dataset.extra); if (def) def.onClick(x); }
    }
    refresh() {
        const ctrl = this.ctrl;
        this.root.querySelectorAll('[data-tool]').forEach((b) => {
            const on = ctrl.tool === b.dataset.tool || (b.dataset.tool === 'hand' && !ctrl.tool);
            b.classList.toggle('is-on', on);
            b.setAttribute('aria-pressed', String(on));
        });
        const shapesBtn = this.root.querySelector('[data-pop="shapes"]');
        if (shapesBtn) {
            const isShape = ['line', 'arrow', 'rect', 'ellipse'].includes(ctrl.tool);
            shapesBtn.classList.toggle('is-on', isShape);
            if (isShape) shapesBtn.innerHTML = icon(TOOL_INFO[ctrl.tool].ic, { size: 19 }) + '<i class="ink-caret"></i>';
        }
        const sw = this.root.querySelector('.ink-swatch');
        if (sw) { sw.style.background = ctrl.color; sw.style.setProperty('--sz', `${Math.max(8, ctrl.size * 1.3)}px`); }
        this.root.querySelectorAll('[data-color]').forEach((b) => b.classList.toggle('is-on', b.dataset.color === ctrl.color));
        this.root.querySelectorAll('[data-size]').forEach((b) => b.classList.toggle('is-on', Number(b.dataset.size) === ctrl.size));
        this.root.querySelectorAll('[data-stamp]').forEach((b) => b.classList.toggle('is-on', b.dataset.stamp === ctrl.stamp));
        const u = this.root.querySelector('[data-act="undo"]'); if (u) u.disabled = !ctrl.canUndo;
        const r = this.root.querySelector('[data-act="redo"]'); if (r) r.disabled = !ctrl.canRedo;
        this.extra.forEach((x) => {
            const b = this.root.querySelector(`[data-extra="${x.id}"]`);
            if (b && x.active) b.classList.toggle('is-on', !!x.active());
        });
    }
    destroy() {
        if (this._off) this._off();
        document.removeEventListener('pointerdown', this._docClick, true);
        this.root.remove();
    }
}

/**
 * اختصارات الرسم المشتركة (السبورة والكتاب). بيرجّع true لو الزرار اتعامل معاه.
 * بيقرا e.code عشان يشتغل والكيبورد عربي برضه.
 */
export function handleInkKey(e, ctrl, { tools, onClear } = {}) {
    const has = (t) => !tools || tools.includes(t);
    if ((e.ctrlKey || e.metaKey) && !e.altKey) {
        if (e.code === 'KeyZ' && !e.shiftKey) { e.preventDefault(); ctrl.undo(); return true; }
        if (e.code === 'KeyY' || (e.code === 'KeyZ' && e.shiftKey)) { e.preventDefault(); ctrl.redo(); return true; }
        return false;
    }
    if (e.altKey || e.metaKey) return false;
    const map = { KeyP: 'pen', KeyH: 'hl', KeyQ: 'temp', KeyE: 'eraser', KeyA: 'arrow', KeyT: 'text', KeyK: 'stamp', KeyV: 'move', KeyL: 'laser', KeyM: 'magnifier', KeyZ: 'zoomarea', KeyS: 'spotlight', KeyR: 'ruler', KeyX: 'snip' };
    const tool = map[e.code];
    if (tool && has(tool)) { e.preventDefault(); ctrl.setTool(ctrl.tool === tool ? null : tool); return true; }
    const dm = /^Digit([1-7])$/.exec(e.code) || /^Numpad([1-7])$/.exec(e.code);
    if (dm) { e.preventDefault(); ctrl.setColor(COLORS[Number(dm[1]) - 1].c); if (!ctrl.tool || ['eraser', 'move'].includes(ctrl.tool)) ctrl.setTool('pen'); return true; }
    if (e.code === 'BracketRight' || e.code === 'BracketLeft') {
        const i = SIZES.findIndex((s) => s.v === ctrl.size);
        const n = Math.max(0, Math.min(SIZES.length - 1, i + (e.code === 'BracketRight' ? 1 : -1)));
        ctrl.setSize(SIZES[n].v); e.preventDefault(); return true;
    }
    if (e.code === 'KeyC' && onClear) { e.preventDefault(); onClear(); return true; }
    return false;
}

/** ألوان وخلفيات صفحات السبورة */
export const BOARD_BGS = [
    { id: 'white', name: 'أبيض' }, { id: 'grid', name: 'مربعات' }, { id: 'lines', name: 'سطور' },
    { id: 'dots', name: 'نقط' }, { id: 'green', name: 'سبورة خضرا' }, { id: 'black', name: 'سودا' }
];
export function boardBgSvg(id, H) {
    const g = el('g', { class: 'ink-bg' });
    const dark = id === 'green' || id === 'black';
    g.appendChild(el('rect', { x: 0, y: 0, width: W, height: H, fill: id === 'green' ? '#1F4D3A' : id === 'black' ? '#151515' : '#FFFFFF' }));
    const line = dark ? '#FFFFFF22' : '#3D6FB633';
    if (id === 'grid') {
        for (let x = 40; x < W; x += 40) g.appendChild(el('line', { x1: x, y1: 0, x2: x, y2: H, stroke: line, 'stroke-width': 1 }));
        for (let y = 40; y < H; y += 40) g.appendChild(el('line', { x1: 0, y1: y, x2: W, y2: y, stroke: line, 'stroke-width': 1 }));
    } else if (id === 'lines') {
        for (let y = 70; y < H; y += 46) g.appendChild(el('line', { x1: 30, y1: y, x2: W - 30, y2: y, stroke: '#3D6FB655', 'stroke-width': 1.4 }));
        g.appendChild(el('line', { x1: W - 70, y1: 0, x2: W - 70, y2: H, stroke: '#E5393566', 'stroke-width': 1.4 }));
    } else if (id === 'dots') {
        for (let x = 40; x < W; x += 40) for (let y = 40; y < H; y += 40) g.appendChild(el('circle', { cx: x, cy: y, r: 1.8, fill: dark ? '#FFFFFF44' : '#55555566' }));
    }
    return g;
}
export const isDarkBg = (id) => id === 'green' || id === 'black';

/**
 * مؤشر ليزر أحمر بذيل بيختفي (للشرح من غير ما نرسم حاجة).
 * الطالب بيشوفه في مشاركة الشاشة بدل سهم الماوس الصغير.
 */
export class LaserPointer {
    constructor(container) {
        this.container = container;
        this.canvas = document.createElement('canvas');
        this.canvas.className = 'ink-laser';
        this.canvas.hidden = true;
        document.body.appendChild(this.canvas);
        this.pts = [];
        this.active = false;
        this._move = (e) => {
            if (!this.active) return;
            const evs = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [e];
            const now = performance.now();
            for (const ev of evs) this.pts.push({ x: ev.clientX, y: ev.clientY, t: now });
            if (!this._raf) this._raf = requestAnimationFrame(() => this._draw());
        };
        this._leave = () => { this.pts = []; this._clear(); };
        this._resize = () => this._size();
    }
    _size() {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        this.canvas.width = Math.floor(innerWidth * dpr);
        this.canvas.height = Math.floor(innerHeight * dpr);
        this.canvas.style.width = innerWidth + 'px';
        this.canvas.style.height = innerHeight + 'px';
        this.dpr = dpr;
    }
    _clear() { const c = this.canvas.getContext('2d'); c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, this.canvas.width, this.canvas.height); }
    _draw() {
        this._raf = null;
        const now = performance.now();
        this.pts = this.pts.filter((p) => now - p.t < 380);
        const c = this.canvas.getContext('2d');
        this._clear();
        c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
        const n = this.pts.length;
        if (n > 1) {
            c.lineCap = 'round'; c.lineJoin = 'round';
            for (let i = 1; i < n; i++) {
                const a = this.pts[i - 1]; const b = this.pts[i];
                const k = 1 - (now - b.t) / 380;
                c.strokeStyle = `rgba(255, 32, 32, ${0.55 * k})`;
                c.lineWidth = 2 + 8 * k;
                c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.stroke();
            }
        }
        const last = this.pts[n - 1];
        if (last) {
            const g = c.createRadialGradient(last.x, last.y, 0, last.x, last.y, 16);
            g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, 'rgba(255,40,40,1)'); g.addColorStop(1, 'rgba(255,0,0,0)');
            c.fillStyle = g;
            c.beginPath(); c.arc(last.x, last.y, 16, 0, Math.PI * 2); c.fill();
            this._lastPt = last;
        }
        if (n) this._raf = requestAnimationFrame(() => this._draw());
        else if (this._lastPt) {
            // النقطة بتفضل ظاهرة مكانها لما الماوس يقف
            const p = this._lastPt;
            const g = c.createRadialGradient(p.x, p.y, 0, p.x, p.y, 16);
            g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, 'rgba(255,40,40,1)'); g.addColorStop(1, 'rgba(255,0,0,0)');
            c.fillStyle = g; c.beginPath(); c.arc(p.x, p.y, 16, 0, Math.PI * 2); c.fill();
        }
    }
    setActive(on) {
        if (on === this.active) return;
        this.active = on;
        this.canvas.hidden = !on;
        this.container.classList.toggle('ink-laser-on', on);
        if (on) {
            this._size();
            window.addEventListener('resize', this._resize);
            this.container.addEventListener('pointermove', this._move);
            this.container.addEventListener('pointerleave', this._leave);
        } else {
            window.removeEventListener('resize', this._resize);
            this.container.removeEventListener('pointermove', this._move);
            this.container.removeEventListener('pointerleave', this._leave);
            this.pts = []; this._lastPt = null; this._clear();
        }
    }
    destroy() { this.setActive(false); this.canvas.remove(); }
}
