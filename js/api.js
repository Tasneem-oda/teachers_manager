/**
 * api.js - طبقة الاتصال بـ API (n8n webhooks)
 * جميع الاتصالات بالخادم تمر من هنا
 */

import { CONFIG } from './config.js?v=13';
import { APIUtils, Storage } from './utils.js?v=13';

/**
 * دالة أساسية لكل الطلبات
 * options.signal    : AbortSignal لإلغاء الطلب (زرار "إيقاف" في الشات مثلًا)
 * options.timeoutMs : مهلة قصوى للطلب (بدونها بيفضل منتظر لحد ما المتصفح يقطع)
 */
async function apiCall(endpoint, method = 'GET', body = null, options = {}) {
    // مؤقّت المهلة + إلغاء خارجي في AbortController واحد
    const controller = new AbortController();
    let timedOut = false;
    let timer = null;
    const onExternalAbort = () => controller.abort();
    if (options.signal) {
        if (options.signal.aborted) controller.abort();
        else options.signal.addEventListener('abort', onExternalAbort, { once: true });
    }
    if (options.timeoutMs) {
        timer = setTimeout(() => { timedOut = true; controller.abort(); }, options.timeoutMs);
    }

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
        const fetchOptions = {
            method,
            headers,
            signal: controller.signal
        };

        if (body && method !== 'GET') {
            fetchOptions.body = JSON.stringify(body);
        }

        // 4. الاتصال بالـ API
        const url = APIUtils.buildUrl(endpoint);
        let response;
        try {
            response = await fetch(url, fetchOptions);
        } catch (netError) {
            if (netError && netError.name === 'AbortError') {
                if (timedOut) {
                    throw { error: { code: 'TIMEOUT', message: 'استغرق الطلب وقتًا أطول من المتوقع. حاول مرة أخرى.' } };
                }
                throw { error: { code: 'ABORTED', message: 'تم إلغاء الطلب' }, aborted: true };
            }
            throw { error: { code: 'NETWORK', message: 'تعذّر الاتصال بالخادم. تأكد من اتصالك بالإنترنت وحاول مرة أخرى.' } };
        }

        // 5. معالجة الاستجابة
        const data = await APIUtils.handleResponse(response);

        return data;

    } catch (error) {
        if (error === 'AUTH_EXPIRED') {
            throw error;
        }

        if (error && (error.status === 401 || error.status === 403)) {
            await window.supabaseClient.auth.signOut();
            window.location.href = 'login.html';
        }

        throw error;
    } finally {
        if (timer) clearTimeout(timer);
        if (options.signal) options.signal.removeEventListener('abort', onExternalAbort);
    }
}

// الـ webhook مش متسجل في n8n (workflow جديد لسه متستوردش) ← n8n بيرجّع 404
function isMissingWebhook(error) {
    return !!error && error.status === 404;
}

async function legacyOverview(apiObj, studentId, offset, limit) {
    const page = Math.floor(offset / limit) + 1;
    const [student, lessonsData, schedulesData] = await Promise.all([
        apiObj.getStudent(studentId),
        apiObj.getLessons(studentId, page, limit).catch(() => ({ lessons: [] })),
        apiObj.getSchedules().catch(() => ({ schedules: [] }))
    ]);
    const all = (lessonsData && lessonsData.lessons) || [];
    const lessons = all.filter((l) => !l.status || l.status === 'completed');
    const total = (lessonsData && (lessonsData.total || (lessonsData.pagination && lessonsData.pagination.total))) || null;
    return {
        legacy: true,
        student,
        stats: {
            completed: total != null ? total : lessons.length,
            completed_exact: total != null,
            last_lesson: lessons[0] ? lessons[0].lesson_date : null
        },
        lessons,
        in_progress: null,
        schedules: ((schedulesData && schedulesData.schedules) || []).filter((s) => s.student_id === studentId),
        billing: { available: false },
        payments: [],
        server_now: new Date().toISOString()
    };
}

