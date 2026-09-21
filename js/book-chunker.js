/**
 * book-chunker.js - دوال نقية (بدون DOM ولا شبكة) لتجهيز نص الكتاب للفهرسة
 *
 *   normalizeText      → تنظيف النص (أشكال الحروف العربية، رموز التحكم، المسافات)
 *   assessTextQuality  → هل النص المستخرج من الصفحة سليم؟ ولا محتاج قراءة بالذكاء الاصطناعي (OCR)؟
 *   chunkUnits         → تقطيع صفحات/شرائح الكتاب لمقاطع متماسكة (مع الفصل ورقم الصفحة)
 *
 * ملاحظة: الكود عمدًا بيتجنب regex lookbehind لأن سفاري القديم (قبل 16.4) بيفشل
 * في تحميل الملف كله لو لقاها، وده كان هيعطّل صفحة الكتب على بعض أجهزة الآيفون.
 */

const AR_CHAR = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/;
const AR_CHAR_G = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/g;

// كلمات عربية شائعة جدًا بالاتجاه الصحيح مقابل نفس الكلمات مقلوبة (بيحصل في بعض ملفات PDF
// اللي مخزّنة بترتيب بصري بدل الترتيب المنطقي فبتطلع الكلمة معكوسة عند الاستخراج)
const AR_FORWARD = new Set(['في', 'من', 'على', 'إلى', 'الى', 'أن', 'هذا', 'التي', 'الذي', 'عن', 'كان', 'مع', 'لم', 'قد', 'ثم']);
const AR_REVERSED = new Set(['يف', 'نم', 'ىلع', 'ىلإ', 'ىلا', 'نأ', 'اذه', 'يتلا', 'يذلا', 'نع', 'ناك', 'عم', 'مل', 'دق', 'مث']);

/** تنظيف نص خام (من PDF أو Word أو OCR) قبل الفهرسة */
export function normalizeText(input) {
    let s = String(input === null || input === undefined ? '' : input);
    // أشكال العرض العربية (FB50–FDFF / FE70–FEFF) → الحروف الأساسية (ﻻ → لا، ﷲ → الله)
    s = s.replace(/[\uFB50-\uFDFF\uFE70-\uFEFF]+/g, (m) => m.normalize('NFKC'));
    s = s
        .replace(/\r\n?/g, '\n')
        // رموز تحكم + علامات الاتجاه غير المرئية + الواصلة الناعمة + BOM
        .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF\u00AD]/g, '')
        .replace(/\u00A0/g, ' ')
        .replace(/[ \t]+/g, ' ')
        .replace(/ *\n */g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
    return s;
}

/**
 * تقييم جودة نص صفحة مستخرج (مثلًا من PDF.js).
 * النتيجة: { ok, reason, len } - reason ∈ short | garbled | reversed | fragmented
 * لو ok=false يبقى الأفضل نقرأ الصفحة بالذكاء الاصطناعي (OCR) بدل الاعتماد على النص المستخرج.
 */
