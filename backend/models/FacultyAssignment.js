const m = require('mongoose'), R = (n, req = true) => ({ type: m.Schema.Types.ObjectId, ref: n, required: req });
const s = new m.Schema({ faculty: R('User'), subject: R('Subject'), section: R('Section'), term: { type: String, required: true, trim: true, maxlength: 20 } }, { timestamps: true });
s.index({ faculty: 1, subject: 1, section: 1, term: 1 }, { unique: true });
module.exports = m.model('FacultyAssignment', s);
