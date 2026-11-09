const r = require('express').Router(), bcrypt = require('bcrypt'), { z } = require('zod'), CR = require('../models/CorrectionRequest'), AR = require('../models/AttendanceRecord'), U = require('../models/User'), S = require('../models/AttendanceSession'), FacultySubjectHistory = require('../models/FacultySubjectHistory'), FA = require('../models/FacultyAssignment');
const { authenticate } = require('../middleware/authenticate'), authorize = require('../middleware/authorize'), validate = require('../middleware/validate'), { ah, fail, zid, oid, audit, pct } = require('../utils/helpers');
const svc = require('../services/attendance.service'), rep = require('../services/report.service');
const { spreadsheetRows, writeSpreadsheetRows } = require('../utils/excel');
const spreadsheetDiff = require('../utils/spreadsheetDiff');
const HodFileUpload = require('../models/HodFileUpload');
const { backfillHodFileCampuses } = require('../utils/hodFileCampus');
const { uploadedSubjectsFromFiles, branchMatches } = require('../utils/uploadedSubjects');
const Section = require('../models/Section');
const Subject = require('../models/Subject');
const { averageRecentAttendance, averageAttendanceBySection, averageOfSubjectPercentages } = require('../utils/facultyAttendance');
const { campusForHod, assignedFacultyIdsForDepartment, getHodDepartmentAttendance } = require('../utils/hodDepartmentAttendance');
const { passwordSchema } = require('../utils/password');
r.use(authenticate, authorize('hod'), (req, res, next) => req.user.department ? next() : res.status(403).json({ success: false, message: 'No department assigned' }));
const fileAccessFilter = (user, campus, id) => ({
  ...(id ? { _id: oid(id) } : {}),
  ...(campus ? { campus } : { department: user.department })
});
r.get('/dashboard', ah(async (req, res) => {
  const d = req.user.department;
  const campus = await campusForHod(req.user);
  const assignedFacultyIds = await assignedFacultyIdsForDepartment(req.user, campus);
  const sectionFilter = { department: d, ...(campus ? { campus } : {}) };
  const [students, faculty, pending, sum, rows, sections] = await Promise.all([
    U.countDocuments({ role: 'student', department: d, active: true, ...(campus ? { campus } : {}) }),
    U.countDocuments({
      _id: { $in: assignedFacultyIds },
      role: 'faculty',
      department: d,
      active: true
    }),
    CR.countDocuments({ department: d, status: 'pending' }),
    svc.summary({ department: d }),
    rep.run(req.user, { low: '1' }),
    Section.find(sectionFilter).select('name branch semester').populate('semester', 'name number').sort({ name: 1 }).lean()
  ]);
  const semesterIds = [...new Set(sections.map(section => String(section.semester?._id)).filter(Boolean))];
  await backfillHodFileCampuses();
  const subjectFiles = await HodFileUpload.find({
    ...(campus ? { campus } : {}),
    kind: { $ne: 'student-list' }
  }).select('fileName content department').populate('department', 'name').sort('-createdAt').limit(100).lean();
  const sectionSubjects = sections.map(section => uploadedSubjectsFromFiles({
    files: subjectFiles,
    branch: section.branch,
    semester: section.semester?.number
  }));
  const catalogSubjects = semesterIds.length
    ? await Subject.find({ department: d, semester: { $in: semesterIds } })
      .select('code name semester')
      .populate('semester', 'name number')
      .sort({ code: 1 })
      .lean()
    : [];
  const semesterNames = new Map(sections.map(section => [section.semester?.number, section.semester?.name || '']));
  const subjectByKey = new Map();
  const subjectKey = (code, semester) => `${String(code || '').replace(/[^a-z0-9]/gi, '').toLowerCase()}:${semester}`;
  const addSubject = (subject, semesterNumber, semesterName, section) => {
    const key = subjectKey(subject.code, semesterNumber);
    if (!subject.code || !Number.isFinite(semesterNumber)) return;
    const existing = subjectByKey.get(key);
    if (existing) {
      if (!existing.name && subject.name) existing.name = subject.name;
      if (section && !existing.sections.some(item => String(item._id) === String(section._id))) existing.sections.push(section);
      return;
    }
    subjectByKey.set(key, {
      code: subject.code,
      name: subject.name || '',
      semester: semesterName || semesterNames.get(semesterNumber) || `Semester ${semesterNumber}`,
      semesterNumber,
      sections: section ? [section] : []
    });
  };
  for (const subject of catalogSubjects) {
    addSubject(subject, subject.semester?.number, subject.semester?.name);
  }
  for (const [index, subjectsForSection] of sectionSubjects.entries()) {
    for (const subject of subjectsForSection) {
      addSubject(subject, subject.semester, semesterNames.get(subject.semester), sections[index]);
    }
  }
  for (const subject of subjectByKey.values()) {
    if (!subject.sections.length) {
      subject.sections = sections.filter(section => section.semester?.number === subject.semesterNumber);
    }
  }
  const uploadedSubjectCodes = [...new Set(sectionSubjects.flat().map(subject => subject.code))];
  const subjectCodes = [...new Set([
    ...sectionSubjects.flat().map(subject => subject.code),
    ...catalogSubjects.map(subject => subject.code)
  ])];
  const studentCampuses = ['BIRT', 'BIRTS'].includes(campus) ? ['BIRT', 'BIRTS'] : campus ? [campus] : [];
  const { averageRosterStudents, averageHistories, overall: departmentOverall } = await getHodDepartmentAttendance(req.user, {
    campus,
    assignedFacultyIds,
    sections,
    subjectCodes
  });
  const normalizedCode = code => String(code || '').replace(/[^a-z0-9]/gi, '').toLowerCase();
  const historiesByCode = new Map();
  for (const history of averageHistories) {
    const key = normalizedCode(history.code);
    if (!historiesByCode.has(key)) historiesByCode.set(key, []);
    historiesByCode.get(key).push(history);
  }
  const subjects = [...subjectByKey.values()].map(subject => {
    const roster = averageRosterStudents.filter(student => subject.sections.some(section =>
      String(student.semester) === String(section.semester?._id)
      && (!section.branch || branchMatches(section.branch, student.branch))
    ));
    const recentHistory = (historiesByCode.get(normalizedCode(subject.code)) || []).slice(0, 3);
    return {
      code: subject.code,
      name: subject.name,
      semester: subject.semester,
      averagePresent: averageRecentAttendance(recentHistory, roster.length),
      averageByAttendanceSection: averageAttendanceBySection(recentHistory, roster)
    };
  });
  const attendanceBySection = sections.length
    ? await AR.aggregate([
      { $match: { section: { $in: sections.map(section => section._id) } } },
      { $group: { _id: '$section', present: { $sum: { $cond: [{ $eq: ['$status', 'present'] }, 1, 0] } }, absent: { $sum: { $cond: [{ $eq: ['$status', 'absent'] }, 1, 0] } } } }
    ])
    : [];
  const sectionStats = new Map(attendanceBySection.map(item => [String(item._id), item]));
  const historyCampuses = studentCampuses.length ? studentCampuses : campus ? [campus] : [];
  const studentsInDepartment = await U.find({
    role: 'student',
    department: d,
    ...(studentCampuses.length ? { campus: { $in: studentCampuses } } : {}),
    semester: { $in: sections.map(section => section.semester?._id).filter(Boolean) }
  }).select('_id branch semester').lean();
  const attendanceByRoster = studentsInDepartment.length
    ? await AR.aggregate([
      {
        $match: {
          student: { $in: studentsInDepartment.map(student => student._id) },
          semester: { $in: sections.map(section => section.semester?._id).filter(Boolean) },
          section: { $nin: sections.map(section => section._id) }
        }
      },
      {
        $group: {
          _id: { student: '$student', semester: '$semester', status: '$status' },
          count: { $sum: 1 }
        }
      }
    ])
    : [];
  const rosterAttendance = new Map();
  for (const item of attendanceByRoster) {
    const key = `${item._id.student}:${item._id.semester}`;
    if (!rosterAttendance.has(key)) rosterAttendance.set(key, { present: 0, absent: 0 });
    if (item._id.status === 'present' || item._id.status === 'absent') {
      rosterAttendance.get(key)[item._id.status] = item.count;
    }
  }
  const facultyIds = historyCampuses.length
    ? await U.find({ role: 'faculty', campus: { $in: historyCampuses } }).distinct('_id')
    : [];
  const histories = facultyIds.length && uploadedSubjectCodes.length
    ? await FacultySubjectHistory.find({ faculty: { $in: facultyIds }, code: { $in: uploadedSubjectCodes } })
      .select('code students')
      .lean()
    : [];
  const classes = sections.map((section, index) => {
    const rosterIds = new Set(studentsInDepartment
      .filter(student => String(student.semester) === String(section.semester?._id)
        && (!section.branch || String(student.branch || '').trim().toLowerCase() === section.branch.trim().toLowerCase()))
      .map(student => String(student._id)));
    const directStats = sectionStats.get(String(section._id));
    const stats = { present: directStats?.present || 0, absent: directStats?.absent || 0 };
    for (const studentId of rosterIds) {
      const attendance = rosterAttendance.get(`${studentId}:${section.semester?._id}`);
      stats.present += attendance?.present || 0;
      stats.absent += attendance?.absent || 0;
    }
    if (rosterIds.size) {
      const codes = new Set(sectionSubjects[index].map(subject => normalizedCode(subject.code)));
      for (const history of histories) {
        if (!codes.has(normalizedCode(history.code))) continue;
        const present = (history.students || []).filter(student => rosterIds.has(String(student.id))).length;
        stats.present += present;
        stats.absent += Math.max(0, rosterIds.size - present);
      }
    }
    return {
      id: section._id,
      name: section.name,
      branch: section.branch || '',
      semester: section.semester?.name || '',
      percentage: pct(stats.present, stats.absent)
    };
  });
  res.json({ success: true, data: { students, faculty, pending, threshold: sum.threshold, overall: departmentOverall, subjects, classes, lowStudents: new Set(rows.rows.map(x => x.rollNo)).size } });
}));
r.get('/students', ah(async (req, res) => {
  const campus = await campusForHod(req.user);
  if (!campus) return res.json({ success: true, data: [] });
  const students = await U.find({ role: 'student', department: req.user.department, campus })
    .select('name email instId rollNo branch active createdAt')
    .populate('department', 'name')
    .sort('name')
    .limit(1000)
    .lean();
  res.json({ success: true, data: students });
}));
r.get('/faculty', ah(async (req, res) => {
  const campus = await campusForHod(req.user);
  if (!campus) return res.json({ success: true, data: [] });
  const assignedFacultyIds = await assignedFacultyIdsForDepartment(req.user, campus);
  const faculty = await U.find({
    role: 'faculty',
    _id: { $in: assignedFacultyIds },
    department: req.user.department
  })
    .select('name phone active campus department savedSubjects savedSubjectCampuses savedUploadedSubjects')
    .populate('department', 'name')
    .populate({
      path: 'savedSubjects',
      select: 'code name department semester',
      populate: [
        { path: 'department', select: 'name' },
        { path: 'semester', select: 'number' }
      ]
    })
    .sort('name')
    .limit(1000)
    .lean();
  await backfillHodFileCampuses();
  const subjectFiles = await HodFileUpload.find({
    ...(campus ? { campus } : {}),
    kind: { $ne: 'student-list' }
  }).select('fileName content campus department').sort('-createdAt').limit(100).lean();
  const uploadedNamesByCampusAndCode = new Map();
  const subjectCampuses = [...new Set([
    campus,
    ...faculty.flatMap(member => (member.savedUploadedSubjects || []).map(subject => subject.campus || member.campus))
  ].filter(Boolean))];
  for (const currentCampus of subjectCampuses) {
    const uploaded = uploadedSubjectsFromFiles({ files: subjectFiles.filter(file => file.campus === currentCampus) });
    uploaded.forEach(subject => uploadedNamesByCampusAndCode.set(
      `${currentCampus}:${String(subject.code || '').trim().toUpperCase()}`,
      subject.name || subject.code
    ));
  }
  const historyFaculty = campus
    ? await U.find({ role: { $in: ['faculty', 'hod'] }, campus }).select('_id campus').lean()
    : [];
  const subjectsByFaculty = new Map(faculty.map(member => {
    const subjects = [];
    for (const subject of member.savedSubjects || []) {
      const source = `subject:${String(subject._id)}`;
      const mappings = (member.savedSubjectCampuses || []).filter(item => item.catalogId.endsWith(`:${source}`));
      const subjectCampuses = mappings.length ? mappings.map(item => item.campus) : [member.campus].filter(Boolean);
      subjectCampuses.forEach(subjectCampus => subjects.push({
        catalogId: `${subjectCampus}:${source}`,
        legacyCatalogId: source,
        campus: subjectCampus,
        code: subject.code,
        name: subject.name || uploadedNamesByCampusAndCode.get(`${subjectCampus}:${String(subject.code || '').trim().toUpperCase()}`) || '',
        department: subject.department?.name || '',
        semester: subject.semester?.number
      }));
    }
    for (const subject of member.savedUploadedSubjects || []) {
      const subjectCampus = subject.campus || member.campus;
      const parsed = /^(BIRT|BIRTS|BIST):(subject|upload):(.+)$/i.exec(subject.catalogId);
      const source = parsed ? `${parsed[2].toLowerCase()}:${parsed[3]}` : subject.catalogId;
      const catalogId = parsed?.[1].toUpperCase() === subjectCampus ? subject.catalogId : `${subjectCampus}:${subject.catalogId}`;
      subjects.push({
        catalogId,
        legacyCatalogId: source,
        campus: subjectCampus,
        code: subject.code,
        name: subject.name || uploadedNamesByCampusAndCode.get(`${subjectCampus}:${String(subject.code || '').trim().toUpperCase()}`) || '',
        department: subject.department || '',
        semester: subject.semester
      });
    }
    return [String(member._id), subjects];
  }));
  const catalogIds = [...new Set([...subjectsByFaculty.values()].flatMap(subjects =>
    subjects.flatMap(subject => [subject.catalogId, subject.legacyCatalogId])
  ))];
  const histories = catalogIds.length && historyFaculty.length
    ? await FacultySubjectHistory.find({
      faculty: { $in: historyFaculty.map(member => member._id) },
      catalogId: { $in: catalogIds }
    }).select('faculty catalogId date createdAt students totalStudents').lean()
    : [];
  const data = faculty.map(member => {
    const subjects = subjectsByFaculty.get(String(member._id)) || [];
    const averages = subjects.map(subject => {
      const relevantHistories = histories.filter(history => {
        return String(history.faculty) === String(member._id)
          && (history.catalogId === subject.catalogId || history.catalogId === subject.legacyCatalogId);
      }).slice(0, 3);
      const average = averageRecentAttendance(
        relevantHistories,
        relevantHistories.find(history => history.totalStudents == null)?.students?.length || 0
      );
      subject.totalDays = relevantHistories.length;
      subject.averageAttendance = average?.percentage ?? null;
      return average?.percentage;
    }).filter(value => value != null);
    const averageAttendance = averageOfSubjectPercentages(averages);
    return {
      _id: member._id,
      name: member.name,
      phone: member.phone,
      department: member.department?.name || '',
      campus: member.campus || '',
      active: member.active !== false,
      averageAttendance,
      subjects
    };
  });
  res.json({ success: true, data });
}));
r.delete('/faculty/:id', ah(async (req, res) => {
  const campus = await campusForHod(req.user);
  if (!campus) throw fail(404, 'Faculty not found in your department and college.');
  const assignedFacultyIds = await assignedFacultyIdsForDepartment(req.user, campus);
  const id = oid(req.params.id);
  const faculty = await U.findOne({
    _id: id,
    role: 'faculty',
    department: req.user.department
  });
  if (!faculty || !assignedFacultyIds.some(assignedId => String(assignedId) === String(faculty._id))) {
    throw fail(404, 'Faculty not found in your department classes and college.');
  }

  await U.findByIdAndDelete(id);
  await audit(req, 'hod.faculty.delete', 'User', id, {
    name: faculty.name,
    email: faculty.email,
    department: faculty.department,
    campus: faculty.campus
  }, null);
  res.json({ success: true, data: { id: String(id) } });
}));
r.patch('/faculty/:id/status', validate(z.object({ active: z.boolean() }).strict()), ah(async (req, res) => {
  const { active } = req.body;
  const campus = await campusForHod(req.user);
  if (!campus) throw fail(404, 'Faculty not found in your department and college.');
  const assignedFacultyIds = await assignedFacultyIdsForDepartment(req.user, campus);
  const faculty = await U.findOne({
    _id: oid(req.params.id),
    role: 'faculty',
    department: req.user.department
  });
  if (!faculty || !assignedFacultyIds.some(id => String(id) === String(faculty._id))) {
    throw fail(404, 'Faculty not found in your department classes and college.');
  }
  if (faculty.active === active) return res.json({ success: true, data: { id: faculty.id, active: faculty.active } });

  const before = { active: faculty.active, deactivationNotice: faculty.deactivationNotice };
  if (active) {
    faculty.active = true;
    faculty.deactivationNotice = undefined;
  } else {
    faculty.active = false;
    faculty.deactivationNotice = `Your account was deactivated by HOD ${req.user.name}. Please contact them to request activation.`;
    faculty.tokenVersion += 1;
  }
  await faculty.save();
  audit(req, active ? 'hod.faculty.activate' : 'hod.faculty.deactivate', 'User', faculty._id, before, {
    active: faculty.active,
    deactivationNotice: faculty.deactivationNotice
  });
  res.json({ success: true, data: { id: faculty.id, active: faculty.active } });
}));
r.patch('/students/:id/status', validate(z.object({ active: z.boolean() }).strict()), ah(async (req, res) => {
  const { active } = req.body;
  const id = oid(req.params.id);
  const campus = await campusForHod(req.user);
  if (!campus) throw fail(404, 'Student not found in your department and college.');
  const student = await U.findOne({ _id: id, role: 'student', department: req.user.department, campus });
  if (!student) throw fail(404, 'Student not found in your department.');
  if (student.active === active) return res.json({ success: true, data: { id: student.id, active: student.active } });

  const before = { active: student.active, deactivationNotice: student.deactivationNotice };
  if (active) {
    student.active = true;
    student.deactivationNotice = undefined;
  } else {
    student.active = false;
    student.deactivationNotice = `Your account was deactivated by HOD ${req.user.name}. Please contact them to request activation.`;
    student.tokenVersion += 1;
  }
  await student.save();
  audit(req, active ? 'hod.student.activate' : 'hod.student.deactivate', 'User', student._id, before, {
    active: student.active,
    deactivationNotice: student.deactivationNotice
  });
  res.json({ success: true, data: { id: student.id, active: student.active } });
}));
r.get('/files', ah(async (req, res) => {
  await backfillHodFileCampuses();
  const campus = await campusForHod(req.user);
  const files = await HodFileUpload.find(fileAccessFilter(req.user, campus))
    .select('department fileName kind contentType size createdAt updatedAt')
    .populate('department', 'name')
    .sort('-createdAt')
    .limit(100)
    .lean();
  res.json({
    success: true,
    data: files.map(file => ({
      ...file,
      canManage: true
    }))
  });
}));
r.get('/files/:id/preview', ah(async (req, res) => {
  await backfillHodFileCampuses();
  const campus = await campusForHod(req.user);
  const file = await HodFileUpload.findOne(fileAccessFilter(req.user, campus, req.params.id)).select('fileName content');
  if (!file) throw fail(404, 'File not found in your college.');
  const extension = file.fileName.slice(file.fileName.lastIndexOf('.')).toLowerCase();
  const rows = spreadsheetRows(file.content, extension);
  res.json({ success: true, data: { fileName: file.fileName, rows: rows.slice(0, 500), totalRows: rows.length, truncated: rows.length > 500 } });
}));
r.post('/files', require('express').raw({ type: 'application/octet-stream', limit: '2mb' }), ah(async (req, res) => {
  const fileName = typeof req.query.fileName === 'string' ? req.query.fileName.trim() : '';
  const kind = typeof req.query.kind === 'string' ? req.query.kind : 'general';
  const replaceId = typeof req.query.replaceId === 'string' ? req.query.replaceId : '';
  if (!fileName || fileName.length > 255 || /[\\/\0-\x1f\x7f]/.test(fileName)) {
    throw fail(400, 'Provide a valid CSV or Excel file name.');
  }
  if (!['general', 'student-list', 'subject-list'].includes(kind)) throw fail(400, 'Invalid file type.');
  if (replaceId && !/^[a-f\d]{24}$/i.test(replaceId)) throw fail(400, 'Invalid file to replace.');
  const extension = fileName.slice(fileName.lastIndexOf('.')).toLowerCase();
  const contentTypes = {
    '.csv': 'text/csv',
    '.xls': 'application/vnd.ms-excel',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  };
  if (!contentTypes[extension]) throw fail(400, 'Only .csv, .xls, or .xlsx files are allowed.');
  if (!Buffer.isBuffer(req.body)) throw fail(400, 'The selected file could not be read.');
  const uploadedRows = spreadsheetRows(req.body, extension);
  const campus = await campusForHod(req.user);
  let replacedFile;
  if (replaceId) {
    await backfillHodFileCampuses();
    replacedFile = await HodFileUpload.findOne(fileAccessFilter(req.user, campus, replaceId))
      .select('fileName department campus kind content');
    if (!replacedFile) throw fail(404, 'File to replace was not found in your college.');
  }
  let upload, rowChanges = { added: uploadedRows.length, removed: 0 };
  if (replacedFile) {
    const previousFileName = replacedFile.fileName;
    const previousDepartment = replacedFile.department;
    const previousExtension = previousFileName.slice(previousFileName.lastIndexOf('.')).toLowerCase();
    const previousRows = spreadsheetRows(replacedFile.content, previousExtension);
    rowChanges = spreadsheetDiff(previousRows, uploadedRows);
    replacedFile.kind = kind;
    replacedFile.fileName = fileName;
    replacedFile.contentType = contentTypes[extension];
    replacedFile.size = req.body.length;
    replacedFile.content = req.body;
    upload = await replacedFile.save();
    audit(req, 'hod.file.replace', 'HodFileUpload', upload._id, {
      fileName: previousFileName,
      department: previousDepartment,
      rowsRemoved: rowChanges.removed
    }, { fileName, department: previousDepartment, rowsAdded: rowChanges.added });
  } else {
    upload = await HodFileUpload.create({
      department: req.user.department,
      ...(campus ? { campus } : {}),
      kind,
      fileName,
      contentType: contentTypes[extension],
      size: req.body.length,
      content: req.body
    });
    audit(req, 'hod.file.upload', 'HodFileUpload', upload._id, null, { fileName, department: req.user.department });
  }
  res.status(replacedFile ? 200 : 201).json({ success: true, data: {
    _id: upload._id,
    fileName: upload.fileName,
    contentType: upload.contentType,
    createdAt: upload.createdAt,
    updatedAt: upload.updatedAt,
    ...(replacedFile ? rowChanges : {})
  } });
}));
r.put('/files/:id/rows/:rowIndex', require('express').raw({ type: 'application/octet-stream', limit: '2mb' }), ah(async (req, res) => {
  const rowIndex = Number(req.params.rowIndex);
  if (!Number.isSafeInteger(rowIndex) || rowIndex < 0) throw fail(400, 'Invalid row number.');
  let body;
  try {
    if (!Buffer.isBuffer(req.body)) throw new Error('Missing request body');
    body = JSON.parse(req.body.toString('utf8'));
  }
  catch { throw fail(400, 'Invalid row data.'); }
  const parsed = z.object({ cells: z.array(z.string().max(10000)).max(200) }).strict().safeParse(body);
  if (!parsed.success) throw fail(400, 'A row can contain up to 200 cells, each up to 10,000 characters.');
  await backfillHodFileCampuses();
  const campus = await campusForHod(req.user);
  const file = await HodFileUpload.findOne(fileAccessFilter(req.user, campus, req.params.id)).select('fileName content');
  if (!file) throw fail(404, 'File not found in your college.');
  const extension = file.fileName.slice(file.fileName.lastIndexOf('.')).toLowerCase();
  const rows = spreadsheetRows(file.content, extension);
  if (rowIndex >= rows.length) throw fail(404, 'Row not found in this file.');
  rows[rowIndex] = parsed.data.cells;
  const content = writeSpreadsheetRows(rows, extension);
  if (content.length > 2 * 1024 * 1024) throw fail(400, 'Edited file must be 2 MB or smaller.');
  file.content = content;
  file.size = content.length;
  await file.save();
  audit(req, 'hod.file.row.update', 'HodFileUpload', file._id, { fileName: file.fileName, row: rowIndex + 1 }, { fileName: file.fileName, row: rowIndex + 1 });
  res.json({ success: true, data: { updated: true } });
}));
r.delete('/files/:id/rows/:rowIndex', ah(async (req, res) => {
  const rowIndex = Number(req.params.rowIndex);
  if (!Number.isSafeInteger(rowIndex) || rowIndex < 0) throw fail(400, 'Invalid row number.');
  await backfillHodFileCampuses();
  const campus = await campusForHod(req.user);
  const file = await HodFileUpload.findOne(fileAccessFilter(req.user, campus, req.params.id)).select('fileName content');
  if (!file) throw fail(404, 'File not found in your college.');
  const extension = file.fileName.slice(file.fileName.lastIndexOf('.')).toLowerCase();
  const rows = spreadsheetRows(file.content, extension);
  if (rowIndex >= rows.length) throw fail(404, 'Row not found in this file.');
  rows.splice(rowIndex, 1);
  const content = writeSpreadsheetRows(rows, extension);
  if (content.length > 2 * 1024 * 1024) throw fail(400, 'Edited file must be 2 MB or smaller.');
  file.content = content;
  file.size = content.length;
  await file.save();
  audit(req, 'hod.file.row.delete', 'HodFileUpload', file._id, { fileName: file.fileName, row: rowIndex + 1 }, null);
  res.json({ success: true, data: { deleted: true } });
}));
r.get('/files/:id', ah(async (req, res) => {
  await backfillHodFileCampuses();
  const campus = await campusForHod(req.user);
  const file = await HodFileUpload.findOne(fileAccessFilter(req.user, campus, req.params.id)).select('fileName contentType content');
  if (!file) throw fail(404, 'File not found in your college.');
  res.type(file.contentType).attachment(file.fileName).send(file.content);
}));
r.delete('/files/:id', ah(async (req, res) => {
  await backfillHodFileCampuses();
  const campus = await campusForHod(req.user);
  const file = await HodFileUpload.findOneAndDelete(fileAccessFilter(req.user, campus, req.params.id));
  if (!file) throw fail(404, 'File not found in your college.');
  audit(req, 'hod.file.delete', 'HodFileUpload', file._id, { fileName: file.fileName }, null);
  res.json({ success: true });
}));
r.post('/students/import', validate(z.object({
  students: z.array(z.record(z.string(), z.unknown())).min(1).max(500)
}).strict()), ah(async (req, res) => {
  let imported = 0, skipped = 0;
  const errors = [];
  const field = (row, names) => {
    const entry = Object.entries(row).find(([key, value]) =>
      names.includes(key.toLowerCase().replace(/[\s-]+/g, '_')) && typeof value === 'string' && value.trim()
    );
    return entry ? entry[1].trim() : '';
  };
  for (const [index, row] of req.body.students.entries()) {
    const name = field(row, ['name', 'full_name', 'student_name']);
    const email = field(row, ['email', 'email_address', 'gmail']).toLowerCase();
    const instId = field(row, ['instid', 'institution_id', 'student_id', 'enrollment_number', 'enrollment_no']);
    const rollNo = field(row, ['rollno', 'roll_no', 'roll_number']);
    const password = field(row, ['password', 'pass']);
    const branch = field(row, ['branch']);
    if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !passwordSchema.safeParse(password).success) {
      skipped++;
      errors.push(`Row ${index + 2}: provide a name, valid email, and a password of exactly 6 characters.`);
      continue;
    }
    if (await U.exists({ $or: [{ email }, ...(instId ? [{ instId }] : [])] })) {
      skipped++;
      errors.push(`Row ${index + 2}: email or institution ID already exists.`);
      continue;
    }
    try {
      await U.create({
        name: name.slice(0, 100),
        email,
        instId: instId.slice(0, 30) || undefined,
        rollNo: rollNo.slice(0, 30) || undefined,
        branch: branch.slice(0, 40) || undefined,
        campus: req.user.campus,
        department: req.user.department,
        role: 'student',
        active: true,
        passwordHash: await bcrypt.hash(password, 12)
      });
      imported++;
    } catch (error) {
      skipped++;
      errors.push(`Row ${index + 2}: ${error.message}`);
    }
  }
  audit(req, 'hod.student.import', 'User', null, null, { imported, skipped, department: req.user.department });
  res.json({ success: true, data: { imported, skipped, errors } });
}));
async function deleteSubjectRecords(subjectIds, session) {
  const sessions = await S.find({ subject: { $in: subjectIds } }).select('_id').session(session).lean();
  const records = await AR.find({ subject: { $in: subjectIds } }).select('_id').session(session).lean();
  const sessionIds = sessions.map(item => item._id);
  const recordIds = records.map(item => item._id);
  await CR.deleteMany({
    $or: [
      { subject: { $in: subjectIds } },
      { session: { $in: sessionIds } },
      { record: { $in: recordIds } }
    ]
  }, { session });
  await AR.deleteMany({ subject: { $in: subjectIds } }, { session });
  await S.deleteMany({ subject: { $in: subjectIds } }, { session });
  await require('../models/FacultyAssignment').deleteMany({ subject: { $in: subjectIds } }, { session });
}

