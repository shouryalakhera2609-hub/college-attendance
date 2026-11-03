import { api } from '../js/api.js';
import { html, fmtDate } from '../js/utils.js';
import { stat, table, statusBadge } from '../js/components.js';
export async function render(root, { user }) {
  const d = await api('/faculty/dashboard');
  root.innerHTML = String(html`<div class="page-head"><h2>Welcome back, ${user.name}</h2><a class="btn primary" href="#/faculty/mark">Mark attendance</a></div>
  <div class="stats">${stat('Subjects', d.subjects)}${stat('Sections', d.sections)}${stat('Sessions recorded', d.sessions, 'good')}${stat('Pending corrections', d.pending, 'warn')}</div>
  <div class="card"><h3>Recent sessions</h3>${table([{ h: 'Date', v: r => fmtDate(r.date) }, { h: 'Subject', v: r => r.subject?.code }, { h: 'Section', v: r => r.section?.name }, { h: 'Period', v: r => r.period }, { h: 'Status', v: r => statusBadge(r.status) }], d.recent, 'No sessions yet. Mark your first class.')}</div>`);
}
