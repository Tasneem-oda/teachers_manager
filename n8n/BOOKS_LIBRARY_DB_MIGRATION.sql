-- ============================================================
-- migration مطلوبة لميزة "📚 مكتبتي" (رفع كتب/مذكرات، تحليلها بالذكاء
-- الاصطناعي، والسؤال عنها بمنطق RAG) - استخدمها n8n/create-book-source.json،
-- n8n/process-book.json، n8n/list-books.json، n8n/delete-book.json،
-- n8n/update-book-access.json، n8n/ask-sources.json، n8n/prepare-lesson.json
--
-- نفّذي كل الكود ده مرة واحدة في محرر SQL في Supabase (SQL Editor) بالترتيب.
-- ============================================================

-- ------------------------------------------------------------
-- 1) تفعيل pgvector (مدعوم بشكل رسمي من Supabase) - محتاجينه عشان نخزن
-- "embedding" (تمثيل رقمي لمعنى كل مقطع من الكتاب) ونقدر نبحث بالمعنى
-- مش بمطابقة الكلمات الحرفية فقط
-- ------------------------------------------------------------
create extension if not exists vector with schema extensions;

-- ------------------------------------------------------------
-- 2) جدول مصادر الكتب (كل كتاب/مذكرة رفعها المعلم)
-- ------------------------------------------------------------
create table if not exists teachers_manager.book_sources (
  id uuid not null default gen_random_uuid(),
  teacher_id uuid not null,
  title text not null,
  file_name text not null,
  file_type text not null check (file_type = any (array['pdf', 'docx', 'pptx'])),
  storage_path text not null,
  status text not null default 'uploading' check (status = any (array['uploading', 'processing', 'ready', 'failed'])),
  error_message text,
  page_count integer,
  chapter_count integer,
  chapters jsonb,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint book_sources_pkey primary key (id),
  constraint book_sources_teacher_id_fkey foreign key (teacher_id) references teachers_manager.profiles (id) on delete cascade
);

create index if not exists idx_book_sources_teacher on teachers_manager.book_sources (teacher_id);

-- ------------------------------------------------------------
-- 3) جدول مقاطع الكتب (chunks) - كل كتاب بيتقسّم لمقاطع صغيرة (فقرة أو
-- فكرة متماسكة) عشان نقدر نبحث ونسترجع الجزء المناسب بس وقت الحاجة،
-- بدل ما نرمي الكتاب كله على الذكاء الاصطناعي كل مرة
-- ------------------------------------------------------------
create table if not exists teachers_manager.book_chunks (
  id uuid not null default gen_random_uuid(),
  book_id uuid not null,
  teacher_id uuid not null,
  chunk_index integer not null,
  chapter_title text,
  page_number integer,
  content text not null,
  embedding extensions.vector(768),
  created_at timestamp with time zone not null default now(),
  constraint book_chunks_pkey primary key (id),
  constraint book_chunks_book_id_fkey foreign key (book_id) references teachers_manager.book_sources (id) on delete cascade,
  constraint book_chunks_teacher_id_fkey foreign key (teacher_id) references teachers_manager.profiles (id) on delete cascade
);

create index if not exists idx_book_chunks_book on teachers_manager.book_chunks (book_id);
-- ملحوظة: مفيش فهرس (index) خاص بالـ embedding نفسه دلوقتي (زي ivfflat) لأن
-- عدد المقاطع لسه صغير على الأغلب. البحث بالـ "<=>": بيشتغل صح من غير فهرس،
-- بس أبطأ تدريجيًا مع آلاف المقاطع. لو المكتبة كبرت جدًا مستقبلًا (كذا كتاب
-- ضخم)، ينفع تضيفي:
--   create index on teachers_manager.book_chunks using ivfflat (embedding vector_cosine_ops) with (lists = 100);
-- بعد ما يبقى عندك بيانات كفاية (الفهرس ده محتاج بيانات موجودة الأول عشان يتبني كويس).

