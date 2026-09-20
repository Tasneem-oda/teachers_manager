/**
 * book-processor.js - خط معالجة الكتاب في المتصفح (يدعم النصي والمصوّر/الممسوح ضوئيًا)
 *
 *   1) بداية المعالجة (السيرفر يعلّم الكتاب processing ويمسح المقاطع القديمة)
 *   2) استخراج النص من الملف (PDF / Word / PowerPoint / نص / صورة)
 *   3) تقييم جودة نص كل صفحة → الصفحات الممسوحة/التالفة تتحوّل لصور
 *   4) قراءة الصور بالذكاء الاصطناعي (OCR) على دفعات صغيرة (n8n → Gemini)
 *   5) تقطيع النص لمقاطع (بالفصل ورقم الصفحة) ثم فهرستها على دفعات (embedding)
 *   6) إنهاء المعالجة (ready / failed)
 *
 * الفكرة: الاستخراج والتقطيع بيحصلوا في المتصفح (سريع ومجاني ومابيتقيّدش بحدود n8n)،
 * والسيرفر بيعمل بس الحاجات اللي محتاجة مفتاح Gemini (OCR + embeddings) وقاعدة البيانات.
 */

import { CONFIG } from './config.js?v=7';
import { normalizeText, assessTextQuality, chunkUnits, paginateBlocks } from './book-chunker.js?v=7';
import { loadPdfJs, pdfDocumentParams, loadJsZip } from './book-libs.js?v=7';

const S = () => CONFIG.BOOKS_SETTINGS;
const OCR_MAX_SIDE = 1800;          // أقصى بُعد لصورة الصفحة المرسلة للـ OCR (بكسل)
const OCR_MAX_B64 = 3600000;        // حد أمان لحجم الصورة (السيرفر بيرفض > 5.5 مليون حرف)
const OCR_BATCH_BYTES = 2800000;    // حد حجم دفعة OCR الواحدة (base64)
const OCR_TOKEN = (k) => `⟦OCR:${k}⟧`;
const OCR_TOKEN_RE = /⟦OCR:([^⟧]+)⟧/g;

// ---------------------------------------------------------------------------
// أدوات عامة
// ---------------------------------------------------------------------------

export class BookProcessError extends Error {
    constructor(message, code = 'PROCESS_ERROR') {
        super(message);
        this.name = 'BookProcessError';
        this.code = code;
    }
}

function abortError() {
    const e = new BookProcessError('تم إلغاء المعالجة', 'ABORTED');
    e.aborted = true;
    return e;
}

function throwIfAborted(signal) {
    if (signal && signal.aborted) throw abortError();
}

function errMessage(err) {
    if (!err) return 'خطأ غير معروف';
    if (typeof err === 'string') return err;
    if (err.error && err.error.message) return err.error.message;
    if (err.message) return err.message;
    return 'خطأ غير معروف';
}

function errCode(err) {
    return (err && err.error && err.error.code) || (err && err.code) || '';
}

function sleep(ms, signal) {
    return new Promise((resolve, reject) => {
        if (signal && signal.aborted) return reject(abortError());
        const t = setTimeout(() => { cleanup(); resolve(); }, ms);
        const onAbort = () => { clearTimeout(t); cleanup(); reject(abortError()); };
        const cleanup = () => signal && signal.removeEventListener('abort', onAbort);
        if (signal) signal.addEventListener('abort', onAbort, { once: true });
    });
}

/**
 * إعادة محاولة ذكية: BUSY/شبكة/مهلة/خطأ مؤقت من الذكاء الاصطناعي → ننتظر ونعيد.
 * أخطاء نهائية (حد يومي، كتاب مش في حالة معالجة، مدخلات غلط) → نرميها فورًا.
 */
async function withRetry(fn, { tries = 4, signal, onWait, busyWaitMs = 4500 } = {}) {
    let lastErr;
    for (let attempt = 1; attempt <= tries; attempt++) {
        throwIfAborted(signal);
        try {
            return await fn();
        } catch (err) {
            if (err && (err.aborted || err.name === 'AbortError')) throw abortError();
            lastErr = err;
            const code = errCode(err);
            const fatal = ['DAILY_LIMIT', 'NOT_PROCESSING', 'VALIDATION_ERROR', 'EMBED_DIM', 'NOT_FOUND', 'ALREADY_PROCESSING'].includes(code);
            if (fatal || attempt === tries) break;
            const wait = (code === 'BUSY' ? busyWaitMs : 2500) * attempt;
            if (onWait) onWait(attempt, wait, code);
            await sleep(wait, signal);
        }
    }
    throw lastErr;
}

/** نوع الملف من الامتداد/الـ MIME (أو null لو غير مدعوم) */
export function detectFileType(file) {
    const name = (file && file.name ? file.name : '').toLowerCase();
    const ext = name.includes('.') ? name.split('.').pop() : '';
    const mime = (file && file.type ? file.type : '').toLowerCase();
    if (ext === 'pdf' || mime === 'application/pdf') return 'pdf';
    if (ext === 'docx' || mime.includes('wordprocessingml')) return 'docx';
    if (ext === 'pptx' || mime.includes('presentationml')) return 'pptx';
    if (ext === 'txt' || ext === 'md' || mime === 'text/plain') return 'txt';
    if (['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp'].includes(ext) || mime.startsWith('image/')) return 'image';
    return null;
}

// ---------------------------------------------------------------------------
// تخزين نتائج الـ OCR محليًا (IndexedDB) - لو المعالجة وقفت في النص (النت، الحد اليومي)
// وأعادت، مانضيّعش حصة Gemini في قراءة نفس الصفحات تاني
// ---------------------------------------------------------------------------

