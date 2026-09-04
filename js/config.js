/**
 * إعدادات التطبيق المركزية
 * يجب حماية هذه المفاتيح في بيئة الإنتاج
 */

export const CONFIG = {
    // Supabase Configuration
    SUPABASE_URL: 'https://qdpnupgqvjxlrmwwgmij.supabase.co',
    SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFkcG51cGdxdmp4bHJtd3dnbWlqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk5NjczMjUsImV4cCI6MjA4NTU0MzMyNX0.gaWPEgrhIQJzZLVoo7x1hnS-63ZJPZN96Xb3WpqApik',
    const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);    // n8n Webhook Base URL
    N8N_WEBHOOK_BASE: 'https://tasneemahmed-n8n.hf.space/webhook',
    
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
            CHECK_CONFLICT: '/check-schedule-conflict'
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
        PHONE_EG: /^(\+?20|0)?1[0125]\d{8}$/,
        USERNAME: /^[a-zA-Z0-9_-]{3,}$/,
        STRONG_PASSWORD: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/,
        URL: /^https?:\/\/.+\..+/
    }
};

// Initialize Supabase Client
if (typeof window !== 'undefined' && window.supabase) {
    window.supabase = window.supabase.createClient(
        CONFIG.SUPABASE_URL,
        CONFIG.SUPABASE_ANON_KEY
    );
}
