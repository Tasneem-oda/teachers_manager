/**
 * auth.js - إدارة المصادقة والجلسات
 * يعتمد على Supabase Auth كليًا
 *
 * ملاحظة مهمة: عميل Supabase الفعلي يتم إنشاؤه مرة واحدة فقط في config.js
 * ويُخزَّن في window.supabaseClient. يجب استخدام window.supabaseClient
 * في كل مكان (وليس window.supabase، لأن هذا الأخير هو مكتبة supabase-js
 * الخام القادمة من الـ CDN وليس عميلاً مهيّأً، وليس لديه خاصية .auth).
 */
import { CONFIG } from './config.js?v=11';
import { APIUtils, Storage, ErrorHandler, Validators } from './utils.js?v=11';

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

    if (code === 'over_email_send_rate_limit' || /email rate limit/i.test(msg)) {
        return 'تم تجاوز الحد المسموح لإرسال الإيميلات حاليًا. حاول مرة أخرى بعد قليل.';
    }
    if (wait) return `لأسباب أمنية، يمكنك طلب رابط جديد بعد ${wait} ثانية.`;
    if (code === 'over_request_rate_limit' || /rate limit|too many/i.test(msg)) {
        return 'محاولات كثيرة في وقت قصير. انتظر قليلًا ثم حاول مرة أخرى.';
    }
    if (code === 'email_address_not_authorized') {
        return 'خادم البريد في Supabase غير مُعد لإرسال رسائل لهذا البريد. تواصل مع الدعم.';
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
            const { data: authData, error: authError } = await window.supabaseClient.auth.signUp({
                email: email,
                password: password
            });

            if (authError) {
                throw authError;
            }

            // 3. إرسال البيانات إلى n8n لتهيئة المعلم
            const webhookUrl = APIUtils.buildUrl(CONFIG.API_ENDPOINTS.AUTH.INITIALIZE_TEACHER);
            
            const response = await fetch(webhookUrl, {
                method: 'POST',
                headers: APIUtils.buildHeaders(),
                body: JSON.stringify({
                    id: authData.user.id,
                    email: email,
                    name: name,
                    phone: phone,
                    username: username,
                    teaching_type: teachingType,
                    subject: subject
                })
            });

            if (!response.ok) {
                // خطة طوارئ: حذف الحساب إذا فشل الـ webhook
                await window.supabaseClient.auth.signOut();
                throw new Error('فشل إعداد ملفك الشخصي');
            }

            // نقرأ الرد كنص أولاً، لأن بعض الحالات (مشاكل بروكسي/شبكة) بترجع
            // status ناجح لكن body فاضي، وده يكسر response.json() مباشرة
            const responseText = await response.text();
            let responseData = null;
            if (responseText) {
                try {
                    responseData = JSON.parse(responseText);
                } catch (parseError) {
                    responseData = null;
                }
            }

            if (!responseData) {
                // الحساب في Supabase اتعمل بالفعل في هذه المرحلة، فمش هنمسحه
                // احتياطًا (ممكن يكون البروفايل اتحفظ فعلاً والمشكلة في وصول الرد بس)
                throw new Error('تم إنشاء حسابك، لكن حدث خطأ أثناء تأكيد إعداد ملفك الشخصي. جرّب تسجيل الدخول مباشرة — لو ظهرت نفس المشكلة، تواصل معنا.');
            }

            if (!responseData.success) {
                await window.supabaseClient.auth.signOut();
                throw new Error(responseData.error?.message || 'فشل في إنشاء الحساب');
            }

            return { success: true, user: authData.user };

        } catch (error) {
            console.error('Signup Error:', error);
            return { 
                success: false, 
                error: error.message || 'فشل التسجيل'
            };
        }
    },

    /**
     * دالة تسجيل الدخول (Login)
     */
    async signIn(email, password) {
        try {
            if (!Validators.email(email)) {
                throw new Error('البريد الإلكتروني غير صحيح');
            }

            const { data, error } = await window.supabaseClient.auth.signInWithPassword({
                email: email,
                password: password
            });

            if (error) throw error;

            // حفظ الجلسة
            Storage.set('auth_session', {
                user_id: data.user.id,
                access_token: data.session.access_token,
                refresh_token: data.session.refresh_token,
                expires_at: data.session.expires_at
            });

            // جلب بيانات الجلسة من الخادم
            await this.bootstrapSession();

            return { success: true, session: data.session };
        } catch (error) {
            console.error('Login Error:', error);
            return { 
                success: false, 
                error: 'البريد الإلكتروني أو كلمة المرور غير صحيحة' 
            };
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

            const headers = APIUtils.buildHeaders(session.access_token);
            const response = await fetch(
                APIUtils.buildUrl(CONFIG.API_ENDPOINTS.AUTH.BOOTSTRAP_SESSION),
                { method: 'GET', headers }
            );

            if (!response.ok) {
                throw new Error('فشل تحميل بيانات الجلسة');
            }

            const data = await response.json();
            
            if (data.success) {
                // حفظ بيانات الجلسة
                Storage.set('user_profile', data.data);
                return data.data;
            }

            return null;
        } catch (error) {
            console.error('Bootstrap Session Error:', error);
            return null;
        }
    },

    /**
     * دالة تسجيل الخروج (Logout)
     */
    async signOut() {
        try {
            const { error } = await window.supabaseClient.auth.signOut();
            if (error) throw error;
            
            // حذف البيانات المحلية
            Storage.remove('auth_session');
            Storage.remove('user_profile');
            
            // إعادة التوجيه إلى صفحة تسجيل الدخول
            window.location.href = 'login.html';
        } catch (error) {
            console.error('Logout Error:', error);
            ErrorHandler.showError('فشل تسجيل الخروج');
        }
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
        const session = await this.getSession();
        if (!session) {
            window.location.replace('login.html');
            return null;
        }

        // تحميل بيانات الملف الشخصي
        const profile = await this.bootstrapSession();
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
                Storage.set('auth_session', {
                    user_id: data.user.id,
                    access_token: data.session.access_token,
                    refresh_token: data.session.refresh_token,
                    expires_at: data.session.expires_at
                });
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
            code = String(code || '').replace(/\s+/g, '');
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
