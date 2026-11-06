import { api } from '../js/api.js';
import { html, fmtDate } from '../js/utils.js';
import { download, modal, toast } from '../js/components.js';

const localDate = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const attendanceSectionNames = ['Birt', 'Birts'];
const sortAttendanceStudents = students => [...students].sort((a, b) => {
  const sectionA = attendanceSectionNames.indexOf(a.attendanceSection);
  const sectionB = attendanceSectionNames.indexOf(b.attendanceSection);
  const sectionOrder = (sectionA < 0 ? 2 : sectionA) - (sectionB < 0 ? 2 : sectionB);
  if (sectionOrder) return sectionOrder;
  const rollA = String(a.rollNo || '').trim();
  const rollB = String(b.rollNo || '').trim();
  if (!rollA && rollB) return 1;
  if (rollA && !rollB) return -1;
  return rollA.localeCompare(rollB, undefined, { numeric: true, sensitivity: 'base' })
    || String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' });
});
const attendanceStudentGroups = (students, grouped) => grouped
  ? [
      ...attendanceSectionNames.map(section => ({
        section,
        students: sortAttendanceStudents(students.filter(student => student.attendanceSection === section))
      })),
      ...(() => {
        const ungrouped = students.filter(student => !attendanceSectionNames.includes(student.attendanceSection));
        return ungrouped.length ? [{ section: '', students: sortAttendanceStudents(ungrouped) }] : [];
      })()
    ]
  : [{ section: '', students }];
const renderStudentGroups = (students, grouped, renderStudent) => html`${attendanceStudentGroups(students, grouped).map(group => html`
  ${group.section ? html`<div class="attendance-section-heading"><strong>⭐ ${group.section}</strong></div>` : ''}
  ${group.students.map(renderStudent)}`)}`;

