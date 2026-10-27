/**
 * auth.js - إدارة المصادقة والجلسات
 * يعتمد على Supabase Auth كليًا
 *
 * ملاحظة مهمة: عميل Supabase الفعلي يتم إنشاؤه مرة واحدة فقط في config.js
 * ويُخزَّن في window.supabaseClient. يجب استخدام window.supabaseClient
 * في كل مكان (وليس window.supabase، لأن هذا الأخير هو مكتبة supabase-js
 * الخام القادمة من الـ CDN وليس عميلاً مهيّأً، وليس لديه خاصية .auth).
 */
import { CONFIG } from './config.js?v=28';
import { APIUtils, Storage, ErrorHandler, Validators, toLatinDigits } from './utils.js?v=28';

/** fetch بمهلة: على النت الضعيف الدخول/التسجيل مايفضلش يلف للأبد */
async function fetchWithTimeout(url, options = {}, ms = 12000) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), ms);
    try { return await fetch(url, { ...options, signal: ctl.signal }); }
    finally { clearTimeout(t); }
}

/** النت وقع قبل ما الصفحة تحمّل: بدل "جاري التحميل" اللي مابيخلصش، رسالة وزرار "حاول تاني" */
function showOfflineRetry() {
    const show = () => {
        const el = document.querySelector('#loading, #loader, #cal-loading, .ls-loader, .loading');
        if (!el) return;
        el.style.display = '';
        el.removeAttribute('hidden');
        el.innerHTML = 'النت ضعيف ومقدرناش نحمّل بياناتك. <button type="button" class="btn btn-sm" style="margin-inline-start:6px">حاول تاني</button>';
        el.querySelector('button').addEventListener('click', () => location.reload());
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', show); else show();
}

const isNetworkError = (err) => !!err && /fetch|network|retryable|timeout|load failed/i.test(`${err.name || ''} ${err.message || ''}`);

/** كل حاجة محفوظة على الجهاز تخص المدرس اللي خرج (عشان الموبايل المشترك مايعرضش بيانات مدرس تاني) */
// (طابور التتبع tm_track_queue_v1 كان بيفضل بعد الخروج ويتبعت باسم المدرس اللي داخل بعده،
//  ونقطة الإشعارات وخطوات البداية كانت بتظهر للمدرس الجديد بحالة المدرس القديم)
const USER_LOCAL_KEYS = ['auth_session', 'user_profile', 'tm_pending_init', 'tm_live_lessons', 'tm_teacher_subject',
    'tm_track_queue_v1', 'tm_signup_source', 'tm_welcome_seen'];
const USER_SESSION_KEYS = ['tm_sub_cache_v1', 'tm_profile_cache_v1', 'tm_income_cache_v1', 'tm_notif_badge_cache_v1', 'tm_ro_prompt', 'tm_track_session'];
function clearUserData() {
    try { if (window.__tmTrackReset) window.__tmTrackReset(); } catch (e) { /* تجاهل */ }
    USER_LOCAL_KEYS.forEach((k) => { try { localStorage.removeItem(k); } catch (e) { /* تجاهل */ } });
    USER_SESSION_KEYS.forEach((k) => { try { sessionStorage.removeItem(k); } catch (e) { /* تجاهل */ } });
    try {
        Object.keys(localStorage).filter((k) => k.startsWith('tm_lesson_draft:') || k.startsWith('tm_book_pos_') || k.startsWith('tm_ai_')
            || k.startsWith('tm_ob_') || k.startsWith('tm_report_nudge_')).forEach((k) => localStorage.removeItem(k));
        Object.keys(sessionStorage).filter((k) => k.startsWith('tm_ai_') || k.startsWith('tm_lesson_alert_')).forEach((k) => sessionStorage.removeItem(k));
    } catch (e) { /* تجاهل */ }
}

// ملحوظة: لا نصدّر "supabase" كقيمة ثابتة هنا لأن window.supabaseClient
// قد لا يكون جاهزًا بعد وقت تحميل هذه الوحدة. أي كود يحتاج العميل مباشرة
// يجب أن يستخدم window.supabaseClient وقت التنفيذ الفعلي (كما تفعل كل
// الدوال أدناه)، وليس عند وقت الاستيراد.

/**
 * كائن إدارة المصادقة
 */

/**
 * ترجمة رسائل أخطاء Supabase Auth الشائعة لرسائل عربية واضحة
 */
function authErrorMessage(error, fallback) {
    if (!error) return fallback;
    const code = String(error.code || error.error_code || '');
    const msg = String(error.message || error.msg || error.error_description || '');
    const wait = retryAfterSeconds(error);

    if (code === 'user_already_exists' || code === 'email_exists' || /already registered|already exists|already been registered/i.test(msg)) {
        return 'الإيميل ده مسجّل قبل كده. ادخل من صفحة الدخول، ولو نسيت كلمة المرور استخدم "نسيت كلمة المرور".';
    }
    if (code === 'email_address_invalid' || code === 'validation_failed' && /email/i.test(msg) || /invalid.*email|email.*invalid|unable to validate email/i.test(msg)) {
        return 'الإيميل ده مش صحيح. اتأكد منه وجرّب تاني.';
    }
    if (code === 'signup_disabled' || /signups not allowed/i.test(msg)) {
        return 'التسجيل مقفول مؤقتًا. كلّمنا على واتساب وهنفعّلك حسابك.';
    }
    if (code === 'over_email_send_rate_limit' || /email rate limit/i.test(msg)) {
        return 'تم تجاوز الحد المسموح لإرسال الإيميلات حاليًا. حاول مرة أخرى بعد قليل.';
    }
    if (wait) return `لأسباب أمنية، يمكنك طلب رابط جديد بعد ${wait} ثانية.`;
    if (code === 'over_request_rate_limit' || /rate limit|too many/i.test(msg)) {
        return 'محاولات كثيرة في وقت قصير. انتظر قليلًا ثم حاول مرة أخرى.';
    }
    if (code === 'email_address_not_authorized') {
        return 'مش قادرين نبعت إيميل للعنوان ده دلوقتي. كلّمنا على واتساب وهنساعدك.';
    }
    if (/error sending|smtp|sending recovery email/i.test(msg) || code === 'unexpected_failure') {
        return 'تعذّر إرسال البريد الآن بسبب مشكلة في خادم البريد. حاول لاحقًا أو تواصل مع الدعم.';
    }
    if (code === 'otp_expired' || /expired|invalid.*(otp|token|code|link)|token.*(invalid|not found)/i.test(msg)) {
        return 'الرمز أو الرابط غير صحيح أو انتهت صلاحيته. اطلب رابطًا جديدًا.';
    }
    if (code === 'same_password' || /should be different/i.test(msg)) {
        return 'كلمة المرور الجديدة يجب أن تختلف عن كلمة المرور القديمة.';
    }
    if (code === 'weak_password' || /password should|weak password|at least \d+ characters/i.test(msg)) {
        return 'كلمة المرور ضعيفة. استخدم 8 أحرف على الأقل تجمع بين حروف وأرقام.';
    }
    if (code === 'session_not_found' || code === 'session_expired' || /auth session missing|session.*(not found|expired)/i.test(msg)) {
        return 'انتهت جلسة الاستعادة. اطلب رابط استعادة جديد.';
    }
    if (/failed to fetch|networkerror|network request failed|load failed/i.test(msg)) {
        return 'تعذّر الاتصال بالخادم. تأكد من اتصالك بالإنترنت وحاول مرة أخرى.';
    }
    // رسالة عربية جاهزة (من الفحص المحلي) بنعرضها كما هي
    if (/[\u0600-\u06FF]/.test(msg)) return msg;
    return fallback;
}

function retryAfterSeconds(error) {
    const msg = String((error && (error.message || error.msg)) || '');
    const m = msg.match(/after (\d+) seconds?/i);
    return m ? parseInt(m[1], 10) : 0;
}

const PROFILE_CACHE_KEY = 'tm_profile_cache_v1';
const PROFILE_CACHE_TTL_MS = 5 * 60 * 1000;

export const Auth = {
    /**
     * دالة التسجيل (Signup)
     * إنشاء حساب جديد والتهيئة الكاملة
     */
    async signUp(name, email, phone, password, username, teachingType, subject) {
        try {
            // 1. التحقق من صحة البيانات
            if (!Validators.name(name)) {
                throw new Error('الاسم يجب أن يكون بين 2 و 100 حرف');
            }
            
            if (!Validators.email(email)) {
                throw new Error('البريد الإلكتروني غير صحيح');
            }
            
            if (!Validators.password(password)) {
                throw new Error('كلمة المرور يجب أن تكون 8 أحرف على الأقل');
            }
            
            if (!Validators.username(username)) {
                throw new Error('اسم المستخدم يجب أن يكون 3-20 حرف (أحرف وأرقام و _ و -)');
            }
            
            // 2. إنشاء الحساب في Supabase Auth
            // بيانات المدرس بتتحفظ كمان مع الحساب نفسه في Supabase: لو تجهيز الملف في n8n فشل
            // (النت فصل، أو أكّد الإيميل من موبايل تاني) الخادم بيعمل الملف منها أول ما يدخل (bootstrap-session)
            const { data: authData, error: authError } = await window.supabaseClient.auth.signUp({
                email: email,
                password: password,
                options: {
                    data: {
                        name: String(name || '').trim().slice(0, 100),
                        phone: String(phone || '').trim().slice(0, 30),
                        teaching_type: teachingType || 'private',
                        subject: subject || ''
                    }
                }
            });

            if (authError) {
                throw authError;
            }

            // لو "تأكيد الإيميل" مفعّل في Supabase والإيميل مسجّل قبل كده، Supabase بيرجّع
            // نجاح شكلي بمستخدم من غير identities (عشان مايكشفش الإيميلات المسجلة).
            // مانبعتش الـ id ده لـ n8n لأنه مش حساب حقيقي.
            if (authData && authData.user && Array.isArray(authData.user.identities) && authData.user.identities.length === 0) {
                throw { code: 'user_already_exists', message: 'already registered' };
            }

            // 3. إرسال البيانات إلى n8n لتهيئة المعلم (مع إعادة المحاولة لو الشبكة اتقطعت)
            const profilePayload = {
                id: authData.user.id,
                email: email,
                name: name,
                phone: phone,
                username: username,
                teaching_type: teachingType,
                subject: subject,
                // مصدر التسجيل (utm / كود الترشيح). initialize-teacher بيتجاهله لو مش متحدث - راجع README_N8N_UPDATES.md
                signup_source: Storage.get('tm_signup_source') || null
            };
            // بنحفظ بيانات الإعداد على الجهاز: لو الإعداد فشل، بيتعمل تلقائيًا أول ما المدرس يدخل
            // (بدل ما يفضل حساب "معلّق" مايقدرش يسجّل بيه تاني ولا يستخدمه)
            Storage.set('tm_pending_init', profilePayload);
            const initResult = await this.initializeProfile(profilePayload, authData.session ? authData.session.access_token : null);
            if (initResult.ok) Storage.remove('tm_pending_init');

            try {
                const src = Storage.get('tm_signup_source') || {};
                (window.dataLayer = window.dataLayer || []).push({ event: 'sign_up', subject, ...src });
            } catch (e) { /* تجاهل */ }
            // مصدر التسجيل اتبعت مع الحساب ده: مايتحسبش تاني لحساب جديد على نفس الجهاز
            if (initResult.ok) Storage.remove('tm_signup_source');

            // تأكيد الإيميل مفعّل: مفيش جلسة لسه، المدرس لازم يفتح الإيميل الأول
            if (!authData.session) {
                return { success: true, user: authData.user, needsConfirmation: true };
            }
            if (!initResult.ok && initResult.fatal) {
                throw new Error(initResult.message);
            }
            return { success: true, user: authData.user };

        } catch (error) {
            console.error('Signup Error:', error);
            return {
                success: false,
                error: authErrorMessage(error, (error && /[\u0600-\u06FF]/.test(error.message || '')) ? error.message : 'حصلت مشكلة أثناء إنشاء الحساب. جرّب تاني.')
            };
        }
    },

    /**
     * تهيئة ملف المعلم في n8n (initialize-teacher)
     * 3 محاولات. fatal = الخادم رفض البيانات نفسها (مش مشكلة شبكة)
     */
    async initializeProfile(payload, accessToken = null) {
        const webhookUrl = APIUtils.buildUrl(CONFIG.API_ENDPOINTS.AUTH.INITIALIZE_TEACHER);
        let lastMessage = 'تعذّر تجهيز حسابك دلوقتي، هيتجهز تلقائيًا أول ما تدخل.';
        for (let attempt = 1; attempt <= 3; attempt++) {
            try {
                const response = await fetchWithTimeout(webhookUrl, {
                    method: 'POST',
                    headers: APIUtils.buildHeaders(accessToken || undefined),
                    body: JSON.stringify(payload)
                }, 15000);
                const text = await response.text();
                let data = null;
                try { data = text ? JSON.parse(text) : null; } catch (e) { data = null; }
                if (response.ok && data && data.success) return { ok: true };
                // الملف موجود بالفعل (مثلًا محاولة تانية بعد ما الأولى نجحت والرد ضاع) = نجاح
                const errText = JSON.stringify((data && data.error) || '');
                // (تكرار في اسم المستخدم/الموبايل مش نجاح: ده خطأ حقيقي لازم المدرس يعرفه)
                if (/duplicate|already|exists|23505/i.test(errText) && !/username|phone|user_name/i.test(errText)) return { ok: true };
                if (response.ok && data && data.success === false) {
                    const m = data.error && data.error.message;
                    return { ok: false, fatal: true, message: (m && /[\u0600-\u06FF]/.test(m)) ? m : 'حصلت مشكلة أثناء تجهيز حسابك. كلّمنا على واتساب وهنحلها فورًا.' };
                }
            } catch (e) {
                lastMessage = 'تعذّر الاتصال بالخادم. اتأكد من النت.';
            }
            await new Promise((r) => setTimeout(r, 800 * attempt));
        }
        return { ok: false, fatal: false, message: lastMessage };
    },

    /** لو فيه إعداد حساب معلّق على الجهاز ده، نكمّله */
    async completePendingInit(userId) {
        const pending = Storage.get('tm_pending_init');
        if (!pending || (userId && pending.id !== userId)) return false;
        let token = null;
        try { const { data } = await window.supabaseClient.auth.getSession(); token = data && data.session ? data.session.access_token : null; } catch (e) { /* تجاهل */ }
        const res = await this.initializeProfile(pending, token);
        if (res.ok) Storage.remove('tm_pending_init');
        return res.ok;
    },

    /**
     * دالة تسجيل الدخول (Login)
     */
    async signIn(email, password) {
        try {
            email = String(email || '').trim().toLowerCase();
            if (!Validators.email(email)) {
                throw new Error('البريد الإلكتروني غير صحيح');
            }

            const { data, error } = await window.supabaseClient.auth.signInWithPassword({
                email: email,
                password: password
            });

            if (error) throw error;

            // بنحفظ رقم المدرس بس (التوكن نفسه Supabase بيحفظه ويجدده)
            Storage.set('auth_session', { user_id: data.user.id });

            // جلب بيانات الجلسة من الخادم (بمهلة: لو اتأخرت نكمّل والرئيسية هتجيبها)
            await Promise.race([this.bootstrapSession(), new Promise((r) => setTimeout(r, 8000))]);

            return { success: true, session: data.session };
        } catch (error) {
            console.error('Login Error:', error);
            const code = String((error && (error.code || error.error_code)) || '');
            const msg = String((error && error.message) || '');
            let text = 'البريد الإلكتروني أو كلمة المرور غير صحيحة';
            if (code === 'email_not_confirmed' || /email not confirmed/i.test(msg)) {
                text = 'لازم تأكّد الإيميل الأول: افتح رسالة التأكيد اللي وصلتك (بص كمان في الـ Spam).';
            } else if (/failed to fetch|network|load failed/i.test(msg)) {
                text = 'تعذّر الاتصال بالخادم. اتأكد من النت وجرّب تاني.';
            } else if (/[\u0600-\u06FF]/.test(msg)) {
                text = msg;
            }
            return { success: false, error: text };
        }
    },

    /**
     * تحميل بيانات الجلسة من الخادم
     * يتم استدعاؤها عند تسجيل الدخول أو تحديث الصفحة
     */
    async bootstrapSession() {
        try {
            const { data: { session }, error } = await window.supabaseClient.auth.getSession();

            if (error || !session) {
                return null;
            }

            const fetchProfile = async () => {
                const headers = APIUtils.buildHeaders(session.access_token);
                const response = await fetchWithTimeout(
                    APIUtils.buildUrl(CONFIG.API_ENDPOINTS.AUTH.BOOTSTRAP_SESSION),
                    { method: 'GET', headers },
                    12000
                );
                if (!response.ok) return null;
                const text = await response.text();
                let data = null;
                try { data = text ? JSON.parse(text) : null; } catch (e) { data = null; }
                return data && data.success ? data.data : null;
            };

            let profile = await fetchProfile();
            // الحساب اتعمل بس الإعداد في n8n ماخلصش وقت التسجيل: نكمّله دلوقتي ونحاول تاني
            if (!profile && Storage.get('tm_pending_init')) {
                const done = await this.completePendingInit(session.user && session.user.id);
                if (done) profile = await fetchProfile();
            }
            if (profile) {
                Storage.set('user_profile', profile);
                try { sessionStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify({ ts: Date.now(), uid: session.user && session.user.id, data: profile })); } catch (e) { /* تجاهل */ }
            }
            return profile;
        } catch (error) {
            console.error('Bootstrap Session Error:', error);
            return null;
        }
    },

    /** بيانات الجلسة من الذاكرة المؤقتة (5 دقايق) بدل طلب n8n في كل صفحة */
    cachedProfile(userId) {
        try {
            const raw = sessionStorage.getItem(PROFILE_CACHE_KEY);
            if (!raw) return null;
            const c = JSON.parse(raw);
            if (!c || c.uid !== userId || (Date.now() - c.ts) > PROFILE_CACHE_TTL_MS) return null;
            return c.data;
        } catch (e) { return null; }
    },

    /**
     * دالة تسجيل الخروج (Logout)
     */
    async signOut() {
        // من غير نت: الخروج من الخادم بيفشل، فبنخرج من الجهاز ده على الأقل (وإلا صفحة الدخول ترجّعه للرئيسية)
        try {
            const { error } = await window.supabaseClient.auth.signOut();
            if (error) throw error;
        } catch (error) {
            try { await window.supabaseClient.auth.signOut({ scope: 'local' }); } catch (e) { /* تجاهل */ }
        }
        clearUserData();
        window.location.href = 'login.html';
    },

    /**
     * الحصول على الجلسة الحالية
     */
    async getSession() {
        const { data: { session }, error } = await window.supabaseClient.auth.getSession();
        if (error) {
            console.error('Get Session Error:', error);
            return null;
        }
        return session;
    },

    /**
     * الحصول على المستخدم الحالي
     */
    async getCurrentUser() {
        const { data: { user }, error } = await window.supabaseClient.auth.getUser();
        if (error) {
            console.error('Get User Error:', error);
            return null;
        }
        return user;
    },

    /**
     * حماية الصفحات: التحقق من تسجيل الدخول
     * يتم استدعاؤها في بداية الصفحات المحمية
     */
    async requireAuth() {
        let session = null;
        let sessErr = null;
        try {
            const res = await window.supabaseClient.auth.getSession();
            session = res.data ? res.data.session : null;
            sessErr = res.error || null;
        } catch (e) { sessErr = e; }
        if (!session) {
            // النت ضعيف وتجديد الجلسة فشل: مانطلّعش المدرس برّه، نقوله يجرّب تاني
            if (isNetworkError(sessErr)) {
                ErrorHandler.showError('النت ضعيف ومقدرناش نتأكد من حسابك. اتأكد من النت وحمّل الصفحة تاني.', 8000);
                showOfflineRetry();
                return null;
            }
            window.location.replace('login.html');
            return null;
        }

        // تحميل بيانات الملف الشخصي
        // السرعة: لو بيانات الجلسة متخزنة من أقل من 5 دقايق نستخدمها فورًا ونحدّثها في الخلفية
        const cached = this.cachedProfile(session.user && session.user.id);
        if (cached) {
            this.bootstrapSession();
            return { session, profile: cached };
        }
        let profile = await this.bootstrapSession();
        // الخادم ماردّش (نت ضعيف): نستخدم آخر بيانات محفوظة لنفس المدرس بدل صفحة فاضية
        if (!profile) {
            const stored = Storage.get('user_profile');
            const uid = session.user && session.user.id;
            if (stored && (!stored.id || stored.id === uid)) profile = stored;
        }
        return { session, profile };
    },

    /**
     * منع المستخدم المسجل من رؤية صفحات التسجيل
     */
    async redirectIfAuthenticated() {
        const session = await this.getSession();
        if (session) {
            window.location.replace('dashboard.html');
        }
    },

    /**
     * تحديث الجلسة إذا انتهت صلاحيتها
     */
    async refreshSession() {
        try {
            const { data, error } = await window.supabaseClient.auth.refreshSession();
            
            if (error) {
                throw error;
            }

            if (data.session) {
                Storage.set('auth_session', { user_id: data.user.id });
                return data.session;
            }

            return null;
        } catch (error) {
            console.error('Refresh Session Error:', error);
            return null;
        }
    },

    /**
     * تغيير كلمة المرور (للمستخدم اللي عامل تسجيل دخول، أو جاي من رابط/رمز الاستعادة)
     */
    async updatePassword(newPassword) {
        try {
            if (!Validators.password(newPassword)) {
                throw new Error('كلمة المرور يجب أن تكون 8 أحرف على الأقل');
            }

            const { error } = await window.supabaseClient.auth.updateUser({
                password: newPassword
            });

            if (error) throw error;

            return { success: true };
        } catch (error) {
            console.error('Update Password Error:', error);
            return {
                success: false,
                error: authErrorMessage(error, 'فشل تغيير كلمة المرور')
            };
        }
    },

    /**
     * إرسال إيميل استعادة كلمة المرور من Supabase
     * الرابط اللي في الإيميل بيرجّع المستخدم لصفحة reset-password.html في نفس مكان الموقع
     * (لازم الرابط ده يكون مضاف في Supabase ← Authentication ← URL Configuration ← Redirect URLs)
     */
    async resetPassword(email) {
        try {
            email = String(email || '').trim().toLowerCase();
            if (!Validators.email(email)) {
                throw new Error('البريد الإلكتروني غير صحيح');
            }

            const { error } = await window.supabaseClient.auth.resetPasswordForEmail(email, {
                redirectTo: new URL('reset-password.html', window.location.href).href.split('#')[0].split('?')[0]
            });

            if (error) throw error;

            return { success: true };
        } catch (error) {
            console.error('Reset Password Error:', error);
            return {
                success: false,
                error: authErrorMessage(error, 'فشل إرسال رابط إعادة التعيين'),
                retryAfter: retryAfterSeconds(error)
            };
        }
    },

    /**
     * التحقق من رمز الاستعادة المكتوب يدويًا (لو قالب الإيميل فيه {{ .Token }})
     * لو نجح، Supabase بيعمل جلسة مؤقتة تسمح بتغيير كلمة المرور
     */
    async verifyRecoveryCode(email, code) {
        try {
            email = String(email || '').trim().toLowerCase();
            code = toLatinDigits(code).replace(/\s+/g, '');
            if (!Validators.email(email)) throw new Error('البريد الإلكتروني غير صحيح');
            if (!/^\d{6,10}$/.test(code)) throw new Error('الرمز يتكوّن من أرقام فقط (6 أرقام أو أكثر)');

            const { data, error } = await window.supabaseClient.auth.verifyOtp({ email, token: code, type: 'recovery' });
            if (error) throw error;
            if (!data || !data.session) throw new Error('انتهت صلاحية الرمز أو تم استخدامه من قبل. اطلب رابطًا جديدًا.');
            return { success: true };
        } catch (error) {
            console.error('Verify Recovery Code Error:', error);
            return { success: false, error: authErrorMessage(error, 'الرمز غير صحيح أو انتهت صلاحيته') };
        }
    },

    /**
     * التحقق من رابط الاستعادة بصيغة token_hash
     * (لو قالب الإيميل في Supabase معدّل للصيغة: reset-password.html?token_hash={{ .TokenHash }}&type=recovery)
     */
    async verifyRecoveryTokenHash(tokenHash) {
        try {
            const { data, error } = await window.supabaseClient.auth.verifyOtp({ token_hash: tokenHash, type: 'recovery' });
            if (error) throw error;
            if (!data || !data.session) throw new Error('رابط الاستعادة غير صالح أو انتهت صلاحيته.');
            return { success: true };
        } catch (error) {
            console.error('Verify Recovery Link Error:', error);
            return { success: false, error: authErrorMessage(error, 'رابط الاستعادة غير صالح أو انتهت صلاحيته') };
        }
    }
};

// جعل الكائن متاحًا عالميًا
window.Auth = Auth;

export default Auth;
