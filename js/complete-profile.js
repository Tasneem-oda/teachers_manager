/**
 * complete-profile.js — v29: بعد أول دخول بجوجل: سؤالين بس (بتدرّس إيه + رقم واتساب) بدل فورم التسجيل كله
 */
import { api } from './api.js?v=29';
import { Storage, ErrorHandler, toLatinDigits, Formatters } from './utils.js?v=29';

const esc = (s) => Formatters.escapeHtml(s == null ? '' : String(s));
const SUBJECTS = [['quran', 'القرآن الكريم'], ['english', 'اللغة الإنجليزية'], ['arabic', 'اللغة العربية'], ['math', 'الرياضيات'],
    ['science', 'العلوم'], ['programming', 'البرمجة'], ['other', 'أخرى']];

function isGoogleUser(user) {
    const ids = (user && Array.isArray(user.identities)) ? user.identities : [];
    return ids.some((i) => i && i.provider === 'google') || (user && user.app_metadata && user.app_metadata.provider === 'google');
}

/**
 * بيظهر مرة واحدة للمدرس الداخل بجوجل اللي ناقصه المادة
 * @param {object} profile من requireAuth
 * @param {object} session
 * @param {() => void} [onDone]
 */
export function maybeCompleteProfile(profile, session, onDone) {
    const user = session && session.user;
    if (!profile || !user) return false;
    const welcome = new URLSearchParams(location.search).get('welcome') === 'google';
    if (welcome) { try { history.replaceState(null, '', location.pathname); } catch (e) { /* تجاهل */ } }
    if (!isGoogleUser(user)) return false;
    if (profile.subject && (profile.phone || !welcome)) return false;
    const key = 'tm_cp_done_' + user.id;
    try { if (localStorage.getItem(key) === '1' && !welcome) return false; } catch (e) { /* تجاهل */ }

    const first = String(profile.name || '').trim().split(/\s+/)[0];
    const m = document.createElement('div');
    m.className = 'modal active bill-modal cp-modal';
    m.innerHTML = `<div class="modal-content" role="dialog" aria-modal="true" aria-label="كمّل بياناتك">
        <h2 class="bm-title">أهلًا${first ? ' ' + esc(first) : ''} 👋 خطوة أخيرة</h2>
        <p class="bm-hint" style="margin-top:0">دخلت بحساب جوجل. قولنا بتدرّس إيه عشان نجهّزلك البرنامج.</p>
        <div class="bm-error" role="alert"></div>
        <div class="bm-field"><label for="cp-name">اسمك</label><input type="text" id="cp-name" maxlength="100" value="${esc(profile.name || '')}"></div>
        <div class="bm-field"><label for="cp-subject">بتدرّس إيه؟ *</label>
            <select id="cp-subject"><option value="">اختر...</option>${SUBJECTS.map(([v, l]) => `<option value="${v}"${profile.subject === v ? ' selected' : ''}>${l}</option>`).join('')}</select></div>
        <div class="bm-field"><label for="cp-phone">رقم واتساب <small>(اختياري — عشان نساعدك لو احتجت حاجة)</small></label>
            <input type="tel" id="cp-phone" dir="ltr" inputmode="tel" maxlength="30" placeholder="01xxxxxxxxx" value="${esc(profile.phone || '')}"></div>
        <div class="bm-buttons">
            <button type="button" class="btn" data-save>يلا نبدأ</button>
            <button type="button" class="btn btn-ghost" data-later>بعدين</button>
        </div>
    </div>`;
    document.body.appendChild(m);
    const $ = (s) => m.querySelector(s);
    const done = () => { try { localStorage.setItem(key, '1'); } catch (e) { /* تجاهل */ } m.remove(); if (onDone) onDone(); };
    $('[data-later]').addEventListener('click', done);
    $('[data-save]').addEventListener('click', async (e) => {
        const btn = e.currentTarget;
        const err = $('.bm-error');
        const data = {
            name: $('#cp-name').value.trim() || profile.name || '',
            phone: toLatinDigits($('#cp-phone').value).trim(),
            teaching_type: profile.teaching_type || 'private',
            subject: $('#cp-subject').value
        };
        if (!data.subject) { err.textContent = 'اختار المادة اللي بتدرّسها.'; err.style.display = 'block'; return; }
        if (data.name.length < 2) { err.textContent = 'اكتب اسمك.'; err.style.display = 'block'; return; }
        btn.disabled = true; btn.textContent = 'جاري الحفظ...';
        try {
            await api.updateProfile(data);
            const fresh = { ...profile, ...data };
            Storage.set('user_profile', fresh);
            try { sessionStorage.removeItem('tm_profile_cache_v1'); localStorage.setItem('tm_teacher_subject', data.subject); } catch (er) { /* تجاهل */ }
            try { (window.dataLayer = window.dataLayer || []).push({ event: 'profile_completed', method: 'google', subject: data.subject }); } catch (er) { /* تجاهل */ }
            ErrorHandler.showSuccess('تمام! يلا نضيف أول طالب');
            done();
        } catch (er) {
            err.textContent = ErrorHandler.getErrorMessage(er);
            err.style.display = 'block';
            btn.disabled = false; btn.textContent = 'يلا نبدأ';
        }
    });
    setTimeout(() => $('#cp-subject').focus(), 80);
    return true;
}
