# أمثلة استخدام API 🔌

## مقدمة

جميع طلبات API تمر عبر n8n Webhooks. يجب إرسال JWT Token في headers لكل طلب.

## معلومات مهمة

### Authentication Header
كل طلب يجب أن يحتوي على:
```
Authorization: Bearer YOUR_JWT_TOKEN
Content-Type: application/json
```

### Base URL
```
https://your-n8n-instance.com/webhook
```

### Response Format
```json
{
  "success": true/false,
  "data": { /* actual data */ },
  "error": { 
    "code": "ERROR_CODE",
    "message": "رسالة الخطأ"
  }
}
```

---

## 1. المصادقة (Authentication)

### التسجيل الجديد
```bash
# Endpoint: /initialize-teacher
# Method: POST

curl -X POST https://your-n8n-instance.com/webhook/initialize-teacher \
  -H "Content-Type: application/json" \
  -d '{
    "email": "teacher@example.com",
    "username": "teacher_username",
    "name": "أحمد محمد",
    "phone": "0123456789",
    "teaching_type": "private",
    "subject": "Quran Studies"
  }'
```

**JavaScript Example**:
```javascript
async function registerTeacher(data) {
  const response = await fetch('https://your-n8n-instance.com/webhook/initialize-teacher', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(data)
  });
  
  const result = await response.json();
  return result;
}

// Usage
await registerTeacher({
  email: 'teacher@example.com',
  username: 'teacher_username',
  name: 'أحمد محمد',
  phone: '0123456789',
  teaching_type: 'private',
  subject: 'Quran Studies'
});
```

### بدء الجلسة (Bootstrap Session)
```bash
# Endpoint: /bootstrap-session
# Method: GET
# Headers: Authorization: Bearer JWT_TOKEN

curl -X GET https://your-n8n-instance.com/webhook/bootstrap-session \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json"
```

**Response**:
```json
{
  "success": true,
  "data": {
    "profile": {
      "id": "uuid",
      "username": "teacher_username",
      "name": "أحمد محمد",
      "email": "teacher@example.com",
      "phone": "0123456789",
      "role": "teacher"
    },
    "subscription": {
      "status": "trial",
      "trial_ends_at": "2024-01-22T10:30:00Z",
      "students_count": 5
    }
  }
}
```

---

## 2. إدارة الطلاب

### إضافة طالب جديد
```bash
# Endpoint: /create-student
# Method: POST

curl -X POST https://your-n8n-instance.com/webhook/create-student \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "محمد علي",
    "phone": "0123456789",
    "email": "student@example.com",
    "subject": "quran",
    "lesson_link": "https://zoom.us/j/123456789"
  }'
```

**JavaScript (من dashboard.js)**:
```javascript
const studentData = {
  name: "محمد علي",
  phone: "0123456789",
  subject: "quran",
  lesson_link: "https://zoom.us/j/123456789"
};

const result = await api.createStudent(studentData);
if (result.success) {
  console.log('Student ID:', result.data.id);
}
```

### الحصول على قائمة الطلاب
```bash
# Endpoint: /get-students?page=1&limit=20
# Method: GET

curl -X GET "https://your-n8n-instance.com/webhook/get-students?page=1&limit=20" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json"
```

**Response**:
```json
{
  "success": true,
  "data": {
    "students": [
      {
        "id": "student-uuid-1",
        "name": "محمد علي",
        "phone": "0123456789",
        "subject": "quran",
        "created_at": "2024-01-15T10:30:00Z"
      },
      {
        "id": "student-uuid-2",
        "name": "فاطمة أحمد",
        "phone": "0987654321",
        "subject": "english",
        "created_at": "2024-01-12T14:30:00Z"
      }
    ],
    "total": 2,
    "page": 1,
    "limit": 20
  }
}
```

### الحصول على طالب محدد
```bash
# Endpoint: /get-student?id=student-uuid
# Method: GET

curl -X GET "https://your-n8n-instance.com/webhook/get-student?id=student-uuid-1" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json"
```

**Response**:
```json
{
  "success": true,
  "data": {
    "id": "student-uuid-1",
    "name": "محمد علي",
    "phone": "0123456789",
    "email": "student@example.com",
    "subject": "quran",
    "lesson_link": "https://zoom.us/j/123456789",
    "current_surah": "Al-Fatiha",
    "current_from_ayah": 1,
    "current_to_ayah": 7,
    "created_at": "2024-01-15T10:30:00Z",
    "updated_at": "2024-01-18T15:45:00Z"
  }
}
```