const OcrCache = (() => {
    const mem = new Map();
    let dbPromise = null;
    function open() {
        if (dbPromise) return dbPromise;
        dbPromise = new Promise((resolve) => {
            try {
                if (typeof indexedDB === 'undefined') return resolve(null);
                const req = indexedDB.open('tm-books-ocr', 1);
                req.onupgradeneeded = () => req.result.createObjectStore('pages', { keyPath: 'k' });
                req.onsuccess = () => resolve(req.result);
                req.onerror = () => resolve(null);
                req.onblocked = () => resolve(null);
            } catch (e) { resolve(null); }
        });
        return dbPromise;
    }
    const tx = async (mode, fn) => {
        const db = await open();
        if (!db) return undefined;
        return new Promise((resolve) => {
            try {
                const t = db.transaction('pages', mode);
                const r = fn(t.objectStore('pages'));
                t.oncomplete = () => resolve(r && 'result' in r ? r.result : undefined);
                t.onerror = () => resolve(undefined);
                t.onabort = () => resolve(undefined);
            } catch (e) { resolve(undefined); }
        });
    };
    return {
        async get(k) {
            if (mem.has(k)) return mem.get(k);
            const row = await tx('readonly', (s) => s.get(k));
            return row ? row.text : undefined;
        },
        async set(k, text) {
            mem.set(k, text);
            await tx('readwrite', (s) => s.put({ k, text }));
        },
        async clear(prefix) {
            for (const k of Array.from(mem.keys())) if (k.startsWith(prefix)) mem.delete(k);
            await tx('readwrite', (s) => {
                const req = s.openCursor();
                req.onsuccess = () => {
                    const cur = req.result;
                    if (cur) { if (String(cur.key).startsWith(prefix)) cur.delete(); cur.continue(); }
                };
                return req;
            });
        }
    };
})();

// ---------------------------------------------------------------------------
// الصور: تحويل لـ JPEG مصغّر (للـ OCR)
// ---------------------------------------------------------------------------

async function decodeImage(blob) {
    if (typeof createImageBitmap === 'function') {
        try { return await createImageBitmap(blob, { imageOrientation: 'from-image' }); } catch (e) { /* نجرّب Image */ }
        try { return await createImageBitmap(blob); } catch (e) { /* نجرّب Image */ }
    }
    return await new Promise((resolve, reject) => {
        const url = URL.createObjectURL(blob);
        const img = new Image();
        img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
        img.onerror = () => { URL.revokeObjectURL(url); reject(new BookProcessError('تعذّر فتح الصورة')); };
        img.src = url;
    });
}

function canvasToJpegB64(canvas, quality) {
    const url = canvas.toDataURL('image/jpeg', quality);
    return url.slice(url.indexOf(',') + 1);
}

/** نسبة "الحبر" في الصورة (لتخطّي الصفحات الفاضية وتوفير حصة الـ OCR) */
function inkRatio(ctx, w, h) {
    try {
        const sw = Math.min(w, 160);
        const sh = Math.max(1, Math.round(h * (sw / w)));
        const tmp = document.createElement('canvas');
        tmp.width = sw; tmp.height = sh;
        const tctx = tmp.getContext('2d', { willReadFrequently: true });
        tctx.drawImage(ctx.canvas, 0, 0, sw, sh);
        const data = tctx.getImageData(0, 0, sw, sh).data;
        let dark = 0;
        for (let i = 0; i < data.length; i += 4) {
            const lum = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
            if (lum < 200) dark++;
        }
        return dark / (sw * sh);
    } catch (e) {
        return 1; // مانقدرش نقيس → نفترض إن فيها محتوى
    }
}

/** blob صورة → { mime, data(base64), blank } */
async function imageBlobToOcrPayload(blob, { maxSide = OCR_MAX_SIDE, minSide = 0 } = {}) {
    const bmp = await decodeImage(blob);
    const w0 = bmp.width || bmp.naturalWidth;
    const h0 = bmp.height || bmp.naturalHeight;
    if (!w0 || !h0) throw new BookProcessError('صورة تالفة');
    if (minSide && Math.min(w0, h0) < minSide) { if (bmp.close) bmp.close(); return { skip: true }; }
    let side = maxSide;
    for (let attempt = 0; attempt < 3; attempt++) {
        const scale = Math.min(1, side / Math.max(w0, h0));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(w0 * scale));
        canvas.height = Math.max(1, Math.round(h0 * scale));
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
        const ink = inkRatio(ctx, canvas.width, canvas.height);
        const data = canvasToJpegB64(canvas, attempt === 0 ? 0.85 : 0.7);
        canvas.width = canvas.height = 0;
        if (data.length <= OCR_MAX_B64 || attempt === 2) {
            if (bmp.close) bmp.close();
            return { mime: 'image/jpeg', data, blank: ink < 0.002 };
        }
        side = Math.round(side * 0.75);
    }
    return { skip: true };
}

// ---------------------------------------------------------------------------
// استخراج PDF
// ---------------------------------------------------------------------------

function joinPdfItems(items) {
    let out = '';
    let prev = null;
    for (const it of items) {
        if (typeof it.str !== 'string') continue;
        const t = it.transform || [1, 0, 0, 1, 0, 0];
        const x = t[4], y = t[5];
        const fs = Math.abs(t[3]) || it.height || 10;
        if (prev) {
            const newLine = Math.abs(y - prev.y) > fs * 0.5;
            if (newLine) {
                if (!out.endsWith('\n')) out += '\n';
            } else {
                const w = it.width || 0;
                const gap = Math.min(Math.abs(x - (prev.x + prev.w)), Math.abs(prev.x - (x + w)));
                if (gap > fs * 0.15 && !out.endsWith(' ') && !it.str.startsWith(' ')) out += ' ';
            }
        }
        out += it.str;
        if (it.hasEOL && !out.endsWith('\n')) out += '\n';
        prev = { x, y, w: it.width || 0 };
    }
    return out;
}

