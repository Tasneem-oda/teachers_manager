/**
 * recording.js — v29: تسجيل الحصة فيديو + لينك التسجيل
 *
 * • LessonRecorder: بيسجّل شاشة Meet/Zoom (أو أي نافذة) بصوت التاب + مايك المدرس، من المتصفح على الكمبيوتر.
 *   الفيديو بيتحفظ على جهاز المدرس (مفيش رفع ولا تكلفة تخزين).
 * • openRecordingLinkModal: لينك التسجيل بعد ما المدرس يرفعه على Drive/YouTube، ويتبعت لولي الأمر بضغطة.
 */
import { api } from './api.js?v=29';
import { ErrorHandler, Formatters } from './utils.js?v=29';
import { icon } from './icons.js?v=29';
import { whatsappUrl, recipientChooser } from './billing.js?v=29';

const esc = (s) => Formatters.escapeHtml(s == null ? '' : String(s));

/** التسجيل بيشتغل على متصفحات الكمبيوتر بس (الموبايل مابيدعمش تسجيل الشاشة من المتصفح) */
export function recordingSupported() {
    try {
        const md = navigator.mediaDevices;
        if (!md || typeof md.getDisplayMedia !== 'function' || typeof window.MediaRecorder !== 'function') return false;
        const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '') || (navigator.maxTouchPoints > 1 && !matchMedia('(pointer: fine)').matches)
            || (matchMedia('(pointer: coarse)').matches && !matchMedia('(any-pointer: fine)').matches);
        return !mobile;
    } catch (e) { return false; }
}

function pickMime() {
    const list = ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
    for (const m of list) { try { if (MediaRecorder.isTypeSupported(m)) return m; } catch (e) { /* تجاهل */ } }
    return '';
}

export function formatDuration(sec) {
    const s = Math.max(0, Math.round(sec || 0));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const r = s % 60;
    return h ? `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}` : `${m}:${String(r).padStart(2, '0')}`;
}
function formatSize(bytes) {
    const mb = (bytes || 0) / (1024 * 1024);
    return mb >= 1000 ? `${(mb / 1024).toFixed(1)} جيجا` : `${Math.max(0.1, mb).toFixed(mb < 10 ? 1 : 0)} ميجا`;
}
function safeName(s) {
    return String(s || '').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, '-').slice(0, 40) || 'حصة';
}

export class LessonRecorder {
    /**
     * @param {{ title?: string, onState?: (s: {state: string, elapsed?: number, warning?: string}) => void }} o
     */
    constructor({ title = 'حصة', onState } = {}) {
        this.title = title;
        this.onState = onState || (() => {});
        this.state = 'idle';
        this.chunks = [];
        this._tick = null;
        this._unload = (e) => { if (this.state === 'recording') { e.preventDefault(); e.returnValue = ''; } };
    }

    get recording() { return this.state === 'recording'; }

    /** بيرجّع true لو التسجيل بدأ. أي رفض من المدرس (قفل نافذة الاختيار) بيرجّع false من غير رسالة خطأ */
    async start() {
        if (this.state === 'recording') return true;
        let display;
        try {
            display = await navigator.mediaDevices.getDisplayMedia({
                video: { frameRate: { ideal: 24, max: 30 }, width: { ideal: 1920 }, height: { ideal: 1080 } },
                audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
                selfBrowserSurface: 'exclude', systemAudio: 'include', surfaceSwitching: 'include', preferCurrentTab: false
            });
        } catch (e) {
            if (e && (e.name === 'NotAllowedError' || e.name === 'AbortError')) return false;
            throw new Error('المتصفح ده مش قادر يسجّل الشاشة. جرّب Chrome أو Edge على الكمبيوتر.');
        }
        let mic = null;
        try { mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); } catch (e) { mic = null; }

