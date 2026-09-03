const api = {
    async call(endpoint, method = 'POST', body = null) {
        const session = JSON.parse(localStorage.getItem('sb-session'));
        if (!session || !session.access_token) {
            throw new Error('UNAUTHORIZED');
        }

        const headers = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`
        };

        const response = await fetch(`${CONFIG.N8N_WEBHOOK_BASE}${endpoint}`, {
            method,
            headers,
            body: body ? JSON.stringify(body) : null
        });

        const data = await response.json();
        if (!data.success) {
            throw new Error(data.error?.message || 'حدث خطأ غير متوقع.');
        }
        return data.data;
    }
};
