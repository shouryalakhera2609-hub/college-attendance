import { api } from '../js/api.js';
import { crudPage, download, modal, toast } from '../js/components.js';
import { html } from '../js/utils.js';

const parseCsv = text => {
  const rows = [], row = [];
  let cells = [], value = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"' && quoted && text[i + 1] === '"') { value += '"'; i++; }
    else if (char === '"') quoted = !quoted;
    else if (char === ',' && !quoted) { cells.push(value.trim()); value = ''; }
    else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && text[i + 1] === '\n') i++;
      cells.push(value.trim()); if (cells.some(Boolean)) rows.push(cells); cells = []; value = '';
    } else value += char;
  }
  cells.push(value.trim()); if (cells.some(Boolean)) rows.push(cells);
  if (!rows.length) return [];
  const headers = rows.shift().map(v => v.replace(/^\ufeff/, '').trim().toLowerCase());
  return rows.map(cells => Object.fromEntries(headers.map((header, index) => [header, cells[index]?.trim() || ''])));
};

export const render = async root => {
  root.innerHTML = '<div class="student-toolbar"><button class="btn primary" id="upload-csv">Upload Student CSV</button><button class="btn" id="download-template">Download CSV Template</button></div><div id="student-crud"></div>';
  root.querySelector('#download-template').onclick = () => download(new Blob(['name,email,instId,rollNo,department,password\n'], { type: 'text/csv' }), 'student-template.csv');
  root.querySelector('#upload-csv').onclick = () => {
    const m = modal({ title: 'Upload Student CSV', body: html`<div class="csv-upload-form"><p>Select a CSV containing <b>name, email, instId, rollNo, department, password</b> columns.</p><input class="file-input" id="student-csv" type="file" accept=".csv,text/csv"><button type="button" class="btn file-picker-button" id="choose-student-csv">Choose CSV File</button><span id="student-file-name" class="file-name">No file selected</span><pre id="student-csv-preview" class="csv-preview" hidden></pre><div class="login-error" id="csv-error" hidden></div><button class="btn primary" id="import-csv" disabled>Import Students</button></div>` });
    const fileInput = m.el.querySelector('#student-csv'), fileName = m.el.querySelector('#student-file-name'), preview = m.el.querySelector('#student-csv-preview'), importButton = m.el.querySelector('#import-csv'), error = m.el.querySelector('#csv-error');
    let parsed = [];
    m.el.querySelector('#choose-student-csv').onclick = () => {
      if (typeof fileInput.showPicker === 'function') fileInput.showPicker();
      else fileInput.click();
    };
    fileInput.onchange = async () => {
      error.hidden = true;
      if (!fileInput.files?.length) { parsed = []; fileName.textContent = 'No file selected'; preview.hidden = true; importButton.disabled = true; return; }
      try { fileName.textContent = fileInput.files[0].name; if (!fileInput.files[0].name.toLowerCase().endsWith('.csv')) throw new Error('Please select a .csv file.'); const text = await fileInput.files[0].text(); parsed = parseCsv(text); preview.textContent = text.split(/\r?\n/).filter(Boolean).slice(0, 6).join('\n'); preview.hidden = false; importButton.disabled = parsed.length === 0; if (!parsed.length) throw new Error('The CSV file is empty.'); }
      catch (e) { error.textContent = e.message; error.hidden = false; parsed = []; importButton.disabled = true; }
    };
    importButton.onclick = async () => {
      importButton.disabled = true;
      try {
        const result = await api('/admin/students/import', { method: 'POST', body: { students: parsed } });
        toast(`${result.imported} students imported; ${result.skipped} skipped`);
        m.close(); await crud();
      } catch (e) { error.textContent = e.message; error.hidden = false; importButton.disabled = false; }
    };
  };
  const crud = async () => await crudPage(root.querySelector('#student-crud'), { title: 'Student Details', path: 'users', del: 'Deactivate', filter: u => u.role === 'student', fixed: { role: 'student' }, columns: [{ h: 'Roll no.', v: r => r.rollNo || '-' }, { h: 'Name', v: r => r.name }, { h: 'Email', v: r => r.email }, { h: 'Department', v: r => r.department?.name || '-' }, { h: 'Status', v: r => r.active ? 'Active' : 'Inactive' }], fields: [{ k: 'name', label: 'Name', req: 1 }, { k: 'email', label: 'Email', type: 'email', req: 1 }, { k: 'instId', label: 'Institution ID' }, { k: 'rollNo', label: 'Roll no.' }, { k: 'department', label: 'Department', from: 'departments' }, { k: 'password', label: 'Password (min 10)', type: 'password' }] });
  await crud();
};
