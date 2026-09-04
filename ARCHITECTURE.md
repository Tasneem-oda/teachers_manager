# البنية المعمارية للتطبيق 🏗️

## نظرة عامة

Teachers Manager هو تطبيق ويب SaaS متعدد المستأجرين (Multi-tenant) بنية موزعة:

```
┌─────────────────────────────────────────────────────────────┐
│                     المستخدمون                              │
└──────────────────────────┬──────────────────────────────────┘
                           │
                    HTTP/HTTPS
                           │
       ┌───────────────────┴───────────────────┐
       │                                       │
       ▼                                       ▼
┌──────────────────┐               ┌──────────────────┐
│  Cloudflare      │               │   DNS / SSL      │
│  Pages           │               │   (Cloudflare)   │
│  (Frontend)      │               │                  │
└────────┬─────────┘               └──────────────────┘
         │
         │ JSON API Calls
         │
         ▼
    ┌────────────────────────────────┐
    │    n8n Webhooks                │
    │  (Business Logic Layer)        │
    │                                │
    │ • Webhooks معينة لكل عملية   │
    │ • معالجة وتحقق من البيانات   │
    │ • ضمان الأمان متعدد المستأجر │
    │ • تكامل الذكاء الاصطناعي    │
    └────────────┬───────────────────┘
                 │
                 │ Database Queries
                 │
         ┌───────┴────────┐
         │                │
         ▼                ▼
    ┌─────────────┐  ┌──────────────┐
    │ Supabase    │  │  PostgreSQL  │
    │ Auth        │  │  Database    │
    │             │  │              │
    │ • JWT       │  │ • Tables     │
    │ • Sessions  │  │ • RLS        │
    │ • Users     │  │ • Policies   │
    └─────────────┘  └──────────────┘
```

## 1. الطبقة الأمامية (Frontend)

### الملفات الثابتة
- **index.html**: صفحة الهبوط
- **login.html**: تسجيل الدخول
- **signup.html**: تسجيل حساب جديد
- **dashboard.html**: لوحة التحكم الرئيسية
- و 7 صفحات أخرى متخصصة

### التكنولوجيا
- **Vanilla JavaScript**: بدون أطر عمل إضافية
- **HTML5**: معايير حديثة
- **CSS3**: Flexbox و Grid
- **RTL Support**: دعم كامل للعربية

### إدارة الحالة
```
localStorage
    ↓
┌─────────────────────────┐
│ session (JWT Token)     │
│ user (Profile Data)     │
│ preferences             │
└─────────────────────────┘
```

### تسلسل الطلب
```
User Action
    ↓
Validation (Client-side)
    ↓
API Call (with JWT)
    ↓
n8n Processing
    ↓
Database Query
    ↓
Response JSON
    ↓
Update UI
    ↓
Show Success/Error Toast
```

## 2. طبقة المصادقة (Authentication)

### معمارية Supabase Auth
```
┌──────────────────────────────────────┐
│     User Signup/Login                │
└────────────┬─────────────────────────┘
             │
             ▼
    ┌────────────────────┐
    │ Supabase Auth      │
    │ - Hash Password    │
    │ - Generate JWT     │
    │ - Create Session   │
    └────────┬───────────┘
             │
    ┌────────┴───────────┐
    │                    │
    ▼                    ▼
┌─────────┐        ┌──────────┐
│ JWT     │        │ Session  │
│ Token   │        │ ID       │
└─────────┘        └──────────┘
    │                    │
    │        Stored in LocalStorage
    │        Sent with every request
    │        Verified by n8n
```

### User Registration Flow
```
1. signup.html Form Submit
   ↓
2. Auth.signUp(email, password, userData)
   ↓
3. Supabase Creates User
   ↓
4. n8n Webhook (initialize-teacher)
   ├─ Create Profile
   ├─ Create Subscription (Trial)
   └─ Send Welcome Email
   ↓
5. Auto-login
   ↓
6. Redirect to Dashboard
```

## 3. طبقة API (n8n Webhooks)

### معمارية Webhook
```
n8n Webhook Structure:
┌────────────────────────────────┐
│ Trigger (HTTP POST/GET)        │
├────────────────────────────────┤
│ 1. Parse Request               │
│ 2. Extract & Validate Data     │
│ 3. Check Authorization         │
│ 4. Execute Business Logic      │
│ 5. Query Database              │
│ 6. Return JSON Response        │
└────────────────────────────────┘
```

