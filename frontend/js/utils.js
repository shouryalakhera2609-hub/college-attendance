// All dynamic text is escaped by the html`` tag; only Safe values (from html``/raw) are inserted as markup.
export class Safe { constructor(s) { this.s = s; } toString() { return this.s; } }
export const raw = s => new Safe(s);
const MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' };
export const esc = v => String(v ?? '').replace(/[&<>"'`]/g, c => MAP[c]);
const one = v => v instanceof Safe ? v.s : Array.isArray(v) ? v.map(one).join('') : esc(v);
export const html = (s, ...v) => new Safe(s.reduce((a, x, i) => a + x + (i < v.length ? one(v[i]) : ''), ''));
export const fmtDate = d => d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '-';
export const qs = o => new URLSearchParams(Object.entries(o).filter(([, v]) => v !== '' && v != null)).toString();
export const pctText = p => p == null ? '-' : p + '%';