        const tracks = [...display.getVideoTracks()];
        const warnings = [];
        let ctx = null;
        try {
            const hasTabAudio = display.getAudioTracks().length > 0;
            if (hasTabAudio || mic) {
                ctx = new (window.AudioContext || window.webkitAudioContext)();
                const dest = ctx.createMediaStreamDestination();
                if (hasTabAudio) ctx.createMediaStreamSource(new MediaStream(display.getAudioTracks())).connect(dest);
                if (mic) ctx.createMediaStreamSource(mic).connect(dest);
                tracks.push(...dest.stream.getAudioTracks());
            }
            if (!hasTabAudio) warnings.push('صوت الطالب مش هيتسجل: المرة الجاية اختار "تاب" وعلّم على "مشاركة صوت التاب".');
            if (!mic) warnings.push('المايك بتاعك مش متاح، فصوتك مش هيتسجل.');
        } catch (e) { /* نكمّل بالفيديو بس */ }

        const mimeType = pickMime();
        this.ext = /mp4/.test(mimeType) ? 'mp4' : 'webm';
        this.mime = mimeType || 'video/webm';
        this.stream = new MediaStream(tracks);
        this._display = display; this._mic = mic; this._ctx = ctx;
        try {
            this.rec = new MediaRecorder(this.stream, { ...(mimeType ? { mimeType } : {}), videoBitsPerSecond: 1500000, audioBitsPerSecond: 96000 });
        } catch (e) {
            this._cleanup();
            throw new Error('مقدرناش نبدأ التسجيل على المتصفح ده. جرّب Chrome على الكمبيوتر.');
        }
        this.chunks = [];
        this.rec.ondataavailable = (ev) => { if (ev.data && ev.data.size) this.chunks.push(ev.data); };
        this._stopped = new Promise((resolve) => { this.rec.onstop = () => resolve(); });
        // المدرس داس "إيقاف المشاركة" من شريط المتصفح = نوقف التسجيل
        display.getVideoTracks().forEach((t) => t.addEventListener('ended', () => { if (this.state === 'recording') this.stop(); }));
        this.rec.start(4000);
        this.startedAt = Date.now();
        this.state = 'recording';
        window.addEventListener('beforeunload', this._unload);
        this._tick = setInterval(() => this.onState({ state: 'recording', elapsed: (Date.now() - this.startedAt) / 1000 }), 1000);
        this.onState({ state: 'recording', elapsed: 0, warning: warnings.join(' ') });
        try { window.tmTrack && window.tmTrack('lesson_recording_started', { tab_audio: !warnings.length }); } catch (e) { /* تجاهل */ }
        return true;
    }

    /** بيوقف التسجيل ويرجّع الملف */
    async stop() {
        if (this.state !== 'recording') return this.result || null;
        this.state = 'stopping';
        clearInterval(this._tick);
        try { if (this.rec && this.rec.state !== 'inactive') this.rec.stop(); } catch (e) { /* تجاهل */ }
        await Promise.race([this._stopped, new Promise((r) => setTimeout(r, 4000))]);
        this._cleanup();
        const duration = (Date.now() - this.startedAt) / 1000;
        const blob = new Blob(this.chunks, { type: this.mime });
        this.chunks = [];
        let day = '';
        try { day = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Cairo' }); } catch (e) { day = new Date().toISOString().slice(0, 10); }
        this.result = { blob, size: blob.size, duration, name: `تسجيل-${safeName(this.title)}-${day}.${this.ext}`, ext: this.ext };
        this.state = 'done';
        window.removeEventListener('beforeunload', this._unload);
        this.onState({ state: 'done', elapsed: duration });
        try { window.tmTrack && window.tmTrack('lesson_recording_saved', { minutes: Math.round(duration / 60), mb: Math.round(blob.size / 1048576) }); } catch (e) { /* تجاهل */ }
        return this.result;
    }

    _cleanup() {
        try { this._display && this._display.getTracks().forEach((t) => t.stop()); } catch (e) { /* تجاهل */ }
        try { this._mic && this._mic.getTracks().forEach((t) => t.stop()); } catch (e) { /* تجاهل */ }
        try { this._ctx && this._ctx.close(); } catch (e) { /* تجاهل */ }
    }
}

/** تنزيل ملف التسجيل على جهاز المدرس */
export function downloadRecording(result) {
    if (!result || !result.blob) return;
    const url = URL.createObjectURL(result.blob);
    const a = document.createElement('a');
    a.href = url; a.download = result.name; a.rel = 'noopener';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
}