-- ------------------------------------------------------------
-- 4) جدول ربط الكتب بالطلاب - "مين يستخدم الكتاب ده؟"
-- القاعدة: لو الكتاب مالوش أي صف هنا خالص = متاح لكل الطلاب (الوضع
-- الافتراضي بعد الرفع). لو ليه صفوف = متاح بس للطلاب المذكورين.
-- ------------------------------------------------------------
create table if not exists teachers_manager.book_student_links (
  id uuid not null default gen_random_uuid(),
  book_id uuid not null,
  student_id uuid not null,
  teacher_id uuid not null,
  created_at timestamp with time zone not null default now(),
  constraint book_student_links_pkey primary key (id),
  constraint book_student_links_book_id_fkey foreign key (book_id) references teachers_manager.book_sources (id) on delete cascade,
  constraint book_student_links_student_id_fkey foreign key (student_id) references teachers_manager.students (id) on delete cascade,
  constraint book_student_links_unique unique (book_id, student_id)
);

create index if not exists idx_book_student_links_book on teachers_manager.book_student_links (book_id);
create index if not exists idx_book_student_links_student on teachers_manager.book_student_links (student_id);

-- ------------------------------------------------------------
-- 5) Storage bucket خاص بملفات الكتب (خاص/private - مش عام)
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('teacher-books', 'teacher-books', false)
on conflict (id) do nothing;

-- التأكد إن الحماية (RLS) مفعّلة على جدول ملفات التخزين (غالبًا مفعّلة
-- بالفعل افتراضيًا في Supabase، بس بنتأكد احتياطًا)
alter table storage.objects enable row level security;

-- سياسة الحماية: كل معلم يقدر بس يرفع/يقرأ/يمسح الملفات اللي جوه مجلده
-- الخاص بيه (اسم المجلد = نفس الـ UUID بتاعه)، مش ملفات أي معلم تاني.
-- الفرونت إند بيرفع الملفات دايمًا بمسار "{teacher_id}/اسم-الملف"
drop policy if exists "teacher-books: teachers manage own folder" on storage.objects;
create policy "teacher-books: teachers manage own folder"
on storage.objects
for all
using (bucket_id = 'teacher-books' and (storage.foldername(name))[1] = auth.uid()::text)
with check (bucket_id = 'teacher-books' and (storage.foldername(name))[1] = auth.uid()::text);

-- ============================================================
-- ملاحظات تشغيلية مهمة (اقرأيها قبل التفعيل)
-- ============================================================
-- 1) لازم يكون عندك مفتاح Gemini API شغال ومربوط في n8n (نفس "Gemini API
--    Key" credential المستخدم في n8n/ai-chat-assistant.json) - نفس المفتاح
--    ده هيتستخدم لتحليل الكتب واستخراج الـ embeddings.
--
-- 2) تحليل الكتب بيستهلك حصة Gemini المجانية بشكل أكبر من الشات العادي،
--    خصوصًا الكتب الكبيرة (كل كتاب = طلب تحليل واحد + طلب embedding منفصل
--    لكل مقطع). كتاب من 300 صفحة تقريبًا ممكن ياخد كذا دقيقة في المعالجة.
--
-- 3) حد أقصى واقعي: تحليل الكتاب بيتم في طلب واحد للذكاء الاصطناعي، وناتج
--    الطلب (المقاطع المستخرجة) محدود بحد أقصى للـ tokens اللي الموديل
--    بيقدر يرجّعه (maxOutputTokens: 8192 في n8n/process-book.json). يعني
--    كتب كبيرة جدًا (مئات الصفحات) ممكن ياخد المعالجة جزء بس من الكتاب
--    مش كله. تحسين مستقبلي: تقسيم الكتاب لفصول قبل التحليل بدل ما يتبعت
--    مرة واحدة.
--
-- 4) دعم PDF مباشر وممتاز (Gemini بيقرأ ملفات PDF بنفسه). دعم Word
--    و PowerPoint بيتم عن طريق كود استخراج نصوص مبني يدويًا (بدون مكتبات
--    خارجية) في n8n/process-book.json - بيغطي أغلب الملفات العادية، لكن
--    ملفات معقدة جدًا أو تالفة ممكن تفشل (هيظهر status = 'failed' مع رسالة
--    خطأ واضحة في book_sources.error_message).
-- ============================================================
