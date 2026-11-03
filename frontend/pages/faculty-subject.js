import { api } from '../js/api.js';
import { html } from '../js/utils.js';
import { modal, toast } from '../js/components.js';

export async function render(root) {
  const params = new URLSearchParams(location.hash.split('?')[1] || '');
  const catalogId = params.get('subject');
  const selectedDate = params.get('date');
  const dashboard = await api('/faculty/dashboard');
  const subject = dashboard.savedSubjects?.find(item => item.catalogId === catalogId);
  if (!subject) {
    root.innerHTML = String(html`<div class="card"><strong>Subject not found</strong><p><a href="#/faculty/dashboard">Back to dashboard</a></p></div>`);
    return;
  }

  const historyId = params.get('history');
  if (historyId) {
    const history = await api(`/faculty/subject-history/${encodeURIComponent(historyId)}?subject=${encodeURIComponent(catalogId)}`);
    const canEdit = Date.now() - new Date(history.createdAt).getTime() <= 6 * 60 * 60 * 1000;
    root.innerHTML = String(html`<div class="card"><p><a href="#/faculty/subject?subject=${encodeURIComponent(catalogId)}">← History</a></p>
      <h2>## ${history.code} · ${history.date}</h2>
      <div id="history-students">${history.students.length ? html`<div class="student-attendance-list">${history.students.map(student => html`<div class="student-attendance-row"><span>${student.name}${student.rollNo ? ` · ${student.rollNo}` : ''}</span><input type="checkbox" checked disabled aria-label="${student.name} was selected"></div>`)}</div>` : html`<div class="empty"><strong>No students were selected</strong></div>`}</div>
      ${canEdit ? html`<div class="history-actions"><button class="btn primary" id="edit-history" type="button">Edit</button></div>` : html`<p class="muted">Editing is available for 6 hours after saving.</p>`}
    </div>`);
    if (canEdit) {
      root.querySelector('#edit-history').onclick = async event => {
        const editButton = event.currentTarget;
        editButton.disabled = true;
        try {
          const roster = await api(`/faculty/subject-students?subject=${encodeURIComponent(catalogId)}`);
          const selected = new Set(history.students.map(student => student.id));
          const studentsRoot = root.querySelector('#history-students');
          studentsRoot.innerHTML = String(html`${roster.length ? html`<div class="student-attendance-list">${roster.map(student => html`<label class="student-attendance-row"><span>${student.name}${student.rollNo ? ` · ${student.rollNo}` : ''}</span><input type="checkbox" value="${student.id}" ${selected.has(student.id) ? 'checked' : ''} aria-label="Select ${student.name}"></label>`)}</div>` : html`<div class="empty"><strong>No students found for this subject</strong></div>`}`);
          editButton.textContent = 'Save changes';
          editButton.disabled = false;
          editButton.onclick = async saveEvent => {
            const saveButton = saveEvent.currentTarget;
            if (!confirm('Save changes to this attendance history?')) return;
            saveButton.disabled = true;
            try {
              const students = [...studentsRoot.querySelectorAll('input[type="checkbox"]:checked')].map(input => input.value);
              await api(`/faculty/subject-history/${encodeURIComponent(historyId)}`, {
                method: 'PUT',
                body: { subject: catalogId, students }
              });
              toast('History updated');
              await render(root);
            } catch (error) {
              toast(error.message, 'error');
              saveButton.disabled = false;
            }
          };
        } catch (error) {
          toast(error.message, 'error');
          editButton.disabled = false;
        }
      };
    }
    return;
  }

  if (selectedDate && /^\d{4}-\d{2}-\d{2}$/.test(selectedDate)) {
    const students = await api(`/faculty/subject-students?subject=${encodeURIComponent(catalogId)}`);
    root.innerHTML = String(html`<div class="card"><h2>${subject.code} · ${selectedDate}</h2>
      ${students.length ? html`<div class="student-attendance-list">${students.map(student => html`<label class="student-attendance-row"><span>${student.name}${student.rollNo ? ` · ${student.rollNo}` : ''}</span><input type="checkbox" value="${student.id}" aria-label="Select ${student.name}"></label>`)}</div>` : html`<div class="empty"><strong>No students found for this subject</strong><p>Students whose branch and semester show this subject will appear here.</p></div>`}
      <button class="btn primary" id="save-subject-history" type="button">Save</button>
    </div>`);
    root.querySelector('#save-subject-history').onclick = async event => {
      const button = event.currentTarget;
      button.disabled = true;
      try {
        const selectedStudents = [...root.querySelectorAll('.student-attendance-row input:checked')].map(input => input.value);
        await api('/faculty/subject-history', {
          method: 'POST',
          body: { subject: catalogId, date: selectedDate, students: selectedStudents }
        });
        toast('History saved');
        location.hash = `#/faculty/subject?subject=${encodeURIComponent(catalogId)}`;
      } catch (error) {
        toast(error.message, 'error');
        button.disabled = false;
      }
    };
    return;
  }

  const history = await api(`/faculty/subject-history?subject=${encodeURIComponent(catalogId)}`);
  root.innerHTML = String(html`<div class="page-head"><div><h2>${subject.code}</h2><p class="muted">${subject.name || ''}</p></div><button class="btn primary" id="mark-attendance" type="button">Mark Attendance</button></div>
  <div class="card"><h3>History</h3>
    ${history.length ? html`<div class="student-attendance-list">${history.map(item => html`<div class="student-attendance-row"><span>${item.code} · ${item.date}</span><span class="history-actions"><a class="btn sm" href="#/faculty/subject?subject=${encodeURIComponent(catalogId)}&history=${item._id}">Open</a><button class="btn sm danger" type="button" data-delete-history="${item._id}">Delete</button></span></div>`)}</div>` : html`<div class="empty"><strong>No saved history yet</strong></div>`}
  </div>`);
  root.querySelectorAll('[data-delete-history]').forEach(button => {
    button.onclick = async () => {
      if (!confirm('Delete this history permanently? This cannot be undone.')) return;
      button.disabled = true;
      try {
        await api(`/faculty/subject-history/${encodeURIComponent(button.dataset.deleteHistory)}?subject=${encodeURIComponent(catalogId)}`, { method: 'DELETE' });
        toast('History deleted');
        await render(root);
      } catch (error) {
        toast(error.message, 'error');
        button.disabled = false;
      }
    };
  });
  root.querySelector('#mark-attendance').onclick = () => {
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const picker = modal({
      title: 'Select attendance date',
      body: html`<div class="form">
        <label>Select date<span class="date-picker-field"><input id="attendance-date" type="date" value="${today}" required><button id="open-date-picker" type="button" aria-label="Open date picker"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 2v4m8-4v4M3 10h18M5 4h14a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z"/></svg></button></span></label>
        <button class="btn primary" id="continue-attendance" type="button">Continue</button>
      </div>`
    });
    const dateInput = picker.el.querySelector('#attendance-date');
    picker.el.querySelector('#open-date-picker').onclick = () => {
      try {
        if (typeof dateInput.showPicker === 'function') dateInput.showPicker();
        else {
          dateInput.focus();
          dateInput.click();
        }
      } catch (error) {
        if (error.name !== 'NotAllowedError') throw error;
        dateInput.focus();
      }
    };
    picker.el.querySelector('#continue-attendance').onclick = () => {
      if (!dateInput.value) return;
      params.set('date', dateInput.value);
      location.hash = `#/faculty/subject?${params.toString()}`;
      picker.close();
    };
  };
}