export async function render(root) {
  const params = new URLSearchParams(location.hash.split('?')[1] || '');
  const catalogId = params.get('subject');
  const selectedDate = params.get('date');
  const selectedLecture = Number(params.get('lectureNo'));
  const dashboard = await api('/faculty/dashboard');
  const subject = dashboard.savedSubjects?.find(item => item.catalogId === catalogId);
  if (!subject) {
    root.innerHTML = String(html`<div class="card"><strong>Subject not found</strong><p><a href="#/faculty/dashboard">Back to dashboard</a></p></div>`);
    return;
  }
  const groupedByAttendanceSection = ['BIRT', 'BIRTS'].includes(subject.campus);

  const historyId = params.get('history');
  if (historyId) {
    const [history, roster] = await Promise.all([
      api(`/faculty/subject-history/${encodeURIComponent(historyId)}?subject=${encodeURIComponent(catalogId)}`),
      api(`/faculty/subject-students?subject=${encodeURIComponent(catalogId)}`)
    ]);
    const rosterById = new Map(roster.map(student => [String(student.id), student]));
    const historyStudents = sortAttendanceStudents(history.students.map(student => ({
      ...rosterById.get(String(student.id)),
      ...student,
      attendanceSection: student.attendanceSection || rosterById.get(String(student.id))?.attendanceSection
    })));
    const canEdit = history.isOwner && Date.now() - new Date(history.createdAt).getTime() <= 6 * 60 * 60 * 1000;
    root.innerHTML = String(html`<div class="card"><p><a href="#/faculty/subject?subject=${encodeURIComponent(catalogId)}">← History</a></p>
      <h2>## ${history.code} · ${history.date} · Lecture ${history.lectureNo || '-'}</h2>
      <p class="muted">Recorded by: ${history.facultyName}${history.facultyPhone ? ` · Mobile: ${history.facultyPhone}` : ''}</p>
      <p class="muted">Present ${history.students.length}/${history.totalStudents ?? roster.length}</p>
      <div id="history-students">${history.students.length ? html`<div class="student-attendance-list">${renderStudentGroups(historyStudents, groupedByAttendanceSection, student => html`<div class="student-attendance-row"><span>${student.name}${student.rollNo ? ` · ${student.rollNo}` : ''}</span><input type="checkbox" checked disabled aria-label="${student.name} was selected"></div>`)}</div>` : html`<div class="empty"><strong>No students were selected</strong></div>`}</div>
      ${canEdit ? html`<div class="history-actions"><button class="btn primary" id="edit-history" type="button">Edit</button></div>` : html`<p class="muted">${history.isOwner ? 'Editing is available for 6 hours after saving.' : 'Only the faculty member who recorded this history can edit it.'}</p>`}
    </div>`);
    if (canEdit) {
      root.querySelector('#edit-history').onclick = async event => {
        const editButton = event.currentTarget;
        editButton.disabled = true;
        try {
          const selected = new Set(history.students.map(student => student.id));
          const studentsRoot = root.querySelector('#history-students');
          studentsRoot.innerHTML = String(html`${roster.length ? html`<div class="student-attendance-list">${renderStudentGroups(roster, groupedByAttendanceSection, student => html`<label class="student-attendance-row"><span>${student.name}${student.rollNo ? ` · ${student.rollNo}` : ''}</span><input type="checkbox" value="${student.id}" ${selected.has(student.id) ? 'checked' : ''} aria-label="Select ${student.name}"></label>`)}</div>` : html`<div class="empty"><strong>No students found for this subject</strong></div>`}`);
          editButton.textContent = 'Save changes';
          editButton.disabled = false;
          editButton.onclick = async saveEvent => {
            const saveButton = saveEvent.currentTarget;
            if (!confirm('Save changes to this attendance history?')) return;
            saveButton.disabled = true;
            try {
              const students = [...studentsRoot.querySelectorAll('input[type="checkbox"]:checked')].map(input => input.value);
              await api(`/faculty/subject-history/${encodeURIComponent(historyId)}`, {
                method: 'PUT',
                body: { subject: catalogId, students }
              });
              toast('History updated');
              await render(root);
            } catch (error) {
              toast(error.message, 'error');
              saveButton.disabled = false;
            }
          };
        } catch (error) {
          toast(error.message, 'error');
          editButton.disabled = false;
        }
      };
    }
    return;
  }

  if (selectedDate && /^\d{4}-\d{2}-\d{2}$/.test(selectedDate) && Number.isInteger(selectedLecture) && selectedLecture >= 1 && selectedLecture <= 12) {
    const students = await api(`/faculty/subject-students?subject=${encodeURIComponent(catalogId)}`);
    root.innerHTML = String(html`<div class="card"><h2>${subject.code} · ${selectedDate} · Lecture ${selectedLecture}</h2>
      ${students.length ? html`<div class="student-attendance-list">${renderStudentGroups(students, groupedByAttendanceSection, student => html`<label class="student-attendance-row"><span>${student.name}${student.rollNo ? ` · ${student.rollNo}` : ''}</span><input type="checkbox" value="${student.id}" aria-label="Select ${student.name}"></label>`)}</div>` : html`<div class="empty"><strong>No students found for this subject</strong><p>Students whose branch and semester show this subject will appear here.</p></div>`}
      <button class="btn primary" id="save-subject-history" type="button">Save</button>
    </div>`);
    root.querySelector('#save-subject-history').onclick = async event => {
      const button = event.currentTarget;
      button.disabled = true;
      try {
        const selectedStudents = [...root.querySelectorAll('.student-attendance-row input:checked')].map(input => input.value);
        await api('/faculty/subject-history', {
          method: 'POST',
          body: { subject: catalogId, date: selectedDate, timezoneOffsetMinutes: new Date().getTimezoneOffset(), lectureNo: selectedLecture, students: selectedStudents }
        });
        toast('History saved');
        location.hash = `#/faculty/subject?subject=${encodeURIComponent(catalogId)}`;
      } catch (error) {
        toast(error.message, 'error');
        button.disabled = false;
      }
    };
    return;
  }

  const history = await api(`/faculty/subject-history?subject=${encodeURIComponent(catalogId)}`);
  const roster = await api(`/faculty/subject-students?subject=${encodeURIComponent(catalogId)}`);
  const historiesWithCounts = await Promise.all(history.map(async item => {
    if (item.presentCount != null && item.totalCount != null) return item;
    const details = await api(`/faculty/subject-history/${encodeURIComponent(item._id)}?subject=${encodeURIComponent(catalogId)}`);
    return {
      ...item,
      presentCount: item.presentCount ?? details.students.length,
      totalCount: item.totalCount ?? details.totalStudents ?? roster.length
    };
  }));
  let monthView = false;
  let masterSheetView = false;
  let selectedMonth = null;
  const monthHistoryCache = new Map();
  const csvEscape = value => {
    const text = String(value ?? '');
    const safeText = /^[=+\-@]/.test(text) ? `'${text}` : text;
    return `"${safeText.replace(/"/g, '""')}"`;
  };
  root.innerHTML = String(html`<div class="page-head"><div><h2>${subject.code}</h2><p class="muted">${subject.name || ''}</p></div><button class="btn primary" id="mark-attendance" type="button">Mark Attendance</button></div>
  <div class="card"><div class="attendance-history-heading subject-history-toolbar"><h3>History</h3><button class="btn sm" id="subject-history-month-view" type="button" aria-pressed="false">Month</button><button class="btn sm" id="subject-history-master-sheet" type="button" aria-pressed="false">Master Sheet</button></div><input class="attendance-history-search" id="subject-history-search" type="search" aria-label="Search subject history by date or subject code" placeholder="Search by date or subject code"><div id="subject-history-list"></div></div>`);
  const drawMasterSheet = async historyList => {
    historyList.innerHTML = String(html`<p class="muted">Loading master sheet…</p>`);
    try {
      const details = await Promise.all(historiesWithCounts.map(item => {
        if (!monthHistoryCache.has(item._id)) {
          monthHistoryCache.set(item._id, api(`/faculty/subject-history/${encodeURIComponent(item._id)}?subject=${encodeURIComponent(catalogId)}`));
        }
        return monthHistoryCache.get(item._id);
      }));
      if (!masterSheetView) return;
      const attendedByStudent = new Map(roster.map(student => [String(student.id), 0]));
      details.forEach(detail => detail.students.forEach(student => {
        const studentId = String(student.id);
        attendedByStudent.set(studentId, (attendedByStudent.get(studentId) || 0) + 1);
      }));
      const absentDatesByStudent = new Map(roster.map(student => [String(student.id), []]));
      historiesWithCounts.forEach((item, index) => {
        const presentIds = new Set(details[index].students.map(student => String(student.id)));
        roster.forEach(student => {
          const absentDates = absentDatesByStudent.get(String(student.id));
          if (!presentIds.has(String(student.id)) && !absentDates.includes(item.date)) absentDates.push(item.date);
        });
      });
      const totalClasses = historiesWithCounts.length;
      historyList.innerHTML = String(html`<div class="tbl-wrap"><table><thead><tr><th scope="col">Student name</th><th scope="col">Total classes</th><th scope="col">Present</th><th scope="col">Absent</th><th scope="col">Attendance %</th><th scope="col">View absent</th></tr></thead>
        <tbody>${attendanceStudentGroups(roster, groupedByAttendanceSection).map(group => html`
          ${group.section ? html`<tr class="attendance-section-row"><th scope="rowgroup" colspan="6"><strong>⭐ ${group.section}</strong></th></tr>` : ''}
          ${group.students.map(student => {
          const studentId = String(student.id);
          const present = attendedByStudent.get(String(student.id)) || 0;
          const absent = totalClasses - present;
          const percentage = totalClasses ? Math.round(present / totalClasses * 1000) / 10 : 0;
          const absentDates = absentDatesByStudent.get(studentId);
          return html`<tr><td>${student.name}${student.rollNo ? ` · ${student.rollNo}` : ''}</td><td>${totalClasses}</td><td>${present}</td><td>${absent}</td><td>${percentage}%</td><td><button class="btn sm danger" type="button" data-view-absent="${studentId}" aria-expanded="false">View absent</button></td></tr>
            <tr data-absent-dates="${studentId}" hidden><td colspan="6"><strong>Absent dates:</strong> ${absentDates.length ? absentDates.map(date => date.split('-').reverse().join('/')).join(', ') : 'None'}</td></tr>`;
        })}`)}</tbody></table></div><button class="btn" id="download-master-sheet" type="button">Download master sheet</button>`);
      historyList.querySelectorAll('[data-view-absent]').forEach(button => {
        button.onclick = () => {
          const expanded = button.getAttribute('aria-expanded') === 'true';
          button.setAttribute('aria-expanded', String(!expanded));
          historyList.querySelector(`[data-absent-dates="${button.dataset.viewAbsent}"]`).hidden = expanded;
        };
      });
      historyList.querySelector('#download-master-sheet').onclick = () => {
        const rows = [...historyList.querySelectorAll('table tr')]
          .filter(row => !row.hasAttribute('data-absent-dates'))
          .map(row => [...row.cells].slice(0, 5).map(cell => cell.textContent.trim()));
        const csv = rows.map(row => row.map(csvEscape).join(',')).join('\r\n');
        download(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }), `${subject.code}-master-sheet.csv`);
      };
    } catch (error) {
      historiesWithCounts.forEach(item => monthHistoryCache.delete(item._id));
      toast(error.message, 'error');
    }
  };
  const drawMonthDetails = async (month, historyList) => {
    const monthHistories = historiesWithCounts.filter(item => item.date?.startsWith(`${month}-`));
    historyList.innerHTML = String(html`<p class="muted">Loading attendance…</p>`);
    try {
      const details = await Promise.all(monthHistories.map(item => {
        if (!monthHistoryCache.has(item._id)) {
          monthHistoryCache.set(item._id, api(`/faculty/subject-history/${encodeURIComponent(item._id)}?subject=${encodeURIComponent(catalogId)}`));
        }
        return monthHistoryCache.get(item._id);
      }));
      if (selectedMonth !== month) return;
      const dates = [...new Set(monthHistories.map(item => item.date))].sort();
      const presentByDate = new Map(dates.map(date => [date, new Set()]));
      const attendanceByStudent = new Map(roster.map(student => [String(student.id), 0]));
      details.forEach((detail, index) => {
        const present = presentByDate.get(monthHistories[index].date);
        detail.students.forEach(student => {
          const studentId = String(student.id);
          present.add(studentId);
          attendanceByStudent.set(studentId, (attendanceByStudent.get(studentId) || 0) + 1);
        });
      });
      const attendanceRows = roster.map(student => {
        const attended = attendanceByStudent.get(String(student.id)) || 0;
        const absent = monthHistories.length - attended;
        const percentage = monthHistories.length ? Math.round(attended / monthHistories.length * 100) : 0;
        return {
          student,
          attended,
          absent,
          percentage,
          daily: dates.map(date => presentByDate.get(date).has(String(student.id)) ? 'P' : 'A')
        };
      });
      const attendanceRowsById = new Map(attendanceRows.map(row => [String(row.student.id), row]));
      historyList.innerHTML = String(html`<div class="attendance-history-heading"><h3>${month.slice(5, 7)}/${month.slice(0, 4)}</h3><button class="btn sm" id="back-to-months" type="button">Back to months</button></div>
        <div class="tbl-wrap"><table><thead><tr><th scope="col">Student name</th>${dates.map(date => html`<th scope="col">${date.slice(8, 10)}/${date.slice(5, 7)}/${date.slice(0, 4)}</th>`)}<th scope="col">Total classes</th><th scope="col">Attended</th><th scope="col">Absent</th><th scope="col">Attendance %</th></tr></thead>
        <tbody>${attendanceStudentGroups(attendanceRows.map(row => row.student), groupedByAttendanceSection).map(group => html`
          ${group.section ? html`<tr class="attendance-section-row"><th scope="rowgroup" colspan="${dates.length + 5}"><strong>⭐ ${group.section}</strong></th></tr>` : ''}
          ${group.students.map(student => {
            const row = attendanceRowsById.get(String(student.id));
            return html`<tr><td>${row.student.name}${row.student.rollNo ? ` · ${row.student.rollNo}` : ''}</td>${row.daily.map(status => html`<td aria-label="${row.student.name}: ${status === 'P' ? 'Present' : 'Absent'}">${status}</td>`)}<td>${monthHistories.length}</td><td>${row.attended}</td><td>${row.absent}</td><td>${row.percentage}%</td></tr>`;
          })}`)}</tbody></table></div>
        <button class="btn" id="download-month-attendance" type="button">Download attendance</button>`);
      historyList.querySelector('#download-month-attendance').onclick = () => {
        const headers = [
          'Student name',
          ...dates.map(date => `${date.slice(8, 10)}/${date.slice(5, 7)}/${date.slice(0, 4)}`),
          'Total classes',
          'Attended',
          'Absent',
          'Attendance %'
        ];
        const rows = attendanceStudentGroups(attendanceRows.map(row => row.student), groupedByAttendanceSection).flatMap(group => [
          ...(group.section ? [[`⭐ ${group.section}`]] : []),
          ...group.students.map(student => {
            const row = attendanceRowsById.get(String(student.id));
            return [
              `${row.student.name}${row.student.rollNo ? ` · ${row.student.rollNo}` : ''}`,
              ...row.daily,
              monthHistories.length,
              row.attended,
              row.absent,
              `${row.percentage}%`
            ];
          })
        ]);
        const csv = [headers, ...rows].map(row => row.map(csvEscape).join(',')).join('\r\n');
        download(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }), `${subject.code}-${month}-attendance.csv`);
      };
      historyList.querySelector('#back-to-months').onclick = () => {
        selectedMonth = null;
        drawHistory();
      };
    } catch (error) {
      monthHistories.forEach(item => monthHistoryCache.delete(item._id));
      toast(error.message, 'error');
      if (selectedMonth === month) {
        selectedMonth = null;
        drawHistory();
      }
    }
  };
  const drawHistory = () => {
    const search = root.querySelector('#subject-history-search').value.trim().toLowerCase();
    const historyList = root.querySelector('#subject-history-list');
    if (masterSheetView) {
      drawMasterSheet(historyList);
      return;
    }
    if (monthView) {
      if (selectedMonth) {
        drawMonthDetails(selectedMonth, historyList);
        return;
      }
      const months = [...new Set(historiesWithCounts
        .filter(item => /^\d{4}-\d{2}-\d{2}$/.test(item.date))
        .map(item => item.date.slice(0, 7)))]
        .sort()
        .filter(month => {
          const label = `${month.slice(5, 7)}/${month.slice(0, 4)}`;
          return !search || label.includes(search) || String(subject.code).toLowerCase().includes(search);
        });
      historyList.innerHTML = String(months.length
        ? html`<div class="student-attendance-list">${months.map(month => {
          const monthHistories = historiesWithCounts.filter(item => item.date?.startsWith(`${month}-`));
          const presentCount = monthHistories.reduce((total, item) => total + (item.presentCount || 0), 0);
          const totalCount = monthHistories.reduce((total, item) => total + (item.totalCount || 0), 0);
          const percentage = totalCount ? Math.round(presentCount / totalCount * 100) : 0;
          return html`<div class="student-attendance-row"><button class="btn sm" type="button" data-month="${month}">${month.slice(5, 7)}/${month.slice(0, 4)}</button><span class="attendance-count">${percentage}% average attendance</span></div>`;
        })}</div>`
        : html`<div class="empty"><strong>${search ? 'No history matches your search.' : 'No saved history yet.'}</strong></div>`);
      historyList.querySelectorAll('[data-month]').forEach(button => {
        button.onclick = () => {
          selectedMonth = button.dataset.month;
          drawHistory();
        };
      });
    } else {
      const filteredHistory = historiesWithCounts.filter(item => {
        if (!search) return true;
        return String(item.code || '').toLowerCase().includes(search)
          || String(item.date || '').toLowerCase().includes(search)
          || fmtDate(item.date).toLowerCase().includes(search);
      });
      historyList.innerHTML = String(filteredHistory.length
        ? html`<div class="student-attendance-list">${filteredHistory.map(item => html`<div class="student-attendance-row"><span>${item.code} · ${item.date} · Lecture ${item.lectureNo || '-'} · Recorded by ${item.facultyName}</span><span class="attendance-count">${item.presentCount}/${item.totalCount}</span><span class="history-actions"><a class="btn sm" href="#/faculty/subject?subject=${encodeURIComponent(catalogId)}&history=${item._id}">Open</a>${item.isOwner ? html`<button class="btn sm danger" type="button" data-delete-history="${item._id}">Delete</button>` : ''}</span></div>`)}</div>`
        : html`<div class="empty"><strong>${search ? 'No history matches your search.' : 'No saved history yet.'}</strong></div>`);
    }
    historyList.querySelectorAll('[data-delete-history]').forEach(button => {
      button.onclick = async () => {
        if (!confirm('Delete this history permanently? This cannot be undone.')) return;
        button.disabled = true;
        try {
          await api(`/faculty/subject-history/${encodeURIComponent(button.dataset.deleteHistory)}?subject=${encodeURIComponent(catalogId)}`, { method: 'DELETE' });
          toast('History deleted');
          await render(root);
        } catch (error) {
          toast(error.message, 'error');
          button.disabled = false;
        }
      };
    });
  };
  const monthViewButton = root.querySelector('#subject-history-month-view');
  monthViewButton.onclick = () => {
    monthView = !monthView;
    masterSheetView = false;
    root.querySelector('#subject-history-master-sheet').setAttribute('aria-pressed', 'false');
    selectedMonth = null;
    monthViewButton.textContent = monthView ? 'Dates' : 'Month';
    monthViewButton.setAttribute('aria-pressed', String(monthView));
    drawHistory();
  };
  const masterSheetButton = root.querySelector('#subject-history-master-sheet');
  masterSheetButton.onclick = () => {
    masterSheetView = !masterSheetView;
    if (masterSheetView) {
      monthView = false;
      selectedMonth = null;
      monthViewButton.textContent = 'Month';
      monthViewButton.setAttribute('aria-pressed', 'false');
    }
    masterSheetButton.setAttribute('aria-pressed', String(masterSheetView));
    drawHistory();
  };
  root.querySelector('#subject-history-search').oninput = drawHistory;
  drawHistory();
  root.querySelector('#mark-attendance').onclick = () => {
    const now = new Date();
    const today = localDate(now);
    const picker = modal({
      title: 'Select attendance date',
      body: html`<div class="form">
        <label>Select date<span class="date-picker-field"><input id="attendance-date" type="date" value="${selectedDate || today}" required><button id="open-date-picker" type="button" aria-label="Open date picker"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 2v4m8-4v4M3 10h18M5 4h14a2 2 0 0 1 2 2v13a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z"/></svg></button></span></label>
        <label>Lecture no.<select id="attendance-lecture" required><option value="" ${selectedLecture >= 1 && selectedLecture <= 12 ? '' : 'selected'} disabled>Select lecture</option>${[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(lecture => html`<option value="${lecture}" ${selectedLecture === lecture ? 'selected' : ''}>${lecture}</option>`)}</select></label>
        <button class="btn primary" id="continue-attendance" type="button">Continue</button>
      </div>`
    });
    const dateInput = picker.el.querySelector('#attendance-date');
    dateInput.max = today;
    picker.el.querySelector('#open-date-picker').onclick = () => {
      try {
        if (typeof dateInput.showPicker === 'function') dateInput.showPicker();
        else {
          dateInput.focus();
          dateInput.click();
        }
      } catch (error) {
        if (error.name !== 'NotAllowedError') throw error;
        dateInput.focus();
      }
    };
    picker.el.querySelector('#continue-attendance').onclick = () => {
      if (!dateInput.value) {
        dateInput.reportValidity();
        return;
      }
      if (dateInput.value > localDate(new Date())) {
        toast('Future dates are not allowed for attendance.', 'error');
        return;
      }
      const lectureNo = picker.el.querySelector('#attendance-lecture').value;
      if (!lectureNo) {
        picker.el.querySelector('#attendance-lecture').reportValidity();
        return;
      }
      params.set('date', dateInput.value);
      params.set('lectureNo', lectureNo);
      location.hash = `#/faculty/subject?${params.toString()}`;
      picker.close();
    };
  };
}
