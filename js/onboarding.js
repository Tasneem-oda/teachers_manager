/**
 * onboarding.js - "خلّينا نجهّز حسابك في 3 خطوات" (الرئيسية)
 *
 * 1. أضف أول طالب   2. حدّد ميعاد أول حصة   3. سجّل أول حصة
 * v36: كارت واحد بيعرض الخطوة الجاية بس، ومفيش نافذة ترحيب.
 * كل خطوة بتتعلّم ✓ تلقائيًا من البيانات الفعلية (مش بإيد المستخدم).
 * بعد الثلاثة: رسالة احتفال مرة واحدة + اقتراحات اختيارية.
 */

import { api } from './api.js?v=59';
import { Formatters } from './utils.js?v=59';
import { openStudentAppointments } from './student-appointments.js?v=59';
import { setLessonsCount } from './guide.js?v=59';

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
            sub: 'الاسم بس يكفي. باقي البيانات تقدر تكمّلها بعدين.',
            cta: 'أضف أول طالب', href: 'students.html?action=add&onboarding=1'
        },
        {
            key: 'schedule', done: (Number(s.schedules) || 0) > 0,
            title: 'حدّد ميعاد أول حصة',
            sub: 'اختار اليوم والساعة وهتظهر في جدولك وتذكيرك.',
            cta: 'حدّد الموعد', target: schedTarget, action: 'schedule'
        },
        {
            key: 'lesson', done: (Number(s.lessons) || 0) > 0,
            title: 'سجّل أول حصة',
            sub: 'ابدأ الحصة، واكتب اللي اتعمل، وبعدين احفظ. بياناتك بتتحفظ تلقائيًا.',
            cta: 'ابدأ أول حصة', target: lessonTarget, action: 'lesson'
        }
    ];
}

// v36: كارت خطوة واحدة بس (أول خطوة لسه ماتعملتش) بدل قايمة الخطوات ونافذة الترحيب
function checklistHtml(steps) {
    const doneCount = steps.filter((s) => s.done).length;
    const idx = steps.findIndex((s) => !s.done);
    const s = steps[idx];
    const n = idx + 1;
    return `<div class="ob-card ob-one" role="region" aria-label="خطوات البداية">
        <div class="ob-top">
            <span class="ob-count">الخطوة ${n} من ${steps.length}</span>
            <div class="ob-bar" role="progressbar" aria-valuenow="${doneCount}" aria-valuemin="0" aria-valuemax="${steps.length}" aria-label="${doneCount} من ${steps.length} خطوات خلصت"><span style="width:${Math.round(((doneCount) / steps.length) * 100)}%"></span></div>
        </div>
        <h3>${esc(s.title)}</h3>
        <p>${esc(s.sub)}</p>
        <div class="ob-actions">
            <button type="button" class="btn" data-ob-step="${idx}">${esc(s.cta)}</button>
            <button type="button" class="ob-later" data-ob-hide>مش دلوقتي</button>
        </div>
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

/**
 * @param {{root:HTMLElement, dashboardData?:object, teacherName?:string}} opts
 * @returns {Promise<{active:boolean, status?:object}>} active = الدليل ظاهر (الخطوات لسه مخلصتش)
 */
export async function renderOnboarding({ root, dashboardData = null, teacherName = '' }) {
    if (!root) return { active: false };
    let status;
    try { status = await api.getOnboardingStatus(dashboardData); } catch (e) { root.innerHTML = ''; return { active: false }; }
    const steps = stepsFrom(status);
    setLessonsCount(status && status.lessons);
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
        root.querySelector('[data-ob-close]').addEventListener('click', () => { LS.set('tm_ob_celebrated', '1'); root.innerHTML = ''; try { window.dispatchEvent(new CustomEvent('tm:guide-free')); } catch (e) { /* تجاهل */ } });
        return { active: false, celebrating: true, status };
    }

    LS.set('tm_ob_seen', '1');
    // v36: «مش دلوقتي» بيخفي الكارت في الجلسة دي بس
    let hiddenNow = false;
    try { hiddenNow = sessionStorage.getItem('tm_ob_later') === '1'; } catch (e) { /* تجاهل */ }
    if (hiddenNow) { root.innerHTML = ''; return { active: false, later: true, status }; }

    root.innerHTML = checklistHtml(steps);
    root.querySelector('[data-ob-hide]').addEventListener('click', () => {
        try { sessionStorage.setItem('tm_ob_later', '1'); } catch (e) { /* تجاهل */ }
        root.innerHTML = '';
        try { window.dispatchEvent(new CustomEvent('tm:guide-free')); } catch (e) { /* تجاهل */ }
    });
    root.querySelectorAll('[data-ob-step]').forEach((btn) => btn.addEventListener('click', () => {
        const step = steps[Number(btn.dataset.obStep)];
        if (!step) return;
        if (step.href) { window.location.href = step.href; return; }
        if (!step.target) return;
        if (step.action === 'schedule') openStudentAppointments(step.target.id, step.target.name || '', { onboarding: true });
        else if (step.action === 'lesson') window.location.href = `lesson.html?student_id=${encodeURIComponent(step.target.id)}&onboarding=1`;
    }));
    return { active: true, status };
}
