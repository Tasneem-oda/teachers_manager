import { CONFIG } from './config.js';

export const api = {
    async call(endpoint, method = 'POST', body = null) {
        // 1. استخدام Supabase مباشرة لجلب الجلسة والتوكن الصحيح بأمان تام
        if (!window.supabase) {
            throw new Error('Supabase client is not initialized.');
        }

        const { data: { session }, error } = await window.supabase.auth.getSession();

        if (error || !session) {
            window.location.href = 'login.html';
            throw new Error('UNAUTHORIZED');
        }
        
        const headers = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}` // التوكن الحقيقي من الجلسة النشطة
        };

        const options = { method, headers };
        if (body && method !== 'GET') {
            options.body = JSON.stringify(body);
        }

        const url = `${CONFIG.N8N_WEBHOOK_BASE}${endpoint}`;
        const response = await fetch(url, options);

        // 2. فحص النص القادم أولاً لحماية الواجهة من الانهيار إذا كان الرد فارغاً
        const textResponse = await response.text();
        if (!textResponse) {
            throw new Error('استجابة الخادم فارغة أو غير صالحة.');
        }

        let data;
        try {
            data = JSON.parse(textResponse);
        } catch (e) {
            throw new Error('فشل قراءة بيانات الخادم (Invalid JSON).');
        }
        
        if (!data.success) {
            if (response.status === 401 || response.status === 403) {
                await window.supabase.auth.signOut();
                window.location.href = 'login.html';
            }
            throw new Error(data.error?.message || 'حدث خطأ في جلب البيانات.');
        }

        return data.data;
    },

    async getDashboard() {
        return await this.call('/webhook/dashboard', 'GET');      
    }
    export const api = {
    async createStudent(studentData) {
        // افتراض وجود دالة auth.getSession() لجلب الـ JWT Token
        const session = await auth.getSession();
        if (!session) throw new Error("AUTHENTICATION_ERROR");

        const response = await fetch(`${N8N_WEBHOOK_BASE}/webhook/qtm/students/create`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session.access_token}`
            },
            body: JSON.stringify(studentData)
        });

        const result = await response.json();
        if (!result.success) {
            throw new Error(result.error.message || "فشل في حفظ البيانات");
        }
        return result.data;
    }
};
};

// إتاحة الـ api عالمياً في حال لم تستخدم الـ ES Modules في كل الملفات
window.api = api;
