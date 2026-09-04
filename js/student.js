import { api } from './api.js';

document.addEventListener('DOMContentLoaded', async () => {
    // 1. استخراج ID الطالب من الرابط (?id=...)
    const urlParams = new URLSearchParams(window.location.search);
    const studentId = urlParams.get('id');

    if (!studentId) {
        alert("معرف الطالب غير مفقود.");
        window.location.href = 'students.html';
        return;
    }

    const loader = document.getElementById('page-loader');
    const content = document.getElementById('student-content');

    // 2. جلب سياق الطالب بالكامل من n8n
    try {
        const data = await api.getStudentContext(studentId);
        
        // تعبئة البيانات في الواجهة
        document.getElementById('ui-student-name').textContent = data.student.name;
        
        if (data.student.lesson_link) {
            const linkEl = document.getElementById('ui-lesson-link');
            linkEl.href = data.student.lesson_link;
            linkEl.classList.remove('hidden');
        }

        document.getElementById('ui-current-surah').textContent = data.student.current_surah || 'غير محدد';
        document.getElementById('ui-from-ayah').textContent = data.student.current_from_ayah || '-';
        document.getElementById('ui-to-ayah').textContent = data.student.current_to_ayah || '-';

        if (data.teaching_profile) {
            document.getElementById('ui-teaching-style').textContent = data.teaching_profile.teaching_style || 'غير محدد';
            document.getElementById('ui-student-prefs').textContent = data.teaching_profile.student_preferences || 'غير محدد';
        }

        if (data.latest_note) {
            document.getElementById('ui-latest-note').textContent = data.latest_note.note;
            document.getElementById('ui-latest-note').classList.remove('text-secondary');
        }

        // سجل الحصص
        const historyList = document.getElementById('lesson-history-list');
        if (data.recent_lessons && data.recent_lessons.length > 0) {
            data.recent_lessons.forEach(lesson => {
                const li = document.createElement('li');
                li.className = 'lesson-item text-sm mb-2 border-bottom pb-2';
                const date = new Date(lesson.lesson_date).toLocaleDateString('ar-EG');
                li.innerHTML = `<strong>${date}:</strong> تسميع (${lesson.recitation || '-'})`;
                historyList.appendChild(li);
            });
        } else {
            document.getElementById('ui-no-lessons').classList.remove('hidden');
        }

        // إخفاء التحميل وإظهار المحتوى
        loader.classList.add('hidden');
        content.classList.remove('hidden');

    } catch (error) {
        loader.innerHTML = `<p class="text-danger">${error.message}</p>`;
    }

    // 3. منطق زر (ابدأ الحصة)
    document.getElementById('btn-start-lesson').addEventListener('click', () => {
        window.location.href = `lesson.html?student_id=${studentId}`;
    });

    // 4. منطق إضافة ملاحظة جديدة
    const addNoteForm = document.getElementById('add-note-form');
    const submitBtn = document.getElementById('btn-save-note');

    addNoteForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const noteText = document.getElementById('note-input').value.trim();
        if (!noteText) return;

        submitBtn.disabled = true;
        submitBtn.textContent = 'جاري الحفظ...';

        try {
            await api.createNote(studentId, noteText);
            
            // تحديث واجهة الملاحظة فوراً
            const noteContainer = document.getElementById('ui-latest-note');
            noteContainer.textContent = noteText;
            noteContainer.classList.remove('text-secondary');
            
            addNoteForm.reset();
        } catch (error) {
            alert(error.message);
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = 'حفظ الملاحظة';
        }
    });
});