/** شرح قصير أول مرة قبل ما المتصفح يسأل "تشارك إيه؟" */
export function explainRecordingOnce() {
    return new Promise((resolve) => {
        let seen = false;
        try { seen = localStorage.getItem('tm_rec_explained') === '1'; } catch (e) { /* تجاهل */ }
        if (seen) { resolve(true); return; }
        const m = document.createElement('div');
        m.className = 'modal active bill-modal rec-modal';
        m.innerHTML = `<div class="modal-content" role="dialog" aria-modal="true" aria-label="تسجيل الحصة">
            <h2 class="bm-title">${icon('record', { size: 20 })} تسجيل الحصة</h2>
            <ol class="rec-steps">
                <li>هيظهرلك سؤال من المتصفح: <b>تشارك إيه؟</b></li>
                <li>اختار <b>تاب Google Meet أو Zoom</b> (من خانة "تاب Chrome").</li>
                <li>علّم على <b>"مشاركة صوت التاب"</b> عشان صوت الطالب يتسجل، واسمح بالمايك عشان صوتك.</li>
                <li>لما تخلّص الحصة الفيديو هيتحفظ على جهازك لوحده.</li>
            </ol>
            <p class="bm-hint">💡 استأذن ولي الأمر قبل ما تسجّل الحصة. وماتقفلش الصفحة دي وانت بتسجّل.</p>
            <div class="bm-buttons">
                <button type="button" class="btn" data-ok>${icon('record', { size: 16 })} ابدأ التسجيل</button>
                <button type="button" class="btn btn-ghost" data-no>رجوع</button>
            </div>
        </div>`;
        const done = (v) => { m.remove(); resolve(v); };
        m.querySelector('[data-ok]').addEventListener('click', () => { try { localStorage.setItem('tm_rec_explained', '1'); } catch (e) { /* تجاهل */ } done(true); });
        m.querySelector('[data-no]').addEventListener('click', () => done(false));
        m.addEventListener('mousedown', (e) => { if (e.target === m) done(false); });
        document.body.appendChild(m);
    });
}

/**
 * نافذة "التسجيل جاهز": تنزيل + رفع على Drive + حفظ اللينك في الحصة
 * @param {object} o
 * @param {object} o.result من LessonRecorder.stop()
 * @param {string} [o.lessonId] / [o.groupSessionId] عشان اللينك يتحفظ مع الحصة
 * @param {object} [o.student] عشان زرار "ابعت لولي الأمر"
 */
export function showRecordingReady({ result, lessonId, groupSessionId, student, onSaved }) {
    if (!result) return;
    downloadRecording(result);
    openRecordingLinkModal({
        lessonId, groupSessionId, student, onSaved,
        intro: `<div class="rec-ready">${icon('checkCircle', { size: 22 })}<div><b>التسجيل اتحفظ على جهازك</b>
            <small>${esc(formatDuration(result.duration))} · ${esc(formatSize(result.size))} · ${esc(result.name)}</small></div>
            <button type="button" class="btn btn-sm btn-outline" data-redl>${icon('download', { size: 14 })} نزّله تاني</button></div>
            <p class="bm-hint" style="margin-top:0.2rem">عايز تبعته لولي الأمر؟ ارفعه على <a href="https://drive.google.com/drive/my-drive" target="_blank" rel="noopener">Google Drive</a> (اسحب الملف جوه الصفحة)، وبعدين "مشاركة ← نسخ الرابط" والصقه هنا.</p>`,
        onIntro: (root) => { const b = root.querySelector('[data-redl]'); if (b) b.addEventListener('click', () => downloadRecording(result)); }
    });
}

/**
 * لينك تسجيل الحصة (إضافة / تعديل / مسح) + "ابعت التسجيل لولي الأمر"
 */