async function pdfOutline(pdf) {
    let raw = null;
    try { raw = await pdf.getOutline(); } catch (e) { return []; }
    if (!raw || !raw.length) return [];
    const out = [];
    const walk = async (items, level) => {
        for (const it of items) {
            if (out.length >= 500) return;
            let page = null;
            try {
                let dest = it.dest;
                if (typeof dest === 'string') dest = await pdf.getDestination(dest);
                if (Array.isArray(dest) && dest[0] != null) {
                    const ref = dest[0];
                    page = typeof ref === 'object' ? (await pdf.getPageIndex(ref)) + 1 : Number(ref) + 1;
                }
            } catch (e) { page = null; }
            const title = (it.title || '').replace(/\s+/g, ' ').trim();
            if (title && page) out.push({ title, page, level });
            if (it.items && it.items.length && level < 3) await walk(it.items, level + 1);
        }
    };
    await walk(raw, 1);
    return out.map((o, i) => ({ ...o, _i: i })).sort((a, b) => (a.page - b.page) || (a._i - b._i)).map(({ _i, ...o }) => o);
}

async function pageHasImages(pdfjs, page) {
    try {
        const ops = await page.getOperatorList();
        const OPS = pdfjs.OPS || {};
        const imgOps = new Set([OPS.paintImageXObject, OPS.paintInlineImageXObject, OPS.paintImageMaskXObject, OPS.paintImageXObjectRepeat].filter((x) => x != null));
        return ops.fnArray.some((f) => imgOps.has(f));
    } catch (e) {
        return true;
    }
}

export async function renderPdfPageToJpeg(page, { maxSide = OCR_MAX_SIDE } = {}) {
    let side = maxSide;
    for (let attempt = 0; attempt < 3; attempt++) {
        const base = page.getViewport({ scale: 1 });
        const scale = Math.min(3, side / Math.max(base.width, base.height));
        const viewport = page.getViewport({ scale });
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.ceil(viewport.width));
        canvas.height = Math.max(1, Math.ceil(viewport.height));
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext: ctx, viewport }).promise;
        const ink = inkRatio(ctx, canvas.width, canvas.height);
        const data = canvasToJpegB64(canvas, attempt === 0 ? 0.85 : 0.7);
        canvas.width = canvas.height = 0;
        if (data.length <= OCR_MAX_B64 || attempt === 2) return { mime: 'image/jpeg', data, blank: ink < 0.002 };
        side = Math.round(side * 0.75);
    }
    return { skip: true };
}

async function extractPdf(buffer, { signal, onStep }) {
    const pdfjs = await loadPdfJs();
    let pdf;
    try {
        pdf = await pdfjs.getDocument(pdfDocumentParams({ data: new Uint8Array(buffer).slice() })).promise;
    } catch (e) {
        if (e && e.name === 'PasswordException') throw new BookProcessError('ملف الـ PDF محمي بكلمة مرور. أزل الحماية وارفعه من جديد.');
        throw new BookProcessError('تعذّر فتح ملف الـ PDF (ممكن يكون تالفًا).');
    }
    const n = pdf.numPages;
    if (n > S().MAX_UNITS) {
        throw new BookProcessError(`الكتاب كبير جدًا (${n} صفحة). الحد الأقصى ${S().MAX_UNITS} صفحة للملف الواحد، قسّمه لجزئين.`);
    }

    const pages = [];   // { page, text, q }
    for (let i = 1; i <= n; i++) {
        throwIfAborted(signal);
        const page = await pdf.getPage(i);
        let text = '';
        try { text = joinPdfItems((await page.getTextContent()).items); } catch (e) { text = ''; }
        pages.push({ page: i, text: normalizeText(text), q: assessTextQuality(text) });
        page.cleanup();
        if (i % 5 === 0 || i === n) onStep(i / n);
    }

    const okCount = pages.filter((p) => p.q.ok).length;
    const textBased = okCount / n >= 0.6;

    const ocr = [];
    for (const p of pages) {
        if (p.q.ok) continue;
        let need = false;
        if (!textBased) need = true;                              // كتاب ممسوح: كل صفحة غير سليمة تتقرأ
        else if (p.q.reason !== 'short') need = true;            // نص تالف/معكوس/متقطع
        else if (p.q.len < 100) {                                 // صفحة قصيرة في كتاب نصي: نقرأها بس لو فيها صور
            const pg = await pdf.getPage(p.page);
            need = await pageHasImages(pdfjs, pg);
            pg.cleanup();
        }
        if (need) {
            ocr.push({
                key: `p${p.page}`, page: p.page, mode: 'replace', badText: p.q.reason !== 'short',
                get: async () => { const pg = await pdf.getPage(p.page); try { return await renderPdfPageToJpeg(pg); } finally { pg.cleanup(); } }
            });
        }
    }

    const outline = await pdfOutline(pdf);
    const units = pages.map((p) => ({ page: p.page, text: p.text }));
    return {
        kind: 'pdf', units, ocr, outline, pageCount: n, textBased,
        dispose: () => { try { pdf.destroy(); } catch (e) { /* تجاهل */ } }
    };
}

// ---------------------------------------------------------------------------
// استخراج Word / PowerPoint (ZIP + XML)
// ---------------------------------------------------------------------------

const NS = {
    w: 'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
    a: 'http://schemas.openxmlformats.org/drawingml/2006/main',
    p: 'http://schemas.openxmlformats.org/presentationml/2006/main',
    r: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
    rel: 'http://schemas.openxmlformats.org/package/2006/relationships',
    v: 'urn:schemas-microsoft-com:vml'
};

function parseXml(str) {
    const doc = new DOMParser().parseFromString(str, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) throw new BookProcessError('ملف تالف (تعذّرت قراءة محتواه).');
    return doc;
}

function childrenByLocal(node, local) {
    return Array.from(node.children || []).filter((c) => c.localName === local);
}

async function zipText(zip, path) {
    const f = zip.file(path);
    return f ? await f.async('string') : null;
}

