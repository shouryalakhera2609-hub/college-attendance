import { api } from '../js/api.js';
import { html, fmtDate } from '../js/utils.js';
import { table, statusBadge, modal, toast } from '../js/components.js';
export async function render(root, { user }) {
  const ep = { student: '/student/correction-requests', faculty: '/faculty/correction-requests', hod: '/hod/correction-requests' }[user.role];
  const draw = async () => {
    const rows = await api(ep), hod = user.role === 'hod';
    root.innerHTML = String(html`<div class="card">${table([{ h: 'Date', v: r => fmtDate(r.date) }, { h: 'Subject', v: r => r.subject?.code }, ...(user.role === 'student' ? [] : [{ h: 'Student', v: r => r.student?.name }]), { h: 'Change', v: r => `${r.currentStatus} → ${r.requestedStatus}` }, { h: 'Reason', v: r => r.reason }, { h: 'Status', v: r => statusBadge(r.status) }, ...(hod ? [{ h: 'Action', v: r => r.status === 'pending' ? html`<button class="btn sm good" data-a="${r._id}">Approve</button> <button class="btn sm danger" data-x="${r._id}">Reject</button>` : (r.reviewReason || '-') }] : [])], rows, 'No correction requests')}</div>`);
    const act = (id, decision, reason) => api('/hod/correction-requests/' + id, { method: 'PATCH', body: { decision, reason } }).then(() => { toast('Request ' + decision); draw(); }).catch(e => toast(e.message, 'error'));
    root.querySelectorAll('[data-a]').forEach(b => b.onclick = () => act(b.dataset.a, 'approved'));
    root.querySelectorAll('[data-x]').forEach(b => b.onclick = () => { const m = modal({ title: 'Reject request', body: html`<form class="form"><label>Reason (required)<textarea name="r" rows="3" maxlength="500" required></textarea></label><button class="btn danger">Reject</button></form>` }); m.el.querySelector('form').onsubmit = e => { e.preventDefault(); m.close(); act(b.dataset.x, 'rejected', e.target.r.value); }; });
  };
  await draw();
}
