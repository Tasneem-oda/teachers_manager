/**
 * utils.js - دوال مساعدة موحدة للتطبيق
 */

import { CONFIG } from './config.js';

/**
 * التحقق من البيانات (Validation)
 */
export const Validators = {
    email: (email) => CONFIG.PATTERNS.EMAIL.test(email),
    
    phone: (phone) => CONFIG.PATTERNS.PHONE_EG.test(phone),
    
    username: (username) => CONFIG.PATTERNS.USERNAME.test(username) && username.length >= 3,
    
    password: (password) => password.length >= 8,
    
    strongPassword: (password) => CONFIG.PATTERNS.STRONG_PASSWORD.test(password),
    
    url: (url) => CONFIG.PATTERNS.URL.test(url),
    
    name: (name) => name.trim().length >= 2 && name.trim().length <= 100,
    
    isRequired: (value) => value !== null && value !== undefined && value.toString().trim() !== '',
    
    minLength: (value, min) => value && value.toString().length >= min,
    
    maxLength: (value, max) => value && value.toString().length <= max,
    
    isNumber: (value) => !isNaN(parseFloat(value)) && isFinite(value),
    
    isPositiveNumber: (value) => Validators.isNumber(value) && parseFloat(value) > 0,
    
    isInteger: (value) => Number.isInteger(parseFloat(value))
};

/**
 * تنسيق البيانات (Formatting)
 */
