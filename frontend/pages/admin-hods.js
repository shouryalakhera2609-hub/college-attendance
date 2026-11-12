import { api } from '../js/api.js';
import { html } from '../js/utils.js';
import { modal, table, toast } from '../js/components.js';
import { go } from '../js/router.js';

export async function render(root) {
  const draw = async () => {
    const hods = await api('/admin/active-hods');
    root.innerHTML = String(html`<div class="page-head"><div><h2>HOD Accounts</h2><p>Manage HOD accounts and departments for your college.</p></div><button class="btn" id="back-dashboard" type="button">Back to dashboard</button></div>
      ${table([
        { h: 'HOD name', v: hod => html`<button class="btn ghost sm" type="button" data-hod-profile="${hod.id}" aria-haspopup="dialog" aria-label="View ${hod.name}'s profile">${hod.name}</button>` },
        { h: 'Department', v: hod => hod.department || '-' },
        { h: 'Status', v: hod => hod.active ? 'Active' : 'Inactive' },
        { h: 'Action', v: hod => html`<button class="btn sm ${hod.active ? 'danger' : ''}" type="button" data-hod-status="${hod.id}">${hod.active ? 'Deactivate' : 'Activate'}</button>` }
      ], hods, 'No HOD accounts found for this college.')}`);
    root.querySelector('#back-dashboard').onclick = () => go('/admin/dashboard');
    root.querySelectorAll('[data-hod-profile]').forEach(button => {
      button.onclick = () => {
        const hod = hods.find(item => item.id === button.dataset.hodProfile);
        if (!hod) return;
        const details = [
          ['Email', hod.email],
          ['Employee ID', hod.instId],
          ['Phone', hod.phone],
          ['College', hod.campus],
          ['Department', hod.department],
          ['Status', hod.active ? 'Active' : 'Inactive']
        ].filter(([, value]) => value);
        modal({
          title: 'HOD Profile',
          body: html`<div class="profile">
            <span class="avatar big">${hod.name?.[0] || '?'}</span>
            <dl>${[['Name', hod.name], ...details].map(([label, value]) => html`<dt>${label}</dt><dd>${value}</dd>`)}</dl>
          </div>`
        });
      };
    });
    root.querySelectorAll('[data-hod-status]').forEach(button => {
      button.onclick = async () => {
        const hod = hods.find(item => item.id === button.dataset.hodStatus);
        if (!hod) return;
        const active = !hod.active;
        const action = active ? 'activate' : 'deactivate';
        if (!confirm(`Are you sure you want to ${action} ${hod.name}'s HOD account?`)) return;
        button.disabled = true;
        try {
          await api(`/admin/active-hods/${encodeURIComponent(hod.id)}/status`, { method: 'PATCH', body: { active } });
          toast(`HOD account ${active ? 'activated' : 'deactivated'}`);
          await draw();
        } catch (error) {
          button.disabled = false;
          toast(error.message, 'error');
        }
      };
    });
  };
  await draw();
}
