/**
 * onboarding.js - "خلّينا نجهّز حسابك في 3 خطوات" (الرئيسية)
 *
 * 1. أضف أول طالب   2. حدّد موعد حصته   3. سجّل أول متابعة
 * كل خطوة بتتعلّم ✓ تلقائيًا من البيانات الفعلية (مش بإيد المستخدم).
 * بعد الثلاثة: رسالة احتفال مرة واحدة + اقتراحات اختيارية.
 */

import { api } from './api.js?v=13';
import { Formatters } from './utils.js?v=13';
import { openStudentAppointments } from './student-appointments.js?v=13';

const esc = (s) => Formatters.escapeHtml(s == null ? '' : String(s));
const LS = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* تجاهل */ } }
};

function track(step) {
    // قياس خطوات البداية (Google Tag Manager موجود في كل الصفحات)
    try { (window.dataLayer = window.dataLayer || []).push({ event: 'onboarding_step', onboarding_step: step }); } catch (e) { /* تجاهل */ }
}

function stepsFrom(status) {
    const s = status || {};
    const schedTarget = s.student_without_schedule || s.first_student;
    const lessonTarget = s.student_with_schedule || s.first_student;
    return [
        {
            key: 'student', done: (Number(s.students) || 0) > 0,
            title: 'أضف أول طالب',
            sub: 'الاسم بس يكفي — وتقدر تضيف كل طلابك مرة واحدة',
            cta: 'أضف طالب', href: 'students.html?action=add&onboarding=1'
        },
        {
            key: 'schedule', done: (Number(s.schedules) || 0) > 0,
            title: 'حدّد موعد حصته',
            sub: 'اليوم والساعة — وحصص كل يوم هتظهر لك هنا تلقائيًا',
            cta: 'حدّد الموعد', target: schedTarget, action: 'schedule'
        },
        {
            key: 'lesson', done: (Number(s.lessons) || 0) > 0,
            title: 'سجّل أول متابعة',
            sub: 'سجّل آخر حصة عملتها مع الطالب — حتى لو كانت امبارح',
            cta: 'سجّل حصة', target: lessonTarget, action: 'lesson'
        }
    ];
}

function checklistHtml(steps) {
    const doneCount = steps.filter((s) => s.done).length;
    const currentIdx = steps.findIndex((s) => !s.done);
    return `<div class="ob-card" role="region" aria-label="خطوات البداية">
        <div class="ob-head">
            <div>
                <h3>خلّينا نجهّز حسابك في 3 خطوات</h3>
                <p>انقل شغلك من الورق للبرنامج في أقل من 3 دقايق</p>
            </div>
            <span class="ob-count">${doneCount} من 3</span>
        </div>
        <div class="ob-bar" role="progressbar" aria-valuenow="${doneCount}" aria-valuemin="0" aria-valuemax="3"><span style="width:${Math.round(doneCount / 3 * 100)}%"></span></div>
        <ol class="ob-steps">
            ${steps.map((s, i) => {
                const state = s.done ? 'done' : (i === currentIdx ? 'current' : 'todo');
                const locked = !s.done && (s.action && !s.target);
                const btn = s.done ? '' : (locked
                    ? '<span class="ob-wait">بعد الخطوة الأولى</span>'
                    : `<button type="button" class="btn btn-sm ${state === 'current' ? '' : 'btn-ghost'}" data-ob-step="${i}">${esc(s.cta)}</button>`);
                return `<li class="ob-step is-${state}">
                    <span class="ob-num" aria-hidden="true">${s.done ? '✓' : i + 1}</span>
                    <div class="ob-text"><strong>${esc(s.title)}</strong><small>${s.done ? 'تم ✓' : esc(s.sub)}</small></div>
                    ${btn}
                </li>`;
            }).join('')}
        </ol>
        <button type="button" class="ob-hide" data-ob-hide>إخفاء الدليل</button>
    </div>`;
}

function celebrationHtml(status) {
    const s = status || {};
    const st = s.student_with_schedule || s.first_student;
    return `<div class="ob-card ob-done" role="status">
        <div class="ob-party" aria-hidden="true">🎉</div>
        <h3>كده أنت بدأت تستخدم البرنامج فعليًا!</h3>
        <p>كل حصة تسجّلها بتبني ملف كامل للطالب: حضوره، مستواه، واجباته وحساب حصصه.</p>
        <div class="ob-next">
            <a href="students.html?action=bulk">➕ أضف باقي طلابك مرة واحدة</a>
            ${st ? `<a href="student.html?id=${encodeURIComponent(st.id)}#billing">💳 تابع حصص ودفع ${esc(st.name || 'طالب')}</a>` : ''}
            <a href="settings.html">🔔 فعّل تنبيهات الحصص</a>
        </div>
        <button type="button" class="btn btn-sm" data-ob-close>تمام، يلا بينا</button>
    </div>`;
}

