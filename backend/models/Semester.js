const m = require('mongoose'), R = (n, req = true) => ({ type: m.Schema.Types.ObjectId, ref: n, required: req });
module.exports = m.model('Semester', new m.Schema({ name: { type: String, required: true, trim: true, maxlength: 40 }, number: { type: Number, required: true, min: 1, max: 12, unique: true } }, { timestamps: true }));
