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
    // 1) أنشئ حساب مجاني على https://onesignal.com
    // 2) أنشئ تطبيق ويب جديد (Web Push) واختار "Typical Site"
    // 3) هتلاقي الـ App ID في Settings > Keys & IDs، حطّه بدل القيمة تحت
    // 4) لازم الموقع يبقى شغال على HTTPS (مش مشكلة هنا لأنه منشور بالفعل على دومين)
    PUSH_NOTIFICATIONS: {
        ONESIGNAL_APP_ID: '8cba05cf-844b-4e83-a7e7-8dbce1264ae3'
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
            GET_HISTORY: '/get-lesson-history',
            // مواعيد اليوم بحالتها (فات ميعادها/قيد التنفيذ/تمت/اتلغت) + إلغاء حصة اليوم يدويًا
            GET_TODAY: '/get-today-lessons',
            CANCEL: '/cancel-lesson'
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
        // مركز الإشعارات (نافذة زر الجرس 🔔) - مقروءة / غير مقروءة
        NOTIFICATIONS: {
            GET_ALL: '/get-notifications',
            MARK_READ: '/mark-notifications-read'
        },
        AI: {
            ASSISTANT: '/teacher-assistant',
            LESSON_SUMMARY: '/lesson-summary',
            // مساعد الذكاء الاصطناعي التفاعلي (شات بذاكرة خاصة بكل طالب) - منفصل
            // عن ASSISTANT اللي بيستخدمه زرار "طلب ملخص ذكي" الموجود بالفعل
            CHAT: '/ai-chat',
            // "✨ حضّرلي الحصة" في صفحة الطالب - خطة حصة مبنية على بيانات
            // الطالب + مصادر مكتبة المعلم المرتبطة به
            PREPARE_LESSON: '/prepare-lesson'
        },
        // 📚 مكتبتي: رفع كتب/مذكرات، تحليلها بالذكاء الاصطناعي، والسؤال عنها
        BOOKS: {
            CREATE_SOURCE: '/create-book-source',
            // خط معالجة الكتاب (المتصفح بيستخرج النص، والسيرفر بيعمل OCR + فهرسة):
            //   PROCESS (start) → OCR (اختياري للصفحات الممسوحة) → INDEX (فهرسة دفعات) → FINISH
            PROCESS: '/process-book',
            OCR: '/book-ocr',
            INDEX: '/book-index',
            FINISH: '/finish-book',
            // نص الكتاب المفهرس (عرض نصي بديل + تحديد مكان الاستشهادات)
            CONTENT: '/get-book-content',
            LIST: '/list-books',
            DELETE: '/delete-book',
            UPDATE_ACCESS: '/update-book-access',
            ASK: '/ask-sources'
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

    // 📚 إعدادات مكتبة الكتب
    BOOKS_SETTINGS: {
        BUCKET: 'teacher-books',
        // لازم يطابق نموذج الـ embedding المستخدم في n8n (ask-sources / book-index / prepare-lesson) - و vector(768) في قاعدة البيانات
        EMBEDDING_MODEL: 'gemini-embedding-001',   // بأبعاد 768 (outputDimensionality) - text-embedding-004 مش شغال
        // حد Supabase المجاني لحجم الملف الواحد 50MB
        MAX_FILE_MB: 50,
        // أقصى عدد صفحات للقراءة بالذكاء الاصطناعي (OCR) في كتاب واحد (بيحمي حصة Gemini)
        MAX_OCR_PAGES: 400,
        // أقصى عدد صفحات/وحدات للكتاب الواحد
        MAX_UNITS: 1500,
        // عدد صفحات الـ OCR في الطلب الواحد وعدد المقاطع في طلب الفهرسة الواحد
        OCR_BATCH_PAGES: 5,
        INDEX_BATCH_CHUNKS: 12,
        // بعد كام دقيقة من غير أي تقدم نعتبر المعالجة "متوقفة" (المتصفح اتقفل مثلًا)
        STALE_PROCESSING_MINUTES: 8,
        // أقصى طول لسؤال الشات وعدد الرسائل السابقة المرسلة كسياق
        MAX_QUESTION_CHARS: 1000,
        HISTORY_MESSAGES: 8
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
// ---------------------------------------------------------------------------
// رابط استعادة كلمة المرور
// Supabase بيرجّع المستخدم من رابط الإيميل ومعاه التوكن في الرابط (#access_token=...&type=recovery
// أو ?token_hash=...&type=recovery). بنحفظ الرابط الأصلي قبل ما مكتبة Supabase تقرأه وتمسحه،
// عشان صفحة reset-password تعرف إن المستخدم جاي من رابط استعادة.
// ولو الرابط وصل لصفحة تانية (مثلًا لو Site URL في Supabase مضبوط على الصفحة الرئيسية
// أو الرابط مش موجود في Redirect URLs) بنحوّله لصفحة الاستعادة بنفس التوكن.
// ---------------------------------------------------------------------------
let __redirectingToReset = false;
if (typeof window !== 'undefined') {
    window.__authUrlAtLoad = window.location.href;
    const h = window.location.hash || '';
    const q = window.location.search || '';
    const isRecoveryLink = /(^|[#&])type=recovery(&|$)/.test(h) || (/[?&]type=recovery(&|$)/.test(q) && /[?&]token_hash=/.test(q));
    const onResetPage = /\/reset-password(\.html)?$/.test(window.location.pathname);
    if (isRecoveryLink && !onResetPage) {
        __redirectingToReset = true;
        window.location.replace(new URL('reset-password.html', window.location.href).pathname + q + h);
    }
}

if (typeof window !== 'undefined' && window.supabase && !window.supabaseClient && !__redirectingToReset) {
    // إنشاء العميل مرة واحدة فقط وتخزينه في window.supabaseClient
    window.supabaseClient = window.supabase.createClient(
        CONFIG.SUPABASE_URL,
        CONFIG.SUPABASE_ANON_KEY
    );
}
