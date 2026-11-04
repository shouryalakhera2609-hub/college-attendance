import { api } from '../js/api.js';
import { html, fmtDate } from '../js/utils.js';
import { modal, toast } from '../js/components.js';

const localDate = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

export async function render(root) {
  const params = new URLSearchParams(location.hash.split('?')[1] || '');
  const catalogId = params.get('subject');
  const selectedDate = params.get('date');
  const selectedLecture = Number(params.get('lectureNo'));
  const dashboard = await api('/faculty/dashboard');
  const subject = dashboard.savedSubjects?.find(item => item.catalogId === catalogId);
  if (!subject) {
    root.innerHTML = String(html`<div class="card"><strong>Subject not found</strong><p><a href="#/faculty/dashboard">Back to dashboard</a></p></div>`);
    return;
  }

  const historyId = params.get('history');
  if (historyId) {
    const [history, roster] = await Promise.all([
      api(`/faculty/subject-history/${encodeURIComponent(historyId)}?subject=${encodeURIComponent(catalogId)}`),
      api(`/faculty/subject-students?subject=${encodeURIComponent(catalogId)}`)
    ]);
    const canEdit = history.isOwner && Date.now() - new Date(history.createdAt).getTime() <= 6 * 60 * 60 * 1000;
    root.innerHTML = String(html`<div class="card"><p><a href="#/faculty/subject?subject=${encodeURIComponent(catalogId)}">← History</a></p>
      <h2>## ${history.code} · ${history.date} · Lecture ${history.lectureNo || '-'}</h2>
      <p class="muted">Recorded by: ${history.facultyName}${history.facultyPhone ? ` · Mobile: ${history.facultyPhone}` : ''}</p>
      <p class="muted">Present ${history.students.length}/${history.totalStudents ?? roster.length}</p>
      <div id="history-students">${history.students.length ? html`<div class="student-attendance-list">${history.students.map(student => html`<div class="student-attendance-row"><span>${student.name}${student.rollNo ? ` · ${student.rollNo}` : ''}</span><input type="checkbox" checked disabled aria-label="${student.name} was selected"></div>`)}</div>` : html`<div class="empty"><strong>No students were selected</strong></div>`}</div>
      ${canEdit ? html`<div class="history-actions"><button class="btn primary" id="edit-history" type="button">Edit</button></div>` : html`<p class="muted">${history.isOwner ? 'Editing is available for 6 hours after saving.' : 'Only the faculty member who recorded this history can edit it.'}</p>`}
    </div>`);
    if (canEdit) {
      root.querySelector('#edit-history').onclick = async event => {
        const editButton = event.currentTarget;
        editButton.disabled = true;
        try {
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

  if (selectedDate && /^\d{4}-\d{2}-\d{2}$/.test(selectedDate) && Number.isInteger(selectedLecture) && selectedLecture >= 1 && selectedLecture <= 12) {
    const students = await api(`/faculty/subject-students?subject=${encodeURIComponent(catalogId)}`);
    root.innerHTML = String(html`<div class="card"><h2>${subject.code} · ${selectedDate} · Lecture ${selectedLecture}</h2>
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
          body: { subject: catalogId, date: selectedDate, timezoneOffsetMinutes: new Date().getTimezoneOffset(), lectureNo: selectedLecture, students: selectedStudents }
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
  const roster = await api(`/faculty/subject-students?subject=${encodeURIComponent(catalogId)}`);
  const historiesWithCounts = await Promise.all(history.map(async item => {
    if (item.presentCount != null && item.totalCount != null) return item;
    const details = await api(`/faculty/subject-history/${encodeURIComponent(item._id)}?subject=${encodeURIComponent(catalogId)}`);
    return {
      ...item,
      presentCount: item.presentCount ?? details.students.length,
      totalCount: item.totalCount ?? details.totalStudents ?? roster.length
    };
  }));
  root.innerHTML = String(html`<div class="page-head"><div><h2>${subject.code}</h2><p class="muted">${subject.name || ''}</p></div><button class="btn primary" id="mark-attendance" type="button">Mark Attendance</button></div>
  <div class="card"><h3>History</h3><input class="attendance-history-search" id="subject-history-search" type="search" aria-label="Search subject history by date or subject code" placeholder="Search by date or subject code"><div id="subject-history-list"></div></div>`);
  const drawHistory = () => {
    const search = root.querySelector('#subject-history-search').value.trim().toLowerCase();
    const filteredHistory = historiesWithCounts.filter(item => {
      if (!search) return true;
      return String(item.code || '').toLowerCase().includes(search)
        || String(item.date || '').toLowerCase().includes(search)
        || fmtDate(item.date).toLowerCase().includes(search);
    });
    const historyList = root.querySelector('#subject-history-list');
    historyList.innerHTML = String(filteredHistory.length
      ? html`<div class="student-attendance-list">${filteredHistory.map(item => html`<div class="student-attendance-row"><span>${item.code} · ${item.date} · Lecture ${item.lectureNo || '-'} · Recorded by ${item.facultyName}</span><span class="attendance-count">${item.presentCount}/${item.totalCount}</span><span class="history-actions"><a class="btn sm" href="#/faculty/subject?subject=${encodeURIComponent(catalogId)}&history=${item._id}">Open</a>${item.isOwner ? html`<button class="btn sm danger" type="button" data-delete-history="${item._id}">Delete</button>` : ''}</span></div>`)}</div>`
      : html`<div class="empty"><strong>${search ? 'No history matches your search.' : 'No saved history yet.'}</strong></div>`);
    historyList.querySelectorAll('[data-delete-history]').forEach(button => {
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
  };
  root.querySelector('#subject-history-search').oninput = drawHistory;
  drawHistory();
  root.querySelector('#mark-attendance').onclick = () => {
    const now = new Date();
    const today = localDate(now);
    const picker = modal({
      title: 'Select attendance date',
      body: html`<div class="form">
        <label>Select date<span class="date-picker-field"><input id="attendance-date" type="date" value="${selectedDate || today}" required><button id="open-date-picker" type="button" aria-label="Open date picker"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 2v4m8-4v4M3 10h18M5 4h14a2 2 0 0 1 2 2v13a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z"/></svg></button></span></label>
        <label>Lecture no.<select id="attendance-lecture" required><option value="" ${selectedLecture >= 1 && selectedLecture <= 12 ? '' : 'selected'} disabled>Select lecture</option>${[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(lecture => html`<option value="${lecture}" ${selectedLecture === lecture ? 'selected' : ''}>${lecture}</option>`)}</select></label>
        <button class="btn primary" id="continue-attendance" type="button">Continue</button>
      </div>`
    });
    const dateInput = picker.el.querySelector('#attendance-date');
    dateInput.max = today;
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
      if (!dateInput.value) {
        dateInput.reportValidity();
        return;
      }
      if (dateInput.value > localDate(new Date())) {
        toast('Future dates are not allowed for attendance.', 'error');
        return;
      }
      const lectureNo = picker.el.querySelector('#attendance-lecture').value;
      if (!lectureNo) {
        picker.el.querySelector('#attendance-lecture').reportValidity();
        return;
      }
      params.set('date', dateInput.value);
      params.set('lectureNo', lectureNo);
      location.hash = `#/faculty/subject?${params.toString()}`;
      picker.close();
    };
  };
}
