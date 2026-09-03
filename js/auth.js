import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const supabase = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);

const auth = {
    async signup(email, password, name, phone, username) {
        // 1. إنشاء الحساب في Supabase Auth
        const { data, error } = await supabase.auth.signUp({
            email,
            password
        });

        if (error) throw new Error(this.translateError(error.message));

        // حفظ الجلسة مؤقتاً لتمريرها لـ n8n
        localStorage.setItem('sb-session', JSON.stringify(data.session));

        // 2. استدعاء n8n لإنشاء الـ Profile والـ Subscription
        try {
            await api.call('/webhook/initialize-teacher', 'POST', {
                id: data.user.id,
                email,
                name,
                phone,
                username
            });
        } catch (n8nError) {
            // في حالة فشل التهيئة، يجب مسح الحساب لتجنب الحسابات المعلقة
            await supabase.auth.signOut();
            throw new Error('تم إنشاء الحساب لكن تعذرت تهيئة البيانات. يرجى مراسلة الدعم.');
        }

        window.location.href = 'dashboard.html';
    },

    async login(email, password) {
        const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password
        });

        if (error) throw new Error(this.translateError(error.message));
        
        localStorage.setItem('sb-session', JSON.stringify(data.session));
        window.location.href = 'dashboard.html';
    },

    async logout() {
        await supabase.auth.signOut();
        localStorage.removeItem('sb-session');
        window.location.href = 'login.html';
    },

    translateError(msg) {
        if (msg.includes('already registered')) return 'البريد الإلكتروني مسجل مسبقاً.';
        if (msg.includes('Invalid login credentials')) return 'بيانات الدخول غير صحيحة.';
        if (msg.includes('Password should be')) return 'كلمة المرور ضعيفة جداً.';
        return 'حدث خطأ في النظام. حاول مرة أخرى.';
    }
};

window.auth = auth; // جعله متاحاً لملفات HTML