export function assessTextQuality(rawText, { minChars = 100 } = {}) {
    const t = normalizeText(rawText);
    const compact = t.replace(/\s+/g, '');
    const len = compact.length;
    if (len < minChars) return { ok: false, reason: 'short', len };

    let bad = 0;
    for (const ch of compact) {
        const c = ch.codePointAt(0);
        if (c === 0xFFFD || (c >= 0xE000 && c <= 0xF8FF) || (c >= 0x80 && c <= 0x9F)) bad++;
    }
    if (bad / len > 0.03) return { ok: false, reason: 'garbled', len };

    const arCount = (compact.match(AR_CHAR_G) || []).length;
    if (arCount / len > 0.3) {
        const tokens = t.split(/[\s\u060C\u061B.,:;!?()\[\]{}"«»\-–—_/\\|]+/).filter(Boolean);
        let fwd = 0;
        let rev = 0;
        for (const tok of tokens) {
            if (AR_FORWARD.has(tok)) fwd++;
            else if (AR_REVERSED.has(tok)) rev++;
        }
        if (rev >= 3 && rev > fwd) return { ok: false, reason: 'reversed', len };

        const arTokens = tokens.filter((tk) => AR_CHAR.test(tk));
        if (arTokens.length >= 30) {
            const single = arTokens.filter((tk) => tk.length === 1).length;
            if (single / arTokens.length > 0.35) return { ok: false, reason: 'fragmented', len };
        }
    }
    return { ok: true, reason: null, len };
}

/** اتجاه النص الغالب ('rtl' أو 'ltr') */
export function detectDir(text) {
    const s = String(text || '');
    const ar = (s.match(AR_CHAR_G) || []).length;
    const latin = (s.match(/[A-Za-z]/g) || []).length;
    return ar >= latin ? 'rtl' : 'ltr';
}

// ---------------------------------------------------------------------------
// التقطيع
// ---------------------------------------------------------------------------

const HEADING_RE = /^(#{1,4})\s+(.+?)\s*#*\s*$/;

function hasContent(s) {
    return /[\p{L}\p{N}]/u.test(s);
}

/** تقسيم فقرة طويلة لجمل (ثم لكتل بطول أقصى لو مفيش علامات ترقيم) */
function splitLongParagraph(text, maxChars) {
    const pieces = [];
    const sentences = text.match(/[^.!?؟…؛\n]+[.!?؟…؛]*\s*/g) || [text];
    let cur = '';
    const pushCur = () => { if (cur.trim()) pieces.push(cur.trim()); cur = ''; };
    for (const sRaw of sentences) {
        const s = sRaw;
        if (s.length > maxChars) {
            pushCur();
            // جملة أطول من الحد بدون علامات ترقيم: نقطعها عند أقرب مسافة
            let rest = s;
            while (rest.length > maxChars) {
                let cut = rest.lastIndexOf(' ', maxChars);
                if (cut < maxChars * 0.5) cut = maxChars;
                pieces.push(rest.slice(0, cut).trim());
                rest = rest.slice(cut);
            }
            cur = rest;
            continue;
        }
        if ((cur + s).length > maxChars) pushCur();
        cur += s;
    }
    pushCur();
    return pieces;
}

/** آخر جزء من النص بطول تقريبي (يقطع عند حدود الكلمات) - بنستخدمه كتداخل (overlap) بين المقاطع */
function tailForOverlap(text, overlapChars) {
    if (!overlapChars || text.length <= overlapChars) return '';
    let tail = text.slice(text.length - overlapChars);
    const sp = tail.search(/\s/);
    if (sp > 0 && sp < tail.length - 20) tail = tail.slice(sp + 1);
    return tail.trim();
}

/** الفصل الحالي لصفحة معيّنة اعتمادًا على فهرس (outline) مسطّح: [{title, page, level}] */
export function chapterForPage(outline, page) {
    if (!Array.isArray(outline) || outline.length === 0 || !page) return null;
    let current = null;
    let parent = null;
    for (const item of outline) {
        if (item.page && item.page <= page) {
            if ((item.level || 1) <= 1) { parent = item; current = item; } else { current = item; }
        } else if (item.page && item.page > page) {
            break;
        }
    }
    if (!current) return null;
    const title = (current.level || 1) > 1 && parent && parent !== current ? `${parent.title} › ${current.title}` : current.title;
    return String(title).slice(0, 200);
}

/**
 * تقطيع وحدات الكتاب (صفحات/شرائح/أقسام) لمقاطع.
 * @param {Array<{page:number, text:string}>} units - بالترتيب
 * @param {object} opts - { targetChars, maxChars, overlapChars, minChars, maxChunks, outline }
 * @returns {Array<{chunk_index:number, chapter:string|null, page:number|null, content:string}>}
 */
export function chunkUnits(units, opts = {}) {
    const {
        targetChars = 900,
        maxChars = 1400,
        overlapChars = 120,
        minChars = 200,
        maxChunks = 8000,
        outline = null
    } = opts;

    const chunks = [];
    let chapter = null;
    let buf = '';
    let bufPage = null;
    let bufChapter = null;
    let carry = '';        // تداخل من المقطع السابق (بيتضاف قبل أول فقرة جديدة)
    let sectionStart = true; // أول مقطع بعد عنوان جديد مايتضافلوش تداخل من قسم تاني

    const pushChunk = (content, page, chap) => {
        const c = content.trim();
        if (!c || !hasContent(c) || chunks.length >= maxChunks) return;
        chunks.push({ chunk_index: chunks.length, chapter: chap || null, page: page || null, content: c });
    };

    const flush = ({ keepOverlap }) => {
        if (buf.trim()) {
            pushChunk(buf, bufPage, bufChapter);
            carry = keepOverlap ? tailForOverlap(buf, overlapChars) : '';
        }
        buf = '';
        bufPage = null;
        bufChapter = null;
    };

    const addParagraph = (text, page) => {
        if (!text) return;
        const pieces = text.length > maxChars ? splitLongParagraph(text, maxChars) : [text];
        for (const piece of pieces) {
            if (buf && (buf.length + piece.length + 2) > maxChars) flush({ keepOverlap: true });
            if (!buf) {
                buf = carry && !sectionStart ? `${carry}\n${piece}` : piece;
                carry = '';
                sectionStart = false;
                bufPage = page;
                bufChapter = chapter;
            } else {
                buf += `\n${piece}`;
            }
            if (buf.length >= targetChars) flush({ keepOverlap: true });
        }
    };

    for (const unit of units || []) {
        if (chunks.length >= maxChunks) break;
        const text = normalizeText(unit && unit.text);
        if (!text) continue;
        const page = unit.page || null;

        if (outline) {
            const oc = chapterForPage(outline, page);
            if (oc && oc !== chapter) {
                flush({ keepOverlap: false });
                chapter = oc;
                sectionStart = true;
            }
        }

        // فقرات: سطر فاضي = فاصل فقرة. الأسطر المتتالية جوه الفقرة بتتدمج بمسافة
        // إلا لو السطر قصير جدًا/قائمة (نقاط) فبنحافظ عليه سطر مستقل
        const rawLines = text.split('\n');
        let para = [];
        const flushPara = () => {
            if (para.length) {
                addParagraph(para.join('\n'), page);
                para = [];
            }
        };
        for (const line of rawLines) {
            const trimmed = line.trim();
            if (!trimmed) { flushPara(); continue; }
            const h = trimmed.match(HEADING_RE);
            if (h) {
                flushPara();
                flush({ keepOverlap: false });
                const level = h[1].length;
                const title = h[2].trim().slice(0, 200);
                if (level <= 2) { chapter = title; sectionStart = true; }
                addParagraph(title, page);
                continue;
            }
            para.push(trimmed);
        }
        flushPara();
    }
    flush({ keepOverlap: false });

    // دمج آخر مقطع صغير جدًا في اللي قبله (لو في نفس الفصل)
    if (chunks.length >= 2) {
        const last = chunks[chunks.length - 1];
        const prev = chunks[chunks.length - 2];
        if (last.content.length < minChars / 2 && prev.chapter === last.chapter && (prev.content.length + last.content.length) <= maxChars * 1.3) {
            prev.content = `${prev.content}\n${last.content}`;
            chunks.pop();
        }
    }
    return chunks;
}

/**
 * ترقيم "صفحات افتراضية" لنص متصل (Word/EPUB/TXT) بمعدل تقريبي لعدد الحروف في الصفحة.
 * blocks: [{ text, pageBreakBefore?:boolean }] → [{ page, text }]
 */
export function paginateBlocks(blocks, charsPerPage = 2200) {
    const units = [];
    let page = 1;
    let acc = [];
    let count = 0;
    const flush = () => {
        if (acc.length) units.push({ page, text: acc.join('\n\n') });
        acc = [];
        count = 0;
    };
    for (const b of blocks) {
        const text = b && b.text ? String(b.text) : '';
        if (b && b.pageBreakBefore && acc.length) { flush(); page++; }
        if (!text.trim()) continue;
        if (count > 0 && count + text.length > charsPerPage * 1.15) { flush(); page++; }
        acc.push(text);
        count += text.length;
    }
    flush();
    return units;
}