### تحديث طالب
```bash
# Endpoint: /update-student
# Method: POST

curl -X POST https://your-n8n-instance.com/webhook/update-student \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "student-uuid-1",
    "name": "محمد علي الجديد",
    "phone": "0123456789",
    "subject": "quran"
  }'
```

### حذف طالب
```bash
# Endpoint: /delete-student
# Method: POST

curl -X POST https://your-n8n-instance.com/webhook/delete-student \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "student-uuid-1"
  }'
```

---

## 3. تسجيل الحصص

### إنهاء الحصة (Finalize Lesson)
```bash
# Endpoint: /finalize-lesson
# Method: POST

curl -X POST https://your-n8n-instance.com/webhook/finalize-lesson \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "student_id": "student-uuid-1",
    "memorization": "سورة الفاتحة - 100%",
    "recitation": "جيد جداً",
    "performance": "90/100",
    "revision": "تم مراجعة الأحكام",
    "notes": "الطالب متقدم جداً",
    "next_assignment": "سورة البقرة آيات 1-10"
  }'
```

**Response**:
```json
{
  "success": true,
  "data": {
    "lesson_id": "lesson-uuid",
    "student_id": "student-uuid-1",
    "created_at": "2024-01-18T15:45:00Z",
    "ai_summary": "الطالب أتقن الفاتحة تماماً، جاهز للمرحلة التالية"
  }
}
```

### الحصول على سجل الحصص
```bash
# Endpoint: /get-lesson-history?student_id=student-uuid&limit=20
# Method: GET

curl -X GET "https://your-n8n-instance.com/webhook/get-lesson-history?student_id=student-uuid-1&limit=20" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json"
```

**Response**:
```json
{
  "success": true,
  "data": {
    "lessons": [
      {
        "id": "lesson-uuid-1",
        "lesson_date": "2024-01-18T15:45:00Z",
        "memorization": "سورة الفاتحة - 100%",
        "recitation": "جيد جداً",
        "performance": "90/100",
        "revision": "تم مراجعة الأحكام",
        "notes": "الطالب متقدم جداً",
        "next_assignment": "سورة البقرة آيات 1-10"
      }
    ],
    "total": 15
  }
}
```

---

## 4. الملاحظات

### إضافة ملاحظة
```bash
# Endpoint: /create-note
# Method: POST

curl -X POST https://your-n8n-instance.com/webhook/create-note \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "student_id": "student-uuid-1",
    "note": "يحتاج إلى عمل أكثر على تجويد التلاوة",
    "lesson_id": null
  }'
```

### الحصول على ملاحظات الطالب
```bash
# Endpoint: /get-notes?student_id=student-uuid
# Method: GET

curl -X GET "https://your-n8n-instance.com/webhook/get-notes?student_id=student-uuid-1" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json"
```

**Response**:
```json
{
  "success": true,
  "data": {
    "notes": [
      {
        "id": "note-uuid-1",
        "note": "يحتاج إلى عمل أكثر على تجويد التلاوة",
        "created_at": "2024-01-18T15:45:00Z"
      }
    ]
  }
}
```

---

## 5. أنماط التدريس

### الحصول على نمط التدريس
```bash
# Endpoint: /get-teaching-profile?student_id=student-uuid
# Method: GET

curl -X GET "https://your-n8n-instance.com/webhook/get-teaching-profile?student_id=student-uuid-1" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json"
```

**Response**:
```json
{
  "success": true,
  "data": {
    "id": "profile-uuid",
    "teaching_style": "Interactive with visual aids",
    "student_preferences": "Prefers group activities",
    "ai_context": "Fast learner, needs advanced challenges"
  }
}
```

### تحديث نمط التدريس
```bash
# Endpoint: /update-teaching-profile
# Method: POST

curl -X POST https://your-n8n-instance.com/webhook/update-teaching-profile \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "student_id": "student-uuid-1",
    "teaching_style": "Interactive with visual aids",
    "student_preferences": "Prefers one-on-one sessions",
    "ai_context": "Fast learner, good at memorization"
  }'
```

