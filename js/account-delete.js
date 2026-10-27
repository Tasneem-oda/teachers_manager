/**
 * account-delete.js — v28: حذف حساب المدرس بنفسه (زي التطبيقات المعروفة)
 *  1) ليه عايز تمشي؟ (سبب + تفاصيل اختيارية)  2) هيتمسح إيه + كلمة السر + تأكيد  3) اتجدول الحذف
 *  - مهلة 14 يوم: لو دخل تاني قبلها يقدر يرجّع حسابه (showDeletionScheduledGate)
 *  - بعد المهلة n8n (purge-deleted-accounts) بيمسح كل حاجة تلقائي
 */
import { api } from './api.js?v=28';
import { Auth } from './auth.js?v=28';
import { ErrorHandler } from './utils.js?v=28';
import { icon } from './icons.js?v=28';
import { CONFIG } from './config.js?v=28';

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const DELETE_REASONS = [
    { value: 'not_using', label: 'مش بستخدم البرنامج كفاية' },
    { value: 'missing_feature', label: 'ناقصه ميزة أنا محتاجها' },
    { value: 'hard_to_use', label: 'صعب أو مش مفهوم' },
    { value: 'price', label: 'الاشتراك غالي عليّ' },
    { value: 'other_app', label: 'لقيت برنامج تاني' },
    { value: 'temporary', label: 'بطّلت أدرّس (مؤقتًا)' },
    { value: 'duplicate_account', label: 'عندي حساب تاني' },
    { value: 'privacy', label: 'قلقان على بياناتي' },
    { value: 'other', label: 'سبب تاني' }
];

const STYLE = `
.ad-modal .modal-content { max-width: 500px; }
.ad-steps { display: flex; gap: 0.3rem; margin: 0 0 1rem; }
.ad-steps i { flex: 1; height: 4px; border-radius: 4px; background: var(--border); }
.ad-steps i.on { background: var(--danger); }
.ad-reasons { display: grid; gap: 0.4rem; margin-bottom: 0.8rem; }
.ad-reasons label { display: flex !important; align-items: center; gap: 0.6rem; border: 1.5px solid var(--border); border-radius: 12px; padding: 0.6rem 0.8rem; cursor: pointer; font-weight: 600 !important; margin: 0 !important; min-height: 46px; }
.ad-reasons label:has(input:checked) { border-color: var(--primary); background: #F7F3FA; }
.ad-reasons input { width: 18px; height: 18px; margin: 0; accent-color: var(--primary); }
.ad-help { background: #F7F3FA; border-radius: 12px; padding: 0.7rem 0.85rem; font-size: 0.86rem; line-height: 1.7; color: var(--text-secondary); margin: 0.6rem 0 0.9rem; }
.ad-list { margin: 0 0 0.9rem; padding-inline-start: 1.2rem; line-height: 1.9; font-size: 0.9rem; }
.ad-time { background: #FFF4E5; border: 1px solid #F1D3A6; color: #7A4B12; border-radius: 12px; padding: 0.65rem 0.85rem; font-size: 0.88rem; line-height: 1.7; margin-bottom: 0.9rem; }
.ad-check { display: flex !important; align-items: flex-start; gap: 0.55rem; font-size: 0.88rem; line-height: 1.6; margin: 0.6rem 0 0.4rem !important; cursor: pointer; }
.ad-check input { width: 20px; height: 20px; margin: 0.1rem 0 0; flex-shrink: 0; accent-color: var(--danger); }
.ad-err { color: var(--danger); font-size: 0.86rem; font-weight: 600; min-height: 1.2em; margin: 0.3rem 0; }
.ad-btns { display: flex; gap: 0.6rem; flex-wrap: wrap; margin-top: 0.6rem; }
.ad-btns .btn { margin: 0; min-height: 46px; flex: 1 1 140px; }
#tm-deletion-gate { position: fixed; inset: 0; z-index: 10070; background: rgba(41, 37, 45, 0.6); display: flex; align-items: center; justify-content: center; padding: 1rem; direction: rtl; }
#tm-deletion-gate .card { background: var(--card-bg, #fff); border-radius: 20px; max-width: 440px; width: 100%; padding: 1.4rem; box-shadow: 0 20px 50px rgba(0,0,0,0.3); text-align: center; }
#tm-deletion-gate h2 { margin: 0.4rem 0; font-size: 1.15rem; }
#tm-deletion-gate p { color: var(--text-secondary); line-height: 1.8; margin: 0 0 1rem; }
#tm-deletion-gate .btn { width: 100%; margin: 0.3rem 0 0; min-height: 48px; }
`;
function ensureStyle() {
    if (document.getElementById('ad-style')) return;
    const st = document.createElement('style');
    st.id = 'ad-style';
    st.textContent = STYLE;
    document.head.appendChild(st);
}
const fmtDate = (iso) => {
    try { return new Date(iso).toLocaleDateString('ar-EG-u-nu-latn', { weekday: 'long', day: 'numeric', month: 'long' }); } catch (e) { return ''; }
};

