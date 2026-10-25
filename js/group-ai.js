/**
 * group-ai.js — v27: مساعد حصة المجموعة (شات ذكي بسياق المجموعة)
 * ------------------------------------------------------------------
 * - نفس فكرة مساعد الحصة الخاصة (lesson.html) لكن السياق مجموعة:
 *   الطلاب ومستوياتهم + آخر حصص المجموعة + اللي بيحصل في الحصة دلوقتي (الحضور والمكتوب).
 * - الخادم: n8n/group-ai-chat.json (نفس حد الطلبات اليومي بتاع المساعد).
 * - المحادثة بتتحفظ على الجهاز لحد ما الحصة تخلص (أو "محادثة جديدة").
 *
 * الاستخدام:
 *   const ai = mountGroupAi({ groupId, groupName, getContext, sessionSince, onUse });
 *   ai.open();
 *   getContext() => { mode, elapsed_min, present_count, absent_names, lesson_content, homework, next_assignment, notes, prev_homework }
 *   onUse(field, text) => بيتنادى لما المدرس يضغط "حطه في …" (field: content | homework | next)
 */
import { api } from './api.js?v=27';
import { ErrorHandler } from './utils.js?v=27';
import { icon } from './icons.js?v=27';
import { renderMarkdown } from './md-lite.js?v=27';

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const STYLE = `
#ga-overlay{position:fixed;inset:0;z-index:10000;background:rgba(41,37,45,.45);display:flex;align-items:flex-end;justify-content:center}
#ga-overlay[hidden]{display:none}
.ga-card{background:var(--card-bg,#fff);width:100%;max-width:640px;height:84%;border-radius:20px 20px 0 0;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 -10px 40px rgba(0,0,0,.22)}
@media (min-width:1024px){
  #ga-overlay{inset:0 auto 0 0;width:420px;background:transparent;align-items:stretch}
  .ga-card{height:100%;max-width:none;border-radius:0;box-shadow:8px 0 30px rgba(41,37,45,.16);border-inline-start:1px solid var(--border)}
  body.ga-docked .main-content{margin-left:420px}
}
.ga-head{display:flex;align-items:center;justify-content:space-between;gap:.5rem;padding:.85rem 1rem;background:linear-gradient(135deg,#4B3A5A 0%,#7A6B83 100%);color:#fff;flex-shrink:0}
.ga-head h3{margin:0;font-size:1rem;color:#fff}
.ga-head p{margin:.1rem 0 0;font-size:.78rem;opacity:.85;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ga-title{display:flex;align-items:center;gap:.6rem;min-width:0}
.ga-hbtns{display:flex;gap:.4rem}
.ga-hbtn{background:rgba(255,255,255,.16);border:0;color:#fff;border-radius:9px;width:36px;height:36px;display:flex;align-items:center;justify-content:center;cursor:pointer}
.ga-hbtn:hover{background:rgba(255,255,255,.3)}
.ga-ctx{display:flex;gap:.35rem;flex-wrap:wrap;padding:.5rem 1rem;background:#F7F3FA;border-bottom:1px solid var(--border);font-size:.74rem;color:var(--text-secondary);flex-shrink:0}
.ga-ctx span{background:#fff;border:1px solid var(--border);border-radius:999px;padding:.15rem .55rem;white-space:nowrap}
.ga-ctx .live{color:var(--danger);border-color:#F0CFCF;font-weight:700}
.ga-msgs{flex:1;overflow-y:auto;padding:.9rem 1rem;display:flex;flex-direction:column;gap:.6rem;background:var(--bg-secondary,#F5F3F0);overscroll-behavior:contain}
.ga-welcome{text-align:center;color:var(--text-secondary);font-size:.86rem;padding:.6rem .4rem;line-height:1.8}
.ga-welcome b{color:var(--text-primary)}
.ga-b{max-width:88%;padding:.6rem .85rem;border-radius:14px;font-size:.92rem;line-height:1.65;word-break:break-word}
.ga-b.user{align-self:flex-end;background:var(--primary,#4B3A5A);color:#fff;border-bottom-left-radius:4px;white-space:pre-wrap}
.ga-b.assistant{align-self:flex-start;background:#fff;border:1px solid var(--border);color:var(--text-primary);border-bottom-right-radius:4px}
.ga-b.assistant p{margin:0 0 .45em}.ga-b.assistant p:last-child{margin-bottom:0}
.ga-b.assistant ul,.ga-b.assistant ol{margin:.15em 0 .5em;padding-inline-start:1.3em}
.ga-b.assistant strong{color:var(--primary)}
.ga-b.error{align-self:center;background:#FBEAEA;color:var(--danger);border:1px solid #F0CFCF;font-size:.82rem}
.ga-typing{align-self:flex-start;background:#fff;border:1px solid var(--border);border-radius:14px;padding:.6rem .9rem;font-size:.8rem;color:var(--text-secondary);display:flex;gap:4px;align-items:center}
.ga-typing i{width:7px;height:7px;border-radius:50%;background:#9A8FA3;animation:gaDot 1.1s infinite ease-in-out}
.ga-typing i:nth-child(2){animation-delay:.15s}.ga-typing i:nth-child(3){animation-delay:.3s}
.ga-typing span{margin-inline-start:.4rem}
@keyframes gaDot{0%,80%,100%{opacity:.3;transform:translateY(0)}40%{opacity:1;transform:translateY(-3px)}}
.ga-tools{align-self:flex-start;display:flex;flex-wrap:wrap;gap:.3rem;margin-top:-.25rem;max-width:92%}
.ga-tools button{border:1px solid var(--border);background:#fff;color:var(--primary);border-radius:999px;padding:.3rem .7rem;font:inherit;font-size:.78rem;font-weight:600;cursor:pointer;min-height:32px}
.ga-tools button.use{background:#EEE9F3;border-color:#D9CFE3}
.ga-chips{display:flex;gap:.35rem;overflow-x:auto;padding:.55rem 1rem .2rem;flex-shrink:0;scrollbar-width:none;background:var(--card-bg);border-top:1px solid var(--border)}
.ga-chips::-webkit-scrollbar{display:none}
.ga-chips button{flex-shrink:0;border:1px solid var(--border);background:var(--bg-secondary);color:var(--text-primary);border-radius:999px;padding:.45rem .85rem;font:inherit;font-size:.82rem;font-weight:600;cursor:pointer;white-space:nowrap;min-height:38px}
.ga-chips button:hover{border-color:var(--primary);color:var(--primary)}
.ga-quota{padding:.15rem 1rem 0;font-size:.72rem;color:var(--text-secondary);text-align:center;background:var(--card-bg)}
.ga-form{display:flex;align-items:flex-end;gap:.45rem;padding:.55rem .8rem calc(.75rem + env(safe-area-inset-bottom,0px));background:var(--card-bg)}
.ga-form textarea{flex:1;min-width:0;margin:0!important;resize:none;min-height:44px;max-height:120px;padding:.65rem .85rem;border:1px solid var(--border);border-radius:14px;font:inherit;font-size:1rem;line-height:1.4;background:var(--bg-secondary)}
.ga-send,.ga-mic{flex-shrink:0;width:44px;height:44px;border-radius:50%;display:flex;align-items:center;justify-content:center;cursor:pointer}
.ga-send{background:var(--primary);color:#fff;border:0}
.ga-send:disabled{opacity:.55}
.ga-mic{border:1px solid var(--border);background:var(--card-bg);color:var(--primary)}
.ga-mic.rec{background:#B85C5C;color:#fff;border-color:var(--danger)}
`;

