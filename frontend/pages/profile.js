import { api } from '../js/api.js';
import { html } from '../js/utils.js';
import { modal, toast } from '../js/components.js';
import { state } from '../js/auth.js';
export async function render(root, { user }) {
  const draw = async () => {
    const p = await api('/profile'), s = user.role === 'student' ? await api('/student/profile') : {};
    const rows = [['Name', p.name], ['Email', p.email], ['Institution ID', p.instId], ['Role', p.role], ['College', p.campus], ['Branch', p.branch], ['Department', p.department?.name], ['Roll no.', p.rollNo], ['Phone', p.phone], ['Semester', s.semester], ['Section', s.section]].filter(r => r[1]);
    root.innerHTML = String(html`<div class="card profile"><span class="avatar big">${p.name[0]}</span><dl>${rows.map(([k, v]) => html`<dt>${k}</dt><dd>${v}</dd>`)}</dl>${user.role === 'student' ? html`<button class="btn primary" id="edit-profile" type="button">Edit profile</button>` : ''}</div>`);
    root.querySelector('#edit-profile')?.addEventListener('click', () => editStudentProfile(p, async updated => {
      state.user = { ...state.user, name: updated.name, rollNo: updated.rollNo, phone: updated.phone };
      await draw();
    }));
  };
  await draw();
}

function editStudentProfile(profile, onSaved) {
  const editor = modal({ title: 'Edit profile', body: html`<form class="form">
    <label>Full name<input name="name" maxlength="100" required value="${profile.name}"></label>
    <label>Roll number<input name="rollNo" maxlength="30" required value="${profile.rollNo || ''}"></label>
    <label>Phone (optional)<input name="phone" type="tel" maxlength="20" value="${profile.phone || ''}"></label>
    <p>Email, college, branch, department, semester, and class cannot be changed here.</p>
    <div class="login-error" data-profile-error hidden></div>
    <button class="btn primary">Save changes</button>
  </form>` });
  editor.el.querySelector('form').onsubmit = async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const saveButton = form.querySelector('button');
    const error = form.querySelector('[data-profile-error]');
    const values = new FormData(form);
    saveButton.disabled = true;
    error.hidden = true;
    try {
      const updated = await api('/profile', { method: 'PATCH', body: {
        name: values.get('name'),
        rollNo: values.get('rollNo'),
        phone: values.get('phone')
      } });
      editor.close();
      toast('Profile updated');
      await onSaved(updated);
    } catch (saveError) {
      error.textContent = saveError.message;
      error.hidden = false;
      saveButton.disabled = false;
    }
  };
}
