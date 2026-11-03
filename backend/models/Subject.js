const m = require('mongoose'), R = (n, req = true) => ({ type: m.Schema.Types.ObjectId, ref: n, required: req });
module.exports = m.model('Subject', new m.Schema({ code: { type: String, required: true, uppercase: true, trim: true, maxlength: 20 }, name: { type: String, required: true, trim: true, maxlength: 120 }, department: R('Department'), semester: R('Semester') }, { timestamps: true }));