export const Formatters = {
    formatDate: (date, locale = 'ar-EG') => {
        if (!date) return '';
        const d = new Date(date);
        return d.toLocaleDateString(locale, { 
            weekday: 'long', 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric' 
        });
    },
    
    formatTime: (time) => {
        if (!time) return '';
        if (time.length >= 5) return time.substring(0, 5);
        return time;
    },
    
    formatDateTime: (dateTime, locale = 'ar-EG') => {
        if (!dateTime) return '';
        const d = new Date(dateTime);
        return d.toLocaleString(locale);
    },
    
    formatPhone: (phone) => {
        const cleaned = phone.replace(/\D/g, '');
        if (cleaned.length === 10) return '0' + cleaned;
        if (cleaned.length === 11 && cleaned.startsWith('2')) return '0' + cleaned.substring(1);
        return '+20' + cleaned.substring(cleaned.length === 12 ? 2 : 0);
    },
    
    capitalizeWords: (str) => {
        return str.replace(/\b\w/g, char => char.toUpperCase());
    },
    
    truncate: (str, length = 50) => {
        return str.length > length ? str.substring(0, length) + '...' : str;
    },
    
    escapeHtml: (text) => {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
};

/**
 * تخزين البيانات المحلية (LocalStorage)
 */
export const Storage = {
    set: (key, value) => {
        try {
            localStorage.setItem(key, JSON.stringify(value));
        } catch (e) {
            console.warn('Failed to save to localStorage:', e);
        }
    },
    
    get: (key) => {
        try {
            const value = localStorage.getItem(key);
            return value ? JSON.parse(value) : null;
        } catch (e) {
            console.warn('Failed to read from localStorage:', e);
            return null;
        }
    },
    
    remove: (key) => {
        try {
            localStorage.removeItem(key);
        } catch (e) {
            console.warn('Failed to remove from localStorage:', e);
        }
    },
    
    clear: () => {
        try {
            localStorage.clear();
        } catch (e) {
            console.warn('Failed to clear localStorage:', e);
        }
    }
};

/**
 * معالجة الأخطاء (Error Handling)
 */
export const ErrorHandler = {
    getErrorMessage: (error) => {
        if (typeof error === 'string') return error;
        if (error.error?.message) return error.error.message;
        if (error.message) return error.message;
        return 'حدث خطأ غير متوقع';
    },
    
    getErrorCode: (error) => {
        if (error.error?.code) return error.error.code;
        if (error.code) return error.code;
        return 'UNKNOWN_ERROR';
    },
    
    showError: (message, duration = 5000) => {
        const errorDiv = document.getElementById('error-toast') || createErrorToast();
        errorDiv.textContent = message;
        errorDiv.style.display = 'block';
        
        setTimeout(() => {
            errorDiv.style.display = 'none';
        }, duration);
    },
    
    showSuccess: (message, duration = 3000) => {
        const successDiv = document.getElementById('success-toast') || createSuccessToast();
        successDiv.textContent = message;
        successDiv.style.display = 'block';
        
        setTimeout(() => {
            successDiv.style.display = 'none';
        }, duration);
    }
};

/**
 * دوال مساعدة للوقت
 */
export const TimeUtils = {
    getCurrentDayOfWeek: () => new Date().getDay(),
    
    getDayName: (dayIndex) => {
        const days = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
        return days[dayIndex] || '';
    },
    
    getTimeFromString: (timeStr) => {
        if (!timeStr || timeStr.length < 5) return null;
        const [hours, minutes] = timeStr.substring(0, 5).split(':');
        return { hours: parseInt(hours), minutes: parseInt(minutes) };
    },
    
    checkTimeOverlap: (start1, end1, start2, end2) => {
        const toMinutes = (timeStr) => {
            const [h, m] = timeStr.split(':').map(Number);
            return h * 60 + m;
        };
        
        const start1Min = toMinutes(start1);
        const end1Min = toMinutes(end1);
        const start2Min = toMinutes(start2);
        const end2Min = toMinutes(end2);
        
        return !(end1Min <= start2Min || end2Min <= start1Min);
    },
    
    addMinutesToTime: (timeStr, minutes) => {
        const [h, m] = timeStr.split(':').map(Number);
        const totalMinutes = h * 60 + m + minutes;
        const newH = Math.floor(totalMinutes / 60) % 24;
        const newM = totalMinutes % 60;
        return `${String(newH).padStart(2, '0')}:${String(newM).padStart(2, '0')}`;
    }
};

/**
 * دوال مساعدة للـ API
 */
export const APIUtils = {
    buildUrl: (endpoint) => {
        return CONFIG.N8N_WEBHOOK_BASE + endpoint;
    },
    
    buildHeaders: (token) => {
        const headers = {
            'Content-Type': 'application/json'
        };
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }
        return headers;
    },
    
    handleResponse: async (response) => {
        const text = await response.text();
        
        if (!text) {
            throw new Error('استجابة الخادم فارغة');
        }
        
        let data;
        try {
            data = JSON.parse(text);
        } catch (e) {
            throw new Error('فشل قراءة استجابة الخادم');
        }
        
        if (!data.success) {
            throw {
                error: data.error || { message: 'حدث خطأ' },
                status: response.status
            };
        }
        
        return data.data;
    }
};

/**
 * دالة مساعدة لإنشاء عنصر toast للأخطاء
 */
function createErrorToast() {
    const div = document.createElement('div');
    div.id = 'error-toast';
    div.style.cssText = `
        position: fixed;
        top: 20px;
        left: 20px;
        background-color: #B85C5C;
        color: white;
        padding: 15px 20px;
        border-radius: 8px;
        box-shadow: 0 4px 6px rgba(0,0,0,0.1);
        display: none;
        z-index: 9999;
        max-width: 400px;
        word-break: break-word;
    `;
    document.body.appendChild(div);
    return div;
}

/**
 * دالة مساعدة لإنشاء عنصر toast للنجاح
 */
function createSuccessToast() {
    const div = document.createElement('div');
    div.id = 'success-toast';
    div.style.cssText = `
        position: fixed;
        top: 20px;
        left: 20px;
        background-color: #6F8F72;
        color: white;
        padding: 15px 20px;
        border-radius: 8px;
        box-shadow: 0 4px 6px rgba(0,0,0,0.1);
        display: none;
        z-index: 9999;
        max-width: 400px;
        word-break: break-word;
    `;
    document.body.appendChild(div);
    return div;
}

// Export all utilities
export default {
    Validators,
    Formatters,
    Storage,
    ErrorHandler,
    TimeUtils,
    APIUtils
};
