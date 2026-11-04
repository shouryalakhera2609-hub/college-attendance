import { api } from '../js/api.js';
import { html, fmtDate } from '../js/utils.js';
import { ring, stat, table, statusBadge } from '../js/components.js';

const normalizeCode = code => String(code || '').replace(/[^a-z0-9]/gi, '').toLowerCase();

export async function render(root) {
  const params = new URLSearchParams(location.hash.split('?')[1] || '');
  const code = params.get('code');
  if (!code) {
    root.innerHTML = String(html`<div class="card"><strong>Subject not found</strong><p><a href="#/student/dashboard">Back to dashboard</a></p></div>`);
    return;
  }

  const dashboard = await api('/student/dashboard');
  const subject = dashboard.uploadedSubjects.find(item => normalizeCode(item.code) === normalizeCode(code));
  if (!subject) {
    root.innerHTML = String(html`<div class="card"><strong>Subject not found</strong><p><a href="#/student/dashboard">Back to dashboard</a></p></div>`);
    return;
  }

  const recent = await api(`/student/attendance/subject-history?code=${encodeURIComponent(subject.code)}`);
  const attendance = dashboard.subjects.find(item => normalizeCode(item.code) === normalizeCode(subject.code));
  const present = attendance?.present || 0;
  const absent = attendance?.absent || 0;
  const total = subject.totalClasses || 0;
  const percentage = total ? Math.round(present / total * 1000) / 10 : null;
  const attendanceStat = (label, value, kind, status) => html`<button type="button" class="stat ${kind} attendance-filter" data-status="${status}" aria-pressed="false"><span>${label}</span><strong>${value}</strong></button>`;

  root.innerHTML = String(html`<div class="page-head"><div><h2>${subject.code} · ${subject.name || 'Subject attendance'}</h2><p class="muted">Minimum required attendance: ${dashboard.threshold}%</p></div><a class="btn" href="#/student/dashboard">Back to dashboard</a></div>
    <div class="grid hero">
      <div class="card center">${ring(percentage, 'Subject')}<small>${present} / ${total} classes attended</small></div>
      <div class="stats">${stat('Total classes', total)}${stat('Classes attended', present, 'good')}${attendanceStat('Present', present, 'good', 'present')}${attendanceStat('Absent', absent, 'bad', 'absent')}</div>
    </div>
    <div class="card"><div class="attendance-history-heading"><h3 id="subject-history-heading">Recent attendance</h3><button type="button" class="btn sm" id="clear-subject-filter" hidden>Clear filter</button></div><input class="attendance-history-search" id="subject-history-search" type="search" aria-label="Search recent attendance by date or subject code" placeholder="Search by date or subject code"><div id="subject-history"></div></div>`);

  let activeFilter = null;
  const historyTable = [
    { h: 'Date', v: record => fmtDate(record.date) },
    { h: 'Subject', v: record => record.subject?.code },
    { h: 'Lecture', v: record => record.session?.period ?? record.lectureNo ?? '-' },
    { h: 'Status', v: record => statusBadge(record.status) }
  ];
  const drawHistory = () => {
    const search = root.querySelector('#subject-history-search').value.trim().toLowerCase();
    const records = recent.rows.filter(record => {
      if (activeFilter && record.status !== activeFilter) return false;
      if (!search) return true;
      const date = new Date(record.date);
      const isoDate = Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
      return String(record.subject?.code || '').toLowerCase().includes(search)
        || isoDate.includes(search)
        || fmtDate(record.date).toLowerCase().includes(search);
    });
    root.querySelector('#subject-history-heading').textContent = activeFilter ? `Recent attendance · ${activeFilter}` : 'Recent attendance';
    root.querySelector('#clear-subject-filter').hidden = !activeFilter;
    root.querySelector('#subject-history').innerHTML = String(table(
      historyTable,
      records,
      search ? 'No recent attendance matches your search.' : activeFilter ? `No ${activeFilter} records for this subject.` : 'No recent attendance for this subject.'
    ));
    root.querySelectorAll('.attendance-filter').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.status === activeFilter)));
  };
  root.querySelector('#subject-history-search').oninput = drawHistory;
  root.querySelectorAll('.attendance-filter').forEach(button => {
    button.onclick = () => {
      activeFilter = activeFilter === button.dataset.status ? null : button.dataset.status;
      drawHistory();
    };
  });
  root.querySelector('#clear-subject-filter').onclick = () => {
    activeFilter = null;
    drawHistory();
  };
  drawHistory();
}
