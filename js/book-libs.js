/**
 * book-libs.js - تحميل مكتبات العرض والاستخراج عند الحاجة فقط (Lazy) من CDN
 *
 *   PDF.js        → عرض PDF واستخراج نصه/تحويل صفحاته لصور (للقراءة بالذكاء الاصطناعي)
 *   JSZip         → فك ضغط Word / PowerPoint / EPUB
 *   docx-preview  → عرض ملفات Word بنفس التنسيق
 *   pptx-preview  → عرض ملفات PowerPoint بنفس التنسيق
 *   pdf-lib       → تجميع صور الصفحات في ملف PDF واحد (كتب مصوّرة/ممسوحة ضوئيًا)
 *
 * كل مكتبة بتتحمّل مرة واحدة فقط وبتتخزّن في الذاكرة. لو فشل التحميل (نت ضعيف مثلًا)
 * بنرجّع خطأ عربي واضح وبنسمح بإعادة المحاولة (مش بنخزّن الفشل).
 */

const VERSIONS = {
    pdfjs: '5.6.205',
    jszip: '3.10.1',
    docx: '0.3.7',
    pptx: '1.0.7',
    pdflib: '1.17.1'
};

export const CDN = {
    pdfjsBase: `https://cdn.jsdelivr.net/npm/pdfjs-dist@${VERSIONS.pdfjs}/`,
    // نسخة legacy: بتشتغل على متصفحات أقدم (آيفون قديم مثلًا)
    pdfjs: `https://cdn.jsdelivr.net/npm/pdfjs-dist@${VERSIONS.pdfjs}/legacy/build/pdf.min.mjs`,
    pdfjsWorker: `https://cdn.jsdelivr.net/npm/pdfjs-dist@${VERSIONS.pdfjs}/legacy/build/pdf.worker.min.mjs`,
    pdfViewerCss: `https://cdn.jsdelivr.net/npm/pdfjs-dist@${VERSIONS.pdfjs}/web/pdf_viewer.css`,
    jszip: `https://cdn.jsdelivr.net/npm/jszip@${VERSIONS.jszip}/dist/jszip.min.js`,
    docxPreview: `https://cdn.jsdelivr.net/npm/docx-preview@${VERSIONS.docx}/dist/docx-preview.min.js`,
    pptxPreview: `https://cdn.jsdelivr.net/npm/pptx-preview@${VERSIONS.pptx}/+esm`,
    pdfLib: `https://cdn.jsdelivr.net/npm/pdf-lib@${VERSIONS.pdflib}/dist/pdf-lib.min.js`
};

const LOAD_TIMEOUT_MS = 30000;
const cache = new Map();

function once(key, factory) {
    if (!cache.has(key)) {
        cache.set(key, factory().catch((err) => {
            cache.delete(key); // مانخزنش الفشل - نسمح بإعادة المحاولة
            throw err;
        }));
    }
    return cache.get(key);
}

function withTimeout(promise, label) {
    let timer;
    const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`انتهت مهلة تحميل ${label}. تأكد من اتصالك بالإنترنت وحاول مرة أخرى.`)), LOAD_TIMEOUT_MS);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

export function loadScript(src, label = 'مكتبة العرض') {
    return withTimeout(new Promise((resolve, reject) => {
        const existing = document.querySelector(`script[data-lib="${src}"]`);
        if (existing && existing.dataset.loaded === '1') { resolve(); return; }
        if (existing) existing.remove();
        const el = document.createElement('script');
        el.src = src;
        el.async = true;
        el.dataset.lib = src;
        el.onload = () => { el.dataset.loaded = '1'; resolve(); };
        el.onerror = () => { el.remove(); reject(new Error(`تعذّر تحميل ${label}. تأكد من اتصالك بالإنترنت.`)); };
        document.head.appendChild(el);
    }), label);
}

export function loadStyle(href) {
    return new Promise((resolve) => {
        if (document.querySelector(`link[data-lib="${href}"]`)) { resolve(); return; }
        const el = document.createElement('link');
        el.rel = 'stylesheet';
        el.href = href;
        el.dataset.lib = href;
        el.onload = () => resolve();
        el.onerror = () => resolve(); // الـ CSS تجميلي هنا - مانوقفش العرض لو فشل
        document.head.appendChild(el);
    });
}

export function loadJsZip() {
    return once('jszip', async () => {
        if (window.JSZip) return window.JSZip;
        await loadScript(CDN.jszip, 'مكتبة فك الضغط');
        if (!window.JSZip) throw new Error('تعذّر تجهيز مكتبة فك الضغط.');
        return window.JSZip;
    });
}

export function loadPdfJs() {
    return once('pdfjs', async () => {
        const mod = await withTimeout(import(/* webpackIgnore: true */ CDN.pdfjs), 'قارئ PDF');
        const lib = (mod && mod.getDocument) ? mod : (mod && mod.default && mod.default.getDocument ? mod.default : null);
        if (!lib) throw new Error('تعذّر تجهيز قارئ PDF.');
        // PDF.js بيتعامل مع الـ worker من دومين تاني تلقائيًا (بيلفّه في Blob)
        lib.GlobalWorkerOptions.workerSrc = CDN.pdfjsWorker;
        return lib;
    });
}

/** إعدادات getDocument المشتركة (خطوط/CMaps من نفس نسخة المكتبة) */
export function pdfDocumentParams(extra = {}) {
    return {
        cMapUrl: `${CDN.pdfjsBase}cmaps/`,
        cMapPacked: true,
        standardFontDataUrl: `${CDN.pdfjsBase}standard_fonts/`,
        wasmUrl: `${CDN.pdfjsBase}wasm/`,
        iccUrl: `${CDN.pdfjsBase}iccs/`,
        isEvalSupported: false,
        ...extra
    };
}

export function loadDocxPreview() {
    return once('docx-preview', async () => {
        await loadJsZip();
        if (!window.docx || !window.docx.renderAsync) {
            await loadScript(CDN.docxPreview, 'عارض Word');
        }
        if (!window.docx || !window.docx.renderAsync) throw new Error('تعذّر تجهيز عارض Word.');
        return window.docx;
    });
}

export function loadPptxPreview() {
    return once('pptx-preview', async () => {
        const mod = await withTimeout(import(/* webpackIgnore: true */ CDN.pptxPreview), 'عارض PowerPoint');
        const lib = (mod && mod.init) ? mod : (mod && mod.default && mod.default.init ? mod.default : null);
        if (!lib) throw new Error('تعذّر تجهيز عارض PowerPoint.');
        return lib;
    });
}

export function loadPdfLib() {
    return once('pdf-lib', async () => {
        if (!window.PDFLib) await loadScript(CDN.pdfLib, 'مكتبة إنشاء PDF');
        if (!window.PDFLib) throw new Error('تعذّر تجهيز مكتبة إنشاء PDF.');
        return window.PDFLib;
    });
}
