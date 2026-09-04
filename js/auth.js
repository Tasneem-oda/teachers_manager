/**
 * auth.js - إدارة المصادقة والجلسات
 * يعتمد على Supabase Auth كليًا
 *
 * ملاحظة مهمة: عميل Supabase الفعلي يتم إنشاؤه مرة واحدة فقط في config.js
 * ويُخزَّن في window.supabaseClient. يجب استخدام window.supabaseClient
 * في كل مكان (وليس window.supabase، لأن هذا الأخير هو مكتبة supabase-js
 * الخام القادمة من الـ CDN وليس عميلاً مهيّأً، وليس لديه خاصية .auth).
 */
import { CONFIG } from './config.js';
import { APIUtils, Storage, ErrorHandler, Validators } from './utils.js';

// إتاحة العميل المهيأ بنفس الاسم "supabase" لمن يريد استيراده من هذا الملف
export const supabase = window.supabaseClient;

/**
 * كائن إدارة المصادقة
 */
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

            const responseData = await response.json();
            
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
     * تغيير كلمة المرور
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
                error: error.message || 'فشل تغيير كلمة المرور'
            };
        }
    },

    /**
     * إرسال رابط إعادة تعيين كلمة المرور
     */
    async resetPassword(email) {
        try {
            if (!Validators.email(email)) {
                throw new Error('البريد الإلكتروني غير صحيح');
            }

            const { error } = await window.supabaseClient.auth.resetPasswordForEmail(email, {
                redirectTo: `${window.location.origin}/reset-password.html`
            });

            if (error) throw error;

            return { success: true };
        } catch (error) {
            console.error('Reset Password Error:', error);
            return { 
                success: false, 
                error: error.message || 'فشل إرسال رابط إعادة التعيين'
            };
        }
    }
};

// جعل الكائن متاحًا عالميًا
window.Auth = Auth;

export default Auth;
