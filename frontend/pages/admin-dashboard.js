import { api } from '../js/api.js';
import { html } from '../js/utils.js';
import { stat } from '../js/components.js';
import { go } from '../js/router.js';
export async function render(root) {
  const d = await api('/admin/dashboard');
  root.innerHTML = String(html`<div class="admin-home">
    <section class="admin-welcome">
      <img src="/images/logo.png" alt="CampusAttend logo">
      <div><p>Administration Portal</p><h2>Welcome to CampusAttend</h2><small>Manage student information and campus records</small></div>
    </section>
    <section class="stats">${stat('Students', d.students)}<button class="stat stat-link" id="active-hods" type="button" aria-label="View active HODs"><span>Active HODs</span><strong>${d.faculty}</strong></button>${stat('Departments', d.departments)}${stat('Active users', d.active, 'good')}</section>
    <section class="admin-action-card">
      <div class="admin-action-icon">${stat('Classes', d.departments, 'good')}</div>
      <div><span>Manage Classes</span><h3>Upload classes</h3><p>Add department, semester, and section information from a CSV file.</p></div>
      <button class="btn primary" id="open-classes">Open Manage Classes</button>
    </section>
  </div>`);
  root.querySelector('#open-classes').onclick = () => go('/admin/classes');
  root.querySelector('#active-hods').onclick = () => go('/admin/hods');
}
