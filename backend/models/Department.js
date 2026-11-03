const m = require('mongoose'), R = (n, req = true) => ({ type: m.Schema.Types.ObjectId, ref: n, required: req });
module.exports = m.model('Department', new m.Schema({ name: { type: String, required: true, trim: true, maxlength: 100 }, code: { type: String, required: true, unique: true, uppercase: true, trim: true, maxlength: 12 } }, { timestamps: true }));