### معايير الاستجابة
كل webhook يجب أن يعيد JSON بهذا الشكل:

**النجاح**:
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "name": "اسم",
    "created_at": "2024-01-15T10:30:00Z"
  }
}
```

**الخطأ**:
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "رسالة الخطأ",
    "field": "email",
    "details": {}
  }
}
```

### Webhooks الأساسية

#### 1. Teacher Initialization
```
POST /webhook/initialize-teacher
Body: { email, username, name, phone, teaching_type, subject }
Actions:
  - Create profile
  - Create trial subscription
  - Send welcome email
Response: { success: true, data: { profile } }
```

#### 2. Student Management
```
POST /webhook/create-student
Body: { teacher_id, name, phone, subject, lesson_link }
Actions:
  - Insert into students table
  - Create teaching profile
  - Notify webhook (optional)
Response: { success: true, data: { student_id } }
```

#### 3. Lesson Recording
```
POST /webhook/finalize-lesson
Body: { student_id, memorization, recitation, performance, notes }
Actions:
  - Insert lesson record
  - Update student progress
  - Generate AI summary (if enabled)
Response: { success: true, data: { lesson_id } }
```

#### 4. Dashboard Data
```
GET /webhook/get-dashboard?teacher_id=xxx
Auth: Bearer JWT
Actions:
  - Count students
  - Fetch next lesson
  - Fetch today's lessons
  - Get subscription status
Response: { success: true, data: { stats, lessons } }
```

## 4. طبقة قاعدة البيانات

### Supabase (PostgreSQL)

#### علاقات الجداول
```
auth.users (Supabase Auth)
    ↓
    └── profiles (username, name, role, phone, email)
        ├── students (name, phone, lesson_link, subject)
        │   ├── schedules (day_of_week, start_time, duration)
        │   ├── lessons (memorization, recitation, performance)
        │   ├── student_notes (note text)
        │   └── teaching_profiles (teaching_style, preferences)
        └── subscriptions (status, trial_ends_at, paid_until)
```

#### مثال على البيانات
```
Teacher "Ahmed"
├─ Student "Mohamed"
│  ├─ Schedule: Saturday 6:00 PM, 45 min
│  ├─ Schedule: Tuesday 7:00 PM, 45 min
│  ├─ Lessons:
│  │  ├─ 2024-01-15: Surah Al-Fatiha (Memorization: 100%, Performance: 90%)
│  │  ├─ 2024-01-12: Surah Al-Baqarah 1-10
│  │  └─ ...
│  ├─ Notes:
│  │  ├─ "Excellent recitation, needs work on tajweed"
│  │  └─ ...
│  └─ Teaching Profile:
│     ├─ Style: "Interactive with visual aids"
│     ├─ Preferences: "Prefers group activities"
│     └─ AI Context: "Fast learner, needs challenges"
```

### Row Level Security (RLS)

```
┌─────────────────────────────────────┐
│ Student Table Policies              │
├─────────────────────────────────────┤
│ SELECT: teacher_id = auth.uid()     │
│ INSERT: teacher_id = auth.uid()     │
│ UPDATE: teacher_id = auth.uid()     │
│ DELETE: teacher_id = auth.uid()     │
└─────────────────────────────────────┘

This ensures:
- Teachers can only see their own students
- Teachers cannot access other teachers' data
- Even if a student ID is known, only the teacher can access it
```

## 5. تدفقات البيانات الرئيسية

### تدفق تسجيل الحصة
```
User Opens lesson.html
        ↓
Fills Form (what taught, performance, homework, notes)
        ↓
Clicks "Finalize Lesson"
        ↓
Client-side Validation
        ↓
POST to n8n /finalize-lesson
        ├─ Verify JWT Token
        ├─ Check teacher_id matches
        ├─ Insert lesson record
        ├─ Update student.current_surah
        ├─ Update student.current_from_ayah
        ├─ Call AI if enabled (generate summary)
        ├─ Create audit log
        └─ Return lesson_id
        ↓
UI Updates → redirect to student.html
        ↓
Student profile page reloads lessons list
```

