import { html } from '../js/utils.js';
import { icon } from '../js/components.js';
import { login, HOME, state } from '../js/auth.js';
import { api } from '../js/api.js';
import { validateLogin } from '../js/validation.js';
import { go } from '../js/router.js';
const ROLES = [
  ['student', 'Student', 'M12 3 2 8l10 5 10-5-10-5Zm-6 7v5c3 2 9 2 12 0v-5M22 8v6'],
  ['faculty', 'Faculty', 'M4 4h16v16H4zM8 8h8M8 12h8M8 16h5'],
  ['hod', 'HOD', 'M3 21h18M5 21V7l7-4 7 4v14M9 10h.01M15 10h.01M9 14h.01M15 14h.01']
];
const roleIcon = path => html`<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="${path}"/></svg>`;
const msgText = (node, message) => { node.textContent = message; node.hidden = !message; };

export function render(root) {
  let selectedRole = 'student', adminMode = false;
  root.innerHTML = String(html`<main class="login-page">
    <section class="login-card" aria-labelledby="login-title">
      <header class="login-brand">
        <img class="login-logo-slot" src="/images/logo.png" alt="BGI logo">
        <svg class="login-check" viewBox="0 0 48 48" aria-hidden="true" focusable="false"><circle cx="24" cy="24" r="21"/><path d="m14 24 7 7 14-15"/></svg>
        <h1 id="login-title">CampusAttend</h1>
        <p>College Attendance Management System</p>
      </header>
      <div class="role-picker" id="role-picker">
        <h2>Login as</h2>
        <div class="role-options" role="radiogroup" aria-label="Choose your role">${ROLES.map(([value, label, path]) => html`<button type="button" class="role-option ${value === selectedRole ? 'selected' : ''}" role="radio" aria-checked="${value === selectedRole}" tabindex="${value === selectedRole ? '0' : '-1'}" data-role="${value}">${roleIcon(path)}<span>${label}</span></button>`)}</div>
      </div>
      <div class="admin-mode" id="admin-mode" hidden>
        <h2>Admin Login</h2>
        <p>Choose your campus, then sign in with an authorized administrator account.</p>
        <label for="admin-campus">Campus</label>
        <select id="admin-campus" name="adminCampus" aria-label="Select administrator campus">
          <option value="">Select campus</option>
          <option value="BIRT">BIRT</option>
          <option value="BIRTS">BIRTS</option>
          <option value="BIST">BIST</option>
        </select>
      </div>
      <form id="login-form" class="login-form" novalidate>
        <label class="login-field" for="identifier"><span class="sr-only">Email address</span><span class="field-icon">${html`<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m4 7 8 6 8-6"/></svg>`}</span><input id="identifier" name="identifier" type="email" autocomplete="username" placeholder="Gmail / Email address" aria-describedby="identifier-error" required></label>
        <small class="field-error" id="identifier-error" hidden></small>
        <label class="login-field" for="password"><span class="sr-only">Password</span><span class="field-icon">${html`<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 1 1 8 0v3"/></svg>`}</span><input id="password" name="password" type="password" autocomplete="current-password" placeholder="Password" aria-label="Password" aria-describedby="password-error" required><button type="button" class="password-toggle" id="toggle-password" aria-label="Show password" aria-pressed="false">${icon('eye')}</button></label>
        <small class="field-error" id="password-error" hidden></small>
        <div class="login-links-row"><span></span><button type="button" class="text-link" id="forgot-link">Forgot Password?</button></div>
        <div class="login-error" id="login-error" role="alert" hidden></div>
        <button class="login-submit" id="login-submit" type="submit">Login</button>
      </form>
      <footer class="login-footer">
        <p><span id="register-label">New student?</span> <button type="button" class="text-link" id="register-link">Create an account</button></p>
        <button type="button" class="admin-link" id="admin-link">Admin Login</button>
      </footer>
    </section>
    <dialog class="auth-dialog registration-dialog" id="hod-register-dialog" aria-labelledby="hod-register-title">
      <div class="dialog-form">
        <div class="dialog-heading"><h2 id="hod-register-title">HOD Registration</h2><button type="button" class="dialog-close" id="hod-register-close" aria-label="Close">×</button></div>
        <form id="hod-register-form" class="register-form" novalidate>
          <div id="staff-register-fields">
            <label for="hod-name">Full name</label><input id="hod-name" name="name" autocomplete="name" maxlength="100" required>
            <label for="hod-inst-id">Employee ID</label><input id="hod-inst-id" name="instId" maxlength="30" required>
            <label for="hod-department">Select department</label><select id="hod-department" name="department" required><option value="">Loading departments…</option></select>
            <label for="hod-campus">Select college</label><select id="hod-campus" name="campus" required><option value="">Select college</option><option value="BIRT">BIRT</option><option value="BIRTS">BIRTS</option><option value="BIST">BIST</option></select>
            <label for="hod-phone">Phone number</label><input id="hod-phone" name="phone" type="tel" autocomplete="tel" maxlength="20" required>
            <label for="hod-email">Gmail address</label><input id="hod-email" name="email" type="email" autocomplete="email" maxlength="254" placeholder="name@gmail.com" required>
            <label for="hod-password">Create password (min 6 chars)</label><input id="hod-password" name="password" type="password" autocomplete="new-password" minlength="6" maxlength="128" required>
            <label for="hod-confirm-password">Confirm password</label><input id="hod-confirm-password" name="confirmPassword" type="password" autocomplete="new-password" minlength="6" maxlength="128" required>
          </div>
          <div id="staff-register-otp-step" hidden>
            <p id="staff-register-otp-help">Enter the verification code sent to your Gmail address.</p>
            <label for="staff-register-otp">Six-digit verification code</label><input id="staff-register-otp" name="otp" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6">
            <button class="text-link" type="button" id="staff-register-resend">Send a new code</button>
            <button class="text-link" type="button" id="staff-register-start-over">Start over</button>
          </div>
          <p class="register-status" id="staff-register-status" role="status" hidden></p>
          <div class="login-error" id="hod-register-error" role="alert" hidden></div>
          <button class="login-submit" id="hod-register-submit" type="submit">Create HOD account</button>
        </form>
      </div>
    </dialog>
    <dialog class="auth-dialog" id="forgot-dialog" aria-labelledby="forgot-title">
      <div class="dialog-form">
        <div class="dialog-heading"><h2 id="forgot-title">Forgot Password?</h2><button type="button" class="dialog-close" id="forgot-close" aria-label="Close">×</button></div>
        <p>Password reset is not available yet. Please contact your college administrator for help.</p>
        <button type="button" class="login-submit" id="forgot-done">Close</button>
      </div>
    </dialog>
    <dialog class="auth-dialog registration-dialog" id="register-dialog" aria-labelledby="register-title">
      <div class="dialog-form">
        <div class="dialog-heading"><h2 id="register-title">Create student account</h2><button type="button" class="dialog-close" id="register-close" aria-label="Close">×</button></div>
        <p id="register-help">Enter your details. We’ll email you a verification code before creating your account.</p>
        <form id="register-form" class="register-form" novalidate>
          <div id="register-fields">
            <label for="register-name">Full name</label><input id="register-name" name="name" autocomplete="name" maxlength="100" required>
            <label for="register-email">Email address</label><input id="register-email" name="email" type="email" autocomplete="email" maxlength="254" required>
            <label for="register-roll-no">Roll number</label><small class="register-hint">Roll number is required. If you don't have one, type NA.</small><input id="register-roll-no" name="rollNo" maxlength="30" required>
            <label for="register-phone">Mobile number</label><input id="register-phone" name="phone" type="tel" autocomplete="tel" minlength="7" maxlength="20" required>
            <label for="register-branch">Branch</label><select id="register-branch" name="branch" required><option value="">Select a branch</option><option value="Data Science">Data Science</option><option value="CSE">CSE</option><option value="AIML">AIML</option><option value="Cyber Security">Cyber Security</option><option value="ME">ME</option><option value="IT">IT</option><option value="MCA">MCA</option><option value="MBA">MBA</option><option value="BBA">BBA</option><option value="Other">Other</option></select>
            <label for="register-department">Department</label><select id="register-department" name="department" required><option value="">Loading departments…</option></select>
            <label for="register-campus">College</label><small class="register-hint">Please select the building where you study.</small><select id="register-campus" name="campus" required><option value="">Select a college</option><option value="BIRT">BIRT</option><option value="BIRTS">BIRTS</option><option value="BIST">BIST</option></select>
            <div id="register-attendance-section-field" hidden><label for="register-attendance-section">Attendance Section</label><select id="register-attendance-section" name="attendanceSection"><option value="">Select an attendance section</option><option value="Birt">Birt</option><option value="Birts">Birts</option></select></div>
            <label for="register-semester">Semester</label><select id="register-semester" name="semester" required disabled><option value="">Loading semesters…</option></select>
            <label for="register-class">Choose class</label><select id="register-class" name="section" required disabled><option value="">Select college, department, and semester first</option></select>
            <small id="register-class-help" class="register-status" hidden></small>
            <label for="register-password">Password (at least 10 characters)</label><input id="register-password" name="password" type="password" autocomplete="new-password" minlength="10" maxlength="128" required>
          </div>
          <div id="register-otp-step" hidden>
            <label for="register-otp">Six-digit verification code</label><input id="register-otp" name="otp" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6">
            <button class="text-link" type="button" id="register-resend">Send a new code</button>
            <button class="text-link" type="button" id="register-start-over">Start over</button>
          </div>
          <div class="login-error" id="register-error" role="alert" hidden></div>
          <p class="register-status" id="register-status" role="status" hidden></p>
          <button class="login-submit" id="register-submit" type="submit">Send verification code</button>
        </form>
      </div>
    </dialog>
  </main>`);

  const form = root.querySelector('#login-form');
  const identifier = form.elements.identifier;
  const password = form.elements.password;
  const adminCampus = root.querySelector('#admin-campus');
  const setError = (id, text) => msgText(root.querySelector(id), text);
  const selectRole = role => {
    selectedRole = role;
    setError('#login-error', '');
    const staffRole = role === 'hod' || role === 'faculty';
    root.querySelector('#register-label').textContent = staffRole ? `New ${role === 'hod' ? 'HOD' : 'Faculty'}?` : 'New student?';
    root.querySelector('#register-link').textContent = staffRole ? 'Register' : 'Create an account';
    root.querySelectorAll('[data-role]').forEach(button => {
      const active = button.dataset.role === role;
      button.classList.toggle('selected', active);
      button.setAttribute('aria-checked', String(active));
      button.tabIndex = active ? 0 : -1;
    });
  };

  root.querySelectorAll('[data-role]').forEach(button => {
    button.onclick = () => selectRole(button.dataset.role);
    button.onkeydown = event => {
      const options = [...root.querySelectorAll('[data-role]')];
      const current = options.indexOf(button);
      const next = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? (current + 1) % options.length :
        event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? (current - 1 + options.length) % options.length :
          event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1 : -1;
      if (next >= 0) { event.preventDefault(); options[next].click(); options[next].focus(); }
    };
  });

  root.querySelector('#toggle-password').onclick = event => {
    const button = event.currentTarget;
    const visible = password.type === 'password';
    password.type = visible ? 'text' : 'password';
    button.setAttribute('aria-label', visible ? 'Hide password' : 'Show password');
    button.setAttribute('aria-pressed', String(visible));
  };

  const forgotDialog = root.querySelector('#forgot-dialog');
  root.querySelector('#forgot-link').onclick = () => forgotDialog.showModal();
  root.querySelector('#forgot-close').onclick = () => forgotDialog.close();
  root.querySelector('#forgot-done').onclick = () => forgotDialog.close();
  forgotDialog.onclick = event => { if (event.target === forgotDialog) forgotDialog.close(); };
  const registerDialog = root.querySelector('#register-dialog');
  const registerForm = root.querySelector('#register-form');
  const registerFields = root.querySelector('#register-fields');
  const registerOtpStep = root.querySelector('#register-otp-step');
  const registerError = root.querySelector('#register-error');
  const registerStatus = root.querySelector('#register-status');
  const registrationEmail = root.querySelector('#register-email');
  const departmentSelect = root.querySelector('#register-department');
  const semesterSelect = root.querySelector('#register-semester');
  const campusSelect = root.querySelector('#register-campus');
  const attendanceSectionField = root.querySelector('#register-attendance-section-field');
  const attendanceSectionSelect = root.querySelector('#register-attendance-section');
  const classSelect = root.querySelector('#register-class');
  const classHelp = root.querySelector('#register-class-help');
  let registrationOptions;
  let registrationClasses = [];
  let classOptionsRequest = 0;
  let registrationOptionsReady = false;
  let registrationPending = false;
  const setSelectOptions = (select, placeholder, options) => {
    select.replaceChildren(new Option(placeholder, ''));
    options.forEach(({ value, label }) => select.add(new Option(label, value)));
  };
  const loadRegistrationOptions = async () => {
    const submit = root.querySelector('#register-submit');
    submit.disabled = true;
    try {
      registrationOptions = await api('/auth/register/options');
      setSelectOptions(departmentSelect, 'Select a department', registrationOptions.departments.map(d => ({ value: d._id, label: d.name })));
      setSelectOptions(semesterSelect, 'Select a semester', registrationOptions.semesters.map(s => ({ value: s._id, label: s.name })));
      semesterSelect.disabled = false;
      registrationOptionsReady = registrationOptions.departments.length > 0 && registrationOptions.semesters.length > 0;
      if (!registrationOptionsReady) {
        registerError.textContent = 'Student registration is unavailable until an administrator configures departments and semesters.';
        registerError.hidden = false;
      }
    } catch (error) {
      registerError.textContent = `Could not load enrollment options: ${error.message}`;
      registerError.hidden = false;
    } finally {
      submit.disabled = !registrationOptionsReady;
    }
  };
  const resetRegistration = () => {
    registrationPending = false;
    registerForm.reset();
    registerFields.querySelectorAll('input').forEach(input => { input.disabled = false; });
    registerFields.querySelectorAll('select').forEach(select => { select.disabled = false; });
    classSelect.disabled = true;
    semesterSelect.disabled = !registrationOptionsReady;
    attendanceSectionField.hidden = true;
    attendanceSectionSelect.required = false;
    setSelectOptions(classSelect, 'Select college, department, and semester first', []);
    if (registrationOptions) {
      setSelectOptions(semesterSelect, 'Select a semester', registrationOptions.semesters.map(s => ({ value: s._id, label: s.name })));
    }
    registrationClasses = [];
    classHelp.hidden = true;
    root.querySelector('#register-otp').required = false;
    registerFields.hidden = false;
    registerOtpStep.hidden = true;
    registerError.hidden = true;
    registerStatus.hidden = true;
    root.querySelector('#register-help').textContent = 'Enter your details. We’ll email you a verification code before creating your account.';
    const submit = root.querySelector('#register-submit');
    submit.textContent = 'Send verification code';
    submit.disabled = !registrationOptionsReady;
  };
  root.querySelector('#register-link').onclick = () => {
    if (selectedRole === 'hod' || selectedRole === 'faculty') {
      const dialog = root.querySelector('#hod-register-dialog');
      const department = root.querySelector('#hod-department');
      const staffTitle = selectedRole === 'hod' ? 'HOD' : 'Faculty';
      root.querySelector('#hod-register-title').textContent = `${staffTitle} Registration`;
      root.querySelector('#hod-register-submit').textContent = `Create ${staffTitle} account`;
      resetStaffRegistration();
      if (!department.dataset.loaded) {
        api('/auth/register/options').then(options => {
          department.replaceChildren(new Option('Select department', ''));
          options.departments.forEach(item => department.add(new Option(item.name, item._id)));
          department.dataset.loaded = 'true';
        }).catch(error => {
          root.querySelector('#hod-register-error').textContent = `Could not load departments: ${error.message}`;
          root.querySelector('#hod-register-error').hidden = false;
        });
      }
      dialog.showModal();
      return;
    }
    resetRegistration();
    registerDialog.showModal();
    if (!registrationOptions) loadRegistrationOptions();
  };
  root.querySelector('#register-close').onclick = () => registerDialog.close();
  registerDialog.onclick = event => { if (event.target === registerDialog) registerDialog.close(); };
  root.querySelector('#register-start-over').onclick = resetRegistration;
  const loadRegistrationClasses = async () => {
    const requestId = ++classOptionsRequest;
    const department = departmentSelect.value;
    const campus = campusSelect.value;
    const semester = semesterSelect.value;
    registrationClasses = [];
    classSelect.disabled = true;
    setSelectOptions(classSelect, 'Select college, department, and semester first', []);
    classHelp.hidden = true;
    if (!department || !campus || !semester) return;
    classSelect.replaceChildren(new Option('Loading classes…', ''));
    try {
      const classes = await api(`/auth/register/classes?campus=${encodeURIComponent(campus)}&department=${encodeURIComponent(department)}&semester=${encodeURIComponent(semester)}`);
      if (requestId !== classOptionsRequest) return;
      registrationClasses = classes;
      setSelectOptions(classSelect, registrationClasses.length ? 'Select a class' : 'No classes found for this college, department, and semester', []);
      registrationClasses.forEach(item => classSelect.add(new Option(item.name, item._id)));
      classSelect.disabled = !registrationClasses.length;
      if (!registrationClasses.length) {
        classHelp.textContent = 'No classes have been uploaded for this college, department, and semester.';
        classHelp.hidden = false;
      }
    } catch (error) {
      if (requestId !== classOptionsRequest) return;
      setSelectOptions(classSelect, 'Could not load classes', []);
      classHelp.textContent = `Could not load classes: ${error.message}`;
      classHelp.hidden = false;
    }
  };
  departmentSelect.onchange = loadRegistrationClasses;
  campusSelect.onchange = () => {
    const showAttendanceSection = campusSelect.value === 'BIRT' || campusSelect.value === 'BIRTS';
    attendanceSectionField.hidden = !showAttendanceSection;
    attendanceSectionSelect.required = showAttendanceSection;
    if (!showAttendanceSection) attendanceSectionSelect.value = '';
    loadRegistrationClasses();
  };
  semesterSelect.onchange = loadRegistrationClasses;
  root.querySelector('#register-resend').onclick = async event => {
    const button = event.currentTarget;
    button.disabled = true;
    registerError.hidden = true;
    registerStatus.hidden = true;
    try {
      const result = await api('/auth/register/resend-otp', { method: 'POST', body: { email: registrationEmail.value.trim() } });
      registerStatus.textContent = result.message;
      registerStatus.hidden = false;
    } catch (error) {
      registerError.textContent = error.message;
      registerError.hidden = false;
    } finally {
      button.disabled = false;
    }
  };
  const hodRegisterDialog = root.querySelector('#hod-register-dialog');
  let staffRegistrationPending = false;
  const staffRegisterFields = root.querySelector('#staff-register-fields');
  const staffOtpStep = root.querySelector('#staff-register-otp-step');
  const staffOtp = root.querySelector('#staff-register-otp');
  const staffStatus = root.querySelector('#staff-register-status');
  const staffRegistrationError = root.querySelector('#hod-register-error');
  const staffRegistrationEmail = root.querySelector('#hod-email');
  const staffSubmit = root.querySelector('#hod-register-submit');
  const resetStaffRegistration = () => {
    staffRegistrationPending = false;
    root.querySelector('#hod-register-form').reset();
    staffRegisterFields.querySelectorAll('input, select').forEach(field => { field.disabled = false; });
    staffRegisterFields.hidden = false;
    staffOtp.required = false;
    staffOtpStep.hidden = true;
    staffStatus.hidden = true;
    root.querySelector('#hod-register-error').hidden = true;
    staffSubmit.textContent = `Create ${selectedRole === 'hod' ? 'HOD' : 'Faculty'} account`;
  };
  root.querySelector('#hod-register-close').onclick = () => hodRegisterDialog.close();
  hodRegisterDialog.onclick = event => { if (event.target === hodRegisterDialog) hodRegisterDialog.close(); };
  root.querySelector('#staff-register-start-over').onclick = resetStaffRegistration;
  root.querySelector('#staff-register-resend').onclick = async event => {
    const button = event.currentTarget;
    button.disabled = true;
    staffStatus.hidden = true;
    staffRegistrationError.hidden = true;
    try {
      const result = await api('/auth/register/resend-otp', {
        method: 'POST',
        body: { email: staffRegistrationEmail.value.trim() }
      });
      staffStatus.textContent = result.message;
      staffStatus.hidden = false;
    } catch (error) {
      staffRegistrationError.textContent = error.message;
      staffRegistrationError.hidden = false;
    } finally {
      button.disabled = false;
    }
  };
  root.querySelector('#hod-register-form').onsubmit = async event => {
    event.preventDefault();
    const registrationError = root.querySelector('#hod-register-error');
    registrationError.hidden = true;
    staffStatus.hidden = true;
    if (!event.currentTarget.reportValidity()) return;
    let staffPassword, confirmPassword;
    if (!staffRegistrationPending) {
      staffPassword = root.querySelector('#hod-password').value;
      confirmPassword = root.querySelector('#hod-confirm-password').value;
      if (staffPassword !== confirmPassword) {
        registrationError.textContent = 'Passwords do not match.';
        registrationError.hidden = false;
        root.querySelector('#hod-confirm-password').focus();
        return;
      }
    }
    staffSubmit.disabled = true;
    try {
      if (!staffRegistrationPending) {
        staffSubmit.textContent = 'Sending verification code…';
        const result = await api(`/auth/register/${selectedRole}/request-otp`, {
          method: 'POST',
          body: {
            name: root.querySelector('#hod-name').value.trim(),
            instId: root.querySelector('#hod-inst-id').value.trim(),
            department: root.querySelector('#hod-department').value,
            campus: root.querySelector('#hod-campus').value,
            phone: root.querySelector('#hod-phone').value.trim(),
            email: staffRegistrationEmail.value.trim(),
            password: staffPassword,
            confirmPassword
          }
        });
        staffRegistrationPending = true;
        root.querySelector('#hod-password').value = '';
        root.querySelector('#hod-confirm-password').value = '';
        staffRegisterFields.querySelectorAll('input, select').forEach(field => { field.disabled = true; });
        staffRegisterFields.hidden = true;
        staffOtpStep.hidden = false;
        staffOtp.required = true;
        root.querySelector('#staff-register-otp-help').textContent = `${result.message} Enter the code sent to ${staffRegistrationEmail.value.trim()}.`;
        staffSubmit.textContent = 'Verify and create account';
        staffOtp.focus();
      } else {
        staffSubmit.textContent = 'Verifying code…';
        const user = await api('/auth/register/verify-otp', {
          method: 'POST',
          body: { email: staffRegistrationEmail.value.trim(), otp: staffOtp.value }
        });
        state.user = user;
        hodRegisterDialog.close();
        go(HOME[user.role]);
      }
    } catch (error) {
      registrationError.textContent = error.message;
      registrationError.hidden = false;
    } finally {
      staffSubmit.disabled = false;
      if (!staffRegistrationPending) staffSubmit.textContent = `Create ${selectedRole === 'hod' ? 'HOD' : 'Faculty'} account`;
      else if (staffSubmit.textContent !== 'Verify and create account') staffSubmit.textContent = 'Verify and create account';
    }
  };
  registerForm.onsubmit = async event => {
    event.preventDefault();
    registerError.hidden = true;
    registerStatus.hidden = true;
    if (!registerForm.reportValidity()) return;
    const submit = root.querySelector('#register-submit');
    submit.disabled = true;
    try {
      if (!registrationPending) {
        submit.textContent = 'Sending code…';
        await api('/auth/register/request-otp', {
          method: 'POST',
          body: {
            name: root.querySelector('#register-name').value.trim(),
            email: registrationEmail.value.trim(),
            phone: root.querySelector('#register-phone').value.trim(),
            password: root.querySelector('#register-password').value,
            rollNo: root.querySelector('#register-roll-no').value.trim() || undefined,
            branch: root.querySelector('#register-branch').value,
            department: departmentSelect.value,
            campus: campusSelect.value,
            attendanceSection: attendanceSectionSelect.value || undefined,
            semester: semesterSelect.value,
            section: classSelect.value,
          }
        });
        root.querySelector('#register-password').value = '';
        registrationPending = true;
        registerFields.querySelectorAll('input').forEach(input => { input.disabled = true; });
        registerFields.querySelectorAll('select').forEach(select => { select.disabled = true; });
        registerFields.hidden = true;
        registerOtpStep.hidden = false;
        root.querySelector('#register-otp').required = true;
        root.querySelector('#register-help').textContent = `Enter the code sent to ${registrationEmail.value.trim()}.`;
        submit.textContent = 'Verify and create account';
        root.querySelector('#register-otp').focus();
      } else {
        submit.textContent = 'Verifying…';
        const user = await api('/auth/register/verify-otp', {
          method: 'POST',
          body: { email: registrationEmail.value.trim(), otp: root.querySelector('#register-otp').value }
        });
        state.user = user;
        registerDialog.close();
        go(HOME.student);
      }
    } catch (error) {
      registerError.textContent = error.message;
      registerError.hidden = false;
    } finally {
      submit.disabled = false;
      if (!registrationPending) submit.textContent = 'Send verification code';
      else if (submit.textContent !== 'Verify and create account') submit.textContent = 'Verify and create account';
    }
  };

  root.querySelector('#admin-link').onclick = event => {
    adminMode = !adminMode;
    root.querySelector('#role-picker').hidden = adminMode;
    root.querySelector('#admin-mode').hidden = !adminMode;
    event.currentTarget.textContent = adminMode ? 'Back to role selection' : 'Admin Login';
    root.querySelector('#login-submit').textContent = adminMode ? 'Admin Login' : 'Login';
    setError('#login-error', '');
  };

  form.onsubmit = async event => {
    event.preventDefault();
    setError('#login-error', '');
    const errors = validateLogin(identifier.value, password.value);
    if (identifier.value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identifier.value.trim())) errors.identifier = 'Enter a valid email address';
    setError('#identifier-error', errors.identifier || '');
    setError('#password-error', errors.password || '');
    if (Object.keys(errors).length) return;
    if (adminMode && !adminCampus.value) {
      setError('#login-error', 'Select a campus before signing in.');
      adminCampus.focus();
      return;
    }

    const expectedRole = adminMode ? 'admin' : selectedRole;
    if (!['student', 'faculty', 'hod', 'admin'].includes(expectedRole)) {
      setError('#login-error', `${expectedRole[0].toUpperCase()}${expectedRole.slice(1)} login is not configured. Please contact an administrator.`);
      return;
    }
    const submit = root.querySelector('#login-submit');
    submit.disabled = true;
    submit.textContent = 'Signing in…';
    try {
      const user = await login(identifier.value.trim(), password.value, adminMode ? adminCampus.value : undefined);
      if (user.role !== expectedRole) {
        try {
          await api('/auth/logout', { method: 'POST' });
          state.user = null;
        } catch (logoutError) {
          state.user = null;
          setError('#login-error', `This account is registered as ${user.role}, but the session could not be cleared: ${logoutError.message}. Refresh before trying again.`);
          return;
        }
        setError('#login-error', `This account is registered as ${user.role}. Choose the matching login option.`);
        return;
      }
      go(HOME[user.role]);
    } catch (error) {
      setError('#login-error', error.message);
      password.value = '';
      password.focus();
    } finally {
      submit.disabled = false;
      submit.textContent = adminMode ? 'Admin Login' : 'Login';
    }
  };

}
