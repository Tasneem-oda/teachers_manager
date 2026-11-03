/**
 * pricing.js — v29.3: الأسعار والعرض ورسالة الاشتراك على واتساب (مكان واحد لكل الصفحات)
 */
import { CONFIG } from './config.js?v=34';

const P = CONFIG.PRICING;
const fmt = (n) => Number(n).toLocaleString('en-US');
export const money = (n) => `${fmt(n)} جنيه`;
export const planById = (id) => P.PLANS.find((p) => p.id === id);

/** العرض شغال لحد آخر يوم UNTIL بتوقيت مصر */
export function offerActive(now = Date.now()) {
    const o = P.OFFER;
    return !!(o && o.UNTIL) && now <= new Date(`${o.UNTIL}T23:59:59+02:00`).getTime();
}
export function offerDaysLeft(now = Date.now()) {
    if (!offerActive(now)) return 0;
    return Math.max(1, Math.ceil((new Date(`${P.OFFER.UNTIL}T23:59:59+02:00`).getTime() - now) / 864e5));
}
/** هل فيه دفع سنوي دلوقتي؟ (في العرض: 799 للاحترافية) */
export const annualAvailable = () => offerActive() || !!P.PRO_ANNUAL_AFTER_OFFER;

/**
 * سعر باقة لمدة معيّنة
 * @returns {{price:number, regular:number|null, unit:string, offer:boolean, note:string, available:boolean}}
 */
export function priceFor(planId, period = 'monthly') {
    const plan = planById(planId); const o = P.OFFER; const on = offerActive();
    if (!plan) return { price: 0, regular: null, unit: '', offer: false, note: '', available: false };
    if (period === 'annual') {
        if (planId !== 'pro') return { price: plan.price, regular: null, unit: 'شهريًا', offer: false, note: 'الباقة دي بالدفع الشهري بس', available: false };
        if (on) return { price: o.PRO_ANNUAL, regular: P.PRO_ANNUAL_REGULAR, unit: 'للسنة', offer: true, note: `يعني حوالي ${fmt(Math.round(o.PRO_ANNUAL / 12))} جنيه في الشهر · بتدفع مرة واحدة`, available: true };
        if (P.PRO_ANNUAL_AFTER_OFFER) return { price: P.PRO_ANNUAL_AFTER_OFFER, regular: plan.price * 12, unit: 'للسنة', offer: false, note: 'بتدفع مرة واحدة', available: true };
        return { price: plan.price, regular: null, unit: 'شهريًا', offer: false, note: '', available: false };
    }
    if (planId === 'pro' && on) {
        return { price: o.PRO_MONTHLY, regular: plan.price, unit: 'شهريًا', offer: true, note: `السعر ده ثابت لك ${fmt(o.PRO_MONTHLY_MONTHS)} شهر، وبعدها ${fmt(plan.price)} جنيه`, available: true };
    }
    return { price: plan.price, regular: null, unit: 'شهريًا', offer: false, note: '', available: true };
}

/** الرسالة الجاهزة لواتساب: الباقة والمدة والسعر وإيميل الحساب عشان التفعيل يبقى على طول */
export function subscribeMessage({ planId, period = 'monthly', email = '', name = '' }) {
    const plan = planById(planId); const pr = priceFor(planId, period);
    const realPeriod = pr.available ? period : 'monthly';
    const lines = [
        'مرحباً، أرغب في الاشتراك في Teachers Manager',
        `• الباقة: ${plan ? plan.name : planId}`,
        `• الدفع: ${realPeriod === 'annual' ? 'سنوي' : 'شهري'} — ${money(pr.price)}${realPeriod === 'annual' ? ' للسنة' : ' في الشهر'}${pr.offer ? ` (${P.OFFER.TITLE})` : ''}`,
        `• إيميل حسابي: ${email || '(اكتب الإيميل اللي بتدخل بيه البرنامج)'}`
    ];
    if (name) lines.push(`• الاسم: ${name}`);
    return lines.join('\n');
}
export const waUrl = (text) => `https://wa.me/${CONFIG.SUPPORT_WHATSAPP}?text=${encodeURIComponent(text)}`;

/** إيميل واسم المدرس الداخل (من الجلسة أو الملف المحفوظ) */
export async function currentUserInfo() {
    let email = ''; let name = '';
    try { const prof = JSON.parse(localStorage.getItem('user_profile') || 'null'); if (prof) { email = prof.email || ''; name = prof.name || ''; } } catch (e) { /* تجاهل */ }
    try {
        if (window.supabaseClient) {
            const { data } = await window.supabaseClient.auth.getSession();
            const u = data && data.session && data.session.user;
            if (u) { email = u.email || email; name = name || (u.user_metadata && (u.user_metadata.full_name || u.user_metadata.name)) || ''; }
        }
    } catch (e) { /* تجاهل */ }
    return { email, name };
}
