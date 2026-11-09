import { api } from '../js/api.js';
import { html } from '../js/utils.js';
import { toast } from '../js/components.js';

const campuses = ['BIRT', 'BIRTS', 'BIST'];
const attendanceSections = ['Birt', 'Birts'];
const idOf = value => value?._id || value || '';

export async function render(root, { user }) {
  let profile = await api('/profile');
  const canEdit = ['student', 'faculty', 'hod'].includes(user.role);

  const draw = () => {
    const idLabel = profile.role === 'student' ? 'Institution ID' : 'Employee ID';
    const rows = [
      ['Name', profile.name],
      ['Email', profile.email],
      [idLabel, profile.instId],
      ['Role', profile.role],
      ['College', profile.campus],
      ['Branch', profile.branch],
      ['Department', profile.department?.name],
      ['Roll no.', profile.rollNo],
      ['Phone', profile.phone],
      ['Semester', profile.semester?.name],
      ['Section', profile.section?.name]
    ].filter(row => row[1]);
    root.innerHTML = String(html`<div class="card profile">
      <div class="page-head"><div><h2>Profile</h2><p>Account details</p></div>${canEdit ? html`<button class="btn primary" id="edit-profile">Edit profile</button>` : ''}</div>
      <span class="avatar big">${profile.name?.[0] || '?'}</span>
      <dl>${rows.map(([key, value]) => html`<dt>${key}</dt><dd>${value}</dd>`)}</dl>
      ${canEdit ? html`<p>Email and password cannot be changed here.</p>` : ''}
    </div>`);
    root.querySelector('#edit-profile')?.addEventListener('click', openEditor);
  };

  const openEditor = async () => {
    const student = profile.role === 'student';
    const section = profile.section;
    root.innerHTML = String(html`<div class="card profile">
      <div class="page-head"><div><h2>Edit profile</h2><p>Email and password are not editable.</p></div></div>
      <form class="form" id="profile-form" novalidate>
        <label>Full name<input name="name" maxlength="100" required value="${profile.name || ''}"></label>
        <label>${student ? 'Institution ID' : 'Employee ID'}<input name="instId" maxlength="30" ${student ? '' : 'required'} value="${profile.instId || ''}"></label>
        ${student ? html`<label>Roll number<input name="rollNo" maxlength="30" required value="${profile.rollNo || ''}"></label>` : ''}
        <label>Phone number (10 digits)<input name="phone" type="tel" inputmode="numeric" pattern="[0-9]{10}" minlength="10" maxlength="10" value="${profile.phone || ''}"></label>
        <label>College<select name="campus" id="profile-campus" required><option value="">Select a college</option>${campuses.map(campus => html`<option value="${campus}" ${profile.campus === campus ? 'selected' : ''}>${campus}</option>`)}</select></label>
        <label>Department<select name="department" id="profile-department" required disabled><option value="">Loading departments…</option></select></label>
        ${student ? html`
          <label>Branch<select name="branch" id="profile-branch" required disabled><option value="">Select department first</option></select></label>
          <div id="profile-attendance-wrap"><label>Attendance section<select name="attendanceSection" id="profile-attendance-section"><option value="">Select attendance section</option>${attendanceSections.map(value => html`<option value="${value}" ${profile.attendanceSection === value ? 'selected' : ''}>${value}</option>`)}</select></label></div>
          <label>Semester<select name="semester" id="profile-semester" required disabled><option value="">Loading semesters…</option></select></label>
          <label>Class / Section<select name="section" id="profile-section" required disabled><option value="">Select department, branch, and semester first</option></select></label>
        ` : ''}
        <div id="profile-error" class="login-error" role="alert" hidden></div>
        <div class="page-head"><button class="btn primary" id="save-profile">Save changes</button><button class="btn" type="button" id="cancel-profile">Cancel</button></div>
      </form>
    </div>`);

    const form = root.querySelector('#profile-form');
    const error = root.querySelector('#profile-error');
    const campusSelect = root.querySelector('#profile-campus');
    const departmentSelect = root.querySelector('#profile-department');
    const branchSelect = root.querySelector('#profile-branch');
    const semesterSelect = root.querySelector('#profile-semester');
    const sectionSelect = root.querySelector('#profile-section');
    const attendanceSelect = root.querySelector('#profile-attendance-section');
    const attendanceWrap = root.querySelector('#profile-attendance-wrap');
    const saveButton = root.querySelector('#save-profile');
    let branchRequest = 0;
    let classRequest = 0;
    let optionsRequest = 0;
    let lookupsReady = false;

    const setOptions = (select, placeholder, options, selected = '') => {
      select.replaceChildren(new Option(placeholder, ''));
      options.forEach(option => select.add(new Option(option.label, option.value)));
      select.value = selected;
    };

    const loadClasses = async (preserveCurrent = false) => {
      if (!student) return;
      const request = ++classRequest;
      const campus = campusSelect.value;
      const department = departmentSelect.value;
      const branch = branchSelect.value;
      const semester = semesterSelect.value;
      saveButton.disabled = true;
      sectionSelect.disabled = true;
      setOptions(sectionSelect, 'Select department, branch, and semester first', []);
      if (!campus || !department || !branch || !semester) return;
      setOptions(sectionSelect, 'Loading classes…', []);
      try {
        const classes = await api(`/auth/register/classes?campus=${encodeURIComponent(campus)}&department=${encodeURIComponent(department)}&semester=${encodeURIComponent(semester)}&branch=${encodeURIComponent(branch)}`);
        if (request !== classRequest) return;
        const options = classes.map(item => ({ value: item._id, label: item.name }));
        const selectedSection = preserveCurrent ? idOf(profile.section) : '';
        setOptions(sectionSelect, options.length ? 'Select a class' : 'No classes uploaded for this selection', options, selectedSection);
        sectionSelect.disabled = !options.length;
        saveButton.disabled = !options.length;
      } catch (loadError) {
        if (request !== classRequest) return;
        setOptions(sectionSelect, 'Could not load classes', []);
        error.textContent = loadError.message;
        error.hidden = false;
      }
    };

    const loadBranches = async preserveCurrent => {
      const request = ++branchRequest;
      classRequest++;
      saveButton.disabled = true;
      branchSelect.disabled = true;
      setOptions(branchSelect, departmentSelect.value ? 'Loading branches…' : 'Select department first', []);
      setOptions(sectionSelect, 'Select department, branch, and semester first', []);
      sectionSelect.disabled = true;
      if (!departmentSelect.value) return;
      try {
        const branches = await api(`/auth/register/branches?campus=${encodeURIComponent(campusSelect.value)}&department=${encodeURIComponent(departmentSelect.value)}`);
        if (request !== branchRequest) return;
        const options = branches.map(value => ({ value, label: value }));
        const selectedBranch = preserveCurrent ? profile.branch || '' : '';
        setOptions(branchSelect, options.length ? 'Select a branch' : 'No branches uploaded for this department', options, selectedBranch);
        branchSelect.disabled = !options.length;
        await loadClasses(preserveCurrent);
      } catch (loadError) {
        if (request !== branchRequest) return;
        setOptions(branchSelect, 'Could not load branches', []);
        error.textContent = loadError.message;
        error.hidden = false;
      }
    };

    const loadOptions = async (preserveCurrent = false) => {
      const request = ++optionsRequest;
      lookupsReady = false;
      saveButton.disabled = true;
      departmentSelect.disabled = true;
      if (student) {
        branchRequest++;
        classRequest++;
        branchSelect.disabled = true;
        sectionSelect.disabled = true;
      }
      try {
        const options = await api(`/auth/register/options?campus=${encodeURIComponent(campusSelect.value)}`);
        if (request !== optionsRequest) return;
        setOptions(
          departmentSelect,
          options.departments.length ? 'Select a department' : 'No departments uploaded for this college',
          options.departments.map(item => ({ value: item._id, label: item.name })),
          preserveCurrent ? idOf(profile.department) : ''
        );
        departmentSelect.disabled = !options.departments.length;
        if (student) {
          setOptions(semesterSelect, 'Select a semester', options.semesters.map(item => ({ value: item._id, label: item.name })), preserveCurrent ? idOf(profile.semester) : '');
          semesterSelect.disabled = !options.semesters.length;
          await loadBranches(preserveCurrent);
        }
        lookupsReady = options.departments.length > 0 &&
          (!student || (options.semesters.length > 0 && !branchSelect.disabled && !sectionSelect.disabled));
        error.hidden = true;
      } catch (loadError) {
        if (request !== optionsRequest) return;
        error.textContent = loadError.message;
        error.hidden = false;
      } finally {
        if (request === optionsRequest) saveButton.disabled = !lookupsReady;
      }
    };

    campusSelect.onchange = async () => {
      if (['BIRT', 'BIRTS'].includes(campusSelect.value)) {
        attendanceWrap.hidden = false;
        attendanceSelect.required = true;
      } else {
        attendanceSelect.value = '';
        attendanceSelect.required = false;
        attendanceWrap.hidden = true;
      }
      await loadOptions(false);
    };
    departmentSelect.onchange = () => student ? loadBranches(false) : undefined;
    branchSelect && (branchSelect.onchange = () => loadClasses(false));
    semesterSelect && (semesterSelect.onchange = () => loadClasses(false));
    root.querySelector('#cancel-profile').onclick = draw;
    form.onsubmit = async event => {
      event.preventDefault();
      error.hidden = true;
      if (!form.reportValidity()) return;
      saveButton.disabled = true;
      try {
        const formData = new FormData(form);
        const body = Object.fromEntries(formData.entries());
        if (!body.attendanceSection) delete body.attendanceSection;
        profile = await api('/profile', {
          method: 'PATCH',
          body
        });
        toast('Profile updated');
        draw();
      } catch (saveError) {
        error.textContent = saveError.message;
        error.hidden = false;
      } finally {
        saveButton.disabled = false;
      }
    };

    if (attendanceWrap) {
      attendanceWrap.hidden = !['BIRT', 'BIRTS'].includes(campusSelect.value);
      attendanceSelect.required = !attendanceWrap.hidden;
      if (attendanceWrap.hidden) attendanceSelect.value = '';
    }
    await loadOptions(true);
  };

  draw();
}
