import { api } from '../js/api.js';
import { html } from '../js/utils.js';
import { stat, table, toast } from '../js/components.js';
import { go } from '../js/router.js';
export async function render(root) {
  const d = await api('/admin/dashboard');
  root.innerHTML = String(html`<div class="admin-home">
    <section class="admin-welcome">
      <img src="/images/logo.png" alt="CampusAttend logo">
      <div><p>Administration Portal</p><h2>Welcome to CampusAttend</h2><small>Manage student information and campus records</small></div>
    </section>
    <section class="stats"><button class="stat stat-link" id="admin-student-count" type="button" aria-expanded="false" aria-controls="admin-student-list"><span>Students</span><strong>${d.students}</strong></button><button class="stat stat-link" id="active-hods" type="button" aria-label="View active HODs"><span>Active HODs</span><strong>${d.faculty}</strong></button>${stat('Departments', d.departments)}${stat('Active users', d.active, 'good')}</section>
    <section class="card" id="admin-student-list" hidden aria-label="College student list">
      <div class="page-head"><div><h3>College Students</h3><p>All students registered at your college.</p></div></div>
      <div class="filters" aria-label="Filter by average attendance">
        <label>Average attendance below (%)<input id="admin-attendance-threshold" type="number" min="10" max="80" step="1" placeholder="Choose 10-80"></label>
        <button class="btn" id="clear-attendance-filter" type="button" hidden>Show all</button>
      </div>
      <p class="muted">Students without attendance data are excluded from this filter.</p>
      <label class="hod-student-search">Search students<input id="admin-student-search" type="search" placeholder="Name, roll number, branch or department"></label>
      <div id="admin-student-results"><div class="empty"><strong>Loading students...</strong></div></div>
    </section>
    <section class="admin-action-card">
      <div class="admin-action-icon">${stat('Classes', d.departments, 'good')}</div>
      <div><span>Manage Classes</span><h3>Upload classes</h3><p>Add department, semester, and section information from a CSV file.</p></div>
      <button class="btn primary" id="open-classes">Open Manage Classes</button>
    </section>
  </div>`);
  root.querySelector('#open-classes').onclick = () => go('/admin/classes');
  root.querySelector('#active-hods').onclick = () => go('/admin/hods');
  const studentList = root.querySelector('#admin-student-list');
  const studentResults = root.querySelector('#admin-student-results');
  const studentSearch = root.querySelector('#admin-student-search');
  const attendanceThreshold = root.querySelector('#admin-attendance-threshold');
  const clearAttendanceFilter = root.querySelector('#clear-attendance-filter');
  let students = [];
  let studentsLoaded = false;
  let averageAttendanceThreshold = null;
  const renderStudents = () => {
    if (attendanceThreshold.value && !attendanceThreshold.validity.valid) {
      studentResults.innerHTML = String(html`<p class="muted">Enter a whole number from 10 to 80.</p>`);
      clearAttendanceFilter.hidden = true;
      return;
    }
    const query = studentSearch.value.trim().toLowerCase();
    const attendanceMatches = students.filter(student =>
      averageAttendanceThreshold === null
        || (student.averageAttendance !== null && student.averageAttendance <= averageAttendanceThreshold)
    );
    const filtered = attendanceMatches.filter(student =>
      [student.name, student.rollNo, student.branch, student.department?.name, student.email]
        .some(value => String(value || '').toLowerCase().includes(query))
    );
    const count = averageAttendanceThreshold === null
      ? `Showing ${filtered.length} of ${students.length} students`
      : `${attendanceMatches.length} students have average attendance at or below ${averageAttendanceThreshold}% · Showing ${filtered.length}`;
    studentResults.innerHTML = String(html`<p class="muted">${count}</p>${table([
      { h: 'Roll no.', v: student => student.rollNo || '-' },
      { h: 'Name', v: student => student.name },
      { h: 'Email', v: student => student.email },
      { h: 'Branch', v: student => student.branch || '-' },
      { h: 'Department', v: student => student.department?.name || '-' },
      { h: 'Average attendance', v: student => student.averageAttendance == null ? '-' : `${student.averageAttendance}%` },
      { h: 'Status', v: student => student.active ? 'Active' : 'Inactive' }
    ], filtered, 'No students match your search.')}`);
    clearAttendanceFilter.hidden = averageAttendanceThreshold === null;
  };
  attendanceThreshold.oninput = () => {
    averageAttendanceThreshold = attendanceThreshold.value
      ? Number(attendanceThreshold.value)
      : null;
    renderStudents();
  };
  clearAttendanceFilter.onclick = () => {
    averageAttendanceThreshold = null;
    attendanceThreshold.value = '';
    renderStudents();
  };
  studentSearch.oninput = renderStudents;
  root.querySelector('#admin-student-count').onclick = async event => {
    const button = event.currentTarget;
    const expanded = button.getAttribute('aria-expanded') !== 'true';
    button.setAttribute('aria-expanded', String(expanded));
    studentList.hidden = !expanded;
    if (!expanded || studentsLoaded) return;
    studentResults.innerHTML = '<div class="empty"><strong>Loading students...</strong></div>';
    try {
      students = await api('/admin/students');
      studentsLoaded = true;
      renderStudents();
    } catch (error) {
      studentResults.innerHTML = String(html`<div class="card error"><strong>Could not load students</strong><p>${error.message}</p></div>`);
      toast(error.message, 'error');
    }
  };
}