// ------------------------------------------------------------------ بث رد المساعد الذكي
// n8n في وضع Streaming بيبعت كائنات JSON ورا بعض (NDJSON):
//   {"type":"begin"} ← {"type":"item","content":"جزء من النص"} ... ← {"type":"end"}
// ردود عقد "Respond to Webhook" (خطأ / انتهاء) بتوصل كـ item محتواه JSON فيه success.
// الفاصل بيقسم أي نص لكائنات JSON كاملة حتى لو الكائن اتقسم على أكتر من دفعة شبكة.
export function createJsonStreamSplitter(onObject) {
    let buf = '';
    let depth = 0, inStr = false, esc = false, start = -1, pos = 0;
    return {
        push(text) {
            buf += text;
            for (; pos < buf.length; pos++) {
                const ch = buf[pos];
                if (inStr) {
                    if (esc) esc = false;
                    else if (ch === '\\') esc = true;
                    else if (ch === '"') inStr = false;
                    continue;
                }
                if (ch === '"') { if (depth > 0) inStr = true; continue; }
                if (ch === '{') { if (depth === 0) start = pos; depth++; }
                else if (ch === '}' && depth > 0) {
                    depth--;
                    if (depth === 0 && start >= 0) {
                        const raw = buf.slice(start, pos + 1);
                        try { onObject(JSON.parse(raw)); } catch (e) { /* كائن غير صالح: تجاهل */ }
                        buf = buf.slice(pos + 1); pos = -1; start = -1;
                    }
                }
            }
        }
    };
}

