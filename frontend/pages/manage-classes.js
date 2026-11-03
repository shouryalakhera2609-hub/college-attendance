import { api } from '../js/api.js';
import { modal, table, toast } from '../js/components.js';
import { html } from '../js/utils.js';
import { parseCsvRows } from '../js/csv.js';

const headerAliases = {
  class_name: 'class_name', class: 'class_name', section: 'class_name', section_name: 'class_name',
  classname: 'class_name', sectionname: 'class_name', section_title: 'class_name',
  class_section: 'class_name', class_section_name: 'class_name', class_or_section: 'class_name',
  name: 'class_name', batch: 'class_name', batch_name: 'class_name', group: 'class_name',
  cohort: 'class_name',
  department: 'department_name', department_name: 'department_name', branch: 'department_name',
  departmentname: 'department_name', branch_name: 'department_name', branchname: 'department_name',
  dept: 'department_name', dept_name: 'department_name', deptname: 'department_name', course: 'department_name',
  department_code: 'department_code', dept_code: 'department_code', branch_code: 'department_code',
  departmentcode: 'department_code', deptcode: 'department_code', branchcode: 'department_code',
  course_code: 'department_code', code: 'department_code',
  semester: 'semester_number', sem: 'semester_number', semester_number: 'semester_number',
  semesternumber: 'semester_number', semester_no: 'semester_number', sem_no: 'semester_number',
  semesterno: 'semester_number', semno: 'semester_number', term: 'semester_number',
  term_number: 'semester_number', termnumber: 'semester_number'
};

