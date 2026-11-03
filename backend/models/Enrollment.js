const m = require('mongoose'), R = (n, req = true) => ({ type: m.Schema.Types.ObjectId, ref: n, required: req });
const s = new m.Schema({ student: R('User'), section: R('Section'), term: { type: String, required: true, trim: true, maxlength: 20 } }, { timestamps: true });
s.index({ student: 1, term: 1 }, { unique: true }); s.index({ section: 1, term: 1 });
module.exports = m.model('Enrollment', s);