export function openRecordingLinkModal({ lessonId, groupSessionId, current = '', student, groupName, onSaved, intro = '', onIntro } = {}) {
    const to = student ? recipientChooser(student) : { html: '', bind: () => {}, initial: '' };
    let toPhone = to.initial;
    let saved = current || '';
    const m = document.createElement('div');
    m.className = 'modal active bill-modal rec-modal';
    m.innerHTML = `<div class="modal-content" role="dialog" aria-modal="true" aria-label="لينك تسجيل الحصة">
        <button type="button" class="bm-close" aria-label="إغلاق">${icon('x', { size: 18 })}</button>
        <h2 class="bm-title">${icon('video', { size: 20 })} تسجيل الحصة</h2>
        ${intro}
        <div class="bm-error" role="alert"></div>
        <div class="bm-field"><label for="rec-url">لينك التسجيل <small>(Google Drive / YouTube / Zoom)</small></label>
            <div class="lf-row"><input type="url" id="rec-url" dir="ltr" inputmode="url" placeholder="https://drive.google.com/..." value="${esc(saved)}" autocomplete="off">
            <button type="button" class="btn btn-outline btn-sm" data-paste>لصق</button></div></div>
        <div class="bm-buttons">
            <button type="button" class="btn" data-save>حفظ اللينك</button>
            ${saved ? '<button type="button" class="btn btn-ghost" data-clear>مسح اللينك</button>' : ''}
        </div>
        <div class="rec-share" ${saved && (student || groupName) ? '' : 'hidden'}>
            ${to.html}
            <a class="btn bm-wa" data-wa target="_blank" rel="noopener">${icon('messageCircle', { size: 16 })} ${groupName ? 'ابعت التسجيل لجروب المجموعة' : 'ابعت التسجيل على واتساب'}</a>
        </div>
    </div>`;
    const $ = (s) => m.querySelector(s);
    const close = () => { m.remove(); document.removeEventListener('keydown', onKey); };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    m.addEventListener('mousedown', (e) => { if (e.target === m) close(); });
    $('.bm-close').addEventListener('click', close);
    document.body.appendChild(m);
    if (onIntro) onIntro(m);
    const input = $('#rec-url');
    const err = $('.bm-error');
    const showErr = (t) => { err.textContent = t; err.style.display = t ? 'block' : 'none'; };
    const norm = (v) => {
        let t = String(v || '').trim().replace(/\s+/g, '');
        if (t && !/^https?:\/\//i.test(t) && /^[\w-]+(\.[\w-]+)+/.test(t)) t = 'https://' + t;
        return t;
    };
    const shareText = () => {
        const first = student ? String(student.name || '').split(' ')[0] : '';
        return groupName
            ? `السلام عليكم 🌸\nده تسجيل حصة ${groupName} النهارده عشان اللي عايز يراجع:\n${saved}`
            : `السلام عليكم 🌸\nده تسجيل حصة ${first} النهارده عشان يراجع:\n${saved}`;
    };
    const refreshShare = () => {
        const box = $('.rec-share');
        box.hidden = !(saved && (student || groupName));
        $('[data-wa]').href = whatsappUrl(groupName ? '' : toPhone, shareText());
    };
    to.bind(m, (ph) => { toPhone = ph; refreshShare(); });
    refreshShare();
    input.addEventListener('blur', () => { input.value = norm(input.value); });
    input.addEventListener('input', () => showErr(''));
    $('[data-paste]').addEventListener('click', async () => {
        try { const t = await navigator.clipboard.readText(); if (t) input.value = norm(t); } catch (e) { input.focus(); ErrorHandler.showError('اضغط جوه الخانة واختار "لصق"'); }
    });
    const save = async (url, btn) => {
        if (url && !/^https?:\/\/[^\s.]+\.[^\s]+/i.test(url)) { showErr('اللينك لازم يبدأ بـ https:// (انسخه كامل).'); return; }
        if (!lessonId && !groupSessionId) { saved = url; refreshShare(); ErrorHandler.showSuccess('جاهز للإرسال'); return; }
        btn.disabled = true;
        try {
            await api.setLessonRecording({ lessonId, groupSessionId, url });
            saved = url;
            input.value = url;
            refreshShare();
            ErrorHandler.showSuccess(url ? 'اتحفظ لينك التسجيل' : 'اتمسح لينك التسجيل');
            if (onSaved) onSaved(url);
            if (!url) close();
        } catch (e) {
            showErr(ErrorHandler.getErrorMessage(e));
        } finally { btn.disabled = false; }
    };
    $('[data-save]').addEventListener('click', (e) => save(norm(input.value), e.currentTarget));
    const clr = $('[data-clear]');
    if (clr) clr.addEventListener('click', (e) => save('', e.currentTarget));
    setTimeout(() => { if (!saved) input.focus(); }, 60);
    return { close };
}