---

## 6. الاشتراكات

### التحقق من الاشتراك
```bash
# Endpoint: /check-subscription
# Method: GET

curl -X GET https://your-n8n-instance.com/webhook/check-subscription \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json"
```

**Response**:
```json
{
  "success": true,
  "data": {
    "status": "trial",
    "trial_ends_at": "2024-01-22T10:30:00Z",
    "days_remaining": 4,
    "students_limit": 10,
    "students_count": 5,
    "can_add_more": true
  }
}
```

---

## 7. المساعد الذكي

### الحصول على مساعدة
```bash
# Endpoint: /teacher-assistant
# Method: POST

curl -X POST https://your-n8n-instance.com/webhook/teacher-assistant \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "الطالب يجد صعوبة في تلاوة سورة البقرة، ماذا أفعل؟",
    "context": {
      "student_level": "beginner",
      "current_surah": "Al-Baqarah",
      "performance": 60
    }
  }'
```

**Response**:
```json
{
  "success": true,
  "data": {
    "suggestion": "جرب تقسيم السورة إلى آيات أصغر، وركز على تصحيح التجويد أولاً قبل التركيز على السرعة.",
    "resources": [
      {
        "title": "شرح أحكام التجويد",
        "url": "https://example.com/tajweed"
      }
    ]
  }
}
```

---

## 8. لوحة التحكم

### الحصول على بيانات لوحة التحكم
```bash
# Endpoint: /get-dashboard
# Method: GET

curl -X GET https://your-n8n-instance.com/webhook/get-dashboard \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json"
```

**Response**:
```json
{
  "success": true,
  "data": {
    "stats": {
      "total_students": 5,
      "lessons_this_week": 8,
      "active_schedules": 7,
      "average_performance": 85
    },
    "next_lesson": {
      "student_name": "محمد علي",
      "time": "18:00",
      "duration": 45,
      "subject": "quran"
    },
    "today_lessons": [
      {
        "id": "lesson-uuid-1",
        "student_name": "محمد علي",
        "time": "18:00",
        "status": "scheduled"
      }
    ],
    "subscription": {
      "status": "trial",
      "days_remaining": 4
    }
  }
}
```

---

## معالجة الأخطاء

### مثال خطأ التحقق
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "البريد الإلكتروني غير صحيح",
    "field": "email"
  }
}
```

### مثال خطأ المصادقة
```json
{
  "success": false,
  "error": {
    "code": "AUTH_EXPIRED",
    "message": "انتهت صلاحية الجلسة"
  }
}
```

---

## كود عام (Boilerplate)

### JavaScript Fetch
```javascript
async function apiCall(endpoint, method = 'GET', body = null) {
  const token = localStorage.getItem('auth_token');
  
  if (!token) {
    window.location.href = 'login.html';
    return;
  }
  
  const headers = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  };
  
  const options = { method, headers };
  if (body) options.body = JSON.stringify(body);
  
  const response = await fetch(
    `https://your-n8n-instance.com/webhook${endpoint}`,
    options
  );
  
  if (response.status === 401) {
    localStorage.clear();
    window.location.href = 'login.html';
  }
  
  return await response.json();
}

// Usage
const students = await apiCall('/get-students?page=1&limit=20');
```

### Python Requests
```python
import requests
import json

def api_call(endpoint, method='GET', body=None, token=None):
    headers = {
        'Authorization': f'Bearer {token}',
        'Content-Type': 'application/json'
    }
    
    url = f'https://your-n8n-instance.com/webhook{endpoint}'
    
    if method == 'GET':
        response = requests.get(url, headers=headers)
    elif method == 'POST':
        response = requests.post(url, json=body, headers=headers)
    
    return response.json()

# Usage
result = api_call('/create-student', 'POST', {
    'name': 'محمد',
    'phone': '0123456789',
    'subject': 'quran'
}, token='your_jwt_token')
```

---

## خواص الطلب

| Property | Type | Required | Notes |
|----------|------|----------|-------|
| name | string | ✓ | 2-100 characters |
| phone | string | ✓ | Valid Egyptian phone |
| email | string | | Optional |
| subject | string | ✓ | quran, english, arabic, math |
| lesson_link | string | | URL to video call |

---

هل تحتاج إلى أي توضيح آخر حول API؟
