import { api } from '../js/api.js';
import { html } from '../js/utils.js';
export async function render(root, { user }) {
  const p = await api('/profile'), s = user.role === 'student' ? await api('/student/profile') : {};
  const rows = [['Name', p.name], ['Email', p.email], ['Institution ID', p.instId], ['Role', p.role], ['College', p.campus], ['Branch', p.branch], ['Department', p.department?.name], ['Roll no.', p.rollNo], ['Semester', s.semester], ['Section', s.section]].filter(r => r[1]);
  root.innerHTML = String(html`<div class="card profile"><span class="avatar big">${p.name[0]}</span><dl>${rows.map(([k, v]) => html`<dt>${k}</dt><dd>${v}</dd>`)}</dl></div>`);
}
