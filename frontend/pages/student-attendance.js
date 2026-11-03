import { api } from '../js/api.js';
import { html } from '../js/utils.js';
import { bar, table, pctClass, badge } from '../js/components.js';
export async function render(root) {
  const d = await api('/student/attendance');
  root.innerHTML = String(html`<p class="muted">Minimum required attendance: <b>${d.threshold}%</b>. Excused classes are not counted; cancelled sessions are never counted as absences.</p><div class="card">${table([{ h: 'Subject', v: s => `${s.code} · ${s.name}` }, { h: 'Present', v: s => s.present }, { h: 'Absent', v: s => s.absent }, { h: 'Total', v: s => s.total }, { h: 'Attendance', v: s => html`<div class="inline"><span class="${pctClass(s.percentage, d.threshold)}">${s.percentage ?? '-'}%</span>${bar(s.percentage, d.threshold)}</div>` }, { h: 'Status', v: s => s.low ? badge('Below minimum', 'bad') : badge('OK', 'good') }], d.subjects, 'No attendance recorded yet')}</div>`);
}
