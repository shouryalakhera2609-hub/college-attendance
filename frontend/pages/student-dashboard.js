import { api } from '../js/api.js';
import { html, fmtDate } from '../js/utils.js';
import { ring, bar, stat, table, statusBadge, pctClass } from '../js/components.js';
export async function render(root, { user }) {
  const d = await api('/student/dashboard'), o = d.overall, low = d.subjects.filter(s => s.low);
  root.innerHTML = String(html`<h2>Hello, ${user.name.split(' ')[0]}</h2>
  ${low.map(s => html`<div class="alert bad">${s.code} is at ${s.percentage}%, below the ${d.threshold}% minimum.</div>`)}
  <div class="grid hero"><div class="card center">${ring(o.percentage)}<small>${o.present} / ${o.total} classes attended</small></div>
  <div class="stats">${stat('Present', o.present, 'good')}${stat('Absent', o.absent, 'bad')}${stat('Total classes', o.total)}${stat('Minimum required', d.threshold + '%')}</div></div>
  <div class="card"><h3>Subjects for your branch and semester</h3>${d.uploadedSubjects?.length ? table([
    { h: 'Subject code', v: subject => subject.code },
    { h: 'Subject name', v: subject => subject.name || '-' }
  ], d.uploadedSubjects) : html`<div class="empty"><strong>No matching subject list found</strong><p>Subjects uploaded by any HOD on your campus will appear here when the branch and semester match.</p></div>`}</div>
  <div class="card"><h3>Subject-wise attendance</h3>${d.subjects.length ? html`<div class="subjects">${d.subjects.map(s => html`<div class="subj"><div><b>${s.code}</b><span class="${pctClass(s.percentage, d.threshold)}">${s.percentage ?? '-'}%</span></div>${bar(s.percentage, d.threshold)}<small>${s.name}</small></div>`)}</div>` : html`<div class="empty"><strong>No attendance recorded yet</strong><p>Your attendance will appear once faculty submit classes.</p></div>`}</div>
  <div class="card"><h3>Recent attendance</h3>${table([{ h: 'Date', v: r => fmtDate(r.date) }, { h: 'Subject', v: r => r.subject?.code }, { h: 'Period', v: r => r.session?.period }, { h: 'Status', v: r => statusBadge(r.status) }], d.recent)}</div>`);
}
