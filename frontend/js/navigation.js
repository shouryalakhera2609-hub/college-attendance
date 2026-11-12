import { html } from './utils.js';
import { api } from './api.js';
import { icon, toast } from './components.js';
import { logout } from './auth.js';
let notificationTimer;

function renderPendingNotifications(button, { endpoint, destination, storageKey }) {
  let pendingIds = [];
  const update = async () => {
    try {
      const requests = await api(endpoint);
      pendingIds = requests.map(request => request.id);
      const stored = JSON.parse(localStorage.getItem(storageKey) || '[]');
      const readIds = new Set(stored.filter(id => pendingIds.includes(id)));
      localStorage.setItem(storageKey, JSON.stringify([...readIds]));
      const unreadCount = pendingIds.filter(id => !readIds.has(id)).length;
      const badge = button.querySelector('[data-notification-count]');
      badge.textContent = unreadCount > 99 ? '99+' : String(unreadCount);
      badge.hidden = unreadCount === 0;
      button.setAttribute('aria-label', unreadCount
        ? `${unreadCount} new pending requests. View pending requests`
        : 'View pending requests');
    } catch (error) {
      toast(`Could not check pending requests: ${error.message}`, 'error');
    }
  };

  button.onclick = async () => {
    try {
      const requests = await api(endpoint);
      pendingIds = requests.map(request => request.id);
      localStorage.setItem(storageKey, JSON.stringify(pendingIds));
    } catch (error) {
      toast(`Could not refresh pending requests: ${error.message}`, 'error');
    }
    location.hash = `#${destination}`;
  };

  update();
  notificationTimer = setInterval(update, 30_000);
}

const N = { dashboard: ['Dashboard', 'dashboard'], att: ['My Attendance', 'check', '/student/attendance'], hist: ['Attendance History', 'history', '/student/history'], corr: ['Correction Requests', 'file', '/corrections'], mark: ['Mark Attendance', 'check', '/faculty/mark'], subj: ['My Subjects', 'book', '/faculty/subjects'], rep: ['Reports', 'grid', '/reports'], prof: ['Profile', 'user', '/profile'], set: ['Settings', 'gear', '/settings'] };
const adm = [['Students', 'users', '/admin/students'], ['Faculty & Staff', 'user', '/admin/faculty'], ['Subjects', 'book', '/admin/subjects'], ['Departments', 'grid', '/admin/departments'], ['Semesters', 'grid', '/admin/semesters'], ['Sections', 'grid', '/admin/sections'], ['Assignments', 'check', '/admin/assignments'], ['Enrollments', 'users', '/admin/enrollments']];
export const MENU = {
  student: u => [['Dashboard', 'dashboard', '/student/dashboard'], N.att, N.prof, N.set],
  faculty: u => [['Dashboard', 'dashboard', '/faculty/dashboard'], N.mark, N.prof, N.set, ['Reset Data', 'history', '/faculty/reset']],
  hod: (u, path) => path.startsWith('/faculty/')
    ? [['Faculty Dashboard', 'dashboard', '/faculty/dashboard'], N.mark, N.subj, ['HOD', 'user', '/hod/dashboard'], ['Accounts', 'users', '/hod/accounts'], ['Request', 'file', '/hod/requests'], N.prof, N.set, ['Reset Data', 'history', '/faculty/reset']]
    : [['Dashboard', 'dashboard', '/hod/dashboard'], ['Faculty', 'users', '/faculty/dashboard'], ['Accounts', 'users', '/hod/accounts'], ['Request', 'file', '/hod/requests'], N.prof, N.set],
  admin: u => [['Dashboard', 'dashboard', '/admin/dashboard'], ['Manage Classes', 'grid', '/admin/classes'], ['Active HODs', 'users', '/admin/hods'], ['Request', 'file', '/admin/requests'], N.prof, N.set]
};
export function drawChrome(u, path, title) {
  const sb = document.getElementById('sidebar'), tb = document.getElementById('topbar'), sc = document.getElementById('scrim');
  sb.hidden = tb.hidden = false;
  const menu = u.role === 'hod' ? MENU.hod(u, path) : MENU[u.role](u);
  const activeRole = u.role === 'hod' && path.startsWith('/faculty/') ? 'faculty' : u.role;
  sb.innerHTML = String(html`<div class="brand admin-brand"><img src="/images/logo.png" alt="CampusAttend logo"><span>CampusAttend</span></div><nav>${menu.map(([t, i, p]) => html`<a href="#${p}" class="${p === path ? 'active' : ''}">${icon(i)}<span>${t}</span></a>`)}<button class="navlink" id="lo">${icon('out')}<span>Logout</span></button></nav>`);
  if (notificationTimer) clearInterval(notificationTimer);
  const showNotifications = (u.role === 'admin' && path === '/admin/dashboard')
    || (u.role === 'hod' && path === '/hod/dashboard');
  tb.innerHTML = String(html`<button class="btn ghost menu" id="mn" aria-label="Open menu">${icon('menu', 22)}</button><div class="crumbs"><small>${activeRole}</small><strong>${title}</strong></div>${showNotifications ? html`<button class="pending-notification" id="pending-notification" type="button" aria-label="View pending requests"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></svg><span class="notification-count" data-notification-count hidden></span></button>` : ''}<div class="who"><span class="avatar">${(u.name || '?')[0]}</span><div><b>${u.name}</b><small>${activeRole}</small></div></div>`);
  const shut = () => { sb.classList.remove('open'); sc.hidden = true; };
  tb.querySelector('#mn').onclick = () => { sb.classList.add('open'); sc.hidden = false; }; sc.onclick = shut; sb.querySelectorAll('a').forEach(a => a.onclick = shut);
  const notificationButton = tb.querySelector('#pending-notification');
  if (notificationButton) {
    const isAdmin = u.role === 'admin';
    renderPendingNotifications(notificationButton, {
      endpoint: isAdmin ? '/admin/requests?status=pending' : '/hod/requests?status=pending',
      destination: isAdmin ? '/admin/requests' : '/hod/requests',
      storageKey: isAdmin
        ? `campusattend:read-pending-requests:${u.campus || 'unknown'}`
        : `campusattend:read-hod-pending-requests:${u.campus || 'unknown'}:${u.department?._id || u.department?.id || u.department || 'unknown'}`
    });
  }
  sb.querySelector('#lo').onclick = async () => { await logout(); location.hash = '#/login'; };
}
export const hideChrome = () => {
  if (notificationTimer) clearInterval(notificationTimer);
  document.getElementById('sidebar').hidden = document.getElementById('topbar').hidden = true;
};
