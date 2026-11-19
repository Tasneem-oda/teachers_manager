/**
 * lib-meta.js — v33: تصنيفات المكتبة (مناسبة لمدرسين القرآن واللغة العربية) + ألوان الفولدرات
 */

export const CATS = [
    { id: 'quran', label: 'القرآن الكريم', em: '📖', cv: 'linear-gradient(135deg,#1F6B4F,#3E9A73)' },
    { id: 'tajweed', label: 'التجويد', em: '🎙️', cv: 'linear-gradient(135deg,#0F5E7A,#2E8DB0)' },
    { id: 'noorania', label: 'تأسيس وقراءة', em: '🔤', cv: 'linear-gradient(135deg,#B5651D,#E08E3C)' },
    { id: 'arabic', label: 'اللغة العربية', em: '✍️', cv: 'linear-gradient(135deg,#7A3E9D,#A86CC9)' },
    { id: 'tafsir', label: 'تفسير ومعاني', em: '💡', cv: 'linear-gradient(135deg,#8C6A12,#C29A2E)' },
    { id: 'islamic', label: 'تربية إسلامية', em: '🕌', cv: 'linear-gradient(135deg,#2D5D8A,#5A8CC0)' },
    { id: 'kids', label: 'أطفال وقصص', em: '🧸', cv: 'linear-gradient(135deg,#C2456B,#E77A9B)' },
    { id: 'worksheets', label: 'أوراق عمل وامتحانات', em: '📝', cv: 'linear-gradient(135deg,#4F5B66,#7D8A96)' },
    { id: 'other', label: 'أخرى', em: '📚', cv: 'linear-gradient(135deg,#5B4A6B,#8C6FA3)' }
];
export const catOf = (id) => CATS.find((c) => c.id === id) || null;

/** تخمين التصنيف من اسم الكتاب (المدرس يقدر يغيّره) */
export function guessCategory(title) {
    const t = String(title || '');
    if (/تجويد|التحفة|تحفة الأطفال|الجزرية|أحكام التلاوة|مخارج/.test(t)) return 'tajweed';
    if (/نور البيان|النوراني|القاعدة|تأسيس|الحروف|هجاء|البغدادية/.test(t)) return 'noorania';
    if (/تفسير|معاني|غريب/.test(t)) return 'tafsir';
    if (/مصحف|قرآن|قران|سورة|سور|جزء|أجزاء|حفظ|تحفيظ|مراجعة/.test(t)) return 'quran';
    if (/نحو|صرف|إملاء|املاء|بلاغة|عربي|العربية|قواعد|الآجرومية|الاجرومية|ألفية|قراءة/.test(t)) return 'arabic';
    if (/فقه|سيرة|حديث|عقيدة|أذكار|اذكار|تربية|أخلاق|صلاة/.test(t)) return 'islamic';
    if (/قصص|قصة|أطفال|اطفال|حكايات|تلوين/.test(t)) return 'kids';
    if (/امتحان|اختبار|ورق عمل|أوراق عمل|ورقة عمل|تدريبات|تمارين|واجب/.test(t)) return 'worksheets';
    return null;
}

export const FOLDER_COLORS = [
    { id: 'violet', c: '#EFE9F5' }, { id: 'green', c: '#E1F2E8' }, { id: 'blue', c: '#E2EDF9' }, { id: 'orange', c: '#FCE9DA' },
    { id: 'pink', c: '#FBE3EB' }, { id: 'gold', c: '#FAF0D2' }, { id: 'teal', c: '#DDF2EF' }, { id: 'gray', c: '#ECEEF0' }
];
export const folderColor = (id) => (FOLDER_COLORS.find((f) => f.id === id) || FOLDER_COLORS[0]).c;
export const FOLDER_ICONS = ['📁', '📖', '📗', '📘', '📙', '📕', '🎙️', '🔤', '✍️', '🕌', '🧸', '📝', '⭐', '🌙'];

/** اقتراحات فولدرات جاهزة لأول مرة (مدرس قرآن / عربي) */
export const FOLDER_SUGGESTIONS = {
    quran: [['جزء عمّ', '📗', 'green'], ['المصاحف', '📖', 'teal'], ['التجويد', '🎙️', 'blue'], ['التأسيس (نور البيان)', '🔤', 'orange']],
    arabic: [['النحو', '✍️', 'violet'], ['الإملاء', '📝', 'orange'], ['القراءة والقصص', '🧸', 'pink'], ['أوراق عمل وامتحانات', '📙', 'gold']]
};
