/**
 * plan.js — v36: التفرقة الفعلية بين باقة «البداية» و«الاحترافية»
 *
 * التحقق الحقيقي بيحصل على السيرفر (n8n: plan-gate). الملف ده للواجهة بس:
 *  - tierFrom(sub): نفس منطق السيرفر بالظبط (لازم يفضلوا متطابقين)
 *  - نافذة الترقية لما السيرفر يرفض (حدث tm:plan-limit من utils.js)
 *  - علامة «الاحترافية» على المزايا المقفولة في باقة البداية، والضغط عليها بيفتح نافذة الترقية على طول
 */
import { CONFIG } from './config.js?v=57';
import { icon } from './icons.js?v=57';
import { priceFor, subscribeMessage, waUrl } from './pricing.js?v=57';

// لازم تطابق LIMITS في workflow plan-gate (عقدة Decide & Forward)
export const PLAN_LIMITS = { starter: { students: 10, ai: 10 }, pro: { students: null, ai: 40 } };

/** 'pro' | 'starter' | 'expired' — الفترة المجانية = الاحترافية كاملة */
export function tierFrom(sub) {
    if (!sub || sub.status === 'none') return 'pro';
    const now = Date.now();
    if (sub.status === 'trial') return (!sub.trial_ends_at || Date.parse(sub.trial_ends_at) > now) ? 'pro' : 'expired';
    if (sub.status === 'active') {
        if (sub.paid_until && Date.parse(sub.paid_until) <= now) return 'expired';
        return sub.plan === 'starter' ? 'starter' : 'pro';
    }
    return 'expired';
}

export async function getTier() {
    try {
        const { getSubscriptionCached } = await import('./sidebar.js?v=57');
        return tierFrom(await getSubscriptionCached());
    } catch (e) { return 'pro'; }   // مش عارفين: مانقفلش حاجة (السيرفر هو الحكم)
}

const TITLES = {
    PLAN_LIMIT_STUDENTS: 'وصلت لحد باقة البداية',
    PLAN_LIMIT_AI: 'خلصت طلبات المساعد الذكي النهارده',
    PLAN_PRO_ONLY: 'الميزة دي في الباقة الاحترافية'
};

/** نافذة ترقية من تحت (موبايل) / في النص (كمبيوتر) */
export function openUpgrade(err = {}) {
    if (err.code === 'SUBSCRIPTION_EXPIRED') { try { window.tmOpenSubscribePrompt && window.tmOpenSubscribePrompt('payment_expired'); } catch (e) { /* تجاهل */ } return; }
    if (document.getElementById('tm-upgrade')) return;
    const pro = CONFIG.PRICING.PLANS.find((p) => p.id === 'pro') || { name: 'الاحترافية' };
    const pr = priceFor('pro', 'monthly');
    const msg = String(err.message || '').replace(/\s*تقدر تشترك في الباقة الاحترافية من صفحة الاشتراك\.?\s*$/, '').trim();
    const m = document.createElement('div');
    m.id = 'tm-upgrade';
    m.className = 'tm-sheet';
    m.innerHTML = `<div class="tm-sheet-panel tm-up" role="dialog" aria-modal="true" aria-labelledby="tm-up-t">
        <div class="tm-sheet-grip" aria-hidden="true"></div>
        <button type="button" class="tm-sheet-x tm-up-x" data-x aria-label="قفل">${icon('x', { size: 18 })}</button>
        <div class="tm-up-ic" aria-hidden="true">${icon('crown', { size: 26 })}</div>
        <h3 id="tm-up-t">${TITLES[err.code] || TITLES.PLAN_PRO_ONLY}</h3>
        ${msg ? `<p class="tm-up-msg">${msg.replace(/[<>&]/g, '')}</p>` : ''}
        <ul class="tm-up-list">
            <li>${icon('check', { size: 15 })} طلاب بلا حد</li>
            <li>${icon('check', { size: 15 })} المساعد الذكي و«حضّرلي الحصة»</li>
            <li>${icon('check', { size: 15 })} «مكتبتي»: كتبك ومذكراتك و«اسأل كتبك»</li>
            <li>${icon('check', { size: 15 })} ملخص فلوس الشهر</li>
        </ul>
        <a class="btn tm-up-go" target="_blank" rel="noopener" href="${waUrl(subscribeMessage({ planId: 'pro', period: 'monthly' }))}">${icon('messageCircle', { size: 17 })} اشترك في ${pro.name} · ${pr.price} جنيه في الشهر</a>
        <a class="tm-up-more" href="subscription.html">قارن الباقات</a>
    </div>`;
    const close = () => { m.classList.remove('open'); setTimeout(() => m.remove(), 180); document.removeEventListener('keydown', onKey); };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    m.addEventListener('click', (e) => { if (e.target === m || e.target.closest('[data-x]')) close(); });
    document.addEventListener('keydown', onKey);
    document.body.appendChild(m);
    requestAnimationFrame(() => m.classList.add('open'));
    setTimeout(() => { const b = m.querySelector('.tm-up-go'); if (b) b.focus({ preventScroll: true }); }, 60);
}

// المزايا المقفولة في البداية: أي عنصر عليه data-pro-feature بياخد علامة، والضغط عليه بيفتح الترقية من غير ما نكلّم السيرفر
const PRO_SELECTORS = ['#btn-prepare-lesson', '#ql-income', '#btn-ask-submit', '.lib2-menu [data-m="upload"]', '[data-pa="add"]', '[data-pro-feature]'];
let installed = false;
export function installPlanUi() {
    if (installed) return;
    installed = true;
    window.addEventListener('tm:plan-limit', (e) => openUpgrade((e && e.detail) || {}));
    getTier().then((tier) => {
        document.documentElement.classList.toggle('tm-starter', tier === 'starter');
        if (tier !== 'starter') return;
        document.addEventListener('click', (e) => {
            const el = e.target.closest(PRO_SELECTORS.join(','));
            if (!el) return;
            e.preventDefault();
            e.stopImmediatePropagation();
            const NAMES = { 'btn-prepare-lesson': '«حضّرلي الحصة»', 'ql-income': 'ملخص فلوس الشهر', 'btn-ask-submit': '«اسأل كتبك»' };
            const name = el.dataset.proName || NAMES[el.id] || (el.matches('[data-m="upload"], [data-pa="add"]') ? '«مكتبتي» (رفع الكتب وإضافتها)' : 'الميزة دي');
            openUpgrade({ code: 'PLAN_PRO_ONLY', message: `${name} في الباقة الاحترافية بس.` });
        }, true);
    });
}
