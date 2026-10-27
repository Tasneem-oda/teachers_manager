/**
 * reminder-settings.js — v28: اختيارات التذكير (قبل الحصة / وقت الحصة / بصوت)
 *  - mountReminderControls: نفس الأزرار في الإعدادات (بتتحفظ أول ما تتغير)
 *  - mountReminderSetupCard: كارت في الرئيسية بيسأل المدرس مرة واحدة (3 أسئلة سريعة)
 *  - playReminderSound: جرس التذكير لما البرنامج يكون مفتوح
 */
import { api } from './api.js?v=29';
import { ErrorHandler } from './utils.js?v=29';
import { icon } from './icons.js?v=29';

export const BEFORE_OPTIONS = [
    { value: null, label: 'لأ' },
    { value: 30, label: 'قبلها بنص ساعة' },
    { value: 60, label: 'قبلها بساعة' }
];

const STYLE = `
.rm-block { margin-top: 0.9rem; }
.rm-q { font-weight: 700; color: var(--text-primary); margin: 0 0 0.45rem; font-size: 0.95rem; }
.rm-sub { font-size: 0.82rem; color: var(--text-secondary); margin: -0.25rem 0 0.5rem; line-height: 1.6; }
.rm-seg { display: flex; flex-wrap: wrap; gap: 0.4rem; }
.rm-seg button { border: 1.5px solid var(--border); background: var(--card-bg); color: var(--text-primary); border-radius: 12px; padding: 0.55rem 0.9rem; font: inherit; font-size: 0.9rem; font-weight: 600; cursor: pointer; min-height: 44px; }
.rm-seg button[aria-pressed="true"] { border-color: var(--primary); background: #F2ECF7; color: var(--primary); }
.rm-fixed { display: flex; align-items: center; gap: 0.5rem; background: #FCF7E0; border-radius: 12px; padding: 0.6rem 0.8rem; font-size: 0.88rem; color: #6B4E12; line-height: 1.6; }
.rm-saved { font-size: 0.8rem; color: var(--success-text, #2E7D32); margin-top: 0.4rem; min-height: 1.1em; }
.rm-help summary { cursor: pointer; color: var(--primary); font-weight: 600; font-size: 0.88rem; margin-top: 0.8rem; min-height: 36px; display: inline-flex; align-items: center; }
.rm-help ol { margin: 0.4rem 0 0; padding-inline-start: 1.3rem; font-size: 0.86rem; line-height: 1.9; color: var(--text-secondary); }
.rm-card { background: linear-gradient(135deg, #F7F3FA 0%, #FFFFFF 100%); border: 1px solid #DCCFE6; border-radius: 16px; padding: 1rem 1.1rem; margin-bottom: 1.2rem; position: relative; }
.rm-card h3 { margin: 0 0 0.25rem; font-size: 1.02rem; color: var(--primary); display: flex; align-items: center; gap: 0.4rem; }
.rm-card .rm-x { position: absolute; top: 0.5rem; left: 0.5rem; background: none; border: 0; color: var(--text-secondary); font-size: 1.1rem; cursor: pointer; min-width: 40px; min-height: 40px; }
.rm-steps { font-size: 0.78rem; color: var(--text-secondary); margin-bottom: 0.6rem; }
`;
function ensureStyle() {
    if (document.getElementById('rm-style')) return;
    const st = document.createElement('style');
    st.id = 'rm-style';
    st.textContent = STYLE;
    document.head.appendChild(st);
}

const seg = (name, options, current) => `<div class="rm-seg" role="group" data-name="${name}">${options.map((o) =>
    `<button type="button" data-v="${o.value === null ? '' : o.value}" aria-pressed="${String(o.value) === String(current)}">${o.label}</button>`).join('')}</div>`;

