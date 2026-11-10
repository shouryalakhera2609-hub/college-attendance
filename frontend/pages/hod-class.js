import { api } from '../js/api.js';
import { html } from '../js/utils.js';
import { download, modal } from '../js/components.js';

export async function render(root) {
  const sectionId = new URLSearchParams(location.hash.split('?')[1] || '').get('section');
  if (!sectionId) {
    root.innerHTML = String(html`<div class="card error"><strong>Class not selected</strong><p><a href="#/hod/dashboard">Return to dashboard</a></p></div>`);
    return;
  }

  root.innerHTML = String(html`<div class="card"><p class="muted">Loading class students...</p></div>`);
  try {
    const result = await api(`/hod/classes/${encodeURIComponent(sectionId)}/students`);
    const groups = result.groupedByAttendanceSection
      ? [
          ...['Birt', 'Birts'].map(section => ({
            section,
            students: result.students.filter(student => student.attendanceSection === section)
          })),
          ...(result.students.some(student => !['Birt', 'Birts'].includes(student.attendanceSection))
            ? [{ section: '', students: result.students.filter(student => !['Birt', 'Birts'].includes(student.attendanceSection)) }]
            : [])
        ]
      : [{ section: '', students: result.students }];
    const subjects = result.subjects || [];
    root.innerHTML = String(html`<div class="page-head"><div><p><a href="#/hod/dashboard">← Department Dashboard</a></p><h2>${result.section.name}</h2><p class="muted">${[result.section.branch, result.section.semester].filter(Boolean).join(' · ')}</p></div><button class="btn primary" id="download-class-sheet" type="button">Download sheet</button></div>
      <section class="card"><div class="page-head"><div><h3>Class Students</h3><p class="muted" id="class-student-count"></p></div><button class="btn" id="minimum-attendance-filter" type="button">Minimum</button></div>
        ${result.students.length
          ? html`<div class="tbl-wrap"><table id="class-student-sheet"><thead><tr><th scope="col">Student name</th><th scope="col">Roll no.</th>${subjects.map(subject => html`<th scope="col" title="${subject.name || subject.code}">${subject.code}(${subject.totalClasses || 0})</th>`)}<th scope="col">Total(${result.totalClasses || 0})</th><th scope="col">Average attendance (Min. ${result.threshold}%)</th></tr></thead><tbody id="class-student-rows"></tbody></table></div>`
          : html`<div class="empty"><strong>No students found in this class.</strong></div>`}
      </section>`);
    let maximumAttendance = null;
    const renderStudents = () => {
      const visibleStudents = result.students.filter(student =>
        maximumAttendance === null || (student.averageAttendance != null && student.averageAttendance <= maximumAttendance)
      );
      root.querySelector('#class-student-count').textContent = maximumAttendance === null
        ? `${visibleStudents.length} students`
        : `${visibleStudents.length} of ${result.students.length} students · attendance ≤ ${maximumAttendance}%`;
      const rows = root.querySelector('#class-student-rows');
      if (!rows) return;
      const visibleGroups = result.groupedByAttendanceSection
        ? [
            ...['Birt', 'Birts'].map(section => ({
              section,
              students: visibleStudents.filter(student => student.attendanceSection === section)
            })),
            ...(visibleStudents.some(student => !['Birt', 'Birts'].includes(student.attendanceSection))
              ? [{ section: '', students: visibleStudents.filter(student => !['Birt', 'Birts'].includes(student.attendanceSection)) }]
              : [])
          ]
        : [{ section: '', students: visibleStudents }];
      rows.innerHTML = visibleStudents.length
        ? String(html`${visibleGroups.map(group => html`
            ${group.section ? html`<tr class="attendance-section-row"><th scope="rowgroup" colspan="${subjects.length + 4}"><strong>⭐ ${group.section}</strong></th></tr>` : ''}
            ${group.students.map(student => html`<tr><td>${student.name}</td><td>${student.rollNo || '-'}</td>${subjects.map(subject => {
              const code = subject.code.replace(/[^a-z0-9]/gi, '').toLowerCase();
              return html`<td>${student.attendedBySubject?.[code] || 0}</td>`;
            })}<td>${student.totalAttended || 0}</td><td>${student.averageAttendance == null ? '-' : `${student.averageAttendance}%`}</td></tr>`)}`)}`)
        : String(html`<tr><td colspan="${subjects.length + 4}">Attendance ${maximumAttendance}% ya usse kam wala koi student nahi hai.</td></tr>`);
    };
    renderStudents();
    root.querySelector('#minimum-attendance-filter').onclick = () => {
      const filterModal = modal({
        title: 'Minimum attendance filter',
        body: html`<div class="form"><p>Show students with attendance at or below the selected percentage.</p><label>Minimum attendance (%)<input name="minimum" type="number" min="0" max="100" step="0.1" value="${maximumAttendance ?? ''}" required></label><div class="row"><button class="btn primary" id="apply-minimum-filter" type="button">Apply filter</button>${maximumAttendance !== null ? html`<button class="btn" id="clear-minimum-filter" type="button">Clear filter</button>` : ''}</div><p class="bad" id="minimum-filter-error" hidden>0 se 100 ke beech number enter karein.</p></div>`
      });
      filterModal.el.querySelector('#apply-minimum-filter').onclick = () => {
        const input = filterModal.el.querySelector('[name="minimum"]');
        const value = Number(input.value);
        const error = filterModal.el.querySelector('#minimum-filter-error');
        if (!input.value.trim() || !Number.isFinite(value) || value < 0 || value > 100) {
          error.hidden = false;
          input.focus();
          return;
        }
        maximumAttendance = value;
        filterModal.close();
        root.querySelector('#minimum-attendance-filter').textContent = `Minimum ≤ ${value}%`;
        renderStudents();
      };
      filterModal.el.querySelector('#clear-minimum-filter')?.addEventListener('click', () => {
        maximumAttendance = null;
        filterModal.close();
        root.querySelector('#minimum-attendance-filter').textContent = 'Minimum';
        renderStudents();
      });
    };
    root.querySelector('#download-class-sheet').onclick = () => {
      const csvCell = value => {
        let text = String(value ?? '');
        if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
        return `"${text.replace(/"/g, '""')}"`;
      };
      const rows = [...root.querySelectorAll('#class-student-sheet tr')]
        .map(row => [...row.cells].map(cell => cell.textContent.trim()));
      const csv = rows.map(row => row.map(csvCell).join(',')).join('\r\n');
      const fileName = `${result.section.name}-master-sheet.csv`.replace(/[<>:"/\\|?*]/g, '-');
      download(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }), fileName);
    };
  } catch (error) {
    root.innerHTML = String(html`<div class="card error"><strong>Could not load class students</strong><p>${error.message}</p><p><a href="#/hod/dashboard">Return to dashboard</a></p></div>`);
  }
}
