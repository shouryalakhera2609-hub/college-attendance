import { api, apiFile, apiDownload } from '../js/api.js';
import { html } from '../js/utils.js';
import { modal, stat, bar, table, toast, pctClass, download } from '../js/components.js';

const fileTypes = ['.csv', '.xls', '.xlsx'];
const maxFileSize = 2 * 1024 * 1024;
const fileSize = size => size < 1024 * 1024 ? `${(size / 1024).toFixed(1)} KB` : `${(size / (1024 * 1024)).toFixed(1)} MB`;

export async function render(root) {
  const draw = async () => {
    const [d, files] = await Promise.all([api('/hod/dashboard'), api('/hod/files')]);
    const departmentOverall = d.overall || null;
    const departmentPercentage = departmentOverall?.percentage ?? null;
    root.innerHTML = String(html`<div class="stats"><div class="stat ${pctClass(departmentPercentage, d.threshold)}" title="${departmentOverall?.total ? 'Present ÷ (Present + Absent) × 100; excused records are excluded.' : 'No attendance records available'}"><span>Department attendance</span><strong>${departmentPercentage == null ? '-' : departmentPercentage + '%'}</strong></div><button class="stat stat-link" id="hod-student-count" type="button" aria-expanded="false" aria-controls="hod-student-list"><span>Department students</span><strong>${d.students}</strong></button><button class="stat stat-link" id="hod-faculty-count" type="button" aria-expanded="false" aria-controls="hod-faculty-list"><span>Department faculty</span><strong>${d.faculty}</strong></button></div>
    <section class="card" id="hod-student-list" hidden aria-label="Department student list">
      <div class="page-head"><div><h3>Department Students</h3><p>Search by student name, roll number, branch, or department.</p></div><a class="btn" href="#/hod/students">Import Student CSV</a></div>
      <label class="hod-student-search">Search students<input id="hod-student-search" type="search" placeholder="Name, roll number, branch or department"></label>
      <div id="hod-student-results"><div class="empty"><strong>Loading students...</strong></div></div>
    </section>
    <section class="card" id="hod-faculty-list" hidden aria-label="Department faculty list">
      <div class="page-head"><div><h3>Department Faculty</h3><p>Faculty in your department and college.</p></div></div>
      <div id="hod-faculty-results"><div class="empty"><strong>Loading faculty...</strong></div></div>
    </section>
    <div class="card"><h3>CSV/Excel Files</h3><p>Files uploaded by any HOD at this college are visible here. All HODs can edit these files. Replacing a file updates the same saved file: new rows are added, rows missing from the new file are removed, and student accounts and attendance data stay unchanged.</p><button class="btn primary" id="hod-file-upload">${files.length ? 'Replace File' : 'Upload File'}</button>
      ${files.length ? files.map(file => html`<div class="card hod-file-row"><div><h4>${file.fileName}</h4><p>${file.department?.name || 'Department'} · ${file.kind === 'student-list' ? 'Student list · ' : file.kind === 'subject-list' ? 'Subject list · ' : ''}${fileSize(file.size)} · Updated ${new Date(file.updatedAt || file.createdAt).toLocaleString()}</p></div><div class="hod-file-actions"><button class="btn sm primary" data-open-file="${file._id}" type="button">Open</button><button class="btn sm" data-edit-file="${file._id}" type="button">Edit</button></div></div>`) : html`<div class="empty"><strong>No files uploaded yet</strong></div>`}
      <div id="hod-file-details"></div>
    </div>
    <div class="grid two"><div class="card"><button class="class-attendance-toggle" id="toggle-class-attendance" type="button" aria-expanded="false" aria-controls="class-attendance-details"><h3>Class wise attendance</h3><span data-toggle-label>Click to view</span></button><div id="class-attendance-details" hidden>
      <div class="filters"><label>Search class<input id="class-attendance-search" type="search" placeholder="Class, branch or semester"></label><label>Sort by attendance<select id="class-attendance-sort"><option value="asc">Low to high</option><option value="desc">High to low</option></select></label></div>
      <div id="class-attendance-list"></div>
    </div></div>
    <div class="card"><button class="class-attendance-toggle" id="toggle-subject-attendance" type="button" aria-expanded="false" aria-controls="subject-attendance-details"><h3>Subject wise attendance</h3><span data-toggle-label>Click to view</span></button><div id="subject-attendance-details" hidden>
      <div class="filters"><label>Search subject<input id="subject-attendance-search" type="search" placeholder="Subject code, name or semester"></label><label>Sort by attendance<select id="subject-attendance-sort"><option value="asc">Low to high</option><option value="desc">High to low</option></select></label></div>
      <div id="subject-attendance-list"></div><p><a href="#/corrections">Review correction requests</a></p>
    </div></div></div>`);
    const studentList = root.querySelector('#hod-student-list');
    const studentResults = root.querySelector('#hod-student-results');
    const studentSearch = root.querySelector('#hod-student-search');
    let students = [];
    let studentsLoaded = false;
    const renderStudents = () => {
      const query = studentSearch.value.trim().toLowerCase();
      const filtered = students.filter(student =>
        [student.name, student.rollNo, student.branch, student.department?.name]
          .some(value => String(value || '').toLowerCase().includes(query))
      );
      studentResults.innerHTML = String(html`<p class="muted">Showing ${filtered.length} of ${students.length} students</p>${table([
        { h: 'Roll no.', v: student => student.rollNo || '-' },
        { h: 'Name', v: student => student.name },
        { h: 'Email', v: student => student.email },
        { h: 'Branch', v: student => student.branch || '-' },
        { h: 'Department', v: student => student.department?.name || '-' },
        { h: 'Status', v: student => student.active ? 'Active' : 'Inactive' },
        { h: 'Action', v: student => html`<button class="btn sm ${student.active ? 'danger' : ''}" data-hod-student-status="${student._id}">${student.active ? 'Deactivate' : 'Activate'}</button>` }
      ], filtered, 'No students match your search.')}`);
      studentResults.querySelectorAll('[data-hod-student-status]').forEach(button => {
        button.onclick = async () => {
          const student = students.find(row => row._id === button.dataset.hodStudentStatus);
          if (!student) return;
          const action = student.active ? 'deactivate' : 'activate';
          if (!confirm(`Are you sure you want to ${action} ${student.name}'s account?`)) return;
          button.disabled = true;
          try {
            await api(`/hod/students/${student._id}/status`, { method: 'PATCH', body: { active: !student.active } });
            toast(`Student account ${student.active ? 'deactivated' : 'activated'}`);
            students = await api('/hod/students');
            renderStudents();
          } catch (error) {
            toast(error.message, 'error');
            button.disabled = false;
          }
        };
      });
    };
    studentSearch.oninput = renderStudents;
    root.querySelector('#hod-student-count').onclick = async event => {
      const button = event.currentTarget;
      const expanded = button.getAttribute('aria-expanded') !== 'true';
      button.setAttribute('aria-expanded', String(expanded));
      studentList.hidden = !expanded;
      if (!expanded) return;
      if (!studentsLoaded) {
        studentResults.innerHTML = '<div class="empty"><strong>Loading students...</strong></div>';
        try {
          students = await api('/hod/students');
          studentsLoaded = true;
          renderStudents();
        } catch (error) {
          studentResults.innerHTML = String(html`<div class="card error"><strong>Could not load students</strong><p>${error.message}</p></div>`);
          toast(error.message, 'error');
        }
      }
      studentList.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
    const facultyList = root.querySelector('#hod-faculty-list');
    const facultyResults = root.querySelector('#hod-faculty-results');
    let facultyLoaded = false;
    let faculty = [];
    const renderFaculty = () => {
      facultyResults.innerHTML = String(html`${table([
        { h: 'Name', v: member => member.name },
        { h: 'Mobile number', v: member => member.phone || '-' },
        { h: 'Average attendance', v: member => member.averageAttendance == null ? '-' : `${member.averageAttendance}%` },
        { h: 'Status', v: member => member.active ? 'Active' : 'Inactive' },
        { h: 'Action', v: member => html`<button class="btn sm ${member.active ? 'danger' : ''}" data-hod-faculty-status="${member._id}">${member.active ? 'Deactivate' : 'Activate'}</button>` },
        { h: 'Subjects', v: member => html`<button class="btn sm primary" data-hod-faculty-subjects="${member._id}" type="button">View subjects</button>` }
      ], faculty, 'No faculty found in your department.')}`);
      facultyResults.querySelectorAll('[data-hod-faculty-subjects]').forEach(button => {
        button.onclick = () => {
          const member = faculty.find(row => row._id === button.dataset.hodFacultySubjects);
          if (!member) return;
          const subjects = member.subjects || [];
          const m = modal({
            title: `${member.name} - My Subjects`,
            body: html`<p class="muted">Saved by: <strong>${member.name}</strong> · Mobile: <strong>${member.phone || 'Not provided'}</strong></p>${subjects.length ? table([
              { h: 'Subject code', v: subject => subject.code || '-' },
              { h: 'Subject name', v: subject => subject.name || '-' },
              { h: 'College', v: subject => subject.campus || '-' },
              { h: 'Department', v: subject => subject.department || '-' },
              { h: 'Semester', v: subject => subject.semester || '-' },
              { h: 'Total days', v: subject => subject.totalDays || 0 },
              { h: 'Average attendance', v: subject => subject.averageAttendance == null ? '-' : `${subject.averageAttendance}%` }
            ], subjects, 'No subjects added yet.') : html`<div class="empty"><strong>No subjects added yet</strong></div>`}`
          });
          m.el.style.maxWidth = '1100px';
        };
      });
      facultyResults.querySelectorAll('[data-hod-faculty-status]').forEach(button => {
        button.onclick = async () => {
          const member = faculty.find(row => row._id === button.dataset.hodFacultyStatus);
          if (!member) return;
          const action = member.active ? 'deactivate' : 'activate';
          if (!confirm(`Are you sure you want to ${action} ${member.name}'s account?`)) return;
          button.disabled = true;
          try {
            await api(`/hod/faculty/${member._id}/status`, { method: 'PATCH', body: { active: !member.active } });
            toast(`Faculty account ${member.active ? 'deactivated' : 'activated'}`);
            faculty = await api('/hod/faculty');
            renderFaculty();
          } catch (error) {
            toast(error.message, 'error');
            button.disabled = false;
          }
        };
      });
    };
    root.querySelector('#hod-faculty-count').onclick = async event => {
      const button = event.currentTarget;
      const expanded = button.getAttribute('aria-expanded') !== 'true';
      button.setAttribute('aria-expanded', String(expanded));
      facultyList.hidden = !expanded;
      if (!expanded) return;
      if (!facultyLoaded) {
        facultyResults.innerHTML = '<div class="empty"><strong>Loading faculty...</strong></div>';
        try {
          faculty = await api('/hod/faculty');
          renderFaculty();
          facultyLoaded = true;
        } catch (error) {
          facultyResults.innerHTML = String(html`<div class="card error"><strong>Could not load faculty</strong><p>${error.message}</p></div>`);
          toast(error.message, 'error');
        }
      }
      facultyList.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
    const classAttendanceToggle = root.querySelector('#toggle-class-attendance');
    const classAttendanceDetails = root.querySelector('#class-attendance-details');
    const subjectAttendanceToggle = root.querySelector('#toggle-subject-attendance');
    const subjectAttendanceDetails = root.querySelector('#subject-attendance-details');
    const bindAttendanceToggle = (button, details) => {
      button.onclick = () => {
        const expanded = button.getAttribute('aria-expanded') !== 'true';
        button.setAttribute('aria-expanded', String(expanded));
        details.hidden = !expanded;
        button.querySelector('[data-toggle-label]').textContent = expanded ? 'Hide details' : 'Click to view';
      };
    };
    bindAttendanceToggle(classAttendanceToggle, classAttendanceDetails);
    bindAttendanceToggle(subjectAttendanceToggle, subjectAttendanceDetails);
    const renderAttendanceList = ({ items, search, sort, target, searchableText, percentage, render }) => {
      const query = search.value.trim().toLowerCase();
      const direction = sort.value === 'desc' ? -1 : 1;
      const filtered = items.filter(item => searchableText(item).toLowerCase().includes(query));
      filtered.sort((left, right) => {
        const leftPercentage = percentage(left);
        const rightPercentage = percentage(right);
        if (leftPercentage == null) return rightPercentage == null ? 0 : 1;
        if (rightPercentage == null) return -1;
        return (leftPercentage - rightPercentage) * direction;
      });
      target.innerHTML = render(filtered);
    };
    const classAttendanceList = root.querySelector('#class-attendance-list');
    const subjectAttendanceList = root.querySelector('#subject-attendance-list');
    const renderClasses = () => renderAttendanceList({
      items: d.classes,
      search: root.querySelector('#class-attendance-search'),
      sort: root.querySelector('#class-attendance-sort'),
      target: classAttendanceList,
      searchableText: section => `${section.name} ${section.branch} ${section.semester}`,
      percentage: section => section.percentage,
      render: classes => classes.length
        ? classes.map(section => html`<div class="subj"><div><b>${section.name}</b><span class="${pctClass(section.percentage, d.threshold)}">${section.percentage == null ? 'No data' : `${section.percentage}%`}</span></div><small>Average attendance${[section.branch, section.semester].filter(Boolean).length ? ` · ${[section.branch, section.semester].filter(Boolean).join(' · ')}` : ''}</small>${bar(section.percentage, d.threshold)}</div>`)
        : html`<div class="empty"><strong>No matching classes found</strong></div>`
    });
    const renderSubjects = () => renderAttendanceList({
      items: d.subjects,
      search: root.querySelector('#subject-attendance-search'),
      sort: root.querySelector('#subject-attendance-sort'),
      target: subjectAttendanceList,
      searchableText: subject => `${subject.code} ${subject.name} ${subject.semester}`,
      percentage: subject => subject.averagePresent?.percentage,
      render: subjects => table([
        { h: 'Subject', v: subject => [subject.code, subject.name].filter(Boolean).join(' · ') },
        { h: 'Semester', v: subject => subject.semester || '-' },
        { h: 'Average attendance', v: subject => subject.averagePresent ? `${subject.averagePresent.percentage}%` : '-' },
        { h: 'Birt student', v: subject => subject.averageByAttendanceSection?.Birt ? `${subject.averageByAttendanceSection.Birt.percentage}%` : '-' },
        { h: 'Birts student', v: subject => subject.averageByAttendanceSection?.Birts ? `${subject.averageByAttendanceSection.Birts.percentage}%` : '-'}
      ], subjects, 'No matching subjects found.')
    });
    root.querySelector('#class-attendance-search').oninput = renderClasses;
    root.querySelector('#class-attendance-sort').onchange = renderClasses;
    root.querySelector('#subject-attendance-search').oninput = renderSubjects;
    root.querySelector('#subject-attendance-sort').onchange = renderSubjects;
    renderClasses();
    renderSubjects();
    root.querySelector('#hod-file-upload').onclick = () => openFileUpload(draw, files);
    root.querySelectorAll('[data-open-file]').forEach(button => {
      button.onclick = () => drawFileDetails(files.find(file => file._id === button.dataset.openFile), false);
    });
    root.querySelectorAll('[data-edit-file]').forEach(button => {
      button.onclick = () => drawFileDetails(files.find(file => file._id === button.dataset.editFile), true);
    });
  };
  await draw();
}

async function drawFileDetails(file, editMode) {
  const details = document.querySelector('#hod-file-details');
  if (!details || !file) return;
  details.innerHTML = '<div class="empty"><strong>Opening file...</strong></div>';
  try {
    const preview = await api(`/hod/files/${file._id}/preview`);
    const rows = preview.rows.map((cells, rowIndex) => ({ cells, rowIndex }));
    const columnCount = Math.max(0, ...preview.rows.map(row => row.length));
    details.innerHTML = String(html`<div class="page-head class-file-detail-head">
      <div><h4>${file.fileName}</h4><p>${preview.totalRows} rows${preview.truncated ? ' · Showing the first 500 rows' : ''}${editMode ? ' · Edit or delete individual rows. Excel edits save the first sheet as a plain table.' : ' · Preview'}</p></div>
      <div class="hod-file-actions"><button class="btn" id="download-hod-file" type="button">Download</button><button class="btn" id="close-hod-file-details" type="button">Close</button></div>
    </div>${table([
      ...Array.from({ length: columnCount }, (_, index) => ({ h: `Column ${index + 1}`, v: row => row.cells[index] ?? '' })),
      ...(editMode ? [{ h: 'Actions', v: row => html`<button class="btn sm" data-edit-file-row="${row.rowIndex}">Edit row</button> <button class="btn sm danger" data-delete-file-row="${row.rowIndex}">Delete row</button>` }] : [])
    ], rows, 'This file has no rows.')}` + (preview.truncated ? '<p class="muted">Only the first 500 rows are shown here. Download the file to access the remaining rows.</p>' : ''));
    details.querySelector('#close-hod-file-details').onclick = () => details.replaceChildren();
    details.querySelector('#download-hod-file').onclick = async () => {
      try { download(await apiDownload(`/hod/files/${file._id}`), file.fileName); }
      catch (error) { toast(error.message, 'error'); }
    };
    details.querySelectorAll('[data-edit-file-row]').forEach(button => {
      button.onclick = () => editFileRow(file, Number(button.dataset.editFileRow), rows[Number(button.dataset.editFileRow)].cells, columnCount, () => drawFileDetails(file, true));
    });
    details.querySelectorAll('[data-delete-file-row]').forEach(button => {
      button.onclick = async () => {
        const rowIndex = Number(button.dataset.deleteFileRow);
        if (!confirm(`Delete row ${rowIndex + 1} from "${file.fileName}"?`)) return;
        try {
          await api(`/hod/files/${file._id}/rows/${rowIndex}`, { method: 'DELETE' });
          toast('Row deleted');
          await drawFileDetails(file, true);
        } catch (error) { toast(error.message, 'error'); }
      };
    });
  } catch (error) {
    details.innerHTML = String(html`<div class="login-error">${error.message}</div>`);
    toast(error.message, 'error');
  }
}

function editFileRow(file, rowIndex, cells, columnCount, refresh) {
  const rowCells = Array.from({ length: columnCount }, (_, index) => cells[index] ?? '');
  const m = modal({ title: `Edit Row ${rowIndex + 1}`, body: html`<form class="form">
    ${rowCells.map((value, index) => html`<label>Column ${index + 1}<input name="cell-${index}" maxlength="10000" value="${value}"></label>`)}
    <button class="btn primary">Save row</button>
  </form>` });
  m.el.querySelector('form').onsubmit = async event => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const updatedCells = rowCells.map((_, index) => String(formData.get(`cell-${index}`) || ''));
    const payload = new Blob([JSON.stringify({ cells: updatedCells })], { type: 'application/octet-stream' });
    try {
      await apiFile(`/hod/files/${file._id}/rows/${rowIndex}`, payload, { method: 'PUT' });
      m.close();
      toast('Row updated');
      await refresh();
    } catch (error) { toast(error.message, 'error'); }
  };
}

function openFileUpload(draw, existingFiles) {
  const replacing = existingFiles.length > 0;
  const m = modal({ title: replacing ? 'Replace CSV/Excel File' : 'Upload CSV/Excel File', body: html`<div class="csv-upload-form">
    <p>${replacing ? 'The selected saved file will be updated from the new file: new rows are added and rows missing from the new file are removed. Student accounts and attendance data remain unchanged.' : 'For student subject names, include Branch, Semester, Subject Code, and Subject Name columns in your CSV.'}</p>
    ${replacing ? html`<label>File to replace<select id="hod-file-replace-id">${existingFiles.map(file => html`<option value="${file._id}">${file.fileName} · ${file.department?.name || 'Department'}</option>`)}</select></label>` : ''}
    <button type="button" class="btn" id="download-subject-list-template">Download subject-list CSV template</button>
    <input class="file-input" id="hod-file-input" type="file" accept=".csv,.xls,.xlsx,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet">
    <button type="button" class="btn file-picker-button" id="choose-hod-file">Choose File</button>
    <span id="hod-file-name" class="file-name">No file selected</span>
    <div class="login-error" id="hod-file-error" hidden></div>
    <button type="button" class="btn primary" id="upload-hod-file" disabled>${replacing ? 'Replace File' : 'Upload File'}</button>
  </div>` });
  const input = m.el.querySelector('#hod-file-input');
  const fileName = m.el.querySelector('#hod-file-name');
  const error = m.el.querySelector('#hod-file-error');
  const button = m.el.querySelector('#upload-hod-file');

  m.el.querySelector('#download-subject-list-template').onclick = () => {
    const csv = '\uFEFFBranch,Semester,Subject Code,Subject Name\r\n';
    download(new Blob([csv], { type: 'text/csv;charset=utf-8' }), 'subject-list-template.csv');
  };
  m.el.querySelector('#choose-hod-file').onclick = () => {
    if (typeof input.showPicker === 'function') input.showPicker();
    else input.click();
  };
  input.onchange = () => {
    const file = input.files?.[0];
    fileName.textContent = file?.name || 'No file selected';
    const extension = file?.name.slice(file.name.lastIndexOf('.')).toLowerCase();
    const problem = !file ? '' : !fileTypes.includes(extension)
      ? 'Please select a .csv or Excel .xls/.xlsx file.'
      : file.size > maxFileSize ? 'File must be 2 MB or smaller.' : '';
    error.textContent = problem;
    error.hidden = !problem;
    button.disabled = !file || Boolean(problem);
  };
  button.onclick = async () => {
    const file = input.files?.[0];
    if (!file || button.disabled) return;
    button.disabled = true;
    button.textContent = replacing ? 'Replacing...' : 'Uploading...';
    error.hidden = true;
    try {
      const kind = file.name.toLowerCase().endsWith('.csv') ? 'subject-list' : 'general';
      const replaceId = m.el.querySelector('#hod-file-replace-id')?.value;
      const replaceQuery = replaceId ? `&replaceId=${encodeURIComponent(replaceId)}` : '';
      const result = await apiFile(`/hod/files?fileName=${encodeURIComponent(file.name)}&kind=${kind}${replaceQuery}`, file);
      m.close();
      toast(replacing ? `File updated: ${result.added} rows added, ${result.removed} rows removed` : 'File uploaded');
      await draw();
    } catch (uploadError) {
      error.textContent = uploadError.message;
      error.hidden = false;
      toast(uploadError.message, 'error');
      button.disabled = false;
      button.textContent = replacing ? 'Replace File' : 'Upload File';
    }
  };
}
