/**
 * api.js - طبقة الاتصال بـ API (n8n webhooks)
 * جميع الاتصالات بالخادم تمر من هنا
 */

import { CONFIG } from './config.js?v=5';
import { APIUtils, Storage } from './utils.js?v=5';

/**
 * دالة أساسية لكل الطلبات
 */
async function apiCall(endpoint, method = 'GET', body = null) {
    try {
        // 1. الحصول على الجلسة والـ token
        const { data: { session }, error } = await window.supabaseClient.auth.getSession();

        if (error || !session) {
            window.location.href = 'login.html';
            throw new Error('AUTH_EXPIRED');
        }

        // 2. بناء الـ headers
        const headers = APIUtils.buildHeaders(session.access_token);

        // 3. بناء الـ options
        const options = { 
            method, 
            headers
        };
        
        if (body && method !== 'GET') {
            options.body = JSON.stringify(body);
        }

        // 4. الاتصال بالـ API
        const url = APIUtils.buildUrl(endpoint);
        const response = await fetch(url, options);

        // 5. معالجة الاستجابة
        const data = await APIUtils.handleResponse(response);
        
        return data;

    } catch (error) {
        if (error === 'AUTH_EXPIRED') {
            throw error;
        }

        if (error.status === 401 || error.status === 403) {
            await window.supabaseClient.auth.signOut();
            window.location.href = 'login.html';
        }

        throw error;
    }
}

/**
 * كائن API الرئيسي
 */
