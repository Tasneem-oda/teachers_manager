/**
 * md-lite.js - عارض ماركداون بسيط وآمن (XSS-safe) لردود الذكاء الاصطناعي والنصوص المستخرجة
 *
 * القاعدة الأساسية: أي نص بيتعمله escape الأول، وبعدين بنولّد إحنا بس وسوم HTML معروفة
 * (p, ul, ol, li, h3-h6, blockquote, pre, code, table, strong, em, br, hr, button.bc-cite)
 * فمفيش أي HTML جاي من الموديل أو من الكتاب نفسه بيتنفّذ في الصفحة.
 *
 * الاستشهادات: [مصدر 2] أو [مصدر 1، 3] بتتحول لأزرار صغيرة قابلة للضغط (class="bc-cite")
 * بتحمل رقم المصدر في data-n - وواجهة الشات هي اللي بتربطها بفتح الكتاب على الصفحة.
 */

export function escapeHtml(s) {
    return String(s === null || s === undefined ? '' : s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';
export function toAsciiDigits(str) {
    return String(str).replace(/[٠-٩]/g, (d) => String(AR_DIGITS.indexOf(d)));
}

const CITE_RE = /\[\s*(?:مصدر|المصدر|المصادر|مصادر|Source|Sources|source|sources)\s*:?\s*([0-9٠-٩]+(?:\s*(?:[,،]|و|and|&)\s*[0-9٠-٩]+)*)\s*\]/g;

/** كل أرقام المصادر المذكورة في نص (كمصفوفة أرقام فريدة) */
export function extractCitationNumbers(text) {
    const out = new Set();
    String(text || '').replace(CITE_RE, (_m, nums) => {
        toAsciiDigits(nums).split(/[^0-9]+/).filter(Boolean).forEach((n) => out.add(parseInt(n, 10)));
        return _m;
    });
    return Array.from(out);
}

function inline(escaped, { citations }) {
    const stash = [];
    const hold = (html) => {
        stash.push(html);
        return `\u0001${stash.length - 1}\u0002`;
    };

    let s = escaped;
    // كود سطري `x`
    s = s.replace(/`([^`\n]+)`/g, (_m, code) => hold(`<code>${code}</code>`));

    if (citations) {
        s = s.replace(CITE_RE, (_m, nums) => {
            const list = toAsciiDigits(nums).split(/[^0-9]+/).filter(Boolean);
            return hold(list.map((n) => `<button type="button" class="bc-cite" data-n="${parseInt(n, 10)}" aria-label="المصدر ${parseInt(n, 10)}">${parseInt(n, 10)}</button>`).join(''));
        });
    }

    s = s
        .replace(/\*\*([^\n*][^\n]*?)\*\*/g, '<strong>$1</strong>')
        .replace(/__([^\n_][^\n]*?)__/g, '<strong>$1</strong>')
        .replace(/(^|[^*\w])\*([^\s*][^\n*]*?)\*(?!\*)/g, '$1<em>$2</em>');

    return s.replace(/\u0001(\d+)\u0002/g, (_m, i) => stash[parseInt(i, 10)]);
}

function splitTableRow(line) {
    let t = line.trim();
    if (t.startsWith('|')) t = t.slice(1);
    if (t.endsWith('|')) t = t.slice(0, -1);
    return t.split('|').map((c) => c.trim());
}

/**
 * @param {string} text
 * @param {{citations?: boolean}} opts
 * @returns {string} HTML آمن
 */
export function renderMarkdown(text, { citations = true } = {}) {
    const src = String(text === null || text === undefined ? '' : text).replace(/\u0000|\u0001|\u0002/g, '').replace(/\r\n?/g, '\n');
    const lines = src.split('\n');
    const out = [];
    let i = 0;

    const fmt = (raw) => inline(escapeHtml(raw), { citations });

    while (i < lines.length) {
        const line = lines[i];
        const trimmed = line.trim();

        if (!trimmed) { i++; continue; }

        // كتلة كود ```
        if (/^```/.test(trimmed)) {
            const buf = [];
            i++;
            while (i < lines.length && !/^```/.test(lines[i].trim())) { buf.push(lines[i]); i++; }
            i++; // إغلاق الكتلة
            out.push(`<pre dir="ltr"><code>${escapeHtml(buf.join('\n'))}</code></pre>`);
            continue;
        }

        // عنوان
        const h = trimmed.match(/^(#{1,4})\s+(.+?)\s*#*$/);
        if (h) {
            const level = Math.min(6, h[1].length + 2);
            out.push(`<h${level} dir="auto">${fmt(h[2])}</h${level}>`);
            i++;
            continue;
        }

        // خط فاصل
        if (/^([-*_])\1{2,}$/.test(trimmed.replace(/\s+/g, ''))) {
            out.push('<hr>');
            i++;
            continue;
        }

        // جدول
        if (trimmed.startsWith('|') && i + 1 < lines.length && /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(lines[i + 1])) {
            const head = splitTableRow(trimmed);
            i += 2;
            const rows = [];
            while (i < lines.length && lines[i].trim().startsWith('|')) { rows.push(splitTableRow(lines[i])); i++; }
            out.push(
                '<div class="md-table-wrap"><table dir="auto"><thead><tr>' +
                head.map((c) => `<th>${fmt(c)}</th>`).join('') +
                '</tr></thead><tbody>' +
                rows.map((r) => '<tr>' + r.map((c) => `<td>${fmt(c)}</td>`).join('') + '</tr>').join('') +
                '</tbody></table></div>'
            );
            continue;
        }

        // اقتباس
        if (/^>\s?/.test(trimmed)) {
            const buf = [];
            while (i < lines.length && /^\s*>\s?/.test(lines[i])) { buf.push(lines[i].replace(/^\s*>\s?/, '')); i++; }
            out.push(`<blockquote dir="auto">${buf.map(fmt).join('<br>')}</blockquote>`);
            continue;
        }

        // قائمة نقطية
        if (/^[-*•]\s+/.test(trimmed)) {
            const items = [];
            while (i < lines.length && /^\s*[-*•]\s+/.test(lines[i])) {
                items.push(lines[i].replace(/^\s*[-*•]\s+/, ''));
                i++;
                // سطور استكمال (مسافة بادئة) تتبع العنصر
                while (i < lines.length && /^\s{2,}\S/.test(lines[i]) && !/^\s*[-*•]\s+/.test(lines[i]) && !/^\s*\d+[.)]\s+/.test(lines[i])) {
                    items[items.length - 1] += ' ' + lines[i].trim();
                    i++;
                }
            }
            out.push(`<ul dir="auto">${items.map((it) => `<li>${fmt(it)}</li>`).join('')}</ul>`);
            continue;
        }

        // قائمة مرقّمة
        if (/^[0-9٠-٩]+[.)\-]\s+/.test(trimmed)) {
            const items = [];
            let start = null;
            while (i < lines.length && /^\s*[0-9٠-٩]+[.)\-]\s+/.test(lines[i])) {
                const m = lines[i].match(/^\s*([0-9٠-٩]+)[.)\-]\s+(.*)$/);
                if (start === null) start = parseInt(toAsciiDigits(m[1]), 10);
                items.push(m[2]);
                i++;
                while (i < lines.length && /^\s{2,}\S/.test(lines[i]) && !/^\s*[-*•]\s+/.test(lines[i]) && !/^\s*[0-9٠-٩]+[.)\-]\s+/.test(lines[i])) {
                    items[items.length - 1] += ' ' + lines[i].trim();
                    i++;
                }
            }
            out.push(`<ol dir="auto"${start && start > 1 ? ` start="${start}"` : ''}>${items.map((it) => `<li>${fmt(it)}</li>`).join('')}</ol>`);
            continue;
        }

        // فقرة: أسطر متتالية غير فاضية وليست بداية كتلة أخرى
        const buf = [];
        while (
            i < lines.length && lines[i].trim() &&
            !/^```/.test(lines[i].trim()) &&
            !/^#{1,4}\s+/.test(lines[i].trim()) &&
            !/^[-*•]\s+/.test(lines[i].trim()) &&
            !/^[0-9٠-٩]+[.)\-]\s+/.test(lines[i].trim()) &&
            !/^>\s?/.test(lines[i].trim())
        ) {
            buf.push(lines[i].trim());
            i++;
        }
        if (buf.length === 0) { buf.push(trimmed); i++; }
        out.push(`<p dir="auto">${buf.map(fmt).join('<br>')}</p>`);
    }

    return out.join('') || '<p></p>';
}

/**
 * قص نص ماركداون جزئيًا للأنيميشن بدون ما نقطع وسط استشهاد [مصدر N] أو وسط ** **
 */
export function safePrefix(text, n) {
    if (n >= text.length) return text;
    let cut = n;
    const open = text.lastIndexOf('[', cut - 1);
    if (open !== -1 && text.indexOf(']', open) >= cut) {
        const close = text.indexOf(']', open);
        if (close !== -1 && close - open < 40) cut = close + 1;
    }
    return text.slice(0, cut);
}
