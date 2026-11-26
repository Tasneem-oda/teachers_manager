/**
 * guide.js — v36: إرشاد المدرس الجديد
 *  - hasLesson / ensureLessonFlag: المدرس سجّل حصة قبل كده ولا لأ (من الجهاز، ولو مش معروف بنسأل السيرفر مرة)
 *  - applyAiGate: المساعد الذكي بيستخبى (مش بيتشال) لحد أول حصة مسجّلة
 *  - guideBusy: رسالة إرشاد واحدة بس في نفس الوقت (خطوة / دعوة / إشعارات / تلميح)
 */
import { api } from './api.js?v=59';

const LS = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* تجاهل */ } }
};
const cairoDay = (d = new Date()) => d.toLocaleDateString('en-CA', { timeZone: 'Africa/Cairo' });

/** true / false / null (مش معروف على الجهاز ده) */
export function hasLesson() {
    if (LS.get('tm_has_lesson') === '1') return true;
    const st = (LS.get('tm_ob_state') || '').split(',');
    if (st.includes('lesson') || LS.get('tm_ob_lesson_done') === '1') return true;
    if (LS.get('tm_has_lesson') === '0') return false;
    return null;
}

/** بعد ما الرئيسية تجيب حالة البداية من السيرفر */
export function setLessonsCount(n) {
    const prev = hasLesson();
    if ((Number(n) || 0) > 0) {
        LS.set('tm_has_lesson', '1');
        // كان معروف إنه ماعندوش حصص ← أول حصة النهارده. مش معروف (جهاز جديد لمدرس قديم) ← قديم
        if (!LS.get('tm_first_lesson_day')) LS.set('tm_first_lesson_day', prev === false ? cairoDay() : '2000-01-01');
    } else if (prev !== true) LS.set('tm_has_lesson', '0');
    applyAiGate();
}

/** أول حصة اتحفظت دلوقتي (من صفحة الحصة). بيرجّع true لو دي فعلًا أول حصة للمدرس */
export function markLessonSaved() {
    const first = hasLesson() === false;
    LS.set('tm_has_lesson', '1');
    LS.set('tm_ob_lesson_done', '1');
    if (!LS.get('tm_first_lesson_day')) LS.set('tm_first_lesson_day', first ? cairoDay() : '2000-01-01');
    applyAiGate();
    return first;
}

let checking = null;
export function ensureLessonFlag() {
    const known = hasLesson();
    if (known !== null) { applyAiGate(); return Promise.resolve(known); }
    if (!checking) {
        checking = api.getOnboardingStatus().then((s) => { setLessonsCount(s && s.lessons); return hasLesson() === true; })
            .catch(() => { applyAiGate(true); return true; });   // مش عارفين: مانخبّيش حاجة
    }
    return checking;
}

/** المساعد الذكي: مستخبي لحد أول حصة (كلاس على html والـ CSS في ui.css) */
export function applyAiGate(forceShow = false) {
    const hide = !forceShow && hasLesson() !== true;
    document.documentElement.classList.toggle('tm-no-ai', hide);
}

/** يوم بعد يوم أول حصة؟ (لدعوة مجتمع واتساب) */
export function dayAfterFirstLesson() {
    const d = LS.get('tm_first_lesson_day');
    return !!d && d !== '2000-01-01' && d < cairoDay();
}

/** فيه رسالة إرشاد ظاهرة دلوقتي؟ */
export function guideBusy() {
    return !!document.querySelector('.ob-card, .rm-card, .gd-card, #tm-notif-banner, .tip-bubble, .modal.active, .tm-confirm');
}

export const once = {
    seen(k) { return LS.get('tm_once_' + k) === '1'; },
    mark(k) { LS.set('tm_once_' + k, '1'); }
};
