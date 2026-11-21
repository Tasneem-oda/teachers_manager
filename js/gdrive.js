/**
 * gdrive.js — v35: كتب المدرس على جوجل درايف بتاعه (بدل تخزين البرنامج)
 *
 * • الصلاحية: drive.file بس — البرنامج يشوف ويعدّل الملفات اللي هو رفعها بنفسه، ومايقدرش يشوف باقي الدرايف.
 * • الكتب بتترفع في فولدر "Teachers Manager - كتبي" على درايف المدرس، وفي قاعدة البيانات بيتسجّل
 *   مكان الملف بس: storage_path = "gdrive:<fileId>".
 * • فتح الكتاب: المتصفح بيحمّله من الدرايف مباشرة (التوكن عند المدرس بس، مش بيروح للسيرفر).
 * • محتاج CONFIG.GOOGLE_DRIVE.CLIENT_ID (OAuth Client ID من Google Cloud). لو فاضي: الخاصية مخفية والكتب على تخزين البرنامج زي الأول.
 */
import { CONFIG } from './config.js?v=52';

const SCOPE = 'https://www.googleapis.com/auth/drive.file';
const LS = 'tm_gdrive_v1';
const TOKEN_SS = 'tm_gdrive_tok_v1';
const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
export const GDRIVE_PREFIX = 'gdrive:';

const cfg = () => (CONFIG.GOOGLE_DRIVE || {});
export const isGdrivePath = (p) => typeof p === 'string' && p.startsWith(GDRIVE_PREFIX);
export const gdriveId = (p) => (isGdrivePath(p) ? p.slice(GDRIVE_PREFIX.length) : '');

const readState = () => { try { return JSON.parse(localStorage.getItem(LS) || '{}') || {}; } catch (e) { return {}; } };
const writeState = (s) => { try { localStorage.setItem(LS, JSON.stringify(s)); } catch (e) { /* تجاهل */ } };

/** الخاصية متاحة (فيه Client ID)؟ */
export function driveAvailable() { return !!cfg().CLIENT_ID; }
/** المدرس وصّل الدرايف قبل كده على الجهاز ده؟ */
export function driveConnected() { return driveAvailable() && !!readState().connected; }
/** المدرس عايز الكتب الجديدة تترفع على الدرايف؟ (افتراضي: آه لو وصّله) */
export function drivePreferred() { const s = readState(); return driveConnected() && s.prefer !== false; }
export function setDrivePreferred(on) { const s = readState(); s.prefer = !!on; writeState(s); }
export function driveEmail() { return readState().email || ''; }

let gisLoading = null;
function loadGis() {
    if (window.google && window.google.accounts && window.google.accounts.oauth2) return Promise.resolve();
    if (gisLoading) return gisLoading;
    gisLoading = new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = 'https://accounts.google.com/gsi/client';
        s.async = true;
        s.onload = () => resolve();
        s.onerror = () => { gisLoading = null; reject(new Error('مقدرناش نحمّل خدمة جوجل. اتأكد من النت.')); };
        document.head.appendChild(s);
    });
    return gisLoading;
}

function cachedToken() {
    try {
        const t = JSON.parse(sessionStorage.getItem(TOKEN_SS) || 'null');
        if (t && t.access_token && t.until > Date.now() + 60000) return t.access_token;
    } catch (e) { /* تجاهل */ }
    return null;
}

let pending = null;
/**
 * توكن صالح للدرايف. أول مرة بيفتح نافذة جوجل للموافقة، وبعدها بيتجدد من غير ما المدرس يحس.
 * لازم أول مرة تتنادى من ضغطة زرار (المتصفح بيمنع النوافذ المنبثقة غير كده).
 */
