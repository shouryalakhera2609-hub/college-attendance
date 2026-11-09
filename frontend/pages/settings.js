import { api } from '../js/api.js';
import { html } from '../js/utils.js';
import { toast } from '../js/components.js';
import { state } from '../js/auth.js';
import { go } from '../js/router.js';
export async function render(root, { user }) {
  const th = user.role === 'admin' ? (await api('/admin/settings/threshold')).value : null;
  root.innerHTML = String(html`${th !== null ? html`<form class="card form" id="t"><h3>Minimum attendance threshold</h3><label>Percent<input type="number" name="v" min="1" max="100" value="${th}" required></label><button class="btn primary">Save threshold</button></form>` : ''}
  <form class="card form" id="p"><h3>Change password</h3><label>Current password<input type="password" name="c" autocomplete="current-password" required></label><label>New password (exactly 6 characters)<input type="password" name="n" autocomplete="new-password" minlength="6" maxlength="6" required></label><button class="btn primary">Update password</button></form>`);
  root.querySelector('#t')?.addEventListener('submit', async e => { e.preventDefault(); try { await api('/admin/settings/threshold', { method: 'PUT', body: { value: Number(e.target.v.value) } }); toast('Threshold saved'); } catch (er) { toast(er.message, 'error'); } });
  root.querySelector('#p').onsubmit = async e => { e.preventDefault(); try { await api('/profile/password', { method: 'PATCH', body: { current: e.target.c.value, next: e.target.n.value } }); toast('Password changed. Sign in again.'); state.user = null; go('/login'); } catch (er) { toast(er.message, 'error'); } };
}
