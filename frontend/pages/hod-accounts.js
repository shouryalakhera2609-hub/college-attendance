import { api } from '../js/api.js';
import { html } from '../js/utils.js';
import { table, toast } from '../js/components.js';

export async function render(root) {
  let faculty = [];

  const draw = async () => {
    root.innerHTML = '<div class="card"><h3>Accounts</h3><div class="empty"><strong>Loading faculty accounts...</strong></div></div>';
    try {
      faculty = await api('/hod/faculty');
      root.innerHTML = String(html`<section class="card">
        <div class="page-head"><div><h3>Faculty Accounts</h3><p>Faculty assigned to your department and college.</p></div></div>
        ${table([
          { h: 'Faculty name', v: member => member.name },
          { h: 'Department', v: member => member.department || '-' },
          { h: 'College', v: member => member.campus || '-' },
          { h: 'Mobile number', v: member => member.phone || '-' },
          { h: 'Status', v: member => member.active ? 'Active' : 'Inactive' },
          { h: 'Action', v: member => html`<button class="btn sm danger" data-delete-faculty="${member._id}" type="button">Delete account</button>` }
        ], faculty, 'No faculty found in your department and college.')}
      </section>`);

      root.querySelectorAll('[data-delete-faculty]').forEach(button => {
        button.onclick = async () => {
          const member = faculty.find(row => row._id === button.dataset.deleteFaculty);
          if (!member) return;
          if (!confirm(`Delete ${member.name}'s account permanently? They will have to create a new account.`)) return;
          button.disabled = true;
          try {
            await api(`/hod/faculty/${member._id}`, { method: 'DELETE' });
            toast('Faculty account deleted');
            await draw();
          } catch (error) {
            toast(error.message, 'error');
            button.disabled = false;
          }
        };
      });
    } catch (error) {
      root.innerHTML = String(html`<div class="card error"><strong>Could not load accounts</strong><p>${error.message}</p></div>`);
      toast(error.message, 'error');
    }
  };

  await draw();
}