r.get('/subjects', ah(async (req, res) => {
  const subjects = await require('../models/Subject').find({ department: req.user.department })
    .sort('code').limit(1000).populate('semester', 'name number');
  res.json({ success: true, data: subjects });
}));
r.patch('/subjects/:id', validate(z.object({
  code: z.string().trim().min(1).max(20),
  name: z.string().trim().min(1).max(120),
  semesterNumber: z.number().int().min(1).max(12)
}).strict()), ah(async (req, res) => {
  const Subject = require('../models/Subject'), Semester = require('../models/Semester');
  const id = oid(req.params.id);
  const before = await Subject.findOne({ _id: id, department: req.user.department });
  if (!before) throw fail(404, 'Subject not found in your department');
  const semester = await Semester.findOne({ number: req.body.semesterNumber });
  if (!semester) throw fail(400, `Semester ${req.body.semesterNumber} does not exist`);
  const updated = await Subject.findOneAndUpdate(
    { _id: id, department: req.user.department },
    { code: req.body.code.toUpperCase(), name: req.body.name, semester: semester._id },
    { new: true, runValidators: true }
  ).populate('semester', 'name number');
  audit(req, 'hod.subject.update', 'Subject', id, before, updated);
  res.json({ success: true, data: updated });
}));
r.delete('/subjects/:id', ah(async (req, res) => {
  const Subject = require('../models/Subject'), id = oid(req.params.id);
  const subject = await Subject.findOne({ _id: id, department: req.user.department });
  if (!subject) throw fail(404, 'Subject not found in your department');
  const session = await Subject.startSession();
  try {
    await session.withTransaction(async () => {
      await deleteSubjectRecords([id], session);
      await Subject.deleteOne({ _id: id, department: req.user.department }, { session });
    });
  } finally {
    await session.endSession();
  }
  audit(req, 'hod.subject.delete', 'Subject', id, subject, null);
  res.json({ success: true });
}));
r.get('/correction-requests', ah(async (req, res) => {
  const m = { department: req.user.department }; if (['pending', 'approved', 'rejected'].includes(req.query.status)) m.status = req.query.status;
  res.json({ success: true, data: await CR.find(m).sort('-createdAt').limit(200).populate('subject', 'code name').populate('student', 'name rollNo') });
}));
const dec = z.object({ decision: z.enum(['approved', 'rejected']), reason: z.string().trim().max(500).optional() }).strict().refine(d => d.decision !== 'rejected' || (d.reason && d.reason.length >= 5), { message: 'A reason is required when rejecting', path: ['reason'] });
r.patch('/correction-requests/:id', validate(dec), ah(async (req, res) => {
  const { decision, reason } = req.body;
  // Atomic claim restricted to the HOD's own department and pending status
  const c = await CR.findOneAndUpdate({ _id: oid(req.params.id), department: req.user.department, status: 'pending' }, { status: decision, reviewedBy: req.user._id, reviewReason: reason, reviewedAt: new Date() });
  if (!c) throw fail(404, 'Pending request not found in your department');
  if (decision === 'approved') await AR.updateOne({ _id: c.record }, { status: c.requestedStatus });
  audit(req, 'correction.' + decision, 'AttendanceRecord', c.record, { status: c.currentStatus }, { status: decision === 'approved' ? c.requestedStatus : c.currentStatus, reason, requestedBy: c.student });
  res.json({ success: true, message: 'Request ' + decision });
}));
r.get('/reports', ah(async (req, res) => res.json({ success: true, data: await rep.run(req.user, {}) })));
module.exports = r;