function parseRels(xml) {
    const map = new Map();
    if (!xml) return map;
    const doc = parseXml(xml);
    for (const rel of Array.from(doc.getElementsByTagNameNS(NS.rel, 'Relationship'))) {
        map.set(rel.getAttribute('Id'), { target: rel.getAttribute('Target') || '', type: rel.getAttribute('Type') || '', mode: rel.getAttribute('TargetMode') });
    }
    return map;
}

function resolveZipPath(baseDir, target) {
    if (!target) return null;
    const parts = target.startsWith('/') ? target.slice(1).split('/') : (baseDir + '/' + target).split('/');
    const out = [];
    for (const p of parts) {
        if (p === '..') out.pop();
        else if (p && p !== '.') out.push(p);
    }
    return out.join('/');
}

const RASTER_EXT = /\.(png|jpe?g|webp|gif|bmp)$/i;

function makeZipImageTask(zip, path, key, page, mode) {
    return {
        key, page, mode, zipPath: path,
        get: async () => {
            const file = zip.file(path);
            if (!file) return { skip: true };
            const bytes = await file.async('uint8array');
            const ext = (path.split('.').pop() || 'png').toLowerCase();
            const mime = ext === 'jpg' ? 'image/jpeg' : `image/${ext}`;
            return await imageBlobToOcrPayload(new Blob([bytes], { type: mime }), { minSide: 200 });
        }
    };
}

async function extractDocx(buffer, { signal, onStep }) {
    const JSZip = await loadJsZip();
    let zip;
    try { zip = await JSZip.loadAsync(buffer); } catch (e) { throw new BookProcessError('تعذّر فتح ملف Word (ممكن يكون تالفًا أو بصيغة .doc القديمة - احفظه كـ .docx).'); }
    const docXml = await zipText(zip, 'word/document.xml');
    if (!docXml) throw new BookProcessError('ملف Word غير صالح (لا يحتوي على word/document.xml).');
    const rels = parseRels(await zipText(zip, 'word/_rels/document.xml.rels'));
    const doc = parseXml(docXml);
    const body = doc.getElementsByTagNameNS(NS.w, 'body')[0];
    if (!body) throw new BookProcessError('ملف Word فارغ.');

    const blocks = [];      // { text, pageBreakBefore, imageRefs }
    let pendingBreak = false;

    const paragraph = (p) => {
        let text = '';
        let softBreak = false;
        const imageRefs = [];
        const walk = (node) => {
            for (const ch of Array.from(node.children || [])) {
                const ln = ch.localName;
                if (ln === 't') text += ch.textContent;
                else if (ln === 'tab') text += '\t';
                else if (ln === 'br' || ln === 'cr') {
                    if (ch.getAttributeNS(NS.w, 'type') === 'page') pendingBreak = true; else text += '\n';
                } else if (ln === 'lastRenderedPageBreak') softBreak = true;
                else if (ln === 'blip') {
                    const rid = ch.getAttributeNS(NS.r, 'embed');
                    if (rid) imageRefs.push(rid);
                } else if (ln === 'imagedata') {
                    const rid = ch.getAttributeNS(NS.r, 'id');
                    if (rid) imageRefs.push(rid);
                } else if (ln === 'del' || ln === 'delText') continue;
                else walk(ch);
            }
        };
        walk(p);
        const ppr = childrenByLocal(p, 'pPr')[0];
        let heading = 0;
        if (ppr) {
            const st = childrenByLocal(ppr, 'pStyle')[0];
            const val = st ? (st.getAttributeNS(NS.w, 'val') || '') : '';
            const m = val.match(/^(?:heading|Heading|العنوان|عنوان)\s*(\d)$/) || null;
            if (/^(title|Title)$/.test(val)) heading = 1;
            else if (m) heading = Math.min(4, parseInt(m[1], 10));
            const ol = childrenByLocal(ppr, 'outlineLvl')[0];
            if (!heading && ol) { const lv = parseInt(ol.getAttributeNS(NS.w, 'val'), 10); if (lv >= 0 && lv <= 3) heading = lv + 1; }
            if (childrenByLocal(ppr, 'pageBreakBefore')[0]) pendingBreak = true;
        }
        text = text.replace(/[ \t]+\n/g, '\n').trim();
        return { text, heading, softBreak, imageRefs };
    };

    const handle = (node) => {
        for (const ch of Array.from(node.children || [])) {
            const ln = ch.localName;
            if (ln === 'p') {
                const { text, heading, softBreak, imageRefs } = paragraph(ch);
                if (!text && imageRefs.length === 0) continue;
                blocks.push({
                    text: text ? (heading ? `${'#'.repeat(heading)} ${text}` : text) : '',
                    pageBreakBefore: pendingBreak || softBreak,
                    imageRefs
                });
                pendingBreak = false;
            } else if (ln === 'tbl') {
                for (const tr of childrenByLocal(ch, 'tr')) {
                    const cells = childrenByLocal(tr, 'tc').map((tc) => {
                        const sub = [];
                        for (const p of childrenByLocal(tc, 'p')) sub.push(paragraph(p).text);
                        return sub.filter(Boolean).join(' ');
                    });
                    const row = cells.filter(Boolean).join(' | ');
                    if (row) blocks.push({ text: row, pageBreakBefore: false, imageRefs: [] });
                }
            } else if (ln === 'sdt' || ln === 'sdtContent' || ln === 'customXml') {
                handle(ch);
            }
        }
    };
    handle(body);
    onStep(0.6);
    throwIfAborted(signal);

    const textChars = blocks.reduce((s, b) => s + b.text.length, 0);
    const allRefs = blocks.flatMap((b) => b.imageRefs);
    const imageTargets = new Map(); // rid -> zipPath (rasters only)
    for (const rid of new Set(allRefs)) {
        const rel = rels.get(rid);
        const path = rel && rel.mode !== 'External' ? resolveZipPath('word', rel.target) : null;
        if (path && RASTER_EXT.test(path) && zip.file(path)) imageTargets.set(rid, path);
    }
    // ملف "مصوّر": صور كتير ونص قليل بالنسبة لها → الصور هي المحتوى الحقيقي
    const scannedLike = imageTargets.size > 0 && (textChars / imageTargets.size) < 800;

    const ocr = [];
    if (scannedLike) {
        let k = 0;
        for (const b of blocks) {
            const tokens = [];
            for (const rid of b.imageRefs) {
                const path = imageTargets.get(rid);
                if (!path) continue;
                const key = `d${k++}`;
                tokens.push(OCR_TOKEN(key));
                ocr.push({ ...makeZipImageTask(zip, path, key, null, 'token') });
            }
            if (tokens.length) {
                b.text = [b.text, ...tokens].filter(Boolean).join('\n\n');
                b.pageBreakBefore = true;   // كل صورة مصوّرة = صفحة جديدة تقريبًا
            }
        }
    }
    const units = paginateBlocks(blocks.filter((b) => b.text).map((b) => ({ text: b.text, pageBreakBefore: b.pageBreakBefore })));
    return { kind: 'docx', units, ocr, outline: null, pageCount: units.length, textBased: !scannedLike, dispose: () => {} };
}

