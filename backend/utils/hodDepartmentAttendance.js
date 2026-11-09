const U = require('../models/User');
const Section = require('../models/Section');
const Subject = require('../models/Subject');
const FacultyAssignment = require('../models/FacultyAssignment');
const FacultySubjectHistory = require('../models/FacultySubjectHistory');
const HodFileUpload = require('../models/HodFileUpload');
const { inferDepartmentCampus } = require('./campusForDepartment');
const { backfillHodFileCampuses } = require('./hodFileCampus');
const { uploadedSubjectsFromFiles } = require('./uploadedSubjects');
const { averageRecentAttendance } = require('./facultyAttendance');

async function campusForHod(user) {
  return user.campus || inferDepartmentCampus(await Section.distinct('campus', {
    department: user.department,
    campus: { $in: ['BIRT', 'BIRTS', 'BIST'] }
  }));
}

async function assignedFacultyIdsForDepartment(user, campus) {
  const sections = await Section.find({
    department: user.department,
    ...(campus ? { campus } : {})
  }).distinct('_id');
  if (!sections.length) {
    return U.find({
      role: 'faculty',
      department: user.department,
      ...(campus ? { campus } : {})
    }).distinct('_id');
  }
  const assignedIds = await FacultyAssignment.find({ section: { $in: sections } }).distinct('faculty');
  if (assignedIds.length) return assignedIds;
  return U.find({
    role: 'faculty',
    department: user.department,
    ...(campus ? { campus } : {})
  }).distinct('_id');
}

function departmentOverall(averageRosterStudents, averageHistories) {
  const rosterIds = new Set(averageRosterStudents.map(student => String(student._id)));
  const rosterRollNos = new Set(averageRosterStudents.map(student => String(student.rollNo || '').trim().toLowerCase()).filter(Boolean));
  const recentHistories = averageHistories.slice(0, 3).map(history => ({
    ...history,
    students: (history.students || []).filter(student => {
      const id = String(student.id || '');
      const rollNo = String(student.rollNo || '').trim().toLowerCase();
      return rosterIds.has(id) || (rollNo && rosterRollNos.has(rollNo));
    })
  }));
  return averageRecentAttendance(recentHistories, averageRosterStudents.length) || {
    present: 0,
    total: 0,
    percentage: null
  };
}

async function subjectCodesForDepartment({ campus, department, sections, filesBackfilled }) {
  const semesterIds = [...new Set(sections.map(section => String(section.semester?._id || section.semester)).filter(Boolean))];
  if (!semesterIds.length) return [];
  if (!filesBackfilled) await backfillHodFileCampuses();
  const files = await HodFileUpload.find({
    ...(campus ? { campus } : {}),
    kind: { $ne: 'student-list' }
  }).select('fileName content department').populate('department', 'name').sort('-createdAt').limit(100).lean();
  const sectionSubjects = sections.map(section => uploadedSubjectsFromFiles({
    files,
    branch: section.branch,
    semester: section.semester?.number
  }));
  const catalogSubjects = await Subject.find({ department, semester: { $in: semesterIds } })
    .select('code semester')
    .populate('semester', 'number')
    .lean();
  return [...new Set([
    ...sectionSubjects.flat().map(subject => subject.code),
    ...catalogSubjects.map(subject => subject.code)
  ])];
}

async function getHodDepartmentAttendance(user, options = {}) {
  const campus = options.campus === undefined ? await campusForHod(user) : options.campus;
  const department = user.department?._id || user.department;
  const sections = options.sections || await Section.find({
    department,
    ...(campus ? { campus } : {})
  }).select('branch semester').populate('semester', 'name number').lean();
  const semesterIds = [...new Set(sections.map(section => String(section.semester?._id || section.semester)).filter(Boolean))];
  const assignedFacultyIds = options.assignedFacultyIds || await assignedFacultyIdsForDepartment(user, campus);
  const subjectCodes = options.subjectCodes || await subjectCodesForDepartment({
    campus,
    department,
    sections,
    filesBackfilled: options.filesBackfilled
  });
  const studentCampuses = ['BIRT', 'BIRTS'].includes(campus) ? ['BIRT', 'BIRTS'] : campus ? [campus] : [];
  const [averageRosterStudents, averageHistories] = await Promise.all([
    U.find({
      role: 'student',
      department,
      active: true,
      ...(studentCampuses.length ? { campus: { $in: studentCampuses } } : {}),
      ...(studentCampuses.includes('BIRT') && studentCampuses.includes('BIRTS')
        ? { attendanceSection: { $in: ['Birt', 'Birts'] } }
        : {}),
      semester: { $in: semesterIds }
    }).select('_id branch semester rollNo attendanceSection').lean(),
    assignedFacultyIds.length && subjectCodes.length
      ? FacultySubjectHistory.find({ faculty: { $in: assignedFacultyIds }, code: { $in: subjectCodes } })
        .select('code date createdAt students totalStudents')
        .sort({ date: -1, createdAt: -1 })
        .lean()
      : []
  ]);
  return {
    overall: departmentOverall(averageRosterStudents, averageHistories),
    averageRosterStudents,
    averageHistories
  };
}

module.exports = { campusForHod, assignedFacultyIdsForDepartment, departmentOverall, getHodDepartmentAttendance };