async function streamAiChatOnce(studentId, message, onText, signal) {
    const { data: { session }, error } = await window.supabaseClient.auth.getSession();
    if (error || !session) { window.location.href = 'login.html'; throw new Error('AUTH_EXPIRED'); }

    let response;
    try {
        response = await fetch(APIUtils.buildUrl(CONFIG.API_ENDPOINTS.AI.CHAT), {
            method: 'POST',
            headers: APIUtils.buildHeaders(session.access_token),
            body: JSON.stringify({ student_id: studentId, message }),
            signal
        });
    } catch (netError) {
        if (netError && netError.name === 'AbortError') throw { error: { code: 'ABORTED', message: 'تم إلغاء الطلب' }, aborted: true };
        throw { error: { code: 'NETWORK', message: 'تعذّر الاتصال بالخادم. تأكد من اتصالك بالإنترنت وحاول مرة أخرى.' } };
    }
    if (response.status === 401 || response.status === 403 || (!response.ok && response.status !== 200)) {
        return await APIUtils.handleResponse(response);   // بيرمي الخطأ المناسب (وبيسجّل خروج لو الجلسة انتهت)
    }

    let reply = '';
    let chunks = 0;
    let streamed = false;
    let textNode = null;    // العقدة اللي بتكتب الرد (لو الأساسية فشلت وكمّلت الاحتياطية نبدأ من جديد)
    let final = null;       // رد JSON (عقدة Respond أو workflow قديم)
    let streamError = null;
    const handleControl = (obj) => {
        if (!obj || typeof obj !== 'object') return false;
        if (obj.success === false) { streamError = { error: obj.error || { message: 'حدث خطأ أثناء التواصل مع المساعد الذكي.' } }; return true; }
        if (obj.success === true) { final = obj.data || {}; return true; }
        return false;
    };
    const splitter = createJsonStreamSplitter((obj) => {
        chunks++;
        if (obj.type === 'item' || obj.type === 'chunk') {
            const rawContent = obj.content != null ? obj.content : (obj.data != null ? obj.data : obj.output);
            const content = rawContent == null ? '' : (typeof rawContent === 'string' ? rawContent : JSON.stringify(rawContent));
            const fromResponder = obj.metadata && /Response$/.test(obj.metadata.nodeName || '');
            if (fromResponder || /^\s*\{/.test(content)) {
                try { if (handleControl(JSON.parse(content))) return; } catch (e) { /* نص عادي */ }
            }
            const node = (obj.metadata && obj.metadata.nodeName) || null;
            if (content && node && textNode && node !== textNode) reply = '';
            if (content) { if (node) textNode = node; streamed = true; reply += content; if (onText) onText(reply); }
        } else if (obj.type === 'error') {
            streamError = { error: { code: 'AI_ERROR', message: 'حدث خطأ غير متوقع أثناء التواصل مع المساعد الذكي، من فضلك حاول مرة أخرى.' } };
        } else if (!obj.type) {
            handleControl(obj);   // workflow قديم بيرد JSON واحد { success, data: { reply } }
        }
    });

    if (response.body && response.body.getReader) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        for (;;) {
            const { value, done } = await reader.read();
            if (done) break;
            splitter.push(decoder.decode(value, { stream: true }));
        }
        splitter.push(decoder.decode());
    } else {
        splitter.push(await response.text());
    }

    // لو البث مش شغال في n8n، الرد الكامل بيوصل في رسالة الانتهاء (Done Response)
    if (final && final.reply && (!reply || !streamed)) { reply = String(final.reply); if (onText) onText(reply); }
    if (!streamed) console.info('[AI chat] الرد وصل مرة واحدة (البث غير مفعّل في n8n). عدد الرسائل:', chunks);
    if (streamError && !reply) throw streamError;
    if (!reply) throw { error: { code: 'EMPTY', message: 'لم يصل رد من المساعد، حاول مرة أخرى.' } };
    return { reply, remaining_today: final ? final.remaining_today : undefined, partialError: streamError };
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

    /**
     * ملف الطالب كامل في طلب واحد: بيانات الطالب + إحصائيات + آخر الحصص + الحصة الجارية + المواعيد + الدفع
     * لو workflow "student-overview" لسه متستوردش، بنجمّع نفس الشكل من الطلبات القديمة (من غير الدفع)
     */
    async getStudentOverview(studentId, { offset = 0, limit = 20 } = {}) {
        try {
            return await apiCall(`${CONFIG.API_ENDPOINTS.STUDENTS.OVERVIEW}?student_id=${encodeURIComponent(studentId)}&offset=${offset}&limit=${limit}`, 'GET');
        } catch (error) {
            if (!isMissingWebhook(error)) throw error;
            return await legacyOverview(this, studentId, offset, limit);
        }
    },

    async updateStudentInfo(studentId, data) {
        try {
            return await apiCall(CONFIG.API_ENDPOINTS.STUDENTS.UPDATE_INFO, 'POST', { student_id: studentId, ...data });
        } catch (error) {
            if (!isMissingWebhook(error)) throw error;
            return await apiCall(CONFIG.API_ENDPOINTS.STUDENTS.UPDATE, 'POST', { id: studentId, ...data });
        }
    },

    /**
     * خطوات البداية: { students, schedules, lessons, first_student, student_without_schedule, student_with_schedule }
     * لو workflow "onboarding-status" لسه متستوردش بنحسبها من بيانات الرئيسية والمواعيد
     */
    async getOnboardingStatus(dashboardData = null) {
        try {
            return await apiCall(CONFIG.API_ENDPOINTS.STUDENTS.ONBOARDING, 'GET');
        } catch (error) {
            if (!isMissingWebhook(error)) throw error;
            const [students, schedules] = await Promise.all([
                this.getStudents(1, 100).then((d) => d.students || []).catch(() => []),
                dashboardData && dashboardData.schedules ? Promise.resolve(dashboardData.schedules) : this.getSchedules().then((d) => d.schedules || []).catch(() => [])
            ]);
            const withSched = new Set(schedules.map((s) => s.student_id));
            const pick = (s) => (s ? { id: s.id, name: s.name } : null);
            let lessonFlag = false;
            try { lessonFlag = localStorage.getItem('tm_ob_lesson_done') === '1'; } catch (e) { /* تجاهل */ }
            return {
                legacy: true,
                students: students.length,
                schedules: schedules.length,
                lessons: lessonFlag ? 1 : 0,
                first_student: pick(students[students.length - 1] || students[0]),
                student_without_schedule: pick(students.find((s) => !withSched.has(s.id))),
                student_with_schedule: pick(students.find((s) => withSched.has(s.id)))
            };
        }
    },

    /**
     * كل الطلاب اللي متابعة الدفع مفعّلة ليهم مع بيانات الرصيد (الرئيسية بتفلتر اللي محتاجين تذكير).
     * لو workflow "billing-due" لسه متستوردش بيرجّع null والكارت مش بيظهر.
     */
    async getBillingDue() {
        try {
            return await apiCall(CONFIG.API_ENDPOINTS.STUDENTS.BILLING_DUE, 'GET');
        } catch (error) {
            if (isMissingWebhook(error)) return null;
            throw error;
        }
    },

    // action: settings | disable | add_payment | adjust | delete_payment
    async studentBilling(studentId, action, data = {}) {
        return await apiCall(CONFIG.API_ENDPOINTS.STUDENTS.BILLING, 'POST', { student_id: studentId, action, ...data });
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
        const now = new Date();
        const pad = (n) => String(n).padStart(2, '0');
        return await apiCall(
            CONFIG.API_ENDPOINTS.LESSONS.START,
            'POST',
            {
                student_id: studentId,
                // تاريخ ووقت الجهاز (بدل توقيت السيرفر) عشان حصة بعد نص الليل تتسجل في يومها الصحيح
                local_date: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
                local_time: `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`
            }
        );
    },

    /**
     * حفظ الحصة: بيحدّث الحصة الجارية (lesson_id) ويخليها مكتملة، أو بيسجل حصة مكتملة جديدة
     * لو مفيش حصة جارية. action: 'discard' بيحذف حصة جارية بدأت بالغلط.
     * لو workflow الجديد لسه متستوردش في n8n بنرجع للطريقة القديمة (finalize-lesson).
     */
    async saveLesson(data) {
        try {
            return await apiCall(CONFIG.API_ENDPOINTS.LESSONS.SAVE, 'POST', data);
        } catch (error) {
            if (!isMissingWebhook(error) || data.action === 'discard') throw error;
            // الخادم القديم: الغياب بيتسجل كإلغاء حصة النهارده بس
            if (data.action === 'absence') return await apiCall(CONFIG.API_ENDPOINTS.LESSONS.CANCEL, 'POST', { student_id: data.student_id });
            const legacy = { ...data, performance_notes: data.performance };
            return await apiCall(CONFIG.API_ENDPOINTS.LESSONS.FINALIZE, 'POST', { id: data.lesson_id || data.student_id, ...legacy });
        }
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

    /**
     * نفس المساعد لكن بالبث المباشر: النص بيوصل كلمة بكلمة وبيتعرض فورًا (onText).
     * بيشتغل مع workflow البث (Webhook بوضع Streaming + AI Agent)، ولو الـ workflow
     * لسه القديم (رد JSON واحد) بيقرأه عادي. لو النظام "مشغول" بيعيد المحاولة تلقائيًا.
     * بيرجّع { reply, remaining_today }
     */
    async chatWithAIAssistantStream(studentId, message, { onText, onRetry, signal } = {}) {
        for (let attempt = 0; ; attempt++) {
            try {
                return await streamAiChatOnce(studentId, message, onText, signal);
            } catch (error) {
                const code = error && error.error && error.error.code;
                if (code === 'BUSY' && attempt < 3 && !(signal && signal.aborted)) {
                    if (onRetry) onRetry(attempt + 1);
                    await new Promise((r) => setTimeout(r, 1500 + attempt * 1500));
                    continue;
                }
                throw error;
            }
        }
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
    async createBookSource(title, fileName, fileType, extra = {}) {
        return await apiCall(
            CONFIG.API_ENDPOINTS.BOOKS.CREATE_SOURCE,
            'POST',
            { title, file_name: fileName, file_type: fileType, ...extra }
        );
    },

    // رفع ملف الكتاب مباشرة إلى Supabase Storage من المتصفح (بدون ما يمر
    // على n8n كبايتات خام) - أسرع وأبسط، وبيستخدم صلاحيات RLS الخاصة
    // بالمعلم نفسه (كل معلم بيشوف/يرفع في مجلده بس).
    async uploadBookFile(storagePath, file) {
        const { error: uploadError } = await window.supabaseClient.storage
            .from(CONFIG.BOOKS_SETTINGS.BUCKET)
            .upload(storagePath, file, { contentType: file.type || 'application/octet-stream', upsert: false });
        if (uploadError) throw uploadError;
        return storagePath;
    },

    // رابط موقّع (Signed URL) لملف الكتاب الأصلي - للعرض أو التحميل.
    // download: true أو اسم ملف → الرابط بيفرض تنزيل الملف بدل فتحه في المتصفح
    async getBookFileUrl(storagePath, { expiresIn = 3600, download = false } = {}) {
        const opts = download ? { download } : undefined;
        const { data, error } = await window.supabaseClient.storage
            .from(CONFIG.BOOKS_SETTINGS.BUCKET)
            .createSignedUrl(storagePath, expiresIn, opts);
        if (error) throw error;
        return data.signedUrl;
    },

    // تحميل بايتات الملف الأصلي للعرض/إعادة الفهرسة، مع تقدّم التحميل
    async fetchBookFile(storagePath, { onProgress, signal } = {}) {
        const url = await this.getBookFileUrl(storagePath, { expiresIn: 3600 });
        let res;
        try {
            res = await fetch(url, { signal });
        } catch (e) {
            if (e && e.name === 'AbortError') throw { error: { code: 'ABORTED', message: 'تم إلغاء التحميل' }, aborted: true };
            throw { error: { code: 'NETWORK', message: 'تعذّر تحميل الملف. تأكد من اتصالك بالإنترنت.' } };
        }
        if (!res.ok) {
            throw { error: { code: 'DOWNLOAD_FAILED', message: `تعذّر تحميل الملف من التخزين (${res.status}).` } };
        }
        const total = parseInt(res.headers.get('content-length') || '0', 10) || 0;
        const contentType = res.headers.get('content-type') || '';
        if (!res.body || !res.body.getReader) {
            const buffer = await res.arrayBuffer();
            if (onProgress) onProgress(buffer.byteLength, total || buffer.byteLength);
            return { buffer, contentType };
        }
        const reader = res.body.getReader();
        const parts = [];
        let loaded = 0;
        for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            parts.push(value);
            loaded += value.length;
            if (onProgress) onProgress(loaded, total);
        }
        const out = new Uint8Array(loaded);
        let offset = 0;
        for (const part of parts) { out.set(part, offset); offset += part.length; }
        return { buffer: out.buffer, contentType };
    },

    // حذف ملف الكتاب من التخزين (بيتنادى بعد نجاح deleteBook في السيرفر)
    async deleteBookFile(storagePath) {
        try {
            await window.supabaseClient.storage.from(CONFIG.BOOKS_SETTINGS.BUCKET).remove([storagePath]);
        } catch (e) {
            // تجاهل - صف الكتاب في قاعدة البيانات اتمسح بالفعل على أي حال
        }
    },

    // ---- خط معالجة الكتاب (المتصفح بيستخرج النص، والسيرفر بيعمل OCR + فهرسة) ----

    // 1) بداية المعالجة: بيعلّم الكتاب "processing" ويمسح أي مقاطع قديمة (لإعادة الفهرسة)
    async startBookProcessing(bookId, meta = {}) {
        return await apiCall(
            CONFIG.API_ENDPOINTS.BOOKS.PROCESS,
            'POST',
            { book_id: bookId, action: 'start', ...meta },
            { timeoutMs: CONFIG.LIMITS.API_TIMEOUT }
        );
    },

    // (قديم - للتوافق فقط) كان بيبدأ التحليل من السيرفر بعد رفع الملف
    async processBook(bookId /* , fileUrl */) {
        return await this.startBookProcessing(bookId);
    },

    // 2) قراءة صفحات ممسوحة/مصوّرة بالذكاء الاصطناعي: pages = [{ page, mime, data(base64) }]
    // بيرجع { pages: [{ page, text }], missing: [أرقام صفحات لم تُقرأ] }
    async ocrBookPages(bookId, pages, options = {}) {
        return await apiCall(
            CONFIG.API_ENDPOINTS.BOOKS.OCR,
            'POST',
            { book_id: bookId, pages },
            { signal: options.signal, timeoutMs: 150000 }
        );
    },

    // 3) فهرسة دفعة مقاطع: chunks = [{ chunk_index, chapter, page, content }]
    async indexBookChunks(bookId, chunks, progress = {}, options = {}) {
        return await apiCall(
            CONFIG.API_ENDPOINTS.BOOKS.INDEX,
            'POST',
            { book_id: bookId, chunks, ...progress },
            { signal: options.signal, timeoutMs: 90000 }
        );
    },

    // 4) إنهاء المعالجة: status = 'ready' أو 'failed'
    async finishBook(bookId, payload = {}) {
        return await apiCall(
            CONFIG.API_ENDPOINTS.BOOKS.FINISH,
            'POST',
            { book_id: bookId, ...payload },
            { timeoutMs: CONFIG.LIMITS.API_TIMEOUT }
        );
    },

    // النص المفهرس للكتاب (دفعات) - للعرض النصي البديل وتحديد مكان الاستشهادات
    async getBookContent(bookId, offset = 0, limit = 300, options = {}) {
        return await apiCall(
            CONFIG.API_ENDPOINTS.BOOKS.CONTENT,
            'POST',
            { book_id: bookId, offset, limit },
            { signal: options.signal, timeoutMs: CONFIG.LIMITS.API_TIMEOUT }
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

    // "✨ اسأل مصادرك": سؤال يتم الإجابة عنه بالاعتماد على مقاطع الكتب المرفوعة
    // فقط (مع الاستشهاد بالمصدر).
    //   options.bookId    : تقييد السؤال بكتاب واحد (شات جوه الكتاب نفسه)
    //   options.studentId : تقييد بمصادر طالب معيّن
    //   options.history   : آخر رسائل المحادثة [{ role: 'user'|'assistant', text }] عشان أسئلة المتابعة
    //   options.signal    : لإيقاف الطلب
    async askSources(question, options = {}) {
        // توافق مع الاستدعاء القديم askSources(question, studentId)
        const opts = (options && typeof options === 'object') ? options : { studentId: options || null };
        return await apiCall(
            CONFIG.API_ENDPOINTS.BOOKS.ASK,
            'POST',
            {
                question,
                student_id: opts.studentId || null,
                book_id: opts.bookId || null,
                history: Array.isArray(opts.history) ? opts.history : []
            },
            { signal: opts.signal, timeoutMs: CONFIG.LIMITS.AI_TIMEOUT }
        );
    }
};

// جعل الكائن متاحًا عالميًا
window.api = api;

export default api;