function paragraphsText(container) {
    const out = [];
    for (const p of Array.from(container.getElementsByTagNameNS(NS.a, 'p'))) {
        let t = '';
        const walk = (n) => {
            for (const ch of Array.from(n.children || [])) {
                if (ch.localName === 't') t += ch.textContent;
                else if (ch.localName === 'br') t += '\n';
                else walk(ch);
            }
        };
        walk(p);
        t = t.trim();
        if (t) out.push(t);
    }
    return out;
}

async function extractPptx(buffer, { signal, onStep }) {
    const JSZip = await loadJsZip();
    let zip;
    try { zip = await JSZip.loadAsync(buffer); } catch (e) { throw new BookProcessError('تعذّر فتح ملف PowerPoint (ممكن يكون تالفًا أو بصيغة .ppt القديمة - احفظه كـ .pptx).'); }

    // ترتيب الشرائح الحقيقي من presentation.xml
    let slidePaths = [];
    try {
        const presXml = await zipText(zip, 'ppt/presentation.xml');
        const presRels = parseRels(await zipText(zip, 'ppt/_rels/presentation.xml.rels'));
        if (presXml) {
            const pres = parseXml(presXml);
            for (const id of Array.from(pres.getElementsByTagNameNS(NS.p, 'sldId'))) {
                const rel = presRels.get(id.getAttributeNS(NS.r, 'id'));
                const path = rel ? resolveZipPath('ppt', rel.target) : null;
                if (path && zip.file(path)) slidePaths.push(path);
            }
        }
    } catch (e) { slidePaths = []; }
    if (slidePaths.length === 0) {
        slidePaths = Object.keys(zip.files)
            .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
            .sort((a, b) => parseInt(a.match(/(\d+)\.xml$/)[1], 10) - parseInt(b.match(/(\d+)\.xml$/)[1], 10));
    }
    if (slidePaths.length === 0) throw new BookProcessError('ملف PowerPoint لا يحتوي على شرائح.');
    if (slidePaths.length > S().MAX_UNITS) throw new BookProcessError(`العرض كبير جدًا (${slidePaths.length} شريحة).`);

    const units = [];
    const ocr = [];
    for (let i = 0; i < slidePaths.length; i++) {
        throwIfAborted(signal);
        const path = slidePaths[i];
        const xml = parseXml(await zipText(zip, path));
        const dir = path.split('/').slice(0, -1).join('/');
        const file = path.split('/').pop();
        const rels = parseRels(await zipText(zip, `${dir}/_rels/${file}.rels`));
        const spTree = xml.getElementsByTagNameNS(NS.p, 'spTree')[0];
        const lines = [];
        const imgRefs = [];
        const walk = (node) => {
            for (const ch of Array.from(node.children || [])) {
                const ln = ch.localName;
                if (ln === 'sp') {
                    const ph = ch.getElementsByTagNameNS(NS.p, 'ph')[0];
                    const type = ph ? (ph.getAttribute('type') || '') : '';
                    const paras = paragraphsText(ch);
                    if (!paras.length) continue;
                    if (type === 'title' || type === 'ctrTitle') lines.push(`# ${paras.join(' ')}`);
                    else if (type === 'sldNum' || type === 'dt' || type === 'ftr') continue;
                    else lines.push(paras.join('\n'));
                } else if (ln === 'graphicFrame') {
                    for (const tr of Array.from(ch.getElementsByTagNameNS(NS.a, 'tr'))) {
                        const cells = Array.from(tr.getElementsByTagNameNS(NS.a, 'tc')).map((tc) => paragraphsText(tc).join(' ')).filter(Boolean);
                        if (cells.length) lines.push(cells.join(' | '));
                    }
                } else if (ln === 'pic') {
                    for (const b of Array.from(ch.getElementsByTagNameNS(NS.a, 'blip'))) {
                        const rid = b.getAttributeNS(NS.r, 'embed');
                        if (rid) imgRefs.push(rid);
                    }
                } else if (ln === 'grpSp') walk(ch);
            }
        };
        if (spTree) walk(spTree);

        // ملاحظات المتحدث (Speaker notes)
        for (const rel of rels.values()) {
            if (/notesSlide$/.test(rel.type)) {
                const np = resolveZipPath(dir, rel.target);
                const nx = np ? await zipText(zip, np) : null;
                if (nx) {
                    const nd = parseXml(nx);
                    const notes = [];
                    for (const sp of Array.from(nd.getElementsByTagNameNS(NS.p, 'sp'))) {
                        const ph = sp.getElementsByTagNameNS(NS.p, 'ph')[0];
                        if (ph && ph.getAttribute('type') === 'body') notes.push(...paragraphsText(sp));
                    }
                    if (notes.length) lines.push('ملاحظات المحاضر: ' + notes.join(' '));
                }
            }
        }

        let text = lines.join('\n\n');
        const chars = text.replace(/\s+/g, '').length;
        // شريحة عبارة عن صورة (مصوّرة) → نقرأ صورها
        if (chars < 40 && imgRefs.length) {
            const tokens = [];
            let k = 0;
            for (const rid of new Set(imgRefs)) {
                const rel = rels.get(rid);
                const ip = rel && rel.mode !== 'External' ? resolveZipPath(dir, rel.target) : null;
                if (ip && RASTER_EXT.test(ip) && zip.file(ip)) {
                    const key = `s${i + 1}_${k++}`;
                    tokens.push(OCR_TOKEN(key));
                    ocr.push(makeZipImageTask(zip, ip, key, i + 1, 'token'));
                    if (k >= 3) break;
                }
            }
            text = [text, ...tokens].filter(Boolean).join('\n\n');
        }
        units.push({ page: i + 1, text });
        if (i % 3 === 0 || i === slidePaths.length - 1) onStep((i + 1) / slidePaths.length);
    }
    return { kind: 'pptx', units, ocr, outline: null, pageCount: slidePaths.length, textBased: ocr.length === 0, dispose: () => {} };
}

