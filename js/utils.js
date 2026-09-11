/**
 * utils.js - دوال مساعدة موحدة للتطبيق
 */

import { CONFIG } from './config.js';

/**
 * التحقق من البيانات (Validation)
 */
export const Validators = {
    email: (email) => CONFIG.PATTERNS.EMAIL.test(email),
    
    // فحص رقم الهاتف: بيقبل أي رقم دولي (مش مقتصر على الأرقام المصرية فقط)
    // بيشيل رموز التنسيق (مسافات/-/أقواس) الأول، وبعدين يتأكد إن الأرقام
    // الفعلية من 7 إلى 15 رقم (نطاق معقول لمعظم أرقام الهواتف حول العالم)
    phone: (phone) => {
        if (!phone) return false;
        const digitsOnly = phone.replace(/\D/g, '');
        return CONFIG.PATTERNS.PHONE.test(phone.trim()) && digitsOnly.length >= 7 && digitsOnly.length <= 15;
    },
    
    // فحص بسيط (true/false) - بيتأكد إن اسم المستخدم مطابق تمامًا للنمط المسموح
    // (أحرف إنجليزية/أرقام/underscore/hyphen فقط، من 3 إلى 20 حرف)
    username: (username) => CONFIG.PATTERNS.USERNAME.test(username) && username.length >= 3,

    // فحص تفصيلي لاسم المستخدم بيرجع سبب الخطأ بالتحديد عشان تقدر تعرض
    // رسالة واضحة للمستخدم (بدل رسالة عامة واحدة لكل الحالات)
    // القيمة المرجعة: { valid: boolean, reason: 'empty' | 'invalidChars' | 'tooShort' | 'tooLong' | null }
    usernameDetailed: (username) => {
        const value = (username || '').trim();

        if (!value) {
            return { valid: false, reason: 'empty' };
        }

        // لو فيه أي حرف غير مسموح به (عربي، مسافة، رمز خاص غير _ أو -) نرفض فورًا
        // ونوضح إن المشكلة في الأحرف نفسها، مش في الطول
        if (!/^[a-zA-Z0-9_-]+$/.test(value)) {
            return { valid: false, reason: 'invalidChars' };
        }

        if (value.length < 3) {
            return { valid: false, reason: 'tooShort' };
        }

        if (value.length > 20) {
            return { valid: false, reason: 'tooLong' };
        }

        return { valid: true, reason: null };
    },
    
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
        const raw = time.length >= 5 ? time.substring(0, 5) : time;
        const parts = raw.split(':');
        if (parts.length < 2) return raw;
        let hours = parseInt(parts[0], 10);
        const minutes = parts[1].padStart(2, '0');
        if (isNaN(hours)) return raw;
        const period = hours >= 12 ? 'م' : 'ص';
        hours = hours % 12;
        if (hours === 0) hours = 12;
        return `${hours}:${minutes} ${period}`;
    },
    
    formatDateTime: (dateTime, locale = 'ar-EG') => {
        if (!dateTime) return '';
        const d = new Date(dateTime);
        return d.toLocaleString(locale);
    },
    
    formatPhone: (phone) => {
        // ملحوظة: قبل كده كانت الدالة دي بتفرض صيغة مصرية (+20) على أي رقم،
        // وده كان غلط لأي رقم هاتف من دولة تانية. التطبيق بقى يقبل أرقام
        // دولية من أي دولة، فبقينا نكتفي بتنظيف بسيط للمسافات ونعرض الرقم
        // زي ما المستخدم كتبه بالظبط، بدون أي افتراض لدولة معينة.
        if (!phone) return '';
        return phone.trim();
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
