const m = require('mongoose'), R = (n, req = true) => ({ type: m.Schema.Types.ObjectId, ref: n, required: req });
const s = new m.Schema({ record: R('AttendanceRecord'), session: R('AttendanceSession'), student: R('User'), faculty: R('User'), department: R('Department'), subject: R('Subject'), date: Date,
  currentStatus: String, requestedStatus: { type: String, enum: ['present', 'absent'], required: true }, reason: { type: String, required: true, trim: true, minlength: 10, maxlength: 500 },
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' }, reviewedBy: R('User', false), reviewReason: { type: String, maxlength: 500 }, reviewedAt: Date }, { timestamps: true });
s.index({ record: 1 }, { unique: true, partialFilterExpression: { status: 'pending' } }); s.index({ department: 1, status: 1 });
module.exports = m.model('CorrectionRequest', s);