// ---------------------------------------------------------------------------
// نص عادي + صورة
// ---------------------------------------------------------------------------

function decodeText(buffer) {
    try { return new TextDecoder('utf-8', { fatal: true }).decode(buffer); } catch (e) { /* مش UTF-8 */ }
    try { return new TextDecoder('windows-1256').decode(buffer); } catch (e) { /* تجاهل */ }
    return new TextDecoder('utf-8').decode(buffer);
}

async function extractTxt(buffer) {
    const text = decodeText(buffer).replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
    let paras = text.split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean);
    if (paras.length <= 1) paras = text.split('\n').map((s) => s.trim()).filter(Boolean);
    const units = paginateBlocks(paras.map((t) => ({ text: t })));
    return { kind: 'txt', units, ocr: [], outline: null, pageCount: units.length, textBased: true, dispose: () => {} };
}

async function extractImage(buffer, { mime }) {
    const blob = new Blob([buffer], { type: mime || 'image/jpeg' });
    return {
        kind: 'image',
        units: [{ page: 1, text: '' }],
        ocr: [{ key: 'img1', page: 1, mode: 'replace', get: () => imageBlobToOcrPayload(blob) }],
        outline: null, pageCount: 1, textBased: false, dispose: () => {}
    };
}

// ---------------------------------------------------------------------------
// OCR على دفعات
// ---------------------------------------------------------------------------

async function runOcr({ api, bookId, tasks, signal, report, cachePrefix }) {
    const results = new Map();     // key -> text
    const failed = [];             // keys اتعذّرت
    let done = 0;
    const total = tasks.length;
    let limitHit = false;

    const bump = (msg) => report(done / total, msg);

    // 1) اللي اتقرأ قبل كده (كاش)
    const pending = [];
    for (const t of tasks) {
        const cached = await OcrCache.get(cachePrefix + t.key);
        if (cached !== undefined) { results.set(t.key, cached); done++; } else pending.push(t);
    }
    if (done) bump(`تم استرجاع ${done} صفحة مقروءة سابقًا`);

    // 2) الباقي: نجهّز صورة كل صفحة ونبعتها في دفعات صغيرة
    let batch = [];
    let batchBytes = 0;
    const flush = async () => {
        if (!batch.length) return;
        const current = batch;
        batch = []; batchBytes = 0;
        await sendBatch(current);
    };

    const sendBatch = async (items) => {
        const payload = items.map((it, i) => ({ page: i + 1, mime: it.img.mime, data: it.img.data }));
        // الـ "page" في الطلب رقم مؤقت داخل الدفعة (1..N) عشان مايتعارضش مع أرقام صفحات الكتاب
        let res;
        try {
            res = await withRetry(
                () => api.ocrBookPages(bookId, payload, { signal }),
                { signal, tries: 4, onWait: (a, ms, code) => report(done / total, code === 'BUSY' ? 'الخدمة مشغولة، جاري إعادة المحاولة...' : 'مشكلة مؤقتة، جاري إعادة المحاولة...') }
            );
        } catch (err) {
            if (err && err.aborted) throw err;
            if (errCode(err) === 'DAILY_LIMIT') { limitHit = true; return; }
            if (errCode(err) === 'NOT_PROCESSING' || errCode(err) === 'NOT_FOUND') throw new BookProcessError(errMessage(err), errCode(err));
            // دفعة فشلت بعد المحاولات: نعتبر صفحاتها فاشلة (وممكن نعيدها فرادى تحت)
            res = { pages: [], missing: payload.map((p) => p.page), failedBatch: true };
        }
        const byTemp = new Map((res.pages || []).map((p) => [p.page, p.text || '']));
        const missing = [];
        items.forEach((it, i) => {
            const tmp = i + 1;
            if (byTemp.has(tmp)) return;
            missing.push(it);
        });
        for (const [tmp, text] of byTemp) {
            const it = items[tmp - 1];
            if (!it) continue;
            results.set(it.task.key, text);
            await OcrCache.set(cachePrefix + it.task.key, text);
            done++;
        }
        bump();
        // الصفحات الناقصة: محاولة واحدة فرادى (بتنجح كتير لما الدفعة كانت كبيرة على الموديل)
        if (items.length > 1) {
            for (const it of missing) {
                throwIfAborted(signal);
                if (limitHit) { failed.push(it.task.key); continue; }
                try {
                    const r1 = await withRetry(
                        () => api.ocrBookPages(bookId, [{ page: 1, mime: it.img.mime, data: it.img.data }], { signal }),
                        { signal, tries: 2 }
                    );
                    const got = (r1.pages || []).find((p) => p.page === 1);
                    if (got) { results.set(it.task.key, got.text || ''); await OcrCache.set(cachePrefix + it.task.key, got.text || ''); done++; bump(); }
                    else failed.push(it.task.key);
                } catch (err) {
                    if (err && err.aborted) throw err;
                    if (errCode(err) === 'DAILY_LIMIT') { limitHit = true; }
                    failed.push(it.task.key);
                }
            }
        } else {
            for (const it of missing) failed.push(it.task.key);
        }
    };

    for (const task of pending) {
        throwIfAborted(signal);
        if (limitHit) { failed.push(task.key); continue; }
        let img;
        try { img = await task.get(); } catch (e) { img = { skip: true }; }
        if (!img || img.skip) { results.set(task.key, ''); done++; bump(); continue; }   // صورة غير صالحة/صغيرة: نتخطاها
        if (img.blank) { results.set(task.key, ''); await OcrCache.set(cachePrefix + task.key, ''); done++; bump(); continue; }   // صفحة فاضية
        if (batch.length >= S().OCR_BATCH_PAGES || (batch.length && batchBytes + img.data.length > OCR_BATCH_BYTES)) await flush();
        batch.push({ task, img });
        batchBytes += img.data.length;
    }
    await flush();
    return { results, failed, limitHit };
}

