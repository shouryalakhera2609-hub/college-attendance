import { api } from '../js/api.js';
import { html } from '../js/utils.js';
import { table, toast } from '../js/components.js';
import { go } from '../js/router.js';

export async function render(root) {
  const draw = async () => {
    const hods = await api('/admin/active-hods');
    root.innerHTML = String(html`<div class="page-head"><div><h2>Active HODs</h2><p>HODs and departments for your college.</p></div><button class="btn" id="back-dashboard" type="button">Back to dashboard</button></div>
      ${table([
        { h: 'HOD name', v: hod => hod.name },
        { h: 'Department', v: hod => hod.department || '-' },
        { h: 'Action', v: hod => html`<button class="btn sm danger" type="button" data-delete-hod="${hod.id}">Delete</button>` }
      ], hods, 'No active HODs found for this college.')}`);
    root.querySelector('#back-dashboard').onclick = () => go('/admin/dashboard');
    root.querySelectorAll('[data-delete-hod]').forEach(button => {
      button.onclick = async () => {
        const hod = hods.find(item => item.id === button.dataset.deleteHod);
        if (!hod || !confirm(`Permanently delete ${hod.name}'s HOD account? They will need to create an account again. Department, attendance, and uploaded data will be kept.`)) return;
        button.disabled = true;
        try {
          await api(`/admin/active-hods/${encodeURIComponent(hod.id)}`, { method: 'DELETE' });
          toast('HOD account deleted. Existing department, attendance, and uploaded data was kept.');
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