function welcomeModal(name, onStart) {
    const modal = document.createElement('div');
    modal.className = 'modal active bill-modal ob-welcome';
    modal.innerHTML = `<div class="modal-content" role="dialog" aria-modal="true" aria-label="أهلًا بك">
        <div class="ob-party" aria-hidden="true">👋</div>
        <h2 class="bm-title" style="padding:0; text-align:center;">أهلًا${name ? ` يا ${esc(name)}` : ''}!</h2>
        <p class="ob-welcome-sub">خلّينا نجهّز حسابك في 3 خطوات — أقل من 3 دقايق:</p>
        <ol class="ob-welcome-list">
            <li><span>1</span> أضف أول طالب</li>
            <li><span>2</span> حدّد موعد حصته</li>
            <li><span>3</span> سجّل أول متابعة</li>
        </ol>
        <div class="bm-buttons">
            <button type="button" class="btn" data-start>يلا نبدأ</button>
            <button type="button" class="btn btn-ghost" data-later>بعدين</button>
        </div>
    </div>`;
    const close = () => modal.remove();
    modal.querySelector('[data-start]').addEventListener('click', () => { close(); onStart(); });
    modal.querySelector('[data-later]').addEventListener('click', close);
    modal.addEventListener('mousedown', (e) => { if (e.target === modal) close(); });
    document.body.appendChild(modal);
}

/**
 * @param {{root:HTMLElement, dashboardData?:object, teacherName?:string}} opts
 * @returns {Promise<{active:boolean, status?:object}>} active = الدليل ظاهر (الخطوات لسه مخلصتش)
 */
export async function renderOnboarding({ root, dashboardData = null, teacherName = '' }) {
    if (!root) return { active: false };
    let status;
    try { status = await api.getOnboardingStatus(dashboardData); } catch (e) { root.innerHTML = ''; return { active: false }; }
    const steps = stepsFrom(status);
    const allDone = steps.every((s) => s.done);

    // تتبع الخطوات اللي اتعملت لأول مرة
    const prev = (LS.get('tm_ob_state') || '').split(',');
    steps.forEach((s) => { if (s.done && !prev.includes(s.key)) track(s.key); });
    LS.set('tm_ob_state', steps.filter((s) => s.done).map((s) => s.key).join(','));

    if (allDone) {
        // مستخدم قديم عمره ما شاف الدليل: مفيش داعي لرسالة الاحتفال
        if (!LS.get('tm_ob_seen')) LS.set('tm_ob_celebrated', '1');
        if (LS.get('tm_ob_celebrated')) { root.innerHTML = ''; return { active: false, status }; }
        root.innerHTML = celebrationHtml(status);
        track('all_done');
        root.querySelector('[data-ob-close]').addEventListener('click', () => { LS.set('tm_ob_celebrated', '1'); root.innerHTML = ''; });
        return { active: false, status };
    }

    LS.set('tm_ob_seen', '1');
    if (LS.get('tm_ob_hidden')) { root.innerHTML = ''; return { active: false, status }; }

    root.innerHTML = checklistHtml(steps);
    root.querySelector('[data-ob-hide]').addEventListener('click', () => {
        LS.set('tm_ob_hidden', '1');
        root.innerHTML = '';
    });
    root.querySelectorAll('[data-ob-step]').forEach((btn) => btn.addEventListener('click', () => {
        const step = steps[Number(btn.dataset.obStep)];
        if (!step) return;
        if (step.href) { window.location.href = step.href; return; }
        if (!step.target) return;
        if (step.action === 'schedule') openStudentAppointments(step.target.id, step.target.name || '');
        else if (step.action === 'lesson') window.location.href = `lesson.html?student_id=${encodeURIComponent(step.target.id)}&manual=1&onboarding=1`;
    }));

    const doneCount = steps.filter((s) => s.done).length;
    if (doneCount === 0 && !LS.get('tm_welcome_seen')) {
        LS.set('tm_welcome_seen', '1');
        welcomeModal(teacherName, () => { window.location.href = steps[0].href; });
    }
    return { active: true, status };
}
