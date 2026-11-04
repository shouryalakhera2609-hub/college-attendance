import { api } from '../js/api.js';
import { html, fmtDate } from '../js/utils.js';
import { ring, bar, stat, table, statusBadge, pctClass } from '../js/components.js';
export async function render(root, { user }) {
  const d = await api('/student/dashboard'), o = d.overall, low = d.subjects.filter(s => s.low);
  const attendanceStat = (label, value, kind, status) => html`<button type="button" class="stat ${kind} attendance-filter" data-status="${status}" aria-pressed="false"><span>${label}</span><strong>${value}</strong></button>`;
  root.innerHTML = String(html`<h2>Hello, ${user.name.split(' ')[0]}</h2>
  ${low.map(s => html`<div class="alert bad">${s.code} is at ${s.percentage}%, below the ${d.threshold}% minimum.</div>`)}
  <div class="grid hero"><div class="card center">${ring(o.percentage)}<small>${o.present} / ${o.total} classes attended</small></div>
  <div class="stats">${attendanceStat('Present', o.present, 'good', 'present')}${attendanceStat('Absent', o.absent, 'bad', 'absent')}${stat('Total classes', o.total)}${stat('Minimum required', d.threshold + '%')}</div></div>
  <div class="card"><h3>Subjects for your branch and semester</h3>${d.uploadedSubjects?.length ? table([
    { h: 'Subject code', v: subject => html`<a href="#/student/subject?code=${encodeURIComponent(subject.code)}">${subject.code}</a>` },
    { h: 'Subject name', v: subject => subject.name || '-' },
    { h: 'Total classes', v: subject => `${subject.presentClasses || 0} / ${subject.totalClasses || 0}` }
  ], d.uploadedSubjects) : html`<div class="empty"><strong>No matching subject list found</strong><p>Subjects uploaded by any HOD on your campus will appear here when the branch and semester match.</p></div>`}</div>
  <div class="card"><h3>Subject-wise attendance</h3>${d.subjects.length ? html`<div class="subjects">${d.subjects.map(s => html`<div class="subj"><div><b>${s.code}</b><span class="${pctClass(s.percentage, d.threshold)}">${s.percentage ?? '-'}%</span></div>${bar(s.percentage, d.threshold)}<small>${s.name}</small></div>`)}</div>` : html`<div class="empty"><strong>No attendance recorded yet</strong><p>Your attendance will appear once faculty submit classes.</p></div>`}</div>
  <div class="card"><div class="attendance-history-heading"><h3 id="recent-heading">Recent attendance</h3><button type="button" class="btn sm" id="clear-attendance-filter" hidden>Clear filter</button></div><input class="attendance-history-search" id="recent-search" type="search" aria-label="Search recent attendance by date or subject code" placeholder="Search by date or subject code"><div id="recent-records"></div></div>`);
  let activeFilter = null;
  const recentTable = [{ h: 'Date', v: r => fmtDate(r.date) }, { h: 'Subject', v: r => r.subject?.code }, { h: 'Lecture', v: r => r.session?.period ?? r.lectureNo ?? '-' }, { h: 'Status', v: r => statusBadge(r.status) }];
  const drawRecent = () => {
    const search = root.querySelector('#recent-search').value.trim().toLowerCase();
    const records = d.recent.filter(record => {
      if (activeFilter && record.status !== activeFilter) return false;
      if (!search) return true;
      const date = new Date(record.date);
      const isoDate = Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
      return String(record.subject?.code || '').toLowerCase().includes(search)
        || isoDate.includes(search)
        || fmtDate(record.date).toLowerCase().includes(search);
    });
    root.querySelector('#recent-heading').textContent = activeFilter ? `Recent attendance · ${activeFilter}` : 'Recent attendance';
    root.querySelector('#clear-attendance-filter').hidden = !activeFilter;
    root.querySelector('#recent-records').innerHTML = String(table(recentTable, records, search ? 'No recent attendance matches your search.' : activeFilter ? `No ${activeFilter} records in recent attendance.` : 'No recent attendance records.'));
    root.querySelectorAll('.attendance-filter').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.status === activeFilter)));
  };
  root.querySelector('#recent-search').oninput = drawRecent;
  root.querySelectorAll('.attendance-filter').forEach(button => {
    button.onclick = () => {
      activeFilter = activeFilter === button.dataset.status ? null : button.dataset.status;
      drawRecent();
    };
  });
  root.querySelector('#clear-attendance-filter').onclick = () => {
    activeFilter = null;
    drawRecent();
  };
  drawRecent();
}
