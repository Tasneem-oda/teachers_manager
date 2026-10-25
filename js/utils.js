/**
 * utils.js - دوال مساعدة موحدة للتطبيق
 */

import { CONFIG } from './config.js?v=27';

/** أرقام عربية/فارسية (٠١٢ / ۰۱۲) ← أرقام إنجليزية. كيبوردات كتير في مصر بتكتب الأرقام العربي افتراضيًا */
export function toLatinDigits(value) {
    return String(value == null ? '' : value)
        .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
        .replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x06F0));
}

/**
 * معرّف UUID v4 صحيح على كل المتصفحات.
 * crypto.randomUUID مش موجودة في موبايلات قديمة (آيفون قبل iOS 15.4 وأندرويد قديم)، والبديل القديم
 * كان بيرجّع نص مش UUID فالخادم كان بيرفضه بصمت (ومواعيد "كل يوم" كانت بتفقد ربطها ببعض).
 */
export function uuidv4() {
    try { if (window.crypto && typeof crypto.randomUUID === 'function') return crypto.randomUUID(); } catch (e) { /* نكمّل بالبديل */ }
    const b = new Uint8Array(16);
    try { crypto.getRandomValues(b); } catch (e) { for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256); }
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

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
        phone = toLatinDigits(phone);
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
    formatDate: (date, locale = 'ar-EG-u-nu-latn') => {
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
    
    formatDateTime: (dateTime, locale = 'ar-EG-u-nu-latn') => {
        if (!dateTime) return '';
        const d = new Date(dateTime);
        // نظام 12 ساعة دايمًا (ص / م)
        return d.toLocaleString(locale, { year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });
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
    
    // بيهرب كمان " و ' عشان النص يبقى آمن جوه attributes (title="..." / data-x="...")
    escapeHtml: (text) => String(text == null ? '' : text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
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
        const GENERIC = 'حصلت مشكلة. جرّب تاني، ولو فضلت كلّمنا على واتساب.';
        if (!error) return GENERIC;
        let msg = '';
        if (typeof error === 'string') msg = error;
        else if (error.error?.message) msg = error.error.message;
        else if (error.message) msg = error.message;
        if (!msg) return GENERIC;
        // رسائل تقنية بالإنجليزي جاية من n8n أو المتصفح (مثلًا "Error in workflow") مانعرضهاش للمدرس
        if (!/[\u0600-\u06FF]/.test(msg)) {
            if (/failed to fetch|network|load failed/i.test(msg)) return 'تعذّر الاتصال بالخادم. اتأكد من النت وجرّب تاني.';
            console.warn('[error]', msg);
            return GENERIC;
        }
        return msg;
    },
    
    getErrorCode: (error) => {
        if (error.error?.code) return error.error.code;
        if (error.code) return error.code;
        return 'UNKNOWN_ERROR';
    },
    
    showError: (message, duration = 5000) => {
        const errorDiv = document.getElementById('error-toast') || createErrorToast();
        errorDiv.textContent = message;
        errorDiv.style.display = 'flex';
        clearTimeout(errorDiv._tmTimer);
        errorDiv._tmTimer = setTimeout(() => {
            errorDiv.style.display = 'none';
        }, duration);
        try { window.dispatchEvent(new CustomEvent('tm:error-shown', { detail: String(message || '').slice(0, 120) })); } catch (e) { /* تجاهل */ }
    },
    
    showSuccess: (message, duration = 3000) => {
        const successDiv = document.getElementById('success-toast') || createSuccessToast();
        successDiv.textContent = message;
        successDiv.style.display = 'flex';
        clearTimeout(successDiv._tmTimer);
        successDiv._tmTimer = setTimeout(() => {
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
 * v25: نافذة اختيار بأزرار بأسماء الفعل نفسه (بدل confirm() اللي "موافق/إلغاء" فيه معناها مش واضح)
 * askChoice({ title, message, choices: [{ label, value, danger? }], cancelLabel })
 * بترجّع value الزرار المختار، أو null لو اتقفلت.
 */
export function askChoice({ title = '', message = '', choices = [], cancelLabel = 'رجوع' } = {}) {
    return new Promise((resolve) => {
        const esc = Formatters.escapeHtml;
        const wrap = document.createElement('div');
        wrap.className = 'modal active tm-choice';
        wrap.setAttribute('role', 'dialog');
        wrap.setAttribute('aria-modal', 'true');
        wrap.innerHTML = `<div class="modal-content tm-choice-box">
            ${title ? `<h3 class="tm-choice-title">${esc(title)}</h3>` : ''}
            ${message ? `<p class="tm-choice-msg">${esc(message)}</p>` : ''}
            <div class="tm-choice-actions">
                ${choices.map((c, i) => `<button type="button" class="btn ${c.danger ? 'btn-danger' : (i === 0 ? '' : 'btn-outline')}" data-i="${i}">${esc(c.label)}</button>`).join('')}
                <button type="button" class="btn btn-outline" data-cancel>${esc(cancelLabel)}</button>
            </div>
        </div>`;
        const done = (v) => { document.removeEventListener('keydown', onKey); wrap.remove(); resolve(v); };
        const onKey = (e) => { if (e.key === 'Escape') done(null); };
        wrap.addEventListener('click', (e) => {
            if (e.target === wrap || e.target.closest('[data-cancel]')) return done(null);
            const b = e.target.closest('[data-i]');
            if (b) done(choices[Number(b.dataset.i)].value);
        });
        document.addEventListener('keydown', onKey);
        document.body.appendChild(wrap);
        const first = wrap.querySelector('[data-i]');
        if (first) first.focus();
    });
}

/**
 * دالة مساعدة لإنشاء عنصر toast للأخطاء
 */
function createErrorToast() {
    // v25: المكان والشكل من style.css (#error-toast): فوق على الكمبيوتر، وتحت فوق شريط التنقل على الموبايل
    const div = document.createElement('div');
    div.id = 'error-toast';
    div.setAttribute('role', 'alert');
    div.style.cssText = 'display: none; word-break: break-word;';
    document.body.appendChild(div);
    return div;
}

/**
 * دالة مساعدة لإنشاء عنصر toast للنجاح
 */
function createSuccessToast() {
    const div = document.createElement('div');
    div.id = 'success-toast';
    div.setAttribute('role', 'status');
    div.style.cssText = 'display: none; word-break: break-word;';
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
