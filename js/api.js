import { CONFIG } from './config.js';

export const api = {
    async call(endpoint, method = 'POST', body = null) {
        const sessionString = localStorage.getItem('sb-session');
        if (!sessionString) {
            window.location.href = 'login.html';
            throw new Error('UNAUTHORIZED');
        }
        
        const session = JSON.parse(sessionString);
        
        const headers = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`
        };

        const options = { method, headers };
        if (body && method !== 'GET') {
            options.body = JSON.stringify(body);
        }

        const response = await fetch(`${CONFIG.N8N_WEBHOOK_BASE}${endpoint}`, options);
        const data = await response.json();
        
        if (!data.success) {
            if (response.status === 401 || response.status === 403) {
                localStorage.removeItem('sb-session');
                window.location.href = 'login.html';
            }
            throw new Error(data.error?.message || 'حدث خطأ في جلب البيانات.');
        }
        return data.data;
    },

    async getDashboard() {
        return await this.call('/webhook/dashboard', 'GET');     
    }
};
