import { api } from '../js/api.js';
import { html } from '../js/utils.js';
import { toast } from '../js/components.js';

export async function render(root, { user }) {
  root.innerHTML = String(html`<div class="card">
    <h2>Reset faculty data</h2>
    <div class="alert bad"><strong>This permanently deletes your faculty data from the database.</strong>
      <p>Saved subjects, subject attendance history, attendance sessions and records, correction requests, and class assignments will be deleted. For each subject saved by you, attendance history entered by every faculty member will also be deleted, resetting that subject's total days and average attendance to zero for everyone. Your faculty account, profile, and student/class master data will remain.</p>
    </div>
    <form class="form" id="reset-faculty-data">
      <label>Email address<input name="email" type="email" autocomplete="username" maxlength="254" required></label>
      <label>Password<input name="password" type="password" autocomplete="current-password" maxlength="128" required></label>
      <button class="btn danger" type="submit">Reset all faculty data</button>
    </form>
  </div>`);
  root.querySelector('#reset-faculty-data').onsubmit = async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector('button[type="submit"]');
    if (!confirm('Permanently delete all your faculty data and assignments? This also deletes every faculty member’s attendance history for subjects saved by you. This cannot be undone.')) return;
    button.disabled = true;
    try {
      await api('/faculty/reset-data', {
        method: 'DELETE',
        body: {
          email: form.elements.namedItem('email').value,
          password: form.elements.namedItem('password').value,
          confirmation: 'RESET'
        }
      });
      form.reset();
      toast('Faculty data and assignments reset');
      location.hash = '#/faculty/dashboard';
    } catch (error) {
      toast(error.message, 'error');
      button.disabled = false;
    }
  };
}
