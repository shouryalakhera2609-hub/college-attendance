import { api, apiFile, apiDownload } from '../js/api.js';
import { html, fmtDate } from '../js/utils.js';
import { modal, stat, bar, table, toast, pctClass, download } from '../js/components.js';
import { go } from '../js/router.js';

const fileTypes = ['.csv', '.xls', '.xlsx'];
const maxFileSize = 2 * 1024 * 1024;
const fileSize = size => size < 1024 * 1024 ? `${(size / 1024).toFixed(1)} KB` : `${(size / (1024 * 1024)).toFixed(1)} MB`;

export async function render(root) {
  const draw = async () => {
    const [d, files] = await Promise.all([api('/hod/dashboard'), api('/hod/files')]);
    root.innerHTML = String(html`<div class="stats">${stat('Department attendance', (d.overall.percentage ?? '-') + '%', pctClass(d.overall.percentage, d.threshold))}${stat('Students', d.students)}${stat('Faculty', d.faculty)}${stat('Below ' + d.threshold + '%', d.lowStudents, 'bad')}${stat('Pending corrections', d.pending, 'warn')}</div>
    <div class="card"><h3>Student Details</h3><p>View students in your department and upload student details from a CSV file.</p><button class="btn primary" id="hod-students-link">Manage Student Details</button></div>
    <div class="card"><h3>CSV/Excel Files</h3><p>Upload and keep any CSV or Excel file for your department. Files are stored as-is and won't change subjects.</p><button class="btn primary" id="hod-file-upload">Upload File</button>
      ${files.length ? files.map(file => html`<div class="card hod-file-row"><div><h4>${file.fileName}</h4><p>${fileSize(file.size)} · Uploaded ${new Date(file.createdAt).toLocaleString()}</p></div><div class="hod-file-actions"><button class="btn sm primary" data-open-file="${file._id}" type="button">Open</button><button class="btn sm" data-edit-file="${file._id}" type="button">Edit</button><button class="btn sm danger" data-delete-file="${file._id}" type="button">Delete</button></div></div>`) : html`<div class="empty"><strong>No files uploaded yet</strong></div>`}
      <div id="hod-file-details"></div>
    </div>
    <div class="grid two"><div class="card"><h3>Subject-wise attendance</h3>${d.subjects.length ? d.subjects.map(s => html`<div class="subj"><div><b>${s.code}</b><span class="${pctClass(s.percentage, d.threshold)}">${s.percentage ?? '-'}%</span></div>${bar(s.percentage, d.threshold)}</div>`) : html`<div class="empty"><strong>No data yet</strong></div>`}</div>
    <div class="card"><h3>Recent sessions</h3>${table([{ h: 'Date', v: r => fmtDate(r.date) }, { h: 'Subject', v: r => r.subject?.code }, { h: 'Faculty', v: r => r.faculty?.name }], d.recent)}<p><a href="#/corrections">Review correction requests</a></p></div></div>`);
    root.querySelector('#hod-students-link').onclick = () => go('/hod/students');
    root.querySelector('#hod-file-upload').onclick = () => openFileUpload(draw);
    root.querySelectorAll('[data-open-file]').forEach(button => {
      button.onclick = () => drawFileDetails(files.find(file => file._id === button.dataset.openFile), false);
    });
    root.querySelectorAll('[data-edit-file]').forEach(button => {
      button.onclick = () => drawFileDetails(files.find(file => file._id === button.dataset.editFile), true);
    });
    root.querySelectorAll('[data-delete-file]').forEach(button => {
      button.onclick = async () => {
        const file = files.find(item => item._id === button.dataset.deleteFile);
        if (!confirm(`Delete "${file.fileName}"?`)) return;
        try {
          await api(`/hod/files/${button.dataset.deleteFile}`, { method: 'DELETE' });
          toast('File deleted');
          await draw();
        } catch (error) { toast(error.message, 'error'); }
      };
    });
  };
  await draw();
}

