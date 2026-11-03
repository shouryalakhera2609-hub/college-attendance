const m = require('mongoose'), R = (n, req = true) => ({ type: m.Schema.Types.ObjectId, ref: n, required: req });
const s = new m.Schema({
  name: { type: String, required: true, trim: true, maxlength: 20 },
  department: R('Department'),
  semester: R('Semester'),
  campus: { type: String, enum: ['BIRT', 'BIRTS', 'BIST'], index: true }
}, { timestamps: true });
s.index({ name: 1, department: 1, semester: 1 });
module.exports = m.model('Section', s);
