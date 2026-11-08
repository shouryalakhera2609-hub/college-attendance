import { api, apiFile } from '../js/api.js';
import { download, modal, toast } from '../js/components.js';
import { html } from '../js/utils.js';
import { parseCsvRows } from '../js/csv.js';

export async function render(root) {
  const draw = async () => {
    root.innerHTML = String(html`<div class="page-head"><div><h2>Student Details</h2><p>View and manage the student list from the Department students count on the dashboard. Import student records from CSV here.</p></div><div class="student-toolbar"><button class="btn" id="download-template">Download CSV Template</button><button class="btn primary" id="upload-csv">Upload Student CSV</button></div></div>`);
    root.querySelector('#download-template').onclick = () => download(
      new Blob(['name,email,rollNo,branch,password\n'], { type: 'text/csv' }),
      'hod-students-template.csv'
    );
    root.querySelector('#upload-csv').onclick = () => openImport(draw);
  };
  await draw();
}

const openImport = draw => {
  const m = modal({ title: 'Upload Student CSV', body: html`<div class="csv-upload-form"><p>Include a name, email, and password with at least 10 characters. Roll number and branch are optional.</p><input class="file-input" id="hod-students-csv" type="file" accept=".csv,text/csv"><button type="button" class="btn file-picker-button" id="choose-hod-students-csv">Choose CSV File</button><span id="hod-students-file-name" class="file-name">No file selected</span><pre id="hod-students-preview" class="csv-preview" hidden></pre><div class="login-error" id="hod-students-error" hidden></div><button class="btn primary" id="import-hod-students" disabled>Import Students</button></div>` });
  const input = m.el.querySelector('#hod-students-csv');
  const fileName = m.el.querySelector('#hod-students-file-name');
  const preview = m.el.querySelector('#hod-students-preview');
  const button = m.el.querySelector('#import-hod-students');
  const error = m.el.querySelector('#hod-students-error');
  let parsed = [];
  let selectedFile = null;
  let storedFileId = null;

  m.el.querySelector('#choose-hod-students-csv').onclick = () => {
    if (typeof input.showPicker === 'function') input.showPicker();
    else input.click();
  };
  input.onchange = async () => {
    error.hidden = true;
    if (!input.files?.length) {
      parsed = [];
      selectedFile = null;
      storedFileId = null;
      fileName.textContent = 'No file selected';
      preview.hidden = true;
      button.disabled = true;
      return;
    }
    try {
      const file = input.files[0];
      if (!file.name.toLowerCase().endsWith('.csv')) throw new Error('Please select a .csv file.');
      const text = await file.text();
      const rows = parseCsvRows(text);
      const headers = rows.shift()?.map(header => header.replace(/^\ufeff/, '').trim().toLowerCase().replace(/[\s-]+/g, '_')) || [];
      parsed = rows.map(row => Object.fromEntries(headers.map((header, index) => [header, row[index]?.trim() || ''])));
      if (!parsed.length) throw new Error('The CSV file is empty.');
      selectedFile = file;
      storedFileId = null;
      fileName.textContent = file.name;
      preview.textContent = text.split(/\r?\n/).filter(Boolean).slice(0, 6).join('\n');
      preview.hidden = false;
      button.disabled = false;
    } catch (e) {
      parsed = [];
      button.disabled = true;
      error.textContent = e.message;
      error.hidden = false;
    }
  };
  button.onclick = async () => {
    button.disabled = true;
    try {
      if (!storedFileId) {
        const storedFile = await apiFile(`/hod/files?fileName=${encodeURIComponent(selectedFile.name)}&kind=student-list`, selectedFile);
        storedFileId = storedFile._id;
      }
      const result = await api('/hod/students/import', { method: 'POST', body: { students: parsed } });
      toast(`${result.imported} students imported; ${result.skipped} skipped`);
      if (result.errors.length) {
        error.textContent = result.errors.join(' ');
        error.hidden = false;
      } else {
        m.close();
      }
      await draw();
    } catch (e) {
      error.textContent = storedFileId
        ? `${e.message} The uploaded CSV is saved under Files on the HOD dashboard; deleting it will not delete student records.`
        : e.message;
      error.hidden = false;
      button.disabled = false;
    }
  };
};