export const api = {
    // ==================== DASHBOARD ====================
    
    async getDashboard() {
        return await apiCall(CONFIG.API_ENDPOINTS.DASHBOARD.GET, 'GET');
    },

    // ==================== STUDENTS ====================
    
    async createStudent(studentData) {
        return await apiCall(CONFIG.API_ENDPOINTS.STUDENTS.CREATE, 'POST', studentData);
    },

    async getStudents(page = 1, limit = 20) {
        return await apiCall(
            `${CONFIG.API_ENDPOINTS.STUDENTS.GET_ALL}?page=${page}&limit=${limit}`,
            'GET'
        );
    },

    async getStudent(studentId) {
        return await apiCall(
            `${CONFIG.API_ENDPOINTS.STUDENTS.GET_ONE}?id=${studentId}`,
            'GET'
        );
    },

    async updateStudent(studentId, studentData) {
        return await apiCall(
            CONFIG.API_ENDPOINTS.STUDENTS.UPDATE,
            'POST',
            { id: studentId, ...studentData }
        );
    },

    async deleteStudent(studentId) {
        return await apiCall(
            CONFIG.API_ENDPOINTS.STUDENTS.DELETE,
            'POST',
            { id: studentId }
        );
    },

    // ==================== SCHEDULES ====================
    
    async createSchedule(scheduleData) {
        return await apiCall(CONFIG.API_ENDPOINTS.SCHEDULES.CREATE, 'POST', scheduleData);
    },

    async updateSchedule(scheduleId, scheduleData) {
        return await apiCall(
            CONFIG.API_ENDPOINTS.SCHEDULES.UPDATE,
            'POST',
            { id: scheduleId, ...scheduleData }
        );
    },

    async deleteSchedule(scheduleId) {
        return await apiCall(
            CONFIG.API_ENDPOINTS.SCHEDULES.DELETE,
            'POST',
            { id: scheduleId }
        );
    },

    async getSchedules() {
        return await apiCall(CONFIG.API_ENDPOINTS.SCHEDULES.GET_ALL, 'GET');
    },

    // ==================== LESSONS ====================
    
    async startLesson(studentId) {
        return await apiCall(
            CONFIG.API_ENDPOINTS.LESSONS.START,
            'POST',
            { student_id: studentId }
        );
    },

    async finalizeLesson(lessonId, lessonData) {
        return await apiCall(
            CONFIG.API_ENDPOINTS.LESSONS.FINALIZE,
            'POST',
            { id: lessonId, ...lessonData }
        );
    },

    async getLesson(lessonId) {
        return await apiCall(
            `${CONFIG.API_ENDPOINTS.LESSONS.GET}?id=${lessonId}`,
            'GET'
        );
    },

    async getLessonHistory(studentId, limit = 20) {
        return await apiCall(
            `${CONFIG.API_ENDPOINTS.LESSONS.GET_HISTORY}?student_id=${studentId}&limit=${limit}`,
            'GET'
        );
    },

    async getLessons(studentId, page = 1, limit = 20) {
        return await apiCall(
            `${CONFIG.API_ENDPOINTS.LESSONS.GET_HISTORY}?student_id=${studentId}&page=${page}&limit=${limit}`,
            'GET'
        );
    },

    // حصص اليوم بحالتها الفعلية (فات ميعادها بدون تنفيذ / قيد التنفيذ / تمت بنجاح / اتلغت يدويًا)
    // مستخدمة في الداشبورد لتمييز شكل كل حصة والأزرار المتاحة لها
    async getTodayLessons() {
        return await apiCall(CONFIG.API_ENDPOINTS.LESSONS.GET_TODAY, 'GET');
    },

    // إلغاء حصة اليوم يدويًا لطالب معيّن (زرار "إلغاء" في قسم حصص اليوم بالداشبورد)
    async cancelLesson(studentId) {
        return await apiCall(CONFIG.API_ENDPOINTS.LESSONS.CANCEL, 'POST', { student_id: studentId });
    },

    // ==================== NOTES ====================
    
    async createNote(studentId, noteText, lessonId = null) {
        return await apiCall(
            CONFIG.API_ENDPOINTS.NOTES.CREATE,
            'POST',
            { 
                student_id: studentId, 
                note: noteText,
                lesson_id: lessonId
            }
        );
    },

    async getNotes(studentId, limit = 20) {
        return await apiCall(
            `${CONFIG.API_ENDPOINTS.NOTES.GET}?student_id=${studentId}&limit=${limit}`,
            'GET'
        );
    },

    async getStudentNotes(studentId, page = 1, limit = 50) {
        return await apiCall(
            `${CONFIG.API_ENDPOINTS.NOTES.GET}?student_id=${studentId}&page=${page}&limit=${limit}`,
            'GET'
        );
    },

    // ==================== TEACHING PROFILE ====================
    
    async getTeachingProfile(studentId) {
        return await apiCall(
            `${CONFIG.API_ENDPOINTS.TEACHING_PROFILE.GET}?student_id=${studentId}`,
            'GET'
        );
    },

    async updateTeachingProfile(studentId, profileData) {
        return await apiCall(
            CONFIG.API_ENDPOINTS.TEACHING_PROFILE.UPDATE,
            'POST',
            { student_id: studentId, ...profileData }
        );
    },

    async createOrUpdateTeachingProfile(studentId, profileData) {
        return await apiCall(
            CONFIG.API_ENDPOINTS.TEACHING_PROFILE.UPDATE,
            'POST',
            { student_id: studentId, ...profileData }
        );
    },

    // ==================== SUBSCRIPTIONS ====================
    
    async checkSubscription() {
        return await apiCall(CONFIG.API_ENDPOINTS.SUBSCRIPTIONS.CHECK, 'GET');
    },

    // ==================== NOTIFICATIONS (مركز الإشعارات - زر الجرس) ====================

    // يرجع { unread: [...], read: [...] } لكل إشعارات المعلم الحالي
    async getNotifications() {
        return await apiCall(CONFIG.API_ENDPOINTS.NOTIFICATIONS.GET_ALL, 'GET');
    },

    // بدون id: تحدد كل الإشعارات غير المقروءة كمقروءة دفعة واحدة (زرار "تحديد الكل كمقروء")
    // مع id: تحدد إشعار واحد بعينه كمقروء (عند الضغط عليه في القائمة)
    async markNotificationsRead(id = null) {
        return await apiCall(
            CONFIG.API_ENDPOINTS.NOTIFICATIONS.MARK_READ,
            'POST',
            id ? { id } : {}
        );
    },

    // ==================== AI ====================
    
    async getAIAssistance(prompt, context = {}) {
        return await apiCall(
            CONFIG.API_ENDPOINTS.AI.ASSISTANT,
            'POST',
            { prompt, context }
        );
    },

    async generateLessonSummary(lessonId) {
        return await apiCall(
            CONFIG.API_ENDPOINTS.AI.LESSON_SUMMARY,
            'POST',
            { lesson_id: lessonId }
        );
    },

    // مساعد الذكاء الاصطناعي التفاعلي: رسالة واحدة من المعلم + رد المساعد،
    // مع ذاكرة محادثة خاصة بالطالب محفوظة في السيرفر (مش محتاجين نبعت
    // التاريخ كامل من هنا - الـ backend بيجيبه بنفسه من قاعدة البيانات)
    async chatWithAIAssistant(studentId, message) {
        return await apiCall(
            CONFIG.API_ENDPOINTS.AI.CHAT,
            'POST',
            { student_id: studentId, message }
        );
    },

    // "✨ حضّرلي الحصة": خطة حصة مبنية على بيانات الطالب + مصادر مكتبة
    // المعلم المرتبطة به (شوف صفحة الطالب)
    async prepareLesson(studentId) {
        return await apiCall(
            CONFIG.API_ENDPOINTS.AI.PREPARE_LESSON,
            'POST',
            { student_id: studentId }
        );
    },

    // ==================== 📚 مكتبتي (رفع كتب/مذكرات + RAG) ====================

    // الخطوة الأولى من رفع كتاب: إنشاء صف في قاعدة البيانات والحصول على
    // مسار تخزين فريد، قبل رفع بايتات الملف نفسها
    async createBookSource(title, fileName, fileType) {
        return await apiCall(
            CONFIG.API_ENDPOINTS.BOOKS.CREATE_SOURCE,
            'POST',
            { title, file_name: fileName, file_type: fileType }
        );
    },

    // رفع ملف الكتاب مباشرة إلى Supabase Storage من المتصفح (بدون ما يمر
    // على n8n كبايتات خام) - أسرع وأبسط، وبيستخدم صلاحيات RLS الخاصة
    // بالمعلم نفسه (كل معلم بيشوف/يرفع في مجلده بس). بترجع رابط موقّع
    // (Signed URL) صالح لمدة قصيرة عشان n8n يقدر يحمّل الملف منه بعدين.
    async uploadBookFile(storagePath, file) {
        const { error: uploadError } = await window.supabaseClient.storage
            .from('teacher-books')
            .upload(storagePath, file, { contentType: file.type, upsert: false });
        if (uploadError) throw uploadError;

        const { data, error: signError } = await window.supabaseClient.storage
            .from('teacher-books')
            .createSignedUrl(storagePath, 600); // صالح 10 دقايق - كفاية لبدء التحليل
        if (signError) throw signError;

        return data.signedUrl;
    },

    // حذف ملف الكتاب من التخزين (بيتنادى بعد نجاح deleteBook في السيرفر)
    async deleteBookFile(storagePath) {
        try {
            await window.supabaseClient.storage.from('teacher-books').remove([storagePath]);
        } catch (e) {
            // تجاهل - صف الكتاب في قاعدة البيانات اتمسح بالفعل على أي حال
        }
    },

    // الخطوة الثالثة والأخيرة: نطلب من n8n يبدأ فعليًا يحلل الملف ويفهرسه
    // (بيرد فورًا بحالة "processing"، والتحليل الفعلي بياخد وقت في الخلفية)
    async processBook(bookId, fileUrl) {
        return await apiCall(
            CONFIG.API_ENDPOINTS.BOOKS.PROCESS,
            'POST',
            { book_id: bookId, file_url: fileUrl }
        );
    },

    async listBooks() {
        return await apiCall(CONFIG.API_ENDPOINTS.BOOKS.LIST, 'GET');
    },

    async deleteBook(bookId) {
        return await apiCall(
            CONFIG.API_ENDPOINTS.BOOKS.DELETE,
            'POST',
            { book_id: bookId }
        );
    },

    // تحديد مين يستخدم الكتاب ده: 'all' (كل الطلاب) أو 'students' مع قائمة
    // معرّفات الطلاب المحددين
    async updateBookAccess(bookId, scope, studentIds = []) {
        return await apiCall(
            CONFIG.API_ENDPOINTS.BOOKS.UPDATE_ACCESS,
            'POST',
            { book_id: bookId, scope, student_ids: studentIds }
        );
    },

    // "✨ اسأل مصادرك": سؤال حر يتم الإجابة عنه بالاعتماد على مقاطع الكتب
    // المرفوعة فقط (مع الاستشهاد بالمصدر)، اختياريًا مقيّد بمصادر طالب معيّن
    async askSources(question, studentId = null) {
        return await apiCall(
            CONFIG.API_ENDPOINTS.BOOKS.ASK,
            'POST',
            { question, student_id: studentId }
        );
    }
};

// جعل الكائن متاحًا عالميًا
window.api = api;

export default api;
