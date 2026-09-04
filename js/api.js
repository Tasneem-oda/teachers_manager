/**
 * api.js - طبقة الاتصال بـ API (n8n webhooks)
 * جميع الاتصالات بالخادم تمر من هنا
 */

import { CONFIG } from './config.js';
import { APIUtils, Storage } from './utils.js';

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

    async checkScheduleConflict(studentId, dayOfWeek, startTime, duration) {
        return await apiCall(
            CONFIG.API_ENDPOINTS.SCHEDULES.CHECK_CONFLICT,
            'POST',
            { student_id: studentId, day_of_week: dayOfWeek, start_time: startTime, duration_minutes: duration }
        );
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
    }
};

// جعل الكائن متاحًا عالميًا
window.api = api;

export default api;
