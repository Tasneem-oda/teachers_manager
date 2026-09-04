import { CONFIG } from './config.js';

export const api = {
    async call(endpoint, method = 'POST', body = null) {
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
            'Authorization': `Bearer ${session.access_token}`
        };

        const options = { method, headers };
        if (body && method !== 'GET') {
            options.body = JSON.stringify(body);
        }

        const url = `${CONFIG.N8N_WEBHOOK_BASE}${endpoint}`;
        const response = await fetch(url, options);

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
    },

    async createStudent(studentData) {
        // استخدام الدالة المركزية call يغني عن إعادة كتابة منطق المصادقة والـ fetch
        return await this.call('/webhook/qtm/students/create', 'POST', studentData);
    }
};

window.api = api;
