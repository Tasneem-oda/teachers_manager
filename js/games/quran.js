/**
 * games/quran.js — v33: ألعاب من آيات القرآن (المدرس يختار السورة والآيات واللعبة بتتعمل لوحدها)
 * النص من api.alquran.cloud (رواية حفص - الرسم الإملائي المشكول) وبيتحفظ على الجهاز بعد أول مرة.
 */

const API = 'https://api.alquran.cloud/v1';
const LS_SURAHS = 'tm_q_surahs_v2';
const LS_PREFIX = 'tm_q_s_v1_';
const MAX_CACHED = 24;

import { shuffle, plain } from './engine.js?v=49';

const lsGet = (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } };

async function getJson(url) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 15000);
    try {
        const r = await fetch(url, { signal: ctl.signal });
        if (!r.ok) throw new Error(String(r.status));
        const j = await r.json();
        if (!j || j.code !== 200 || !j.data) throw new Error('bad');
        return j.data;
    } finally { clearTimeout(t); }
}

/** قايمة السور: [{n, name, ayahs}] */
export async function surahList() {
    const hit = lsGet(LS_SURAHS);
    if (hit && hit.length === 114) return hit;
    const data = await getJson(`${API}/surah`);
    const list = data.map((s) => ({ n: s.number, name: String(s.name || '').replace(/^سُورَةُ\s*/, '').replace(/[\u06D6-\u06ED]/g, '').replace(/\u0671/g, 'ا').trim(), ayahs: s.numberOfAyahs }));
    if (list.length === 114) lsSet(LS_SURAHS, list);
    return list;
}

// "بسم الله الرحمن الرحيم" في أول آية من كل سورة (ماعدا الفاتحة والتوبة) مش جزء من الآية في الترقيم
function stripBasmala(text, n) {
    if (n === 1 || n === 9) return text;
    const words = String(text).split(/\s+/);
    if (words.length > 4 && plain(words.slice(0, 4).join(' ')).replace(/\s+/g, ' ') === 'بسم الله الرحمن الرحيم') return words.slice(4).join(' ');
    return text;
}

/** آيات سورة: [{n, text}] (بتتحفظ على الجهاز) */
export async function surahAyahs(n) {
    const key = LS_PREFIX + n;
    const hit = lsGet(key);
    if (hit && Array.isArray(hit.a) && hit.a.length) { hit.t = Date.now(); lsSet(key, hit); return hit.a; }
    const data = await getJson(`${API}/surah/${n}/quran-simple`);
    const a = (data.ayahs || []).map((x) => ({ n: x.numberInSurah, text: stripBasmala(String(x.text || '').trim(), n) }));
    // تنضيف: أقدم السور المحفوظة لو عدّينا الحد
    try {
        const keys = Object.keys(localStorage).filter((k) => k.startsWith(LS_PREFIX));
        if (keys.length >= MAX_CACHED) keys.map((k) => [k, (lsGet(k) || {}).t || 0]).sort((x, y) => x[1] - y[1]).slice(0, keys.length - MAX_CACHED + 1).forEach(([k]) => localStorage.removeItem(k));
    } catch (e) { /* تجاهل */ }
    if (!lsSet(key, { a, t: Date.now() })) { /* الجهاز مليان: بنكمّل من غير حفظ */ }
    return a;
}

export const QURAN_GAMES = [
    { id: 'complete', name: 'أكمل الآية', desc: 'كلمات مخفية والطالب يكمّلها' },
    { id: 'recite', name: 'سمّع وأظهر', desc: 'الطالب يقول الكلمة وانت تظهرها' },
    { id: 'words', name: 'رتّب كلمات الآية', desc: 'كلمات الآية متلخبطة' },
    { id: 'ayahs', name: 'رتّب الآيات', desc: 'الآيات متلخبطة يرتّبها' },
    { id: 'next', name: 'الآية اللي بعدها', desc: 'يختار الآية الجاية صح' },
    { id: 'halves', name: 'وصّل أول الآية بآخرها', desc: 'نص الآية الأول بنصها التاني' },
    { id: 'cards', name: 'بطاقات التسميع', desc: 'أول الآية والطالب يكمّل' },
    { id: 'surahs', name: 'رتّب السور', desc: 'ترتيب أسماء السور في المصحف' }
];

const words = (t) => String(t).split(/\s+/).filter(Boolean);
const short = (t, n = 7) => { const w = words(t); return w.length > n ? `${w.slice(0, n).join(' ')} …` : t; };