### تدفق إضافة طالب جديد
```
User in students.html clicks "+ Add Student"
        ↓
Modal Opens with form
        ↓
Fills: Name, Phone, Subject, Lesson Link
        ↓
Submit to n8n /create-student
        ├─ Verify JWT
        ├─ Validate data
        ├─ Insert into students table
        ├─ Create teaching_profile record
        ├─ Log activity
        └─ Return student_id
        ↓
Add to UI list immediately
        ↓
Show Success Toast
```

## 6. طبقة الأمان

### التحقق من الهوية (Authentication)
```
1. حفظ JWT في localStorage
2. إضافة JWT في كل طلب:
   Headers: {
     "Authorization": "Bearer eyJhbGc..."
   }
3. n8n يتحقق من التوقيع
4. Supabase يفك التشفير ويستخرج user_id
```

### التحقق من الصلاحيات (Authorization)
```
n8n Checks:
┌─────────────────────────────────┐
│ 1. Is JWT valid?                │
│ 2. Has token expired?           │
│ 3. Does teacher_id match        │
│    authenticated user?          │
│ 4. Does user have subscription? │
│ 5. Is user within limits?       │
└─────────────────────────────────┘
```

### عزل البيانات (Multi-tenancy)
```
Every Query Includes teacher_id:

SELECT * FROM students
WHERE teacher_id = $1   ← Always filtered
  AND student_id = $2   ← Even if known

Even if attacker knows other teacher's student ID,
they cannot access it because teacher_id check fails
```

## 7. معالجة الأخطاء

### Client-side
```
1. Validation Error
   ↓
2. Show Red Toast with Message
   ↓
3. User fixes input
   ↓
4. Retry
```

### Server-side
```
1. n8n catches error
   ↓
2. Logs to error tracking (optional)
   ↓
3. Returns error JSON
   ↓
4. Frontend shows Error Toast
   ↓
5. User can retry or contact support
```

### Error Codes
```json
{
  "code": "AUTH_REQUIRED",     // No JWT token
  "code": "AUTH_EXPIRED",      // Token expired
  "code": "FORBIDDEN",         // Not authorized
  "code": "NOT_FOUND",         // Resource doesn't exist
  "code": "VALIDATION_ERROR",  // Input validation failed
  "code": "LIMIT_EXCEEDED",    // Over quota
  "code": "SUBSCRIPTION_EXPIRED" // Trial/paid ended
}
```

## 8. الأداء والتحسينات

### Frontend Optimization
```
✓ Minimal JavaScript (No heavy frameworks)
✓ CSS is inlined for fast first paint
✓ Images optimized
✓ LocalStorage caching of profile data
✓ No unnecessary re-renders
```

### Backend Optimization
```
✓ Indexed database columns
✓ Efficient queries (SELECT specific fields)
✓ Caching at n8n level (if needed)
✓ Batch operations where possible
```

### Network Optimization
```
✓ GZIP compression (Cloudflare)
✓ CDN caching (Cloudflare Pages)
✓ Minimal payload sizes
✓ HTTP/2 (Cloudflare)
```

## 9. مراقبة والسجلات

### Client-side Logging
```
ErrorHandler.showError(message)  → User notification
console.error(error)              → Browser console
```

### Server-side Logging (n8n)
```
- Request timestamps
- User IDs
- Operations performed
- Errors and exceptions
- Query times
```

### Database Logging (Supabase)
```
- Query logs (in Supabase dashboard)
- Auth events
- RLS policy violations
- Performance metrics
```

## 10. النسخ الاحتياطية والاسترجاع

### Supabase Backups
```
Automatic daily backups
7-day retention
Point-in-time recovery available
```

### Data Integrity
```
- Append-only for lessons (never delete)
- Soft deletes for students (if needed)
- Audit trails via created_at timestamps
- Version control via git for code
```

## الملخص

```
┌─ Frontend (Vanilla JS)
│  └─ Clean, Simple, Fast
│
├─ n8n (Business Logic)
│  └─ Secure, Extensible, Auditable
│
└─ Supabase (Database + Auth)
   └─ Reliable, Scalable, Secure
```

كل طبقة لها مسؤولية واضحة:
- **Frontend**: العرض والتفاعل
- **n8n**: المنطق والأمان
- **Supabase**: البيانات والمصادقة

هذا الفصل يجعل النظام:
✅ سهل الصيانة
✅ آمن
✅ قابل للتوسع
✅ عالي الأداء
