import { html, raw } from './utils.js';
import { api } from './api.js';
const I = { dashboard: 'M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z', check: 'M20 6 9 17l-5-5', history: 'M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l3 2', book: 'M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5z', users: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8', user: 'M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8', gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6M19 12h2M3 12h2M12 3v2M12 19v2', out: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9', file: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M8 13h8M8 17h8', menu: 'M3 6h18M3 12h18M3 18h18', cap: 'M22 10 12 5 2 10l10 5zM6 12v5c3 2 9 2 12 0v-5', eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6', grid: 'M3 3h18v18H3zM3 9h18M9 21V9' };
export const icon = (n, s = 18) => raw(`<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${I[n] || I.file}"/></svg>`);
export const toast = (msg, type = 'ok') => { const t = document.createElement('div'); t.className = 'toast ' + type; t.textContent = msg; document.getElementById('toasts').append(t); setTimeout(() => t.remove(), 4000); };
export const loading = on => { document.getElementById('loader').hidden = !on; };
export const badge = (t, k = 'muted') => html`<span class="badge ${k}">${t}</span>`;
export const statusBadge = s => badge(s, { present: 'good', absent: 'bad', excused: 'warn', pending: 'warn', approved: 'good', rejected: 'bad', submitted: 'good', open: 'warn' }[s] || 'muted');
export const pctClass = (p, th = 75) => p == null ? 'muted' : p >= th + 10 ? 'good' : p >= th ? 'warn' : 'bad';
export const bar = (p, th) => html`<div class="bar"><i data-w="${p ?? 0}" class="${pctClass(p, th)}"></i></div>`;
export const stat = (label, value, kind = '') => html`<div class="stat ${kind}"><span>${label}</span><strong>${value}</strong></div>`;
export const ring = (p, label = 'Overall') => { const c = 2 * Math.PI * 42, v = p ?? 0; return html`<div class="ring"><svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="42" class="trk"/><circle cx="50" cy="50" r="42" class="val ${pctClass(p)}" stroke-dasharray="${c * v / 100} ${c}" transform="rotate(-90 50 50)"/></svg><div><strong>${p == null ? '-' : p + '%'}</strong><small>${label}</small></div></div>`; };
export const table = (cols, rows, empty = 'No records found') => rows.length ? html`<div class="tbl-wrap"><table><thead><tr>${cols.map(c => html`<th>${c.h}</th>`)}</tr></thead><tbody>${rows.map(r => html`<tr>${cols.map(c => html`<td data-label="${c.h}">${c.v(r)}</td>`)}</tr>`)}</tbody></table></div>` : html`<div class="empty"><strong>${empty}</strong></div>`;
export function modal({ title, body }) {
  const root = document.getElementById('modal-root');
  root.innerHTML = String(html`<div class="overlay"><div class="modal" role="dialog" aria-modal="true" aria-label="${title}"><div class="modal-h"><h3>${title}</h3><button class="btn ghost sm" data-x aria-label="Close">✕</button></div>${body}</div></div>`);
  const close = () => { root.innerHTML = ''; document.removeEventListener('keydown', esc); };
  const esc = e => e.key === 'Escape' && close();
  document.addEventListener('keydown', esc);
  root.querySelector('[data-x]').onclick = close; root.querySelector('.overlay').onclick = e => e.target.classList.contains('overlay') && close();
  return { el: root.querySelector('.modal'), close };
}
export const download = (blob, name) => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); };
const label = o => [o.code, o.name].filter(Boolean).join(' · ') || o._id;
// Generic admin CRUD page. All writes are re-validated and authorised by the backend.
export async function crudPage(root, c) {
  const lk = { ...(c.lookups || {}) }; await Promise.all(c.fields.filter(f => f.from && !lk[f.k]).map(async f => { lk[f.k] = (await api('/admin/' + f.from)).filter(f.pick || (() => true)); }));
  const val = (r, f) => r ? (r[f.k]?._id || r[f.k] || '') : '';
  const draw = async () => {
    const rows = (await api('/admin/' + c.path)).filter(c.filter || (() => true));
    root.innerHTML = String(html`<div class="page-head"><h2>${c.title}</h2><button class="btn primary" id="add">+ Add</button></div>${table([...c.columns, { h: 'Actions', v: r => html`<button class="btn sm" data-e="${r._id}">Edit</button> <button class="btn sm danger" data-d="${r._id}">${c.del || 'Delete'}</button>` }], rows, 'Nothing here yet. Use Add to create the first record.')}`);
    root.querySelector('#add').onclick = () => form();
    root.querySelectorAll('[data-e]').forEach(b => b.onclick = () => form(rows.find(r => r._id === b.dataset.e)));
    root.querySelectorAll('[data-d]').forEach(b => b.onclick = async () => { if (!confirm('Are you sure?')) return; try { await api(`/admin/${c.path}/${b.dataset.d}`, { method: 'DELETE' }); toast('Done'); draw(); } catch (e) { toast(e.message, 'error'); } });
  };
  const form = r => {
    const m = modal({ title: (r ? 'Edit ' : 'Add ') + c.title, body: html`<form class="form" novalidate>${c.fields.map(f => html`<label>${f.label}${f.from || f.opts ? html`<select name="${f.k}" required><option value="">Select</option>${(f.from ? lk[f.k].map(o => [o._id, label(o)]) : f.opts.map(o => [o, o])).map(([v, t]) => html`<option value="${v}" ${val(r, f) === v ? 'selected' : ''}>${t}</option>`)}</select>` : html`<input name="${f.k}" type="${f.type || 'text'}" value="${f.type === 'password' ? '' : val(r, f)}" ${(f.type === 'password' && !r) || f.req ? 'required' : ''} ${f.minLength ? html`minlength="${f.minLength}"` : ''} ${f.maxLength ? html`maxlength="${f.maxLength}"` : ''} autocomplete="off">`}</label>`)}<button class="btn primary">Save</button></form>` });
    m.el.querySelector('form').onsubmit = async e => {
      e.preventDefault(); const body = { ...(c.fixed || {}) };
      for (const f of c.fields) { const v = new FormData(e.target).get(f.k); if (v) body[f.k] = f.type === 'number' ? Number(v) : v; }
      try { await api(`/admin/${c.path}${r ? '/' + r._id : ''}`, { method: r ? 'PATCH' : 'POST', body }); m.close(); toast('Saved'); draw(); } catch (er) { toast(er.message, 'error'); }
    };
  };
  await draw();
}
