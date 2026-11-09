import { state, HOME } from './auth.js';
import { html } from './utils.js';
import { loading } from './components.js';
import { drawChrome, hideChrome } from './navigation.js';
const A = ['admin'];
const R = [['/login', 'login', null, 'Sign in'],
  ['/student/dashboard', 'student-dashboard', ['student'], 'Dashboard'], ['/student/subject', 'student-subject', ['student'], 'Subject Attendance'], ['/student/attendance', 'student-attendance', ['student'], 'My Attendance'], ['/student/history', 'attendance-history', ['student'], 'Attendance History'],
  ['/faculty/dashboard', 'faculty-dashboard', ['faculty', 'hod'], 'Dashboard'], ['/faculty/mark', 'mark-attendance', ['faculty', 'hod'], 'Mark Attendance'], ['/faculty/subjects', 'faculty-subjects', ['faculty', 'hod'], 'My Subjects'], ['/faculty/subject', 'faculty-subject', ['faculty', 'hod'], 'Subject'], ['/faculty/reset', 'faculty-reset', ['faculty', 'hod'], 'Reset Data'],
  ['/hod/dashboard', 'hod-dashboard', ['hod'], 'Department Dashboard'], ['/hod/students', 'hod-students', ['hod'], 'Student Details'], ['/hod/accounts', 'hod-accounts', ['hod'], 'Accounts'], ['/admin/dashboard', 'admin-dashboard', A, 'System Overview'],
  ['/admin/students', 'manage-students', A, 'Manage Students'], ['/admin/faculty', 'manage-faculty', A, 'Manage Faculty & Staff'], ['/admin/subjects', 'manage-subjects', A, 'Manage Subjects'], ['/admin/departments', 'manage-departments', A, 'Manage Departments'],
  ['/admin/classes', 'manage-classes', A, 'Manage Classes'],
  ['/admin/hods', 'admin-hods', A, 'Active HODs'],
  ['/admin/semesters', 'manage-semesters', A, 'Manage Semesters'], ['/admin/sections', 'manage-sections', A, 'Manage Sections'], ['/admin/assignments', 'manage-assignments', A, 'Faculty Assignments'], ['/admin/enrollments', 'manage-enrollments', A, 'Enrollments'],
  ['/corrections', 'correction-requests', ['student', 'faculty', 'hod'], 'Correction Requests'], ['/reports', 'reports', ['faculty', 'hod', 'admin'], 'Reports & Analytics'], ['/profile', 'profile', null, 'Profile'], ['/settings', 'settings', null, 'Settings']];
export const go = p => { location.hash = '#' + p; };
export async function route() {
  const path = location.hash.slice(1).split('?')[0] || '/', u = state.user, root = document.getElementById('page-content');
  if (!u) { if (path !== '/login') return go('/login'); }
  else if (path === '/' || path === '/login') return go(HOME[u.role]);
  const hit = R.find(r => r[0] === path);
  if (u && hit && hit[2] && !hit[2].includes(u.role)) return go(HOME[u.role]); // UX guard only; backend enforces access
  if (u) drawChrome(u, path, hit ? hit[3] : 'Not found'); else hideChrome();
  loading(true);
  try { const mod = await import(`../pages/${hit ? hit[1] : 'not-found'}.js`); root.innerHTML = ''; await mod.render(root, { user: u }); root.focus({ preventScroll: true }); }
  catch (e) { root.innerHTML = String(html`<div class="card error"><strong>Something went wrong</strong><p>${e.message}</p></div>`); }
  finally { loading(false); }
}
