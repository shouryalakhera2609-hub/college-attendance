import { api } from '../js/api.js';
import { html, fmtDate } from '../js/utils.js';
import { modal, table, toast } from '../js/components.js';
export async function render(root, { user }) {
  const d = await api('/faculty/dashboard');
  root.innerHTML = String(html`<div class="card"><div class="page-head"><h3>My Subjects</h3><button class="btn primary" id="add-subject" type="button">Add your subject</button></div>
  ${d.savedSubjects?.length ? table([{ h: 'Subject code', v: subject => html`<a href="#/faculty/subject?subject=${encodeURIComponent(subject.catalogId)}">${subject.code}</a>` }, { h: 'Subject name', v: subject => subject.name || '-' }, { h: 'Department', v: subject => subject.department || '-' }, { h: 'Total days', v: subject => subject.totalDays || 0 }, { h: 'Average attendance', v: subject => subject.averagePresent ? `${subject.averagePresent.percentage}%` : '-' }], d.savedSubjects) : html`<div class="empty"><strong>No subjects added yet</strong><p>Choose subjects from your college subject list.</p></div>`}</div>
  <div class="card"><h3>Recent attendance</h3><input class="attendance-history-search" id="recent-attendance-search" type="search" aria-label="Search recent attendance by date or subject code" placeholder="Search by date or subject code"><div id="recent-attendance"></div></div>`);
  const recentColumns = [
    { h: 'Date', v: record => fmtDate(record.date) },
    { h: 'Subject', v: record => record.subject?.code },
    { h: 'Section', v: record => record.section?.name || '-' },
    { h: 'Lecture', v: record => record.lecture || '-' },
    { h: 'Present / Total', v: record => `${record.presentCount}/${record.totalCount}` }
  ];
  let recentExpiryTimer;
  const drawRecentAttendance = () => {
    const container = root.querySelector('#recent-attendance');
    if (!container) return;
    clearTimeout(recentExpiryTimer);
    const cutoff = Date.now() - 12 * 60 * 60 * 1000;
    const search = root.querySelector('#recent-attendance-search').value.trim().toLowerCase();
    const recent = d.recent.filter(record => {
      if (new Date(record.recordedAt).getTime() <= cutoff) return false;
      if (!search) return true;
      const date = new Date(record.date);
      const isoDate = Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
      return String(record.subject?.code || '').toLowerCase().includes(search)
        || isoDate.includes(search)
        || fmtDate(record.date).toLowerCase().includes(search);
    });
    container.innerHTML = String(table(
      recentColumns,
      recent,
      search ? 'No recent attendance matches your search.' : 'No attendance recorded in the last 12 hours.'
    ));
    const nextExpiry = Math.min(...d.recent
      .filter(record => new Date(record.recordedAt).getTime() > cutoff)
      .map(record => new Date(record.recordedAt).getTime() + 12 * 60 * 60 * 1000));
    if (Number.isFinite(nextExpiry)) recentExpiryTimer = setTimeout(drawRecentAttendance, Math.max(1, nextExpiry - Date.now() + 1));
  };
  root.querySelector('#recent-attendance-search').oninput = drawRecentAttendance;
  drawRecentAttendance();
  root.querySelector('#add-subject').onclick = async () => {
    try {
      const catalog = await api('/faculty/subject-catalog');
      const selected = new Set((d.savedSubjects || []).map(subject => subject.catalogId));
      const m = modal({ title: 'Add your subject', body: html`<div class="form">
        <label>Search by subject name or code<input id="subject-search" type="search" placeholder="Search subjects"></label>
        <div id="subject-options">${catalog.length ? catalog.map(subject => html`<button class="subject-option" type="button" data-subject="${subject.id}" aria-pressed="${selected.has(subject.id)}"><span class="subject-option-main"><span class="subject-check" aria-hidden="true">${selected.has(subject.id) ? '✓' : ''}</span><span>${subject.code}${subject.name ? ` · ${subject.name}` : ''}</span></span><small>${subject.department || ''}${subject.semester ? ` · Semester ${subject.semester}` : ''}</small></button>`) : html`<div class="empty"><strong>No subjects found</strong><p>Your college has no subjects in its subject list yet.</p></div>`}</div>
        <button class="btn primary" id="save-subjects" type="button">Save subjects</button>
      </div>` });
      m.el.querySelectorAll('.subject-option').forEach(option => {
        option.onclick = () => {
          const isSelected = option.getAttribute('aria-pressed') === 'true';
          option.setAttribute('aria-pressed', String(!isSelected));
          option.querySelector('.subject-check').textContent = isSelected ? '' : '✓';
        };
      });
      m.el.querySelector('#subject-search').oninput = event => {
        const query = event.target.value.trim().toLowerCase();
        m.el.querySelectorAll('.subject-option').forEach(option => {
          option.hidden = !option.textContent.toLowerCase().includes(query);
        });
      };
      m.el.querySelector('#save-subjects').onclick = async event => {
        const button = event.currentTarget;
        button.disabled = true;
        try {
          const subjects = [...m.el.querySelectorAll('.subject-option[aria-pressed="true"]')].map(option => option.dataset.subject);
          if (!subjects.length) {
            toast('Select at least one subject before saving.', 'error');
            button.disabled = false;
            return;
          }
          await api('/faculty/my-subjects', { method: 'PUT', body: { subjects } });
          m.close();
          toast('Subjects saved');
          await render(root, { user });
        } catch (error) {
          toast(error.message, 'error');
          button.disabled = false;
        }
      };
    } catch (error) {
      toast(error.message, 'error');
    }
  };
}
