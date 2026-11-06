import { api } from '../js/api.js';
import { html, fmtDate } from '../js/utils.js';
import { modal, table, toast } from '../js/components.js';
export async function render(root, { user }) {
  const d = await api('/faculty/dashboard');
  root.innerHTML = String(html`<div class="card"><div class="page-head"><h3>My Subjects</h3><div class="history-actions"><button class="btn" id="remove-subject" type="button">Remove subject</button><button class="btn primary" id="add-subject" type="button">Add your subject</button></div></div><p class="muted">Saved by: <strong>${d.savedBy?.name || 'Faculty'}</strong> · Mobile: <strong>${d.savedBy?.phone || 'Not provided'}</strong></p><div id="faculty-subjects"></div></div>
  <div class="card"><h3>Recent attendance</h3><input class="attendance-history-search" id="recent-attendance-search" type="search" aria-label="Search recent attendance by date or subject code" placeholder="Search by date or subject code"><div id="recent-attendance"></div></div>`);
  let removeMode = false;
  const drawSubjects = () => {
    const subjects = d.savedSubjects || [];
    const showCollege = ['BIRT', 'BIRTS'].includes(user.campus);
    root.querySelector('#faculty-subjects').innerHTML = String(subjects.length ? html`<div class="tbl-wrap"><table><thead><tr>${removeMode ? html`<th scope="col">Remove</th>` : ''}<th scope="col">Subject code</th><th scope="col">Subject name</th>${showCollege ? html`<th scope="col">College</th>` : ''}<th scope="col">Department</th><th scope="col">Total days</th><th scope="col">Average attendance</th>${showCollege ? html`<th scope="col">Birt student</th><th scope="col">Birts student</th>` : ''}</tr></thead><tbody>${subjects.map(subject => html`<tr>${removeMode ? html`<td data-label="Remove"><input type="checkbox" class="subject-to-remove" value="${subject.catalogId}" aria-label="Select ${subject.code} to remove"></td>` : ''}<td data-label="Subject code"><a href="#/faculty/subject?subject=${encodeURIComponent(subject.catalogId)}">${subject.code}</a></td><td data-label="Subject name">${subject.name || '-'}</td>${showCollege ? html`<td data-label="College">${subject.campus || user.campus || '-'}</td>` : ''}<td data-label="Department">${subject.department || '-'}</td><td data-label="Total days">${subject.totalDays || 0}</td><td data-label="Average attendance">${subject.averagePresent ? `${subject.averagePresent.percentage}%` : '-'}</td>${showCollege ? html`<td data-label="Birt student">${subject.averageByAttendanceSection?.Birt ? `${subject.averageByAttendanceSection.Birt.percentage}%` : '-'}</td><td data-label="Birts student">${subject.averageByAttendanceSection?.Birts ? `${subject.averageByAttendanceSection.Birts.percentage}%` : '-'}</td>` : ''}</tr>`)}</tbody></table></div>` : html`<div class="empty"><strong>No subjects added yet</strong><p>Choose subjects from your college subject list.</p></div>`);
    const previousRemoveSelected = root.querySelector('#remove-selected-subjects');
    if (previousRemoveSelected) previousRemoveSelected.remove();
    const removeButton = root.querySelector('#remove-subject');
    removeButton.textContent = removeMode ? 'Cancel' : 'Remove subject';
    removeButton.classList.toggle('danger', removeMode);
    removeButton.disabled = !removeMode && !subjects.length;
    root.querySelector('#add-subject').hidden = removeMode;
    root.querySelector('#remove-subject').onclick = () => {
      removeMode = !removeMode;
      drawSubjects();
    };
    if (removeMode) {
      const removeSelected = document.createElement('button');
      removeSelected.type = 'button';
      removeSelected.className = 'btn danger';
      removeSelected.textContent = 'Remove selected';
      removeSelected.disabled = true;
      removeSelected.id = 'remove-selected-subjects';
      removeButton.before(removeSelected);
      root.querySelectorAll('.subject-to-remove').forEach(checkbox => {
        checkbox.onchange = () => {
          removeSelected.disabled = !root.querySelector('.subject-to-remove:checked');
        };
      });
      removeSelected.onclick = async () => {
        const subjects = [...root.querySelectorAll('.subject-to-remove:checked')].map(checkbox => checkbox.value);
        if (!subjects.length) return;
        if (!confirm(`Remove ${subjects.length} selected subject${subjects.length === 1 ? '' : 's'} from your list? Attendance history will be kept.`)) return;
        removeSelected.disabled = true;
        try {
          await api('/faculty/my-subjects', { method: 'DELETE', body: { subjects } });
          toast('Selected subjects removed');
          await render(root, { user });
        } catch (error) {
          toast(error.message, 'error');
          removeSelected.disabled = false;
        }
      };
    }
  };
  drawSubjects();
  const recentColumns = [
    { h: 'Date', v: record => fmtDate(record.date) },
    { h: 'Subject', v: record => record.subject?.code },
    { h: 'Section', v: record => record.section?.name || '-' },
    { h: 'Lecture', v: record => record.lecture || '-' },
    { h: 'Present / Total', v: record => `${record.presentCount}/${record.totalCount}` }
  ];
  let recentExpiryTimer;
  const drawRecentAttendance = () => {
    const container = root.querySelector('#recent-attendance');
    if (!container) return;
    clearTimeout(recentExpiryTimer);
    const cutoff = Date.now() - 12 * 60 * 60 * 1000;
    const search = root.querySelector('#recent-attendance-search').value.trim().toLowerCase();
    const recent = d.recent.filter(record => {
      if (new Date(record.recordedAt).getTime() <= cutoff) return false;
      if (!search) return true;
      const date = new Date(record.date);
      const isoDate = Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
      return String(record.subject?.code || '').toLowerCase().includes(search)
        || isoDate.includes(search)
        || fmtDate(record.date).toLowerCase().includes(search);
    });
    container.innerHTML = String(table(
      recentColumns,
      recent,
      search ? 'No recent attendance matches your search.' : 'No attendance recorded in the last 12 hours.'
    ));
    const nextExpiry = Math.min(...d.recent
      .filter(record => new Date(record.recordedAt).getTime() > cutoff)
      .map(record => new Date(record.recordedAt).getTime() + 12 * 60 * 60 * 1000));
    if (Number.isFinite(nextExpiry)) recentExpiryTimer = setTimeout(drawRecentAttendance, Math.max(1, nextExpiry - Date.now() + 1));
  };
  root.querySelector('#recent-attendance-search').oninput = drawRecentAttendance;
  drawRecentAttendance();
  root.querySelector('#add-subject').onclick = async () => {
    try {
      const canChooseCampus = ['BIRT', 'BIRTS'].includes(user.campus);
      let selectedCampus = canChooseCampus ? '' : user.campus;
      let catalog = [];
      let catalogRequest = 0;
      const m = modal({ title: 'Add your subject', body: html`<div class="form">
        ${canChooseCampus ? html`<label>Select college<select id="subject-campus" required><option value="">Select a college</option><option value="BIRT">Birt</option><option value="BIRTS">Birts</option></select></label>` : ''}
        <label>Search by subject name or code<input id="subject-search" type="search" placeholder="Search subjects"></label>
        <div id="subject-options" class="muted">${canChooseCampus ? 'Select a college to view its subjects.' : 'Loading subjects…'}</div>
        <div id="subject-save-warning" class="alert bad" hidden></div>
        <button class="btn primary" id="save-subjects" type="button">Save subjects</button>
      </div>` });
      const optionsContainer = m.el.querySelector('#subject-options');
      const saveButton = m.el.querySelector('#save-subjects');
      const drawCatalog = () => {
        const selected = new Set((d.savedSubjects || [])
          .filter(subject => subject.campus === selectedCampus)
          .map(subject => subject.catalogId));
        optionsContainer.classList.remove('muted');
        optionsContainer.innerHTML = String(catalog.length ? html`${catalog.map(subject => {
          const isSelected = selected.has(subject.id);
          const isAssigned = subject.assignedTo?.length > 0;
          return html`<button class="subject-option ${isAssigned ? 'subject-option-conflict' : ''}" type="button" data-subject="${subject.id}" data-conflict="${isAssigned}" aria-pressed="${isSelected}" ${isAssigned && !isSelected ? 'disabled' : ''}><span class="subject-option-main"><span class="subject-check" aria-hidden="true">${isSelected ? '✓' : ''}</span><span>${subject.code}${subject.name ? ` · ${subject.name}` : ''}</span></span><small>${isAssigned ? `⚠ Already saved by ${subject.assignedTo.map(faculty => `${faculty.name} (Mobile: ${faculty.phone || 'not provided'})`).join(', ')}. They must remove it before you can add it.` : `${subject.department || ''}${subject.semester ? ` · Semester ${subject.semester}` : ''}`}</small></button>`;
        })}` : html`<div class="empty"><strong>No subjects found</strong><p>This college has no subjects in its subject list yet.</p></div>`);
        optionsContainer.querySelectorAll('.subject-option').forEach(option => {
          option.onclick = () => {
            const isSelected = option.getAttribute('aria-pressed') === 'true';
            option.setAttribute('aria-pressed', String(!isSelected));
            option.querySelector('.subject-check').textContent = isSelected ? '' : '✓';
            if (isSelected && option.dataset.conflict === 'true') option.disabled = true;
          };
        });
        saveButton.disabled = false;
      };
      const loadCatalog = async () => {
        const request = ++catalogRequest;
        catalog = [];
        saveButton.disabled = true;
        optionsContainer.classList.add('muted');
        optionsContainer.textContent = 'Loading subjects…';
        m.el.querySelector('#subject-save-warning').hidden = true;
        try {
          catalog = await api(`/faculty/subject-catalog?campus=${encodeURIComponent(selectedCampus)}`);
          if (request === catalogRequest) drawCatalog();
        } catch (error) {
          if (request !== catalogRequest) return;
          optionsContainer.textContent = 'Could not load subjects.';
          m.el.querySelector('#subject-save-warning').textContent = error.message;
          m.el.querySelector('#subject-save-warning').hidden = false;
          toast(error.message, 'error');
        }
      };
      const campusSelect = m.el.querySelector('#subject-campus');
      if (campusSelect) {
        campusSelect.onchange = () => {
          selectedCampus = campusSelect.value;
          catalog = [];
          catalogRequest += 1;
          if (!selectedCampus) {
            saveButton.disabled = true;
            optionsContainer.classList.add('muted');
            optionsContainer.textContent = 'Select a college to view its subjects.';
            return;
          }
          loadCatalog();
        };
        saveButton.disabled = true;
      } else {
        await loadCatalog();
      }
      m.el.querySelector('#subject-search').oninput = event => {
        const query = event.target.value.trim().toLowerCase();
        m.el.querySelectorAll('.subject-option').forEach(option => {
          option.hidden = !option.textContent.toLowerCase().includes(query);
        });
      };
      saveButton.onclick = async event => {
        const button = event.currentTarget;
        button.disabled = true;
        try {
          const subjects = [...m.el.querySelectorAll('.subject-option[aria-pressed="true"]')].map(option => option.dataset.subject);
          if (!subjects.length) {
            toast('Select at least one subject before saving.', 'error');
            button.disabled = false;
            return;
          }
          await api('/faculty/my-subjects', { method: 'PUT', body: { campus: selectedCampus, subjects } });
          m.close();
          toast('Subjects saved');
          await render(root, { user });
        } catch (error) {
          if (error.details?.length) {
            const warning = m.el.querySelector('#subject-save-warning');
            warning.innerHTML = String(html`<strong>These subjects are already saved by another faculty:</strong><ul>${error.details.map(subject => html`<li>${subject.code}: ${subject.faculty.map(faculty => `${faculty.name} (Mobile: ${faculty.phone || 'not provided'})`).join(', ')}</li>`)}</ul><p>They must remove the subject before you can add it.</p>`);
            warning.hidden = false;
          }
          toast(error.message, 'error');
          button.disabled = false;
        }
      };
    } catch (error) {
      toast(error.message, 'error');
    }
  };
}