export function openDeleteAccount({ unlinkOnSignOut } = {}) {
    ensureStyle();
    const modal = document.createElement('div');
    modal.className = 'modal active ad-modal';
    modal.innerHTML = `<div class="modal-content" role="dialog" aria-modal="true" aria-label="حذف الحساب">
        <span class="close-modal" data-x>&times;</span>
        <div class="ad-body"></div>
    </div>`;
    document.body.appendChild(modal);
    const body = modal.querySelector('.ad-body');
    const close = () => { modal.remove(); document.removeEventListener('keydown', onKey); };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    modal.addEventListener('mousedown', (e) => { if (e.target === modal) close(); });
    modal.querySelector('[data-x]').addEventListener('click', close);

    const state = { reason: '', details: '' };
    const steps = (n) => `<div class="ad-steps" aria-hidden="true">${[1, 2, 3].map((i) => `<i class="${i <= n ? 'on' : ''}"></i>`).join('')}</div>`;

    // ---------------- 1) السبب
    const step1 = () => {
        body.innerHTML = `${steps(1)}
            <h2 style="margin-top:0">قبل ما تمشي، ليه عايز تمسح حسابك؟</h2>
            <p class="muted" style="margin:-0.3rem 0 0.8rem; font-size:0.88rem;">إجابتك بتساعدنا نحسّن البرنامج للمدرسين.</p>
            <div class="ad-reasons" role="radiogroup">${DELETE_REASONS.map((r) => `<label><input type="radio" name="ad-reason" value="${r.value}" ${state.reason === r.value ? 'checked' : ''}> ${r.label}</label>`).join('')}</div>
            <div class="form-group"><label for="ad-details">حابب تقولنا أكتر؟ <small class="muted">(اختياري)</small></label>
                <textarea id="ad-details" rows="3" maxlength="1000" placeholder="مثلًا: الميزة اللي كنت محتاجها، أو إيه اللي ضايقك" style="width:100%">${esc(state.details)}</textarea></div>
            <div class="ad-help" id="ad-help" hidden></div>
            <div class="ad-err" role="alert"></div>
            <div class="ad-btns">
                <button type="button" class="btn btn-outline" data-x2>رجوع</button>
                <button type="button" class="btn btn-danger" data-next>التالي</button>
            </div>`;
        const help = body.querySelector('#ad-help');
        const HELP = {
            missing_feature: 'ممكن تكون الميزة موجودة أو جاية قريب. اكتبها في "حابب تقولنا أكتر" أو من زرار "عندك اقتراح؟".',
            hard_to_use: 'لو حاجة معينة مش واضحة، اكتبها تحت وهنحسّنها.',
            price: 'لو الاشتراك غالي عليك، ممكن تكلّمنا ونشوف حل يناسبك.',
            temporary: 'لو هترجع تدرّس قريب، ممكن تسيب الحساب زي ما هو: طلابك وحصصك بيفضلوا محفوظين ومش هتدفع حاجة لحد ما تحتاجه.',
            duplicate_account: 'اتأكد إنك مسجّل دخول بالحساب اللي عايز تمسحه (الإيميل في أعلى صفحة الإعدادات).'
        };
        body.querySelectorAll('input[name="ad-reason"]').forEach((r) => r.addEventListener('change', () => {
            state.reason = r.value;
            const t = HELP[r.value];
            help.hidden = !t;
            if (t) {
                const wa = CONFIG.SUPPORT_WHATSAPP ? ` <a href="https://wa.me/${CONFIG.SUPPORT_WHATSAPP}" target="_blank" rel="noopener">كلّمنا على واتساب</a> (اختياري)` : '';
                help.innerHTML = `💡 ${esc(t)}${r.value === 'price' ? wa : ''}`;
            }
        }));
        body.querySelector('[data-x2]').addEventListener('click', close);
        body.querySelector('[data-next]').addEventListener('click', () => {
            state.details = body.querySelector('#ad-details').value.trim();
            if (!state.reason) { body.querySelector('.ad-err').textContent = 'اختار سبب واحد على الأقل.'; return; }
            step2();
        });
    };

    // ---------------- 2) التأكيد
    const step2 = async () => {
        let email = '';
        try { const u = await Auth.getCurrentUser(); email = (u && u.email) || ''; } catch (e) { /* تجاهل */ }
        const until = new Date(Date.now() + 14 * 86400000).toISOString();
        body.innerHTML = `${steps(2)}
            <h2 style="margin-top:0">${icon('warning', { size: 20 })} هيتمسح إيه؟</h2>
            <ul class="ad-list">
                <li>حسابك${email ? ` (<span dir="ltr">${esc(email)}</span>)` : ''} وبياناتك.</li>
                <li>كل الطلاب والمجموعات والحصص والمواعيد.</li>
                <li>المدفوعات والملاحظات والكتب المرفوعة ومحادثات المساعد.</li>
            </ul>
            <div class="ad-time">⏳ الحساب هيتقفل دلوقتي، والمسح النهائي يوم <b>${esc(fmtDate(until))}</b>.<br>لو غيّرت رأيك قبل كده، ادخل بنفس الإيميل واضغط "رجّع حسابي".</div>
            <div class="form-group"><label for="ad-pass">اكتب كلمة السر عشان نتأكد إنه انت</label>
                <input type="password" id="ad-pass" autocomplete="current-password" style="width:100%"></div>
            <label class="ad-check"><input type="checkbox" id="ad-ok"> فاهم إن بعد 14 يوم كل بياناتي هتتمسح نهائيًا ومش هقدر أرجّعها.</label>
            <div class="ad-err" role="alert"></div>
            <div class="ad-btns">
                <button type="button" class="btn btn-outline" data-back>رجوع</button>
                <button type="button" class="btn btn-danger" data-go>امسح حسابي</button>
            </div>`;
        const err = body.querySelector('.ad-err');
        body.querySelector('[data-back]').addEventListener('click', step1);
        body.querySelector('[data-go]').addEventListener('click', async (e) => {
            const btn = e.currentTarget;
            const pass = body.querySelector('#ad-pass').value;
            err.textContent = '';
            if (!body.querySelector('#ad-ok').checked) { err.textContent = 'علّم على "فاهم" الأول.'; return; }
            if (!pass) { err.textContent = 'اكتب كلمة السر.'; body.querySelector('#ad-pass').focus(); return; }
            btn.disabled = true;
            btn.textContent = 'جاري التأكد...';
            try {
                // التأكد من كلمة السر (نفس اللي بيحصل في تسجيل الدخول)
                if (email && window.supabaseClient) {
                    const { error } = await window.supabaseClient.auth.signInWithPassword({ email, password: pass });
                    if (error) throw { error: { message: 'كلمة السر مش صح.' } };
                }
                const res = await api.requestAccountDeletion(state.reason, state.details);
                try { window.tmTrack && window.tmTrack('account_deletion_requested', { reason: state.reason }); } catch (er) { /* تجاهل */ }
                step3((res && res.scheduled_for) || until);
            } catch (er) {
                err.textContent = ErrorHandler.getErrorMessage(er);
                btn.disabled = false;
                btn.textContent = 'امسح حسابي';
            }
        });
    };

    // ---------------- 3) اتجدول
    const step3 = (when) => {
        body.innerHTML = `${steps(3)}
            <div style="text-align:center">
                <div style="font-size:2.2rem">👋</div>
                <h2 style="margin:0.3rem 0">اتجدول حذف حسابك</h2>
                <p class="muted" style="line-height:1.8">هيتمسح نهائيًا يوم <b>${esc(fmtDate(when))}</b>.<br>لو غيّرت رأيك قبل كده ادخل بنفس الإيميل واضغط "رجّع حسابي".<br>شكرًا إنك جرّبت Teachers Manager 🌷</p>
                <div class="ad-btns"><button type="button" class="btn" data-out>تمام، اخرج</button></div>
            </div>`;
        const out = async () => {
            try { if (unlinkOnSignOut) await unlinkOnSignOut(); } catch (e) { /* تجاهل */ }
            try { await window.supabaseClient.auth.signOut({ scope: 'global' }); } catch (e) { /* نكمّل */ }
            await Auth.signOut();
        };
        body.querySelector('[data-out]').addEventListener('click', out);
        setTimeout(out, 12000);
    };

    step1();
}