// ---------------------------------------------------------------------------
// الفصول (للعرض في بطاقة الكتاب)
// ---------------------------------------------------------------------------

function chaptersFrom(outline, chunks) {
    if (outline && outline.length) {
        return outline.slice(0, 500).map((o) => ({ title: o.title, page: o.page, level: o.level || 1 }));
    }
    const out = [];
    let lastTitle = null;
    for (const c of chunks) {
        if (c.chapter && c.chapter !== lastTitle) {
            out.push({ title: c.chapter, page: c.page || null, level: 1 });
            lastTitle = c.chapter;
            if (out.length >= 500) break;
        }
    }
    return out;
}

// ---------------------------------------------------------------------------
// الدالة الرئيسية
// ---------------------------------------------------------------------------

/**
 * @param {object} p
 * @param {object} p.api        كائن api (js/api.js)
 * @param {{id:string,file_type:string}} p.book
 * @param {File|Blob} [p.file]  الملف (لو متاح محليًا) - وإلا بنحمّله من التخزين
 * @param {(info:{stage:string,percent:number,message:string,ocrPages?:number})=>void} [p.onProgress]
 * @param {AbortSignal} [p.signal]
 * @returns {Promise<{chunkCount:number,pageCount:number,isScanned:boolean,ocrPages:number,failedPages:number}>}
 */
