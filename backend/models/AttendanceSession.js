const m = require('mongoose'), R = (n, req = true) => ({ type: m.Schema.Types.ObjectId, ref: n, required: req });
const s = new m.Schema({ subject: R('Subject'), section: R('Section'), department: R('Department'), semester: R('Semester'), faculty: R('User'), term: { type: String, required: true }, date: { type: Date, required: true }, period: { type: Number, required: true, min: 1, max: 12 },
  status: { type: String, enum: ['open', 'submitted', 'cancelled'], default: 'open' }, submittedAt: Date }, { timestamps: true });
s.index({ subject: 1, section: 1, date: 1, period: 1, term: 1 }, { unique: true }); s.index({ faculty: 1, date: -1 });
module.exports = m.model('AttendanceSession', s);
