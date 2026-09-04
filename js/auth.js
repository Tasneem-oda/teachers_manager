/**
 * ملف auth.js
 * المسؤول حصرياً عن إدارة جلسات المستخدم، تسجيل الدخول، إنشاء الحساب، وتسجيل الخروج
 * بالاعتماد على Supabase Auth.
 */

const Auth = {
    /**
     * دالة إنشاء حساب جديد (Signup)
     * تقوم بإنشاء الحساب في Supabase ثم إرسال البيانات إلى n8n لتهيئة المعلم
     */
    async signUp(name, email, phone, password) {
        try {
            // 1. توليد username تلقائي وفريد باستخدام البريد الإلكتروني وتاريخ اللحظة لتلبية شرط قاعدة البيانات
            const generatedUsername = email.split('@')[0].replace(/[^a-zA-Z0-9]/g, '') + '_' + Date.now();

            // 2. إنشاء الحساب في Supabase Auth
            const { data: authData, error: authError } = await supabase.auth.signUp({
                email: email,
                password: password
            });

            if (authError) {
                throw authError;
            }

            // 3. إرسال البيانات إلى n8n Webhook لتهيئة ملف المعلم (Profile) والاشتراك (Subscription)
            // تم استخدام الرابط الخاص بك بناءً على إعدادات n8n
            const webhookUrl = 'https://tasneemahmed-n8n.hf.space/webhook/initialize-teacher';
            
            const response = await fetch(webhookUrl, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json' 
                },
                body: JSON.stringify({
                    id: authData.user.id,
                    email: email,
                    name: name,
                    phone: phone,
                    username: generatedUsername // الاسم المولد تلقائياً لتجنب خطأ قاعدة البيانات
                })
            });

            if (!response.ok) {
                // خطة طوارئ: إذا فشل n8n في تسجيل البيانات، نقوم بمسح الحساب المعلق من الجلسة
                await supabase.auth.signOut();
                throw new Error('حدث خطأ أثناء إعداد ملفك الشخصي في النظام الأساسي.');
            }

            const responseData = await response.json();
            
            if (responseData.success === false) {
                await supabase.auth.signOut();
                throw new Error(responseData.error?.message || 'فشل في تهيئة الحساب.');
            }

            return { success: true, user: authData.user };

        } catch (error) {
            console.error('Signup Error:', error);
            // إرجاع الخطأ ليتم عرضه للمستخدم في واجهة HTML
            return { success: false, error: error.message };
        }
    },

    /**
     * دالة تسجيل الدخول (Login)
     */
    async signIn(email, password) {
        try {
            const { data, error } = await supabase.auth.signInWithPassword({
                email: email,
                password: password
            });

            if (error) throw error;

            return { success: true, session: data.session };
        } catch (error) {
            console.error('Login Error:', error);
            return { success: false, error: 'البريد الإلكتروني أو كلمة المرور غير صحيحة.' };
        }
    },

    /**
     * دالة تسجيل الخروج (Logout)
     */
    async signOut() {
        try {
            const { error } = await supabase.auth.signOut();
            if (error) throw error;
            
            // إعادة التوجيه إلى صفحة تسجيل الدخول
            window.location.href = 'login.html';
        } catch (error) {
            console.error('Logout Error:', error);
        }
    },

    /**
     * الحصول على الجلسة الحالية
     */
    async getSession() {
        const { data: { session }, error } = await supabase.auth.getSession();
        if (error) {
            console.error('Get Session Error:', error);
            return null;
        }
        return session;
    },

    /**
     * حماية الصفحات: التحقق مما إذا كان المستخدم مسجل الدخول
     * يتم استدعاؤها في بداية تحميل الصفحات المحمية (مثل dashboard.html)
     */
    async requireAuth() {
        const session = await this.getSession();
        if (!session) {
            // إذا لم يكن هناك جلسة نشطة، تحويله لصفحة تسجيل الدخول
            window.location.replace('login.html');
            return null;
        }
        return session;
    },

    /**
     * منع المستخدم المسجل من رؤية صفحات تسجيل الدخول/الإنشاء
     * يتم استدعاؤها في صفحات login.html و signup.html
     */
    async redirectIfAuthenticated() {
        const session = await this.getSession();
        if (session) {
            window.location.replace('dashboard.html');
        }
    }
};

// جعل الكائن متاحاً للاستخدام في ملفات HTML
window.Auth = Auth;
