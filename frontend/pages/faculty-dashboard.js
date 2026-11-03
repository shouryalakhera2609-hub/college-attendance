import { api } from '../js/api.js';
import { html, fmtDate } from '../js/utils.js';
import { modal, stat, table, statusBadge, toast } from '../js/components.js';
export async function render(root, { user }) {
  const d = await api('/faculty/dashboard');
  root.innerHTML = String(html`<div class="page-head"><h2>Welcome back, ${user.name}</h2><a class="btn primary" href="#/faculty/mark">Mark attendance</a></div>
  <div class="stats">${stat('Subjects', d.subjects)}${stat('Sections', d.sections)}${stat('Sessions recorded', d.sessions, 'good')}${stat('Pending corrections', d.pending, 'warn')}</div>
  <div class="card"><div class="page-head"><h3>My Subjects</h3><button class="btn primary" id="add-subject" type="button">Add your subject</button></div>
  ${d.savedSubjects?.length ? table([{ h: 'Subject code', v: subject => subject.code }, { h: 'Subject name', v: subject => subject.name || '-' }, { h: 'Department', v: subject => subject.department || '-' }], d.savedSubjects) : html`<div class="empty"><strong>No subjects added yet</strong><p>Choose subjects from your college subject list.</p></div>`}</div>
  <div class="card"><h3>Recent sessions</h3>${table([{ h: 'Date', v: r => fmtDate(r.date) }, { h: 'Subject', v: r => r.subject?.code }, { h: 'Section', v: r => r.section?.name }, { h: 'Period', v: r => r.period }, { h: 'Status', v: r => statusBadge(r.status) }], d.recent, 'No sessions yet. Mark your first class.')}</div>`);
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
