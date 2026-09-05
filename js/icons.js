/**
 * icons.js - مكتبة أيقونات موحّدة (SVG) لكل صفحات البرنامج
 * تحل محل الإيموجي القديم لتوحيد شكل التصميم مطابقةً للتصميم المرجعي.
 * كل أيقونة عبارة عن سطر SVG بسيط (stroke) بحجم قابل للتحكم.
 */

const PATHS = {
    home: '<path d="M4 11.5 12 4l8 7.5"/><path d="M6 10v9a1 1 0 0 0 1 1h3v-6h4v6h3a1 1 0 0 0 1-1v-9"/>',
    users: '<circle cx="9" cy="8" r="3.25"/><path d="M3.5 20c.5-3.2 2.9-5 5.5-5s5 1.8 5.5 5"/><path d="M15.5 5.5c1.4.4 2.4 1.6 2.4 3.1 0 1.5-1 2.7-2.4 3.1"/><path d="M15 15c2.2.2 4.3 1.8 4.8 5"/>',
    calendar: '<rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M3.5 9.5h17"/><path d="M8 3v3.2"/><path d="M16 3v3.2"/>',
    bookOpen: '<path d="M12 6.2c-1.5-1.2-3.7-1.7-6.8-1.7v13.7c3.1 0 5.3.5 6.8 1.7 1.5-1.2 3.7-1.7 6.8-1.7V4.5c-3.1 0-5.3.5-6.8 1.7Z"/><path d="M12 6.2v13.7"/>',
    edit: '<path d="M4 20h4.2L18.8 9.4a2 2 0 0 0 0-2.8l-1.4-1.4a2 2 0 0 0-2.8 0L4 15.8V20Z"/><path d="M13.5 6.2 17.8 10.5"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 13.5a1.7 1.7 0 0 0 .34 1.87l.06.06a2.06 2.06 0 1 1-2.92 2.92l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.03 1.56v.17a2.06 2.06 0 1 1-4.12 0v-.09A1.7 1.7 0 0 0 8.76 18a1.7 1.7 0 0 0-1.87.34l-.06.06a2.06 2.06 0 1 1-2.92-2.92l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.56-1.03H2.58a2.06 2.06 0 1 1 0-4.12h.09A1.7 1.7 0 0 0 4.24 7.24 1.7 1.7 0 0 0 3.9 5.37l-.06-.06A2.06 2.06 0 1 1 6.76 2.4l.06.06a1.7 1.7 0 0 0 1.87.34h.08A1.7 1.7 0 0 0 9.8 1.24V1.06a2.06 2.06 0 1 1 4.12 0v.09a1.7 1.7 0 0 0 1.03 1.56h.08a1.7 1.7 0 0 0 1.87-.34l.06-.06a2.06 2.06 0 1 1 2.92 2.92l-.06.06a1.7 1.7 0 0 0-.34 1.87v.08a1.7 1.7 0 0 0 1.56 1.03h.17a2.06 2.06 0 1 1 0 4.12h-.09a1.7 1.7 0 0 0-1.56 1.03Z" fill="none"/>',
    logout: '<path d="M9.5 20H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h3.5"/><path d="M15.5 16.5 20 12l-4.5-4.5"/><path d="M20 12H9.5"/>',
    search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="M20 20l-4.8-4.8"/>',
    creditCard: '<rect x="3" y="6" width="18" height="13" rx="2.2"/><path d="M3 10.5h18"/><path d="M7 15h4"/>',
    plus: '<path d="M12 5v14"/><path d="M5 12h14"/>',
    graduationCap: '<path d="M2.5 9.5 12 5l9.5 4.5-9.5 4.5-9.5-4.5Z"/><path d="M6.5 11.6v4.4c0 1.4 2.4 2.5 5.5 2.5s5.5-1.1 5.5-2.5v-4.4"/><path d="M21.5 9.5v5.3"/>',
    sparkles: '<path d="M11 2.5 12.4 7l4.6 1.4-4.6 1.4L11 14.3 9.6 9.9 5 8.5l4.6-1.4L11 2.5Z"/><path d="M18.3 14.5 19 17l2.5.8L19 18.6l-.7 2.4-.8-2.4-2.5-.8 2.5-.8.8-2.5Z"/>',
    lightbulb: '<path d="M9 18h6"/><path d="M10 21h4"/><path d="M12 3a6 6 0 0 0-3.6 10.8c.6.5 1.1 1.3 1.2 2.2h4.8c.1-.9.6-1.7 1.2-2.2A6 6 0 0 0 12 3Z"/>',
    clipboard: '<rect x="5.5" y="4.5" width="13" height="16" rx="2"/><path d="M9 4.5V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v.5"/><path d="M9 11h6"/><path d="M9 15h6"/>',
    target: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.8"/><circle cx="12" cy="12" r="1.1" fill="currentColor"/>',
    messageCircle: '<path d="M4 12a8 8 0 1 1 3.3 6.5L4 20l1.3-3.6A7.9 7.9 0 0 1 4 12Z"/>',
    star: '<path d="M12 3.5 14.6 9l6 .8-4.4 4.1 1.1 6-5.3-2.9-5.3 2.9 1.1-6-4.4-4.1 6-.8 2.6-5.5Z"/>',
    clipboardList: '<rect x="5.5" y="4.5" width="13" height="16" rx="2"/><path d="M9 4.5V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v.5"/><path d="M9 11h.01"/><path d="M9 15h.01"/><path d="M12 11h3"/><path d="M12 15h3"/>',
    arrowNext: '<path d="M20 12H4"/><path d="M9 6l-5 6 5 6"/>',
    messageSquare: '<path d="M20 15.5a2 2 0 0 1-2 2H8l-4 3V6.5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v9Z"/>',
    checkCircle: '<circle cx="12" cy="12" r="8.5"/><path d="M8.2 12.3 10.6 14.7 15.8 9.3"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    link: '<path d="M9.5 14.5 14.5 9.5"/><path d="M11 6.5 13 4.5a3.5 3.5 0 0 1 5 5l-2 2"/><path d="M13 17.5l-2 2a3.5 3.5 0 0 1-5-5l2-2"/>',
    play: '<path d="M7 4.5v15l13-7.5-13-7.5Z"/>',
    lock: '<rect x="4.5" y="10.5" width="15" height="10" rx="2"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/>',
    check: '<path d="M4.5 12.5 9 17l10.5-11"/>',
    x: '<path d="M5 5l14 14"/><path d="M19 5 5 19"/>',
    crown: '<path d="M4 17.5h16"/><path d="M4.5 17 3 8.5l4.8 3.3L12 6l4.2 5.8 4.8-3.3-1.5 8.5Z"/>',
    bell: '<path d="M6 16V11a6 6 0 0 1 12 0v5l1.6 2.3H4.4L6 16Z"/><path d="M10.2 20.5a1.9 1.9 0 0 0 3.6 0"/>',
    trash: '<path d="M5 7h14"/><path d="M9.5 7V5a1.5 1.5 0 0 1 1.5-1.5h2A1.5 1.5 0 0 1 14.5 5v2"/><path d="M7 7l1 12.5A1.5 1.5 0 0 0 9.5 21h5a1.5 1.5 0 0 0 1.5-1.5L17 7"/>',
    phone: '<path d="M6.6 4.5h3l1.3 4.3-2 1.6a12 12 0 0 0 5.7 5.7l1.6-2 4.3 1.3v3a1.5 1.5 0 0 1-1.6 1.5A16 16 0 0 1 5.1 6.1 1.5 1.5 0 0 1 6.6 4.5Z"/>',
    mail: '<rect x="3" y="5.5" width="18" height="13" rx="2"/><path d="M4 7l8 6 8-6"/>',
    chevronDown: '<path d="M6 9l6 6 6-6"/>',
    userCheck: '<circle cx="9.5" cy="8" r="3.5"/><path d="M3.5 20c.5-3.4 3-5.4 6-5.4s5.5 2 6 5.4"/><path d="M16.5 11l2 2 3.5-3.5"/>',
    warning: '<path d="M12 4.5 21 19.5H3L12 4.5Z"/><path d="M12 10.5v4"/><path d="M12 17.2h.01"/>',
    info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5"/><path d="M12 7.6h.01"/>',
    eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="2.6"/>'
};

/**
 * تُرجع سلسلة SVG جاهزة للحقن في innerHTML
 * @param {keyof typeof PATHS} name
 * @param {{size?:number, className?:string, strokeWidth?:number}} opts
 */
export function icon(name, opts = {}) {
    const { size = 18, className = '', strokeWidth = 2 } = opts;
    const body = PATHS[name] || '';
    return `<svg class="i ${className}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
}

export default { icon };