const DEEP_RE = /تفسير|فس?ّ?ر|معن[ىي]|اشرح|شرح|إعراب|اعراب|قاعد|أحكام|احكام|حضّ?ر|خطة|مسابقة|ورقة عمل/;

export function mountGroupAi({ groupId, groupName = '', getContext = () => ({}), sessionSince = null, onUse = null } = {}) {
    if (!document.getElementById('ga-style')) {
        const st = document.createElement('style');
        st.id = 'ga-style';
        st.textContent = STYLE;
        document.head.appendChild(st);
    }
    const storeKey = `tm_gai_${groupId}`;
    let since = sessionSince || null;
    let history = [];
    try {
        const saved = JSON.parse(localStorage.getItem(storeKey) || 'null');
        // نفس الجلسة بس (نفس بداية الحصة) ولمدة 10 ساعات
        if (saved && saved.since === since && Date.now() - (saved.at || 0) < 10 * 3600 * 1000) history = saved.history || [];
    } catch (e) { /* تجاهل */ }
    const persist = () => { try { localStorage.setItem(storeKey, JSON.stringify({ since, at: Date.now(), history: history.slice(-30) })); } catch (e) { /* تجاهل */ } };

    const ov = document.createElement('div');
    ov.id = 'ga-overlay';
    ov.hidden = true;
    ov.innerHTML = `
        <div class="ga-card" role="dialog" aria-label="مساعد حصة المجموعة">
            <div class="ga-head">
                <div class="ga-title">${icon('sparkles', { size: 18 })}<div><h3>مساعد الحصة</h3><p>${esc(groupName)}</p></div></div>
                <div class="ga-hbtns">
                    <button type="button" class="ga-hbtn" data-ga="new" title="محادثة جديدة" aria-label="محادثة جديدة">${icon('refresh', { size: 16 })}</button>
                    <button type="button" class="ga-hbtn" data-ga="close" aria-label="إغلاق">${icon('x', { size: 16 })}</button>
                </div>
            </div>
            <div class="ga-ctx"></div>
            <div class="ga-msgs" aria-live="polite"></div>
            <div class="ga-chips" role="toolbar" aria-label="طلبات سريعة"></div>
            <div class="ga-quota"></div>
            <form class="ga-form">
                <button type="button" class="ga-mic" hidden title="اتكلم بدل ما تكتب" aria-label="اتكلم بدل ما تكتب">${icon('mic', { size: 18 })}</button>
                <textarea rows="1" maxlength="600" placeholder="اكتب بسرعة… مثلًا: اسألهم، زهقوا، مسابقة"></textarea>
                <button type="submit" class="ga-send" aria-label="إرسال">${icon('send', { size: 18 })}</button>
            </form>
        </div>`;
    document.body.appendChild(ov);
    const $ = (sel) => ov.querySelector(sel);
    const msgs = $('.ga-msgs');
    const input = $('textarea');
    const form = $('form');
    const sendBtn = $('.ga-send');
    let busy = false;

    const scrollBottom = () => { msgs.scrollTop = msgs.scrollHeight; };
    const grow = () => { input.style.height = 'auto'; input.style.height = Math.min(120, input.scrollHeight) + 'px'; };
    input.addEventListener('input', grow);
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey && window.matchMedia('(min-width: 1024px)').matches) { e.preventDefault(); form.requestSubmit(); }
    });

    function bubble(role, text) {
        const b = document.createElement('div');
        b.className = `ga-b ${role}`;
        if (role === 'assistant') b.innerHTML = renderMarkdown(text || '', { citations: false });
        else b.textContent = text;
        msgs.appendChild(b);
        scrollBottom();
        return b;
    }
    function tools(text) {
        const t = document.createElement('div');
        t.className = 'ga-tools';
        t.innerHTML = `<button type="button" data-t="copy">📋 نسخ</button>
            ${onUse ? `<button type="button" class="use" data-t="content">➕ في "أخدنا إيه"</button>
            <button type="button" class="use" data-t="homework">➕ في الواجب</button>` : ''}
            <button type="button" data-t="easier">أسهل</button><button type="button" data-t="other">غيره</button>`;
        t.addEventListener('click', async (e) => {
            const b = e.target.closest('button');
            if (!b) return;
            const plain = String(text || '').replace(/\*\*/g, '').replace(/^#+\s*/gm, '').trim();
            if (b.dataset.t === 'copy') {
                try { await navigator.clipboard.writeText(plain); ErrorHandler.showSuccess('اتنسخ'); } catch (er) { ErrorHandler.showError('مقدرتش أنسخ. علّم النص وانسخه.'); }
            } else if (b.dataset.t === 'content' || b.dataset.t === 'homework') {
                onUse(b.dataset.t, plain);
                b.disabled = true;
                b.textContent = '✓ اتحط';
            } else send(b.dataset.t === 'easier' ? 'أسهل' : 'غيره');
        });
        msgs.appendChild(t);
        scrollBottom();
    }
    function typing(label) {
        removeTyping();
        const d = document.createElement('div');
        d.className = 'ga-typing';
        d.innerHTML = `<i></i><i></i><i></i><span>${esc(label)}</span>`;
        msgs.appendChild(d);
        scrollBottom();
    }
    function removeTyping() { msgs.querySelectorAll('.ga-typing').forEach((x) => x.remove()); }

    function renderAll() {
        msgs.innerHTML = '';
        if (!history.length) {
            msgs.innerHTML = `<div class="ga-welcome"><b>مساعد حصة ${esc(groupName)}</b><br>
                عارف طلاب المجموعة وآخر حصصهم واللي بيحصل في الحصة دلوقتي.<br>
                اطلب أسئلة للمجموعة، نشاط لما يزهقوا، مسابقة، شرح، أو ملخص للحصة.</div>`;
        }
        history.forEach((m) => { bubble(m.role, m.text); if (m.role === 'assistant') tools(m.text); });
    }

    function chips() {
        const ctx = getContext() || {};
        const live = ctx.mode === 'live';
        const list = live ? [
            ['❓ اسألهم', 'اسألهم ٥ أسئلة سريعة على اللي أخدناه'],
            ['😴 زهقوا', 'زهقوا ومش مركزين'],
            ['🏆 مسابقة', 'مسابقة فرق سريعة على الدرس'],
            ['🐢 طالب متأخر', 'فيه طالب متأخر عن الباقيين، أساعده إزاي من غير ما أعطّلهم؟'],
            ['📝 لخّص الحصة', 'لخّص الحصة عشان أسجّلها'],
            ['📚 واجب', 'واجب']
        ] : [
            ['🎯 حضّر الحصة', 'حضّر الحصة الجاية للمجموعة'],
            ['🔥 نشاط للبداية', 'نشاط ٣ دقايق أبدأ بيه الحصة مع المجموعة'],
            ['🏆 مسابقة', 'مسابقة فرق على آخر درس'],
            ['📝 لخّص', 'لخّص الحصة عشان أسجّلها'],
            ['💬 رسالة الجروب', 'رسالة لجروب أولياء الأمور عن حصة النهارده']
        ];
        $('.ga-chips').innerHTML = list.map(([l, t], i) => `<button type="button" data-c="${i}">${esc(l)}</button>`).join('');
        $('.ga-chips')._list = list;
    }
    $('.ga-chips').addEventListener('click', (e) => {
        const b = e.target.closest('[data-c]');
        const list = $('.ga-chips')._list || [];
        if (b && list[Number(b.dataset.c)]) send(list[Number(b.dataset.c)][1]);
    });

    function ctxBar() {
        const c = getContext() || {};
        const parts = [];
        if (c.mode === 'live') parts.push(`<span class="live">● الحصة شغالة${c.elapsed_min != null ? ` · ${c.elapsed_min} د` : ''}</span>`);
        if (c.present_count != null) parts.push(`<span>حاضر ${c.present_count}</span>`);
        if (c.lesson_content) parts.push(`<span>${esc(String(c.lesson_content).slice(0, 40))}</span>`);
        $('.ga-ctx').innerHTML = parts.join('') || '<span>تحضير ومتابعة</span>';
    }

    function send(text) {
        if (busy) return;
        input.value = text;
        form.requestSubmit();
    }

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const message = input.value.trim();
        if (!message || busy) return;
        busy = true;
        sendBtn.disabled = true;
        if (!history.length) msgs.innerHTML = '';
        bubble('user', message);
        history.push({ role: 'user', text: message });
        persist();
        input.value = '';
        grow();
        const deep = DEEP_RE.test(message);
        typing(deep ? 'بيجهّز الشرح' : 'بيكتب');
        const aborter = new AbortController();
        let stop = setTimeout(() => aborter.abort(), 60000);
        let live = null;
        let pending = '';
        try {
            try { window.tmTrack && window.tmTrack('group_ai_request', { mode: (getContext() || {}).mode || 'ready' }); } catch (er) { /* تجاهل */ }
            const res = await api.groupAiChatStream(groupId, message, {
                lessonContext: getContext(),
                sessionSince: since,
                signal: aborter.signal,
                onText: (t) => {
                    clearTimeout(stop); stop = setTimeout(() => aborter.abort(), 45000);
                    pending = t;
                    removeTyping();
                    if (!live) live = bubble('assistant', '');
                    live.innerHTML = renderMarkdown(pending, { citations: false });
                    scrollBottom();
                },
                onRetry: () => typing('ثانية واحدة')
            });
            removeTyping();
            if (!live) live = bubble('assistant', '');
            live.innerHTML = renderMarkdown(res.reply, { citations: false });
            history.push({ role: 'assistant', text: res.reply });
            persist();
            tools(res.reply);
            if (typeof res.remaining_today === 'number') $('.ga-quota').textContent = res.remaining_today <= 10 ? `فاضل ${res.remaining_today} طلب النهارده` : '';
        } catch (error) {
            removeTyping();
            const msg = aborter.signal.aborted ? 'المساعد اتأخر أكتر من اللازم. جرّب تاني بسؤال أقصر.' : (ErrorHandler.getErrorMessage(error) || 'حصلت مشكلة مع المساعد، جرّب تاني.');
            if (pending.trim()) {
                history.push({ role: 'assistant', text: pending });
                persist();
                tools(pending);
            } else {
                history.pop();
                persist();
                if (!input.value) { input.value = message; grow(); }
            }
            bubble('error', msg);
        } finally {
            clearTimeout(stop);
            busy = false;
            sendBtn.disabled = false;
        }
    });

    // المايك (لو المتصفح بيدعمه)
    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRec) {
        const mic = $('.ga-mic');
        mic.hidden = false;
        let rec = null;
        mic.addEventListener('click', () => {
            if (rec) { try { rec.stop(); } catch (er) { /* تجاهل */ } return; }
            try {
                rec = new SpeechRec();
                rec.lang = 'ar-EG';
                rec.interimResults = true;
                const base = input.value.trim();
                rec.onresult = (ev) => {
                    input.value = (base ? base + ' ' : '') + Array.from(ev.results).map((r) => r[0].transcript).join(' ');
                    grow();
                    if (ev.results[ev.results.length - 1].isFinal && input.value.trim()) { try { rec.stop(); } catch (er) { /* تجاهل */ } form.requestSubmit(); }
                };
                rec.onerror = (ev) => { if (ev.error === 'not-allowed') ErrorHandler.showError('اسمح للمتصفح يستخدم المايك'); };
                rec.onend = () => { mic.classList.remove('rec'); rec = null; };
                mic.classList.add('rec');
                rec.start();
            } catch (er) { mic.classList.remove('rec'); rec = null; }
        });
    }

    function close() {
        ov.hidden = true;
        document.body.classList.remove('ga-docked');
    }
    ov.addEventListener('click', (e) => {
        if (e.target === ov) close();
        const b = e.target.closest('[data-ga]');
        if (!b) return;
        if (b.dataset.ga === 'close') close();
        if (b.dataset.ga === 'new') { history = []; since = new Date().toISOString(); persist(); renderAll(); }
    });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !ov.hidden) close(); });

    renderAll();
    return {
        open() {
            ctxBar();
            chips();
            ov.hidden = false;
            if (window.matchMedia('(min-width: 1024px)').matches) { document.body.classList.add('ga-docked'); input.focus(); }
            scrollBottom();
        },
        close,
        setSince(v) { if (v && v !== since) { since = v; history = []; persist(); renderAll(); } },
        clear() { try { localStorage.removeItem(storeKey); } catch (e) { /* تجاهل */ } }
    };
}
