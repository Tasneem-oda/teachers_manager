-- ============================================================
-- BOOKS_LIBRARY_V2_MIGRATION.sql
-- ترقية ميزة "📚 مكتبتي" (النسخة 2): دعم الكتب المصوّرة/الممسوحة ضوئيًا (OCR)،
-- فهرسة على دفعات، عرض الكتاب الأصلي، وشات داخل الكتاب.
--
-- شغّلي الملف ده مرة واحدة في Supabase → SQL Editor (بعد ما تكوني نفّذتِ
-- BOOKS_LIBRARY_DB_MIGRATION.sql القديم). كله آمن للتكرار (idempotent):
-- لو نفّذتيه مرتين مفيش أي ضرر.
-- ============================================================

-- ------------------------------------------------------------
-- 1) أنواع ملفات جديدة: نص عادي (txt) + صورة (jpg/png/webp) - عشان الكتب
--    المصوّرة بالموبايل. (pdf / docx / pptx زي ما هما.)
--    اسم القيد التلقائي بيكون book_sources_file_type_check.
-- ------------------------------------------------------------
alter table teachers_manager.book_sources
  drop constraint if exists book_sources_file_type_check;

alter table teachers_manager.book_sources
  add constraint book_sources_file_type_check
  check (file_type = any (array['pdf', 'docx', 'pptx', 'txt', 'image']));

-- ------------------------------------------------------------
-- 2) أعمدة جديدة لمتابعة المعالجة (نسبة التقدّم + هل الكتاب ممسوح ضوئيًا)
--    progress       : من 0 إلى 100 - بيتحدّث أثناء الفهرسة
--    is_scanned     : true لو اتقرأت صفحات بالذكاء الاصطناعي (OCR)
--    ocr_page_count : عدد الصفحات/الصور اللي اتقرأت بالـ OCR
-- ------------------------------------------------------------
alter table teachers_manager.book_sources
  add column if not exists progress integer not null default 0;

alter table teachers_manager.book_sources
  add column if not exists is_scanned boolean not null default false;

alter table teachers_manager.book_sources
  add column if not exists ocr_page_count integer not null default 0;

-- الكتب اللي كانت "ready" قبل الترقية = تقدّمها 100
update teachers_manager.book_sources set progress = 100 where status = 'ready' and progress = 0;

-- ------------------------------------------------------------
-- 3) منع تكرار نفس المقطع لو الفرونت إند أعاد إرسال دفعة (بسبب ضعف النت مثلًا)
--    الأول بنمسح أي تكرار قديم (لو موجود) بعدين بنبني الفهرس الفريد.
-- ------------------------------------------------------------
delete from teachers_manager.book_chunks a
using teachers_manager.book_chunks b
where a.book_id = b.book_id
  and a.chunk_index = b.chunk_index
  and a.ctid < b.ctid;

create unique index if not exists uq_book_chunks_book_chunk
  on teachers_manager.book_chunks (book_id, chunk_index);

-- فهرس لجلب مقاطع صفحة معيّنة بسرعة (سؤال عن "الصفحة الحالية")
create index if not exists idx_book_chunks_book_page
  on teachers_manager.book_chunks (book_id, page_number);

-- ------------------------------------------------------------
-- 4) حد يومي لعدد الصفحات المقروءة بالـ OCR لكل معلم (بيحمي حصة Gemini)
--    منفصل عن حد أسئلة الشات (ai_usage_daily) عشان كتاب ممسوح من 200 صفحة
--    ما يستهلكش حصة الأسئلة كلها.
-- ------------------------------------------------------------
create table if not exists teachers_manager.book_ocr_usage_daily (
  id uuid not null default gen_random_uuid(),
  teacher_id uuid not null,
  usage_date date not null default current_date,
  pages_count integer not null default 0,
  constraint book_ocr_usage_daily_pkey primary key (id),
  constraint book_ocr_usage_daily_teacher_fkey foreign key (teacher_id) references teachers_manager.profiles (id) on delete cascade,
  constraint book_ocr_usage_daily_unique unique (teacher_id, usage_date)
);

-- ------------------------------------------------------------
-- ملاحظات:
-- * حجم الـ embedding لسه vector(768). موديل الـ embedding في كل الـ workflows بقى
--   gemini-embedding-001 بـ outputDimensionality: 768 (text-embedding-004 مش شغال عندك).
--   ده نفس الموديل والحجم اللي كانت شغالة بيهم الكتب المفهرسة قبل كده، فمفيش حاجة تتعاد فهرستها.
--   لو غيّرتي الموديل أو الحجم مستقبلًا لازم تغيّريه في ask-sources و book-index و prepare-lesson
--   وتغيّري vector(768) وتعيدي فهرسة كل الكتب.
-- * لو عايزة تغيّري الحد اليومي للـ OCR: عدّلي المتغير dailyOcrPages في node
--   "Validate & Config" داخل n8n/book-ocr.json (الافتراضي 600 صفحة/يوم).
-- ============================================================