/**
 * بيعمل لعبة جاهزة للعب/الحفظ
 * @param {string} kind من QURAN_GAMES
 * @param {{surah:{n,name}, from:number, to:number, level?:string, ayahs:Array, list?:Array}} o
 */
export function buildQuranGame(kind, o) {
    const { surah, from, to } = o;
    const sel = (o.ayahs || []).filter((a) => a.n >= from && a.n <= to);
    const label = `${surah ? `سورة ${surah.name}` : ''}${from && to ? ` (${from === to ? from : `${from}-${to}`})` : ''}`;
    const base = { subject: 'quran' };
    if (kind === 'surahs') {
        const list = (o.list || []).filter((s) => s.n >= from && s.n <= to);
        const rounds = [];
        for (let i = 0; i < list.length; i += 6) rounds.push({ prompt: 'رتّب السور زي ترتيبها في المصحف', items: list.slice(i, i + 6).map((s) => s.name) });
        return { ...base, title: `رتّب السور (${from}-${to})`, template: 'order', content: { rounds, quran: true } };
    }
    if (!sel.length) return null;
    if (kind === 'complete' || kind === 'recite') {
        const text = sel.map((a) => `${a.text} ﴿${a.n}﴾`).join(' ');
        return { ...base, title: `${kind === 'recite' ? 'سمّع' : 'أكمل'}: ${label}`, template: 'fill', content: { text, level: o.level || 'medium', mode: kind === 'recite' ? 'reveal' : 'choose', quran: true } };
    }
    if (kind === 'words') {
        const rounds = [];
        sel.forEach((a) => {
            const w = words(a.text);
            if (w.length < 2) return;
            // الآيات الطويلة بتتقسم أجزاء (كل جزء 9 كلمات بالكتير)
            const parts = Math.ceil(w.length / 9);
            const size = Math.ceil(w.length / parts);
            for (let i = 0; i < w.length; i += size) {
                const chunk = w.slice(i, i + size);
                if (chunk.length >= 2) rounds.push({ prompt: `رتّب كلمات الآية ${a.n}${parts > 1 ? ` (جزء ${Math.floor(i / size) + 1} من ${parts})` : ''}`, items: chunk });
            }
        });
        return { ...base, title: `رتّب الكلمات: ${label}`, template: 'order', content: { rounds, quran: true } };
    }
    if (kind === 'ayahs') {
        const rounds = [];
        for (let i = 0; i < sel.length; i += 5) {
            const chunk = sel.slice(i, i + 5);
            if (chunk.length >= 2) rounds.push({ prompt: `رتّب الآيات (${chunk[0].n}-${chunk[chunk.length - 1].n})`, items: chunk.map((a) => a.text), vertical: true });
        }
        if (!rounds.length) return null;
        return { ...base, title: `رتّب الآيات: ${label}`, template: 'order', content: { rounds, quran: true } };
    }
    if (kind === 'next') {
        const pool = o.ayahs || [];
        const questions = sel.filter((a) => pool.some((b) => b.n === a.n + 1)).map((a) => {
            const right = pool.find((b) => b.n === a.n + 1);
            const wrong = shuffle(pool.filter((b) => b.n !== a.n + 1 && b.n !== a.n)).slice(0, 3);
            return { q: short(a.text, 14), options: [short(right.text, 9), ...wrong.map((b) => short(b.text, 9))], answer: 0 };
        });
        if (!questions.length) return null;
        return { ...base, title: `الآية اللي بعدها: ${label}`, template: 'quiz', content: { questions, quran: true } };
    }
    if (kind === 'halves') {
        const pairs = sel.filter((a) => words(a.text).length >= 4).slice(0, 8).map((a) => {
            const w = words(a.text);
            const mid = Math.ceil(w.length / 2);
            return [w.slice(0, mid).join(' '), w.slice(mid).join(' ')];
        });
        if (pairs.length < 2) return null;
        return { ...base, title: `وصّل: ${label}`, template: 'match', content: { pairs, quran: true } };
    }
    if (kind === 'cards') {
        const cards = sel.map((a) => [`${short(a.text, 3)}`, `${a.text} ﴿${a.n}﴾`]);
        return { ...base, title: `تسميع: ${label}`, template: 'flash', content: { cards, quran: true } };
    }
    return null;
}