/** الإعدادات: الأزرار بتتحفظ أول ما تتغير */
export function mountReminderControls(root, settings) {
    ensureStyle();
    const st = { remind_before_minutes: null, remind_at_start: false, remind_sound: true, ...(settings || {}) };
    root.innerHTML = `
        <div class="rm-fixed">🌅 <span>كل يوم <b>الساعة 5 الصبح</b> بيوصلك ملخص حصص اليوم (شغال لكل المدرسين).</span></div>
        <div class="rm-block">
            <p class="rm-q">تذكير قبل كل حصة</p>
            ${seg('remind_before_minutes', BEFORE_OPTIONS, st.remind_before_minutes)}
        </div>
        <div class="rm-block">
            <p class="rm-q">تذكير تاني أول ما ميعاد الحصة ييجي</p>
            ${seg('remind_at_start', [{ value: true, label: 'أيوه' }, { value: false, label: 'لأ' }], st.remind_at_start)}
        </div>
        <div class="rm-block">
            <p class="rm-q">صوت التذكير</p>
            ${seg('remind_sound', [{ value: true, label: '🔔 بصوت' }, { value: false, label: '🔕 من غير جرس' }], st.remind_sound)}
        </div>
        <div class="rm-saved" aria-live="polite"></div>
        <div style="display:flex; gap:0.5rem; flex-wrap:wrap; margin-top:0.6rem;">
            <button type="button" class="btn btn-outline" data-test>${icon('bell', { size: 16 })} جرّب التنبيه دلوقتي</button>
        </div>
        <details class="rm-help">
            <summary>التنبيه بيوصل من غير صوت؟</summary>
            <ol>
                <li><b>أندرويد:</b> الإعدادات ← التطبيقات ← Chrome (أو Teachers Manager لو مثبّت) ← الإشعارات ← اختار "تنبيه بصوت" أو "أولوية عالية"، وشيل "صامت".</li>
                <li><b>آيفون:</b> لازم البرنامج يكون مثبّت على الشاشة الرئيسية، وبعدين الإعدادات ← الإشعارات ← Teachers Manager ← شغّل "الأصوات".</li>
                <li>اتأكد إن الموبايل مش على "عدم الإزعاج" أو "صامت".</li>
                <li>لما البرنامج يكون مفتوح، الجرس بيرن من البرنامج نفسه كمان.</li>
            </ol>
        </details>`;
    const saved = root.querySelector('.rm-saved');
    root.addEventListener('click', async (e) => {
        const b = e.target.closest('.rm-seg button');
        if (b) {
            const group = b.parentElement;
            const name = group.dataset.name;
            const raw = b.dataset.v;
            const value = name === 'remind_before_minutes' ? (raw === '' ? null : Number(raw)) : raw === 'true';
            group.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
            saved.textContent = 'جاري الحفظ...';
            try {
                await api.saveTeacherSettings({ [name]: value, reminders_configured: true });
                saved.textContent = '✓ اتحفظ';
                if (name === 'remind_sound' && value) playReminderSound();
                setTimeout(() => { if (saved.textContent === '✓ اتحفظ') saved.textContent = ''; }, 2500);
            } catch (err) {
                saved.textContent = '';
                ErrorHandler.showError(ErrorHandler.getErrorMessage(err));
            }
            return;
        }
        const t = e.target.closest('[data-test]');
        if (t) {
            t.disabled = true;
            try {
                await api.testReminder();
                ErrorHandler.showSuccess('اتبعت تنبيه تجربة. لو ماوصلش خلال دقيقة، اتأكد إن الإشعارات مفعّلة فوق.', 6000);
            } catch (err) { ErrorHandler.showError(ErrorHandler.getErrorMessage(err)); }
            finally { setTimeout(() => { t.disabled = false; }, 4000); }
        }
    });
}

/**
 * الرئيسية: كارت بيسأل المدرس 3 أسئلة (مرة واحدة). بيختفي بعد الحفظ أو "بعدين".
 * onEnablePush: بتطلب إذن الإشعارات لو لسه مش مفعّل
 */
