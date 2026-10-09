/**
 * suggestions.js - "عندك اقتراح؟"
 * المدرس يكتب اقتراحه من أي صفحة، ويختار لو موافق إن اسمه يظهر لما الميزة تتنفذ.
 * الاقتراحات بتتحفظ في teachers_manager.feature_suggestions (n8n/submit-suggestion.json)
 * ودي أساس داشبورد المساهمين بعدين.
 */

import { api } from './api.js?v=17';
import { ErrorHandler } from './utils.js?v=17';
import { icon } from './icons.js?v=17';
import { CONFIG } from './config.js?v=17';

export function openSuggestionModal() {
    if (document.getElementById('tm-suggest-modal')) return;
    const modal = document.createElement('div');
    modal.id = 'tm-suggest-modal';
    modal.className = 'modal active';
    modal.innerHTML = `<div class="modal-content" role="dialog" aria-modal="true" aria-label="اقترح ميزة" style="position:relative; max-width:460px;">
        <button type="button" class="close-modal" aria-label="إغلاق" style="background:none;border:0;font-size:1.6rem;cursor:pointer;">&times;</button>
        <h2 style="margin:0 0 0.4rem;">💡 عندك اقتراح؟</h2>
        <p style="margin:0 0 1rem; color:var(--text-secondary); font-size:0.9rem;">قولنا إيه اللي يسهّل شغلك أو إيه اللي ضايقك. كل اقتراح بنقراه بنفسنا.</p>
        <form id="tm-suggest-form" novalidate>
            <div class="form-group">
                <label for="tm-suggest-text">اقتراحك</label>
                <textarea id="tm-suggest-text" rows="5" maxlength="2000" style="width:100%; font:inherit;" placeholder="مثلًا: نفسي أقدر أبعت التقرير لكل أولياء الأمور مرة واحدة"></textarea>
            </div>
            <label style="display:flex; gap:0.5rem; align-items:flex-start; font-size:0.9rem; margin-bottom:1rem; cursor:pointer;">
                <input type="checkbox" id="tm-suggest-name" checked style="margin-top:0.25rem;">
                <span>ممكن تذكروا اسمي لما الميزة دي تتنفذ</span>
            </label>
            <div style="display:flex; gap:0.6rem; flex-wrap:wrap;">
                <button type="submit" class="btn" id="tm-suggest-send">${icon('send', { size: 15 })} ابعت الاقتراح</button>
                <a class="btn btn-ghost" id="tm-suggest-wa" target="_blank" rel="noopener">كلّمنا على واتساب</a>
            </div>
        </form>
    </div>`;
    document.body.appendChild(modal);
    const close = () => modal.remove();
    modal.querySelector('.close-modal').addEventListener('click', close);
    modal.addEventListener('mousedown', (e) => { if (e.target === modal) close(); });
    modal.querySelector('#tm-suggest-wa').href = `https://wa.me/${CONFIG.SUPPORT_WHATSAPP}?text=${encodeURIComponent('عندي اقتراح لـ Teachers Manager: ')}`;
    setTimeout(() => modal.querySelector('#tm-suggest-text').focus(), 60);

    modal.querySelector('#tm-suggest-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const text = modal.querySelector('#tm-suggest-text').value.trim();
        if (text.length < 3) { ErrorHandler.showError('اكتب الاقتراح الأول'); return; }
        const btn = modal.querySelector('#tm-suggest-send');
        btn.disabled = true;
        btn.textContent = 'جاري الإرسال...';
        try {
            await api.submitSuggestion(text, modal.querySelector('#tm-suggest-name').checked, location.pathname.split('/').pop() || 'dashboard.html');
            try { (window.dataLayer = window.dataLayer || []).push({ event: 'suggestion_sent' }); } catch (err) { /* تجاهل */ }
            close();
            ErrorHandler.showSuccess('وصلنا اقتراحك، شكرًا جدًا 🙏');
        } catch (err) {
            btn.disabled = false;
            btn.innerHTML = `${icon('send', { size: 15 })} ابعت الاقتراح`;
            // لو الخدمة لسه مش متفعّلة: نخلّيه يبعته على واتساب بنفس النص
            if (err && err.status === 404) {
                window.open(`https://wa.me/${CONFIG.SUPPORT_WHATSAPP}?text=${encodeURIComponent('اقتراح لـ Teachers Manager: ' + text)}`, '_blank', 'noopener');
                close();
                return;
            }
            ErrorHandler.showError(ErrorHandler.getErrorMessage(err));
        }
    });
}

window.openSuggestionModal = openSuggestionModal;