const normalizeHeader = value => value.replace(/^\ufeff/, '').trim()
  .replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase()
  .replace(/[^a-z0-9_]+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');

const rowsToClasses = rows => {
  if (!rows.length) return [];
  const headers = rows[0].map(value => normalizeHeader(String(value)));
  const hasHeader = headers.some(header => Object.hasOwn(headerAliases, header));
  const data = hasHeader ? rows.slice(1) : rows;
  const keys = hasHeader
    ? headers.map(header => headerAliases[header] || header)
    : rows[0].map((_, index) => `column_${index + 1}`);
  return data.map((row, index) => ({
    ...Object.fromEntries(keys.map((key, column) => [key, String(row[column] ?? '').trim()])),
    rowNumber: index + (hasHeader ? 2 : 1)
  }));
};

export async function render(root) {
  root.innerHTML = String(html`<section class="class-upload-page">
    <div class="page-head"><div><h2>Manage Classes</h2><p>Upload a CSV file to add classes. Column names and order can vary.</p></div></div>
    <div class="card class-upload-card">
      <div><h3>Upload class list</h3><p>Choose a CSV with class, department, and semester details. If headers are missing, the first column is used as the class name.</p></div>
      <input class="class-upload-input" id="classes-file" type="file" accept=".csv,text/csv">
      <button class="btn primary" id="upload-csv" type="button">Upload CSV</button>
      <p class="class-upload-status" id="classes-status" role="status" hidden></p>
      <div class="login-error" id="classes-error" role="alert" hidden></div>
    </div>
    <section class="class-list-section">
      <h3>Uploaded classes</h3>
      <div id="class-records"></div>
    </section>
  </section>`);

  const input = root.querySelector('#classes-file');
  const uploadButton = root.querySelector('#upload-csv');
  const status = root.querySelector('#classes-status');
  const error = root.querySelector('#classes-error');
  const records = root.querySelector('#class-records');

  const drawClasses = async () => {
    const upload = await api('/admin/classes/upload');
    if (!upload) {
      records.innerHTML = '<div class="empty"><strong>No CSV file uploaded yet</strong></div>';
      return;
    }

    records.innerHTML = String(html`<div class="card class-upload-file">
      <div><h4>${upload.fileName}</h4><p>${upload.legacy ? 'Upload a CSV to set the original file name.' : `${upload.sections.length} classes · Uploaded ${new Date(upload.updatedAt).toLocaleString()}`}</p></div>
      <div class="class-upload-file-actions">
        <button class="btn sm primary" id="edit-upload-file" type="button">Edit</button>
        <button class="btn sm danger" id="delete-upload-file" type="button">Delete</button>
      </div>
    </div>`);
    records.querySelector('#edit-upload-file').onclick = () => drawClassDetails(upload);
    records.querySelector('#delete-upload-file').onclick = async () => {
      if (!confirm(`Delete "${upload.fileName}" and permanently delete all of its classes and related records?`)) return;
      try {
        await api('/admin/classes/upload', { method: 'DELETE' });
        toast('Uploaded file and its class data deleted');
        await drawClasses();
      } catch (e) {
        toast(e.message, 'error');
      }
    };
  };

  const drawClassDetails = upload => {
    const sections = upload.sections.filter(Boolean);
    records.innerHTML = String(html`<div class="page-head class-file-detail-head">
      <div><h3>${upload.fileName}</h3><p>Edit or remove classes in this uploaded file.</p></div>
      <button class="btn" id="back-to-upload-file" type="button">Back to files</button>
    </div>${table([
      { h: 'Class / Section', v: section => section.name },
      { h: 'Department', v: section => section.department ? `${section.department.name}${section.department.code ? ` (${section.department.code})` : ''}` : '-' },
      { h: 'Semester', v: section => section.semester?.name || '-' },
      { h: 'Actions', v: section => html`<button class="btn sm" data-edit-class="${section._id}">Edit</button> <button class="btn sm danger" data-delete-class="${section._id}">Delete</button>` }
    ], sections, 'This file has no classes.')}`);

    records.querySelector('#back-to-upload-file').onclick = drawClasses;
    records.querySelectorAll('[data-edit-class]').forEach(button => {
      button.onclick = () => editClass(sections.find(section => section._id === button.dataset.editClass), async () => {
        const updatedUpload = await api('/admin/classes/upload');
        if (updatedUpload) drawClassDetails(updatedUpload);
        else await drawClasses();
      });
    });
    records.querySelectorAll('[data-delete-class]').forEach(button => {
      button.onclick = async () => {
        if (!confirm('Delete this class and permanently delete its enrollments, faculty assignments, attendance, and correction requests?')) return;
        try {
          await api(`/admin/sections/${button.dataset.deleteClass}`, { method: 'DELETE' });
          toast('Class and related records deleted');
          const updatedUpload = await api('/admin/classes/upload');
          if (updatedUpload) drawClassDetails(updatedUpload);
          else await drawClasses();
        } catch (e) {
          toast(e.message, 'error');
        }
      };
    });
  };

  uploadButton.onclick = () => {
    if (typeof input.showPicker === 'function') input.showPicker();
    else input.click();
  };

  input.onchange = async () => {
    error.hidden = true;
    status.hidden = true;
    if (!input.files?.length) return;

    uploadButton.disabled = true;
    try {
      const file = input.files[0];
      if (!file.name.toLowerCase().endsWith('.csv')) throw new Error('Please select a .csv file.');
      if (file.size > 2 * 1024 * 1024) throw new Error('File must be smaller than 2 MB.');

      const rows = parseCsvRows(await file.text());
      if (!rows.length) throw new Error('The selected file is empty.');

      const classes = rowsToClasses(rows);
      if (classes.length > 500) throw new Error('The file can contain up to 500 class rows.');
      if (!classes.some(row => Object.values(row).some(value => typeof value === 'string' && value.trim()))) {
        throw new Error('The selected file has no data.');
      }
      if (new TextEncoder().encode(JSON.stringify({ classes })).length > 90 * 1024) {
        throw new Error('The selected data is too large to upload. Please split it into smaller files.');
      }

      status.textContent = 'Uploading CSV...';
      status.hidden = false;
      const result = await api('/admin/classes/import', { method: 'POST', body: { fileName: file.name, classes } });
      status.textContent = `${result.imported} new classes added; ${result.existing} rows matched; ${result.removed} old classes and their related records removed.`;
      if (result.errors?.length) {
        error.textContent = result.errors.slice(0, 30).join(' ') + (result.errors.length > 30 ? ` And ${result.errors.length - 30} more.` : '');
        error.hidden = false;
      }
      toast(`${result.imported} classes added; ${result.removed} old classes removed`);
      await drawClasses();
    } catch (e) {
      error.textContent = e.message;
      error.hidden = false;
      status.hidden = true;
    } finally {
      uploadButton.disabled = false;
      input.value = '';
    }
  };

  await drawClasses();
}

async function editClass(section, drawClasses) {
  if (!section) return;
  try {
    const [departments, semesters] = await Promise.all([
      api('/admin/departments'),
      api('/admin/semesters')
    ]);
    const departmentId = section.department?._id || section.department;
    const semesterId = section.semester?._id || section.semester;
    const editor = modal({
      title: 'Edit Class / Section',
      body: html`<form class="form">
        <label>Class / section name<input name="name" maxlength="20" required value="${section.name}"></label>
        <label>Department<select name="department" required><option value="">Select department</option>${departments.map(item => html`<option value="${item._id}" ${item._id === departmentId ? 'selected' : ''}>${item.name} (${item.code})</option>`)}</select></label>
        <label>Semester<select name="semester" required><option value="">Select semester</option>${semesters.map(item => html`<option value="${item._id}" ${item._id === semesterId ? 'selected' : ''}>${item.name}</option>`)}</select></label>
        <div class="login-error" data-edit-error hidden></div>
        <button class="btn primary">Save changes</button>
      </form>`
    });
    editor.el.querySelector('form').onsubmit = async event => {
      event.preventDefault();
      const formData = new FormData(event.currentTarget);
      const saveButton = event.currentTarget.querySelector('button[type="submit"], button:not([type])');
      const error = editor.el.querySelector('[data-edit-error]');
      saveButton.disabled = true;
      error.hidden = true;
      try {
        await api(`/admin/sections/${section._id}`, {
          method: 'PATCH',
          body: {
            name: formData.get('name'),
            department: formData.get('department'),
            semester: formData.get('semester')
          }
        });
        editor.close();
        toast('Class updated');
        await drawClasses();
      } catch (e) {
        error.textContent = e.message;
        error.hidden = false;
        saveButton.disabled = false;
      }
    };
  } catch (e) {
    toast(e.message, 'error');
  }
}
