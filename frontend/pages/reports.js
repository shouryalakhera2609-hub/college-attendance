import { api } from '../js/api.js';
import { html, qs } from '../js/utils.js';
import { table, badge, download, toast, pctClass } from '../js/components.js';
export async function render(root) {
  const { subjects } = await api('/reports/filters'); let f = {};
  const draw = async () => {
    const d = await api('/reports/attendance?' + qs(f));
    root.querySelector('#res').innerHTML = String(html`<div class="card">${table([{ h: 'Student', v: r => r.student }, { h: 'Roll No', v: r => r.rollNo }, { h: 'Subject', v: r => r.subject }, { h: 'Present', v: r => r.present }, { h: 'Absent', v: r => r.absent }, { h: 'Excused', v: r => r.excused }, { h: '%', v: r => html`<span class="${pctClass(r.percentage, d.threshold)}">${r.percentage ?? '-'}</span>` }, { h: 'Flag', v: r => r.low ? badge('Low', 'bad') : '' }], d.rows, 'No records match these filters')}</div>`);
  };
  root.innerHTML = String(html`<form class="card filters" id="ff"><label>From<input type="date" name="from"></label><label>To<input type="date" name="to"></label><label>Subject<select name="subject"><option value="">All</option>${subjects.map(s => html`<option value="${s._id}">${s.code}</option>`)}</select></label><label>Status<select name="status"><option value="">All</option><option>present</option><option>absent</option><option>excused</option></select></label><label class="chk"><input type="checkbox" name="low" value="1"> Low attendance only</label><button class="btn primary">Generate</button><button type="button" class="btn" id="csv">Export CSV</button></form><div id="res"></div>`);
  const get = () => Object.fromEntries([...new FormData(root.querySelector('#ff'))].filter(([, v]) => v));
  root.querySelector('#ff').onsubmit = e => { e.preventDefault(); f = get(); draw(); };
  root.querySelector('#csv').onclick = async () => { try { download(await api('/reports/attendance/export.csv?' + qs(get())), 'attendance-report.csv'); } catch (e) { toast(e.message, 'error'); } };
  draw();
}
