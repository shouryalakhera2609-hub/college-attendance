import { api } from '../js/api.js';
import { html, fmtDate, qs } from '../js/utils.js';
import { table, statusBadge, modal, toast } from '../js/components.js';
export async function render(root) {
  const subs = (await api('/student/attendance')).subjects; let f = { page: 1 };
  const draw = async () => {
    const d = await api('/student/attendance/history?' + qs(f)); const box = root.querySelector('#res');
    box.innerHTML = String(html`<div class="card">${table([{ h: 'Date', v: r => fmtDate(r.date) }, { h: 'Subject', v: r => `${r.subject?.code} · ${r.subject?.name}` }, { h: 'Period', v: r => r.session?.period }, { h: 'Status', v: r => statusBadge(r.status) },
      { h: 'Action', v: r => r.status === 'excused' ? '-' : html`<button class="btn sm" data-r="${r._id}" data-s="${r.status}">Request correction</button>` }], d.rows)}
      <div class="pager"><button class="btn sm" id="pv" ${d.page <= 1 ? 'disabled' : ''}>Previous</button><span>Page ${d.page} of ${d.pages || 1} · ${d.total} records</span><button class="btn sm" id="nx" ${d.page >= d.pages ? 'disabled' : ''}>Next</button></div></div>`);
    box.querySelector('#pv').onclick = () => { f.page--; draw(); }; box.querySelector('#nx').onclick = () => { f.page++; draw(); };
    box.querySelectorAll('[data-r]').forEach(b => b.onclick = () => ask(b.dataset.r, b.dataset.s));
  };
  const ask = (id, cur) => {
    const want = cur === 'present' ? 'absent' : 'present';
    const m = modal({ title: 'Request correction', body: html`<form class="form"><p>Current status: <b>${cur}</b>. Requested: <b>${want}</b></p><label>Reason (min 10 characters)<textarea name="reason" rows="4" maxlength="500" required></textarea></label><button class="btn primary">Send request</button></form>` });
    m.el.querySelector('form').onsubmit = async e => { e.preventDefault(); try { await api('/student/correction-requests', { method: 'POST', body: { record: id, requestedStatus: want, reason: e.target.reason.value } }); m.close(); toast('Request sent'); } catch (er) { toast(er.message, 'error'); } };
  };
  root.innerHTML = String(html`<form class="card filters" id="ff"><label>Subject<select name="subject"><option value="">All subjects</option>${subs.map(s => html`<option value="${s.id}">${s.code}</option>`)}</select></label><label>Status<select name="status"><option value="">All</option><option>present</option><option>absent</option><option>excused</option></select></label><label>From<input type="date" name="from"></label><label>To<input type="date" name="to"></label><button class="btn primary">Search</button></form><div id="res"></div>`);
  root.querySelector('#ff').onsubmit = e => { e.preventDefault(); f = { page: 1, ...Object.fromEntries(new FormData(e.target)) }; draw(); };
  draw();
}
