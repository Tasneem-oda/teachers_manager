/**
 * إعدادات التطبيق المركزية
 * يجب حماية هذه المفاتيح في بيئة الإنتاج
 */

export const CONFIG = {
    // Supabase Configuration
    SUPABASE_URL: 'https://qdpnupgqvjxlrmwwgmij.supabase.co',
    SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFkcG51cGdxdmp4bHJtd3dnbWlqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk5NjczMjUsImV4cCI6MjA4NTU0MzMyNX0.gaWPEgrhIQJzZLVoo7x1hnS-63ZJPZN96Xb3WpqApik',
    
    // n8n Webhook Base URL
    N8N_WEBHOOK_BASE: 'https://n8n-2lse.srv1963528.hstgr.cloud/webhook',

    // إعدادات إشعارات Push (OneSignal) - لإرسال تذكير يومي للمعلم بحصص اليوم
    // 1) أنشئي حساب مجاني على https://onesignal.com
    // 2) أنشئي تطبيق ويب جديد (Web Push) واختاري "Typical Site"
    // 3) هتلاقي الـ App ID في Settings > Keys & IDs، حطيه بدل القيمة تحت
    // 4) لازم الموقع يبقى شغال على HTTPS (مش مشكلة عندك لأنه منشور بالفعل على دومين)
    PUSH_NOTIFICATIONS: {
        ONESIGNAL_APP_ID: 'REPLACE_WITH_YOUR_ONESIGNAL_APP_ID'
    },
    
    // API Endpoints تجميع لسهولة الصيانة
    API_ENDPOINTS: {
        AUTH: {
            INITIALIZE_TEACHER: '/initialize-teacher',
            BOOTSTRAP_SESSION: '/bootstrap-session'
        },
        DASHBOARD: {
            GET: '/get-dashboard'
        },
        STUDENTS: {
            CREATE: '/create-student',
            GET_ALL: '/get-students',
            GET_ONE: '/get-student',
            UPDATE: '/update-student',
            DELETE: '/delete-student'
        },
        SCHEDULES: {
            CREATE: '/create-schedule',
            UPDATE: '/update-schedule',
            DELETE: '/delete-schedule',
            GET_ALL: '/get-schedules'
        },
        LESSONS: {
            START: '/start-lesson',
            FINALIZE: '/finalize-lesson',
            GET: '/get-lesson',
            GET_HISTORY: '/get-lesson-history'
        },
        NOTES: {
            CREATE: '/create-note',
            GET: '/get-notes'
        },
        TEACHING_PROFILE: {
            GET: '/get-teaching-profile',
            UPDATE: '/update-teaching-profile'
        },
        SUBSCRIPTIONS: {
            CHECK: '/check-subscription'
        },
        ADMIN: {
            GET_USERS: '/admin/get-users'
        },
        AI: {
            ASSISTANT: '/teacher-assistant',
            LESSON_SUMMARY: '/lesson-summary'
        }
    },
    
    // Application Settings
    APP: {
        NAME: 'Teachers Manager',
        VERSION: '1.0.0',
        TRIAL_DAYS: 7,
        TIMEZONE_DEFAULT: 'Africa/Cairo'
    },
    
    // Limits
    LIMITS: {
        MAX_STUDENTS_TRIAL: 10,
        API_TIMEOUT: 30000,
        AI_TIMEOUT: 60000
    },
    
    // Validation Patterns
    PATTERNS: {
        EMAIL: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
        // نمط الهاتف المصري القديم - ما عاد يُستخدم في الفحص الفعلي (احتفظنا
        // بيه هنا للمرجعية فقط)، لأن الفحص كان بيرفض أي رقم غير مصري
        PHONE_EG: /^(\+?20|0)?1[0125]\d{8}$/,
        // نمط عام لأي رقم هاتف دولي (مش مقتصر على مصر فقط): يسمح بعلامة "+"
        // اختيارية في الأول، وبعدين أرقام، وممكن تتخللها مسافات أو "-" أو
        // أقواس للتنسيق (زي +1 (212) 555-0100). طول الأرقام الفعلي (من غير
        // رموز التنسيق) بيتفحص بعدين في Validators.phone
        PHONE: /^\+?[0-9\s\-()]{7,20}$/,
        // اسم المستخدم: أحرف إنجليزية (كبيرة/صغيرة) وأرقام و "_" و "-" فقط، بدون مسافات
        // أو أحرف عربية أو رموز خاصة أخرى، بطول من 3 إلى 20 حرفًا
        USERNAME: /^[a-zA-Z0-9_-]{3,20}$/,
        STRONG_PASSWORD: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/,
        URL: /^https?:\/\/.+\..+/
    }
};

// استخراج دالة التهيئة من مكتبة المتصفح لتفادي التضارب
const { createClient } = window.supabase;

// تهيئة وتصدير الكائن بالاسم الذي تعتمد عليه باقي الملفات
// إضافة هذا الكود في نهاية ملف config.js أسفل كائن CONFIG
if (typeof window !== 'undefined' && window.supabase && !window.supabaseClient) {
    // إنشاء العميل مرة واحدة فقط وتخزينه في window.supabaseClient
    window.supabaseClient = window.supabase.createClient(
        CONFIG.SUPABASE_URL,
        CONFIG.SUPABASE_ANON_KEY
    );
}
