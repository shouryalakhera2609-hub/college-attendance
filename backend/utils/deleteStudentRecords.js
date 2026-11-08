const AttendanceRecord = require('../models/AttendanceRecord');
const CorrectionRequest = require('../models/CorrectionRequest');
const Enrollment = require('../models/Enrollment');
const FacultySubjectHistory = require('../models/FacultySubjectHistory');

module.exports = async (studentId, session) => {
  const records = await AttendanceRecord.find({ student: studentId }).select('_id').session(session).lean();
  const recordIds = records.map(item => item._id);
  await CorrectionRequest.deleteMany({
    $or: [{ student: studentId }, { record: { $in: recordIds } }]
  }, { session });
  await AttendanceRecord.deleteMany({ student: studentId }, { session });
  await Enrollment.deleteMany({ student: studentId }, { session });
  await FacultySubjectHistory.updateMany(
    { 'students.id': String(studentId) },
    { $pull: { students: { id: String(studentId) } } },
    { session }
  );
};