export async function getDriveToken({ interactive = false } = {}) {
    const hit = cachedToken();
    if (hit) return hit;
    if (!driveAvailable()) throw driveError('NOT_CONFIGURED', 'ربط جوجل درايف لسه مش متفعّل في البرنامج.');
    if (pending) return pending;
    pending = (async () => {
        await loadGis();
        const st = readState();
        return new Promise((resolve, reject) => {
            const client = window.google.accounts.oauth2.initTokenClient({
                client_id: cfg().CLIENT_ID,
                scope: SCOPE,
                hint: st.email || undefined,
                prompt: interactive && !st.connected ? 'consent' : '',
                callback: (r) => {
                    if (!r || r.error || !r.access_token) { reject(driveError('DENIED', 'جوجل مارجّعش صلاحية. حاول تاني ووافق على "الملفات اللي البرنامج بيعملها".')); return; }
                    try { sessionStorage.setItem(TOKEN_SS, JSON.stringify({ access_token: r.access_token, until: Date.now() + (Number(r.expires_in) || 3600) * 1000 })); } catch (e) { /* تجاهل */ }
                    const s = readState(); s.connected = true; writeState(s);
                    resolve(r.access_token);
                },
                error_callback: (e) => {
                    const popup = e && /popup/i.test(String(e.type || e.message || ''));
                    reject(driveError(popup ? 'POPUP' : 'DENIED', popup ? 'المتصفح منع نافذة جوجل. اضغط الزرار تاني أو اسمح بالنوافذ المنبثقة.' : 'اتلغى الربط بجوجل درايف.'));
                }
            });
            client.requestAccessToken();
        });
    })();
    try { return await pending; } finally { pending = null; }
}

function driveError(code, message, status) { return { error: { code: `GDRIVE_${code}`, message }, status }; }

async function dfetch(url, opts = {}, { retry = true } = {}) {
    const token = await getDriveToken(opts.interactive ? { interactive: true } : {});
    const headers = { ...(opts.headers || {}), Authorization: `Bearer ${token}` };
    let res;
    try { res = await fetch(url, { ...opts, headers }); } catch (e) {
        if (e && e.name === 'AbortError') throw { error: { code: 'ABORTED', message: 'تم الإلغاء' }, aborted: true };
        throw driveError('NETWORK', 'تعذّر الاتصال بجوجل درايف. اتأكد من النت.');
    }
    if (res.status === 401 && retry) {
        try { sessionStorage.removeItem(TOKEN_SS); } catch (e) { /* تجاهل */ }
        return dfetch(url, opts, { retry: false });
    }
    if (res.status === 404) throw driveError('NOT_FOUND', 'الملف مش موجود على جوجل درايف (ممكن يكون اتمسح من الدرايف).', 404);
    if (res.status === 403) {
        let reason = '';
        try { reason = ((await res.clone().json()).error || {}).message || ''; } catch (e) { /* تجاهل */ }
        if (/quota|storage/i.test(reason)) throw driveError('FULL', 'مساحة جوجل درايف بتاعك خلصت. فضّي مساحة أو ارفع على تخزين البرنامج.', 403);
        throw driveError('FORBIDDEN', 'جوجل درايف رفض الطلب. جرّب تفصل الدرايف وتوصّله تاني من الإعدادات.', 403);
    }
    if (!res.ok) throw driveError('FAILED', `جوجل درايف رجّع خطأ (${res.status}).`, res.status);
    return res;
}

/** ربط الدرايف (من زرار): بياخد الموافقة ويجهّز الفولدر */
export async function connectDrive() {
    await getDriveToken({ interactive: true });
    try {
        const r = await dfetch(`${API}/about?fields=user(emailAddress,displayName)`);
        const j = await r.json();
        const s = readState(); s.email = (j.user && j.user.emailAddress) || ''; s.prefer = true; writeState(s);
    } catch (e) { /* الإيميل للعرض بس */ }
    await ensureFolder();
    return { email: driveEmail() };
}

export function disconnectDrive() {
    const tok = cachedToken();
    try { sessionStorage.removeItem(TOKEN_SS); } catch (e) { /* تجاهل */ }
    writeState({});
    try { if (tok && window.google && window.google.accounts) window.google.accounts.oauth2.revoke(tok, () => {}); } catch (e) { /* تجاهل */ }
}

async function ensureFolder() {
    const st = readState();
    if (st.folderId) return st.folderId;
    const name = cfg().FOLDER_NAME || 'Teachers Manager - كتبي';
    const q = encodeURIComponent(`name='${name.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and trashed=false`);
    const r = await dfetch(`${API}/files?q=${q}&fields=files(id,name)&spaces=drive&pageSize=5`);
    const j = await r.json();
    let id = j.files && j.files[0] && j.files[0].id;
    if (!id) {
        const c = await dfetch(`${API}/files?fields=id`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, mimeType: 'application/vnd.google-apps.folder' }) });
        id = (await c.json()).id;
    }
    const s = readState(); s.folderId = id; writeState(s);
    return id;
}

