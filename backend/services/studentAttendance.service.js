const AttendanceRecord = require('../models/AttendanceRecord');
const FacultySubjectHistory = require('../models/FacultySubjectHistory');
const HodFileUpload = require('../models/HodFileUpload');
const User = require('../models/User');
const { uploadedSubjectsForStudent } = require('../utils/uploadedSubjects');
const { backfillHodFileCampuses } = require('../utils/hodFileCampus');
const { overallAttendancePercentage } = require('../utils/studentAttendance');

const normalizeCode = code => String(code || '').replace(/[^a-z0-9]/gi, '').toLowerCase();

exports.getAverageAttendanceByStudent = async (students, campus) => {
  const averages = new Map();
  if (!students.length) return averages;

  if (students.some(student => student.semester)) await backfillHodFileCampuses();
  const studentIds = students.map(student => student._id);
  const [files, facultyIds, recordTotals] = await Promise.all([
    HodFileUpload.find({ campus, kind: { $ne: 'student-list' } })
      .select('fileName content')
      .sort('-createdAt')
      .limit(100)
      .lean(),
    User.distinct('_id', { role: 'faculty', campus }),
    AttendanceRecord.aggregate([
      { $match: { student: { $in: studentIds } } },
      {
        $group: {
          _id: '$student',
          present: { $sum: { $cond: [{ $eq: ['$status', 'present'] }, 1, 0] } },
          absent: { $sum: { $cond: [{ $eq: ['$status', 'absent'] }, 1, 0] } }
        }
      }
    ])
  ]);
  const uploadedByStudent = new Map();
  const codes = new Set();
  for (const student of students) {
    const uploadedSubjects = student.semester
      ? uploadedSubjectsForStudent({ files, semester: student.semester.number, branch: student.branch })
      : [];
    uploadedByStudent.set(String(student._id), uploadedSubjects);
    uploadedSubjects.forEach(subject => codes.add(subject.code));
  }
  const histories = codes.size && facultyIds.length
    ? await FacultySubjectHistory.find({ faculty: { $in: facultyIds }, code: { $in: [...codes] } })
      .select('code students')
      .lean()
    : [];
  const historiesByCode = new Map();
  for (const history of histories) {
    const key = normalizeCode(history.code);
    if (!historiesByCode.has(key)) historiesByCode.set(key, []);
    historiesByCode.get(key).push(history);
  }
  const totalsByStudent = new Map(recordTotals.map(total => [String(total._id), total]));
  for (const student of students) {
    const studentId = String(student._id);
    const uploadedSubjects = uploadedByStudent.get(studentId) || [];
    const subjectCodes = [...new Set(uploadedSubjects.map(subject => normalizeCode(subject.code)))];
    const relevantHistories = subjectCodes.flatMap(code => historiesByCode.get(code) || []);
    const totals = totalsByStudent.get(studentId) || { present: 0, absent: 0 };
    averages.set(studentId, overallAttendancePercentage({
      present: totals.present,
      absent: totals.absent,
      histories: relevantHistories,
      uploadedSubjects,
      studentId: student._id
    }));
  }
  return averages;
};
