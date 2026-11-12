import { api } from '../js/api.js';
import { html } from '../js/utils.js';
import { table, toast } from '../js/components.js';

export async function render(root) {
  const draw = async () => {
    const hods = (await api('/admin/active-hods')).filter(hod => hod.active);
    root.innerHTML = String(html`<div class="page-head"><div><h2>Accounts</h2><p>Manage active HOD accounts for your college.</p></div></div>
      ${table([
        { h: 'HOD name', v: hod => hod.name },
        { h: 'Department', v: hod => hod.department || '-' },
        { h: 'Action', v: hod => html`<button class="btn sm danger" type="button" data-delete-hod="${hod.id}">Delete</button>` }
      ], hods, 'No active HOD accounts found for this college.')}`);
    root.querySelectorAll('[data-delete-hod]').forEach(button => {
      button.onclick = async () => {
        const hod = hods.find(item => item.id === button.dataset.deleteHod);
        if (!hod || !confirm(`Permanently delete ${hod.name}'s account? Department, attendance, uploaded data, and other existing records will be kept.`)) return;
        button.disabled = true;
        try {
          await api(`/admin/active-hods/${encodeURIComponent(hod.id)}`, { method: 'DELETE' });
          toast('HOD account deleted. Existing data was kept.');
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