export async function processBook({ api, book, file, onProgress, signal }) {
    const bookId = book.id;
    const fileType = book.file_type;
    const cachePrefix = `${bookId}:`;
    let last = -1;
    const emit = (stage, percent, message, extra = {}) => {
        const p = Math.max(0, Math.min(100, Math.round(percent)));
        if (p < last && stage !== 'plan') return;   // التقدّم مايرجعش لورا
        last = Math.max(last, p);
        if (onProgress) onProgress({ stage, percent: p, message, ...extra });
    };
    let extracted = null;
    let started = false;

    try {
        emit('start', 1, 'جاري بدء المعالجة...');
        try {
            await api.startBookProcessing(bookId, { file_type: fileType });
            started = true;
        } catch (err) {
            throw new BookProcessError(errMessage(err) + (errCode(err) ? '' : ' — تأكد إنك استوردت n8n/process-book.json الجديد.'), errCode(err) || 'START_FAILED');
        }
        throwIfAborted(signal);

        // ---- تحميل الملف (لو مش متاح محليًا) ----
        let buffer;
        let mime = '';
        if (file) {
            buffer = await file.arrayBuffer();
            mime = file.type || '';
        } else {
            emit('download', 2, 'جاري تحميل الملف...');
            const res = await api.fetchBookFile(book.storage_path, {
                signal,
                onProgress: (loaded, total) => { if (total) emit('download', 2 + (loaded / total) * 6, 'جاري تحميل الملف...'); }
            });
            buffer = res.buffer;
            mime = res.contentType || '';
        }
        throwIfAborted(signal);

        // ---- استخراج النص ----
        emit('extract', 8, 'جاري قراءة الملف...');
        const step = (f) => emit('extract', 8 + f * 12, 'جاري قراءة صفحات الملف...');
        const ctx = { signal, onStep: step, mime };
        if (fileType === 'pdf') extracted = await extractPdf(buffer, ctx);
        else if (fileType === 'docx') extracted = await extractDocx(buffer, ctx);
        else if (fileType === 'pptx') extracted = await extractPptx(buffer, ctx);
        else if (fileType === 'txt') extracted = await extractTxt(buffer);
        else if (fileType === 'image') extracted = await extractImage(buffer, ctx);
        else throw new BookProcessError('نوع ملف غير مدعوم.');
        throwIfAborted(signal);

        const ocrTasks = extracted.ocr;
        if (ocrTasks.length > S().MAX_OCR_PAGES) {
            throw new BookProcessError(`الكتاب ممسوح ضوئيًا وعدد صفحاته اللي محتاجة قراءة (${ocrTasks.length}) أكبر من الحد المسموح (${S().MAX_OCR_PAGES}). قسّم الملف لأجزاء.`);
        }
        const hasOcr = ocrTasks.length > 0;
        emit('plan', 20, hasOcr ? `الكتاب محتاج قراءة ${ocrTasks.length} صفحة بالذكاء الاصطناعي` : 'النص واضح - مفيش حاجة للقراءة الضوئية', { ocrPages: ocrTasks.length, pageCount: extracted.pageCount });

        // ---- OCR ----
        let ocrResults = new Map();
        let failedKeys = [];
        if (hasOcr) {
            const r = await runOcr({
                api, bookId, tasks: ocrTasks, signal, cachePrefix,
                report: (f, msg) => emit('ocr', 20 + f * 50, msg || `جاري قراءة الصفحات بالذكاء الاصطناعي (${Math.round(f * 100)}%)`, { ocrPages: ocrTasks.length })
            });
            ocrResults = r.results;
            failedKeys = r.failed;
            if (r.limitHit) {
                throw new BookProcessError(`وصلت للحد اليومي لقراءة الصفحات بالذكاء الاصطناعي (اتقرأ ${ocrResults.size} من ${ocrTasks.length} صفحة). الصفحات دي اتحفظت، أعد المعالجة بكرة وهتكمل من حيث توقفت.`, 'DAILY_LIMIT');
            }
            if (failedKeys.length > ocrTasks.length * 0.4) {
                throw new BookProcessError(`تعذّرت قراءة أغلب الصفحات (${failedKeys.length} من ${ocrTasks.length}). جرّب إعادة المعالجة، أو ارفع نسخة أوضح من الكتاب.`, 'OCR_FAILED');
            }
        }

        // ---- دمج نص الـ OCR ----
        const units = extracted.units.map((u) => ({ page: u.page, text: u.text }));
        const byPage = new Map(units.map((u) => [u.page, u]));
        for (const t of ocrTasks) {
            const text = ocrResults.get(t.key);
            if (text === undefined) continue;
            if (t.mode === 'replace') {
                const u = byPage.get(t.page);
                if (u) u.text = text;
            }
        }
        // صفحة نصها تالف (معكوس/رموز) وفشلت قراءتها: نمسح النص التالف بدل ما نفهرسه
        for (const t of ocrTasks) {
            if (t.mode === 'replace' && t.badText && failedKeys.includes(t.key)) {
                const u = byPage.get(t.page);
                if (u) u.text = '';
            }
        }
        for (const u of units) {
            if (u.text.includes('⟦OCR:')) {
                u.text = u.text.replace(OCR_TOKEN_RE, (m, key) => ocrResults.get(key) || '');
            }
        }
        // docx: الصفحات اللي كلها صور اتحوّلت لنص → ممكن تبقى فاضية لو الـ OCR فشل
        const finalUnits = units.filter((u) => normalizeText(u.text));

        // ---- التقطيع ----
        emit('chunk', 71, 'جاري تقسيم النص لمقاطع...');
        // مقاطع أكبر شوية (≈1300 حرف) = طلبات embedding أقل (حصة Gemini المجانية محدودة يوميًا)
        const chunks = chunkUnits(finalUnits, {
            targetChars: 1300, maxChars: 1900, overlapChars: 150,
            outline: extracted.outline && extracted.outline.length ? extracted.outline : null
        });
        if (chunks.length === 0) {
            throw new BookProcessError(hasOcr
                ? 'لم يتم استخراج أي نص من الكتاب حتى بعد القراءة الضوئية. تأكد إن الصور واضحة.'
                : 'لم يتم استخراج أي نص قابل للفهرسة من هذا الملف.');
        }

        // ---- الفهرسة على دفعات ----
        const size = S().INDEX_BATCH_CHUNKS;
        const batches = Math.ceil(chunks.length / size);
        for (let b = 0; b < batches; b++) {
            throwIfAborted(signal);
            const slice = chunks.slice(b * size, (b + 1) * size);
            const pct = 72 + ((b + 1) / batches) * 26;
            emit('index', 72 + (b / batches) * 26, `جاري فهرسة الكتاب (${b + 1}/${batches})...`);
            await withRetry(
                () => api.indexBookChunks(bookId, slice, { progress: Math.round(pct) }, { signal }),
                // حد Gemini للـ embedding (طلبات/دقيقة و tokens/دقيقة) ممكن يرجّع BUSY: نستنى أطول (15ث، 30ث، ...)
                { signal, tries: 6, busyWaitMs: 15000, onWait: (a, ms, code) => emit('index', 72 + (b / batches) * 26, code === 'BUSY' ? 'حد الفهرسة اللحظي وصل، هنكمل بعد ثواني...' : 'مشكلة مؤقتة، جاري إعادة المحاولة...') }
            ).catch((err) => {
                if (err && err.aborted) throw err;
                throw new BookProcessError(errMessage(err), errCode(err) || 'INDEX_FAILED');
            });
        }

        // ---- إنهاء ----
        emit('finish', 99, 'جاري إنهاء المعالجة...');
        const chapters = chaptersFrom(extracted.outline, chunks);
        const fin = await api.finishBook(bookId, {
            status: 'ready',
            page_count: extracted.pageCount,
            chapters,
            is_scanned: hasOcr && !extracted.textBased,
            ocr_page_count: ocrResults.size ? Array.from(ocrResults.values()).filter(Boolean).length : 0
        });
        if (fin && fin.status && fin.status !== 'ready') {
            throw new BookProcessError(fin.error_message || 'لم يتم استخراج أي نص قابل للفهرسة من هذا الملف.');
        }
        await OcrCache.clear(cachePrefix);
        emit('done', 100, 'تم تحليل الكتاب');
        return {
            chunkCount: chunks.length,
            pageCount: extracted.pageCount,
            isScanned: hasOcr && !extracted.textBased,
            ocrPages: ocrResults.size,
            failedPages: failedKeys.length
        };
    } catch (err) {
        const aborted = !!(err && (err.aborted || err.name === 'AbortError'));
        const message = aborted ? 'تم إلغاء المعالجة. تقدر تعيدها من بطاقة الكتاب.' : errMessage(err);
        if (started) {
            try { await api.finishBook(bookId, { status: 'failed', error_message: message }); } catch (e) { /* تجاهل */ }
        }
        if (err instanceof BookProcessError) throw err;
        const wrapped = new BookProcessError(message, errCode(err) || 'PROCESS_ERROR');
        wrapped.aborted = aborted;
        throw wrapped;
    } finally {
        if (extracted && extracted.dispose) extracted.dispose();
    }
}
