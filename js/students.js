import { api } from './api.js';

document.addEventListener('DOMContentLoaded', () => {
    const modal = document.getElementById('add-student-modal');
    const form = document.getElementById('add-student-form');
    const submitBtn = document.getElementById('submit-student-btn');

    // فتح الـ Modal إذا كان الرابط يحتوي على ?action=add
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('action') === 'add') {
        modal.classList.remove('hidden');
    }

    // إغلاق الـ Modal
    document.querySelector('.close-modal').addEventListener('click', () => {
        modal.classList.add('hidden');
    });

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        // تعطيل الزر وعرض حالة التحميل (القاعدة 51)
        submitBtn.disabled = true;
        submitBtn.textContent = 'جاري الحفظ...';

        const studentData = {
            name: document.getElementById('student-name').value.trim(),
            phone: document.getElementById('student-phone').value.trim() || null,
            lesson_link: document.getElementById('student-link').value.trim() || null,
            current_surah: document.getElementById('student-surah').value.trim() || null,
            current_from_ayah: parseInt(document.getElementById('student-from-ayah').value) || null,
            current_to_ayah: parseInt(document.getElementById('student-to-ayah').value) || null
        };

        try {
            await api.createStudent(studentData);
            alert("تم إضافة الطالب بنجاح");
            modal.classList.add('hidden');
            form.reset();
            // هنا يجب استدعاء دالة تحديث قائمة الطلاب في الواجهة
        } catch (error) {
            alert(error.message);
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = 'حفظ الطالب';
        }
    });
});