async function drawFileDetails(file, editMode) {
  const details = document.querySelector('#hod-file-details');
  if (!details || !file) return;
  details.innerHTML = '<div class="empty"><strong>Opening file...</strong></div>';
  try {
    const preview = await api(`/hod/files/${file._id}/preview`);
    const rows = preview.rows.map((cells, rowIndex) => ({ cells, rowIndex }));
    const columnCount = Math.max(0, ...preview.rows.map(row => row.length));
    details.innerHTML = String(html`<div class="page-head class-file-detail-head">
      <div><h4>${file.fileName}</h4><p>${preview.totalRows} rows${preview.truncated ? ' · Showing the first 500 rows' : ''}${editMode ? ' · Edit or delete individual rows. Excel edits save the first sheet as a plain table.' : ' · Preview'}</p></div>
      <div class="hod-file-actions"><button class="btn" id="download-hod-file" type="button">Download</button><button class="btn" id="close-hod-file-details" type="button">Close</button></div>
    </div>${table([
      ...Array.from({ length: columnCount }, (_, index) => ({ h: `Column ${index + 1}`, v: row => row.cells[index] ?? '' })),
      ...(editMode ? [{ h: 'Actions', v: row => html`<button class="btn sm" data-edit-file-row="${row.rowIndex}">Edit row</button> <button class="btn sm danger" data-delete-file-row="${row.rowIndex}">Delete row</button>` }] : [])
    ], rows, 'This file has no rows.')}` + (preview.truncated ? '<p class="muted">Only the first 500 rows are shown here. Download the file to access the remaining rows.</p>' : ''));
    details.querySelector('#close-hod-file-details').onclick = () => details.replaceChildren();
    details.querySelector('#download-hod-file').onclick = async () => {
      try { download(await apiDownload(`/hod/files/${file._id}`), file.fileName); }
      catch (error) { toast(error.message, 'error'); }
    };
    details.querySelectorAll('[data-edit-file-row]').forEach(button => {
      button.onclick = () => editFileRow(file, Number(button.dataset.editFileRow), rows[Number(button.dataset.editFileRow)].cells, columnCount, () => drawFileDetails(file, true));
    });
    details.querySelectorAll('[data-delete-file-row]').forEach(button => {
      button.onclick = async () => {
        const rowIndex = Number(button.dataset.deleteFileRow);
        if (!confirm(`Delete row ${rowIndex + 1} from "${file.fileName}"?`)) return;
        try {
          await api(`/hod/files/${file._id}/rows/${rowIndex}`, { method: 'DELETE' });
          toast('Row deleted');
          await drawFileDetails(file, true);
        } catch (error) { toast(error.message, 'error'); }
      };
    });
  } catch (error) {
    details.innerHTML = String(html`<div class="login-error">${error.message}</div>`);
    toast(error.message, 'error');
  }
}

function editFileRow(file, rowIndex, cells, columnCount, refresh) {
  const rowCells = Array.from({ length: columnCount }, (_, index) => cells[index] ?? '');
  const m = modal({ title: `Edit Row ${rowIndex + 1}`, body: html`<form class="form">
    ${rowCells.map((value, index) => html`<label>Column ${index + 1}<input name="cell-${index}" maxlength="10000" value="${value}"></label>`)}
    <button class="btn primary">Save row</button>
  </form>` });
  m.el.querySelector('form').onsubmit = async event => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const updatedCells = rowCells.map((_, index) => String(formData.get(`cell-${index}`) || ''));
    const payload = new Blob([JSON.stringify({ cells: updatedCells })], { type: 'application/octet-stream' });
    try {
      await apiFile(`/hod/files/${file._id}/rows/${rowIndex}`, payload, { method: 'PUT' });
      m.close();
      toast('Row updated');
      await refresh();
    } catch (error) { toast(error.message, 'error'); }
  };
}

function openFileUpload(draw) {
  const m = modal({ title: 'Upload CSV/Excel File', body: html`<div class="csv-upload-form">
    <p>Choose any .csv or Excel .xls/.xlsx file. It will be stored as-is and will not be imported as a subject list.</p>
    <input class="file-input" id="hod-file-input" type="file" accept=".csv,.xls,.xlsx,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet">
    <button type="button" class="btn file-picker-button" id="choose-hod-file">Choose File</button>
    <span id="hod-file-name" class="file-name">No file selected</span>
    <div class="login-error" id="hod-file-error" hidden></div>
    <button type="button" class="btn primary" id="upload-hod-file" disabled>Upload File</button>
  </div>` });
  const input = m.el.querySelector('#hod-file-input');
  const fileName = m.el.querySelector('#hod-file-name');
  const error = m.el.querySelector('#hod-file-error');
  const button = m.el.querySelector('#upload-hod-file');

  m.el.querySelector('#choose-hod-file').onclick = () => {
    if (typeof input.showPicker === 'function') input.showPicker();
    else input.click();
  };
  input.onchange = () => {
    const file = input.files?.[0];
    fileName.textContent = file?.name || 'No file selected';
    const extension = file?.name.slice(file.name.lastIndexOf('.')).toLowerCase();
    const problem = !file ? '' : !fileTypes.includes(extension)
      ? 'Please select a .csv or Excel .xls/.xlsx file.'
      : file.size > maxFileSize ? 'File must be 2 MB or smaller.' : '';
    error.textContent = problem;
    error.hidden = !problem;
    button.disabled = !file || Boolean(problem);
  };
  button.onclick = async () => {
    const file = input.files?.[0];
    if (!file || button.disabled) return;
    button.disabled = true;
    button.textContent = 'Uploading...';
    error.hidden = true;
    try {
      await apiFile(`/hod/files?fileName=${encodeURIComponent(file.name)}`, file);
      m.close();
      toast('File uploaded');
      await draw();
    } catch (uploadError) {
      error.textContent = uploadError.message;
      error.hidden = false;
      toast(uploadError.message, 'error');
      button.disabled = false;
      button.textContent = 'Upload File';
    }
  };
}
