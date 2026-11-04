import { api } from '../js/api.js';
import { html, fmtDate } from '../js/utils.js';
import { toast, statusBadge } from '../js/components.js';
const localDate = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
export async function render(root) {
  const as = await api('/faculty/assignments');
  if (!as.length) { root.innerHTML = String(html`<div class="empty card"><strong>No assigned classes</strong><p>An admin must assign you a subject and section first.</p></div>`); return; }
  const today = localDate(new Date());
  root.innerHTML = String(html`<form class="card filters" id="ff"><label>Subject & section<select name="a">${as.map((x, i) => html`<option value="${i}">${x.subject.code} · ${x.subject.name} — ${x.section.name} (${x.term})</option>`)}</select></label><label>Date<input type="date" name="date" value="${today}" max="${today}" required></label><label>Lecture no.<select name="period" required><option value="" selected disabled>Select lecture</option>${[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(p => html`<option value="${p}">${p}</option>`)}</select></label><button class="btn primary">Load students</button></form><div id="list"></div>`);
  root.querySelector('#ff').onsubmit = async e => {
    e.preventDefault(); const fd = new FormData(e.target), a = as[fd.get('a')];
    if (fd.get('date') > localDate(new Date())) {
      toast('Future dates are not allowed for attendance.', 'error');
      return;
    }
    try {
      const { session, students } = await api('/attendance/sessions', { method: 'POST', body: { subject: a.subject._id, section: a.section._id, term: a.term, date: fd.get('date'), timezoneOffsetMinutes: new Date().getTimezoneOffset(), period: Number(fd.get('period')) } });
      sheet(session, students, a, fd.get('date'));
    } catch (er) { toast(er.message, 'error'); }
  };
  function sheet(session, students, a, date) {
    const st = Object.fromEntries(students.map(s => [s._id, 'present'])), L = root.querySelector('#list');
    const draw = () => {
      const p = Object.values(st).filter(v => v === 'present').length;
      L.innerHTML = String(html`<div class="card"><div class="page-head"><h3>${a.subject.code} · Section ${a.section.name} · ${fmtDate(date)}</h3><div><button class="btn sm good" id="ap">Mark all present</button> <button class="btn sm danger" id="aa">Mark all absent</button></div></div>
      ${students.length ? html`<div class="rows">${students.map(s => html`<div class="row"><span><b>${s.rollNo || ''}</b> ${s.name}</span><span class="seg"><button type="button" data-id="${s._id}" data-v="present" class="${st[s._id] === 'present' ? 'on good' : ''}">Present</button><button type="button" data-id="${s._id}" data-v="absent" class="${st[s._id] === 'absent' ? 'on bad' : ''}">Absent</button></span></div>`)}</div>` : html`<div class="empty"><strong>No students enrolled in this section</strong></div>`}
      <div class="sum">Present <b>${p}</b> · Absent <b>${students.length - p}</b> · Total <b>${students.length}</b></div><button class="btn primary block" id="sub" ${students.length ? '' : 'disabled'}>Submit attendance</button></div>`);
      L.querySelector('#ap').onclick = () => { for (const k in st) st[k] = 'present'; draw(); }; L.querySelector('#aa').onclick = () => { for (const k in st) st[k] = 'absent'; draw(); };
      L.querySelectorAll('[data-id]').forEach(b => b.onclick = () => { st[b.dataset.id] = b.dataset.v; draw(); });
      L.querySelector('#sub').onclick = async ev => {
        if (!confirm('Submit attendance? Later changes need an approved correction request.')) return; ev.target.disabled = true;
        try { await api(`/attendance/sessions/${session._id}/records`, { method: 'POST', body: { records: Object.entries(st).map(([student, status]) => ({ student, status })) } }); toast('Attendance saved'); L.innerHTML = String(html`<div class="alert good">Attendance submitted ${statusBadge('submitted')}</div>`); }
        catch (er) { toast(er.message, 'error'); ev.target.disabled = false; }
      };
    };
    draw();
  }
}
