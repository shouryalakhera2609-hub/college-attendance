const m = require('mongoose'), R = (n, req = true) => ({ type: m.Schema.Types.ObjectId, ref: n, required: req });
const s = new m.Schema({ session: R('AttendanceSession'), student: R('User'), subject: R('Subject'), section: R('Section'), department: R('Department'), semester: R('Semester'), faculty: R('User'), term: String, date: Date,
  status: { type: String, enum: ['present', 'absent', 'excused'], required: true } }, { timestamps: true });
s.index({ session: 1, student: 1 }, { unique: true }); s.index({ student: 1, subject: 1 }); s.index({ department: 1, date: 1 });
module.exports = m.model('AttendanceRecord', s);
