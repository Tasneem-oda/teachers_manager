import { api } from './api.js';

document.addEventListener('DOMContentLoaded', async () => {
    const loader = document.getElementById('loader');
    const content = document.getElementById('dashboard-content');

    // إعداد التاريخ
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    document.getElementById('current-date').innerText = new Date().toLocaleDateString('ar-EG', options);

    try {
        const data = await api.getDashboard();
        
        // 1. البيانات الشخصية
        document.getElementById('greeting').innerText = `صباح الخير، ${data.teacher.name.split(' ')[0]} 🌷`;
        
        // 2. الإحصائيات
        document.getElementById('stat-students').innerText = data.studentsCount || 0;
        document.getElementById('stat-lessons').innerText = data.todayLessonsCount || 0;
        
        const subStatus = data.subscription?.status === 'trial' ? 'فترة تجريبية' : 
                          data.subscription?.status === 'active' ? 'نشط' : 'منتهي';
        document.getElementById('stat-subscription').innerText = subStatus;
        if(data.subscription?.status === 'expired') {
            document.getElementById('stat-subscription').style.color = 'var(--danger)';
        }

        // 3. حصص اليوم
        const lessonsContainer = document.getElementById('today-lessons-list');
        if (!data.todayLessons || data.todayLessons.length === 0) {
            lessonsContainer.innerHTML = '<div class="empty-state">مفيش حصص اليوم 🌷</div>';
        } else {
            lessonsContainer.innerHTML = data.todayLessons.map(lesson => `
                <div class="lesson-item">
                    <div class="lesson-info">
                        <h4>${lesson.student_name}</h4>
                        <p>${lesson.start_time.slice(0, 5)} - حفظ: ${lesson.current_surah || 'غير محدد'}</p>
                    </div>
                    <a href="lesson.html?student_id=${lesson.student_id}" class="btn">ابدأ الحصة</a>
                </div>
            `).join('');
        }

        // 4. التقويم (توضيح مبسط للأيام التي بها حصص)
        const calendarContainer = document.getElementById('weekly-calendar');
        if (!data.schedules || data.schedules.length === 0) {
            calendarContainer.innerHTML = '<div class="empty-state">لا يوجد جدول أسبوعي مسجل.</div>';
        } else {
            const days = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
            const grouped = data.schedules.reduce((acc, sch) => {
                acc[sch.day_of_week] = (acc[sch.day_of_week] || 0) + 1;
                return acc;
            }, {});
            
            calendarContainer.innerHTML = Object.keys(grouped).map(dayIndex => `
                <div style="display: flex; justify-content: space-between; margin-bottom: 0.8rem; border-bottom: 1px solid #f0f0f0; padding-bottom: 0.5rem;">
                    <strong>${days[dayIndex]}</strong>
                    <span style="color: var(--secondary-text)">${grouped[dayIndex]} حصص</span>
                </div>
            `).join('');
        }

        loader.style.display = 'none';
        content.style.display = 'block';

    } catch (error) {
        loader.innerText = error.message;
        loader.style.color = '#B85C5C';
    }
});
