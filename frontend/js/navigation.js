import { html } from './utils.js';
import { icon } from './components.js';
import { logout } from './auth.js';
const N = { dashboard: ['Dashboard', 'dashboard'], att: ['My Attendance', 'check', '/student/attendance'], hist: ['Attendance History', 'history', '/student/history'], corr: ['Correction Requests', 'file', '/corrections'], mark: ['Mark Attendance', 'check', '/faculty/mark'], subj: ['My Subjects', 'book', '/faculty/subjects'], rep: ['Reports', 'grid', '/reports'], prof: ['Profile', 'user', '/profile'], set: ['Settings', 'gear', '/settings'] };
const adm = [['Students', 'users', '/admin/students'], ['Faculty & Staff', 'user', '/admin/faculty'], ['Subjects', 'book', '/admin/subjects'], ['Departments', 'grid', '/admin/departments'], ['Semesters', 'grid', '/admin/semesters'], ['Sections', 'grid', '/admin/sections'], ['Assignments', 'check', '/admin/assignments'], ['Enrollments', 'users', '/admin/enrollments']];
export const MENU = {
  student: u => [['Dashboard', 'dashboard', '/student/dashboard'], N.att, N.prof, N.set],
  faculty: u => [['Dashboard', 'dashboard', '/faculty/dashboard'], N.mark, N.subj, N.prof, N.set, ['Reset Data', 'history', '/faculty/reset']],
  hod: (u, path) => path.startsWith('/faculty/')
    ? [['Faculty Dashboard', 'dashboard', '/faculty/dashboard'], N.mark, N.subj, ['HOD', 'user', '/hod/dashboard'], ['Accounts', 'users', '/hod/accounts'], N.prof, N.set, ['Reset Data', 'history', '/faculty/reset']]
    : [['Dashboard', 'dashboard', '/hod/dashboard'], ['Faculty', 'users', '/faculty/dashboard'], ['Accounts', 'users', '/hod/accounts'], N.prof, N.set],
  admin: u => [['Dashboard', 'dashboard', '/admin/dashboard'], ['Student Details', 'users', '/admin/students'], ['Manage Classes', 'grid', '/admin/classes'], N.prof, N.set]
};
export function drawChrome(u, path, title) {
  const sb = document.getElementById('sidebar'), tb = document.getElementById('topbar'), sc = document.getElementById('scrim');
  sb.hidden = tb.hidden = false;
  const menu = u.role === 'hod' ? MENU.hod(u, path) : MENU[u.role](u);
  const activeRole = u.role === 'hod' && path.startsWith('/faculty/') ? 'faculty' : u.role;
  sb.innerHTML = String(html`<div class="brand admin-brand"><img src="/images/logo.png" alt="CampusAttend logo"><span>CampusAttend</span></div><nav>${menu.map(([t, i, p]) => html`<a href="#${p}" class="${p === path ? 'active' : ''}">${icon(i)}<span>${t}</span></a>`)}<button class="navlink" id="lo">${icon('out')}<span>Logout</span></button></nav>`);
  tb.innerHTML = String(html`<button class="btn ghost menu" id="mn" aria-label="Open menu">${icon('menu', 22)}</button><div class="crumbs"><small>${activeRole}</small><strong>${title}</strong></div><div class="who"><span class="avatar">${(u.name || '?')[0]}</span><div><b>${u.name}</b><small>${activeRole}</small></div></div>`);
  const shut = () => { sb.classList.remove('open'); sc.hidden = true; };
  tb.querySelector('#mn').onclick = () => { sb.classList.add('open'); sc.hidden = false; }; sc.onclick = shut; sb.querySelectorAll('a').forEach(a => a.onclick = shut);
  sb.querySelector('#lo').onclick = async () => { await logout(); location.hash = '#/login'; };
}
export const hideChrome = () => { document.getElementById('sidebar').hidden = document.getElementById('topbar').hidden = true; };