export async function mountReminderSetupCard(root, { onEnablePush } = {}) {
    if (!root) return;
    try { if (localStorage.getItem('tm_rm_card_off') === '1') return; } catch (e) { /* تجاهل */ }
    let settings = null;
    try { settings = await api.getTeacherSettings(); } catch (e) { return; }
    if (!settings || settings.reminders_configured) return;   // الـ workflow مش متركب أو المدرس اختار قبل كده
    ensureStyle();
    const answers = { remind_before_minutes: 60, remind_at_start: true, remind_sound: true };
    let step = 0;
    const QUESTIONS = [
        { key: 'remind_before_minutes', q: 'تحب نفكرك قبل كل حصة؟', sub: 'غير تذكير الساعة 5 الصبح بحصص اليوم.', options: [{ value: 60, label: 'قبلها بساعة' }, { value: 30, label: 'قبلها بنص ساعة' }, { value: null, label: 'لأ، كفاية الصبح' }] },
        { key: 'remind_at_start', q: 'ونبعتلك تنبيه تاني أول ما ميعاد الحصة ييجي؟', options: [{ value: true, label: 'أيوه' }, { value: false, label: 'لأ' }] },
        { key: 'remind_sound', q: 'التذكير يكون بصوت؟', options: [{ value: true, label: '🔔 بصوت' }, { value: false, label: '🔕 من غير جرس' }] }
    ];
    const render = () => {
        const Q = QUESTIONS[step];
        root.innerHTML = `<div class="rm-card" role="region" aria-label="إعداد التذكيرات">
            <button type="button" class="rm-x" data-later aria-label="بعدين">✕</button>
            <h3>${icon('bell', { size: 18 })} تذكير الحصص</h3>
            <div class="rm-steps">سؤال ${step + 1} من ${QUESTIONS.length}</div>
            <p class="rm-q">${Q.q}</p>
            ${Q.sub ? `<p class="rm-sub">${Q.sub}</p>` : ''}
            <div class="rm-seg" data-name="${Q.key}">${Q.options.map((o) => `<button type="button" data-v="${o.value === null ? '' : o.value}">${o.label}</button>`).join('')}</div>
        </div>`;
    };
    render();
    root.addEventListener('click', async (e) => {
        if (e.target.closest('[data-later]')) {
            try { localStorage.setItem('tm_rm_card_off', '1'); } catch (er) { /* تجاهل */ }
            root.innerHTML = '';
            return;
        }
        const b = e.target.closest('.rm-seg button');
        if (!b) return;
        const key = QUESTIONS[step].key;
        const raw = b.dataset.v;
        answers[key] = key === 'remind_before_minutes' ? (raw === '' ? null : Number(raw)) : raw === 'true';
        // لو مش عايز تذكير قبل الحصة ولا وقتها، مالوش لازمة نسأل عن الصوت
        if (step === 1 && answers.remind_before_minutes === null && answers.remind_at_start === false) step = QUESTIONS.length;
        else step++;
        if (step < QUESTIONS.length) { render(); return; }
        root.innerHTML = `<div class="rm-card"><p class="rm-q" style="margin:0">جاري الحفظ...</p></div>`;
        try {
            await api.saveTeacherSettings({ ...answers, reminders_configured: true });
            if (answers.remind_sound) playReminderSound();
            const parts = [];
            if (answers.remind_before_minutes) parts.push(answers.remind_before_minutes === 60 ? 'قبل الحصة بساعة' : 'قبل الحصة بنص ساعة');
            if (answers.remind_at_start) parts.push('ووقت الحصة');
            const needPush = 'Notification' in window && Notification.permission !== 'granted';
            root.innerHTML = `<div class="rm-card">
                <h3>${icon('checkCircle', { size: 18 })} تمام!</h3>
                <p class="rm-sub" style="margin:0.2rem 0 0.6rem">${parts.length ? `هنفكرك ${parts.join(' ')}${answers.remind_sound ? ' بصوت' : ''}.` : 'هيوصلك ملخص الصبح بس.'} تقدر تغيّر ده من الإعدادات.</p>
                ${needPush ? `<button type="button" class="btn" data-push>${icon('bell', { size: 16 })} فعّل الإشعارات على الجهاز ده</button>` : ''}
            </div>`;
            const pb = root.querySelector('[data-push]');
            if (pb) pb.addEventListener('click', async () => { if (onEnablePush) await onEnablePush(); root.innerHTML = ''; });
            else setTimeout(() => { root.innerHTML = ''; }, 6000);
        } catch (err) {
            ErrorHandler.showError(ErrorHandler.getErrorMessage(err));
            step = 0;
            render();
        }
    });
}

/** جرس قصير (3 نغمات) + اهتزاز. بيشتغل لما البرنامج مفتوح */
export function playReminderSound() {
    try { if (navigator.vibrate) navigator.vibrate([180, 90, 180]); } catch (e) { /* تجاهل */ }
    try {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return;
        const ctx = new Ctx();
        const notes = [880, 1175, 1568];
        notes.forEach((f, i) => {
            const o = ctx.createOscillator();
            const g = ctx.createGain();
            o.type = 'sine';
            o.frequency.value = f;
            const t0 = ctx.currentTime + i * 0.22;
            g.gain.setValueAtTime(0.0001, t0);
            g.gain.exponentialRampToValueAtTime(0.35, t0 + 0.02);
            g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.4);
            o.connect(g); g.connect(ctx.destination);
            o.start(t0); o.stop(t0 + 0.42);
        });
        setTimeout(() => { try { ctx.close(); } catch (e) { /* تجاهل */ } }, 1500);
    } catch (e) { /* المتصفح منع الصوت */ }
}