/**
 * لو الحساب مجدول للحذف ودخل تاني: شاشة "رجّع حسابي" قبل أي حاجة
 * @param {object} profile من bootstrap-session
 */
export function showDeletionScheduledGate(profile) {
    if (!profile || !profile.deletion_scheduled_for || document.getElementById('tm-deletion-gate')) return;
    ensureStyle();
    const gate = document.createElement('div');
    gate.id = 'tm-deletion-gate';
    gate.setAttribute('role', 'dialog');
    gate.setAttribute('aria-modal', 'true');
    gate.innerHTML = `<div class="card">
        <div style="font-size:2rem">⏳</div>
        <h2>حسابك هيتمسح يوم ${esc(fmtDate(profile.deletion_scheduled_for))}</h2>
        <p>انت طلبت حذف الحساب. لو غيّرت رأيك، رجّعه دلوقتي وكل طلابك وحصصك هيرجعوا زي ما هم.</p>
        <button type="button" class="btn" data-restore>رجّع حسابي</button>
        <button type="button" class="btn btn-outline" data-out>لأ، اخرج</button>
    </div>`;
    document.body.appendChild(gate);
    gate.querySelector('[data-restore]').addEventListener('click', async (e) => {
        const b = e.currentTarget;
        b.disabled = true;
        b.textContent = 'جاري الرجوع...';
        try {
            await api.cancelAccountDeletion();
            try { sessionStorage.removeItem('tm_profile_cache_v1'); } catch (er) { /* تجاهل */ }
            try { window.tmTrack && window.tmTrack('account_deletion_cancelled', {}); } catch (er) { /* تجاهل */ }
            gate.remove();
            ErrorHandler.showSuccess('أهلًا بيك تاني! حسابك رجع زي ما كان 🌷', 6000);
        } catch (er) {
            ErrorHandler.showError(ErrorHandler.getErrorMessage(er));
            b.disabled = false;
            b.textContent = 'رجّع حسابي';
        }
    });
    gate.querySelector('[data-out]').addEventListener('click', () => Auth.signOut());
}
