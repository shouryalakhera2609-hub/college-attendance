import { api } from '../js/api.js';
import { html } from '../js/utils.js';
import { table } from '../js/components.js';
export async function render(root) {
  const a = await api('/faculty/assignments');
  root.innerHTML = String(html`<div class="card">${table([{ h: 'Subject', v: r => `${r.subject.code} · ${r.subject.name}` }, { h: 'Section', v: r => r.section.name }, { h: 'Term', v: r => r.term }], a, 'No subjects assigned yet. Ask an admin to assign subjects.')}</div>`);
}