/**
 * رفع ملف على الدرايف (رفع قابل للاستكمال مع نسبة تقدّم)
 * @returns {Promise<string>} storage_path = gdrive:<id>
 */
export async function uploadToDrive(file, { name, onProgress, signal } = {}) {
    const folderId = await ensureFolder();
    const meta = { name: name || file.name, parents: [folderId], appProperties: { tm: '1' } };
    const init = await dfetch(`${UPLOAD}/files?uploadType=resumable&fields=id`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=UTF-8', 'X-Upload-Content-Type': file.type || 'application/octet-stream', 'X-Upload-Content-Length': String(file.size) },
        body: JSON.stringify(meta), signal
    });
    const loc = init.headers.get('Location');
    if (!loc) throw driveError('FAILED', 'جوجل درايف مارجّعش مكان الرفع.');
    const token = await getDriveToken();
    const id = await new Promise((resolve, reject) => {
        const x = new XMLHttpRequest();
        x.open('PUT', loc);
        x.setRequestHeader('Authorization', `Bearer ${token}`);
        x.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
        x.upload.onprogress = (e) => { if (onProgress && e.lengthComputable) onProgress(e.loaded, e.total); };
        x.onload = () => {
            if (x.status >= 200 && x.status < 300) { try { resolve(JSON.parse(x.responseText).id); } catch (e) { reject(driveError('FAILED', 'رد غريب من جوجل درايف.')); } }
            else if (x.status === 403) reject(driveError('FULL', 'مساحة جوجل درايف مش كفاية للملف ده.', 403));
            else reject(driveError('FAILED', `الرفع على جوجل درايف فشل (${x.status}).`, x.status));
        };
        x.onerror = () => reject(driveError('NETWORK', 'النت قطع أثناء الرفع على جوجل درايف.'));
        if (signal) signal.addEventListener('abort', () => { x.abort(); reject({ error: { code: 'ABORTED', message: 'تم الإلغاء' }, aborted: true }); }, { once: true });
        x.send(file);
    });
    return GDRIVE_PREFIX + id;
}

/** تحميل بايتات الملف من الدرايف مع نسبة تقدّم (نفس شكل api.fetchBookFile) */
export async function fetchFromDrive(path, { onProgress, signal } = {}) {
    const id = gdriveId(path);
    const res = await dfetch(`${API}/files/${encodeURIComponent(id)}?alt=media`, { signal });
    const total = parseInt(res.headers.get('content-length') || '0', 10) || 0;
    const contentType = res.headers.get('content-type') || '';
    if (!res.body || !res.body.getReader) {
        const buffer = await res.arrayBuffer();
        if (onProgress) onProgress(buffer.byteLength, total || buffer.byteLength);
        return { buffer, contentType };
    }
    const reader = res.body.getReader();
    const parts = [];
    let loaded = 0;
    for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        parts.push(value); loaded += value.length;
        if (onProgress) onProgress(loaded, total);
    }
    const out = new Uint8Array(loaded);
    let off = 0;
    for (const p of parts) { out.set(p, off); off += p.length; }
    return { buffer: out.buffer, contentType };
}

const blobUrls = new Map();
/** رابط محلي (blob:) للملف — للعرض أو التحميل */
export async function driveFileUrl(path, { download = false } = {}) {
    const key = path;
    let url = blobUrls.get(key);
    if (!url) {
        const { buffer, contentType } = await fetchFromDrive(path);
        url = URL.createObjectURL(new Blob([buffer], { type: contentType || 'application/octet-stream' }));
        blobUrls.set(key, url);
    }
    if (download) {
        const a = document.createElement('a');
        a.href = url; a.download = typeof download === 'string' ? download : 'book';
        document.body.appendChild(a); a.click(); a.remove();
    }
    return url;
}

export async function deleteFromDrive(path) {
    try { await dfetch(`${API}/files/${encodeURIComponent(gdriveId(path))}`, { method: 'DELETE' }); } catch (e) { /* الملف ممكن يكون اتمسح بالفعل */ }
}

/** مساحة الدرايف (للعرض في الإعدادات) */
export async function driveQuota() {
    const r = await dfetch(`${API}/about?fields=storageQuota`);
    const q = (await r.json()).storageQuota || {};
    return { used: Number(q.usage) || 0, limit: Number(q.limit) || 0 };
}
