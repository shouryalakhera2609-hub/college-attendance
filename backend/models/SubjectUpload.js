const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  department: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', required: true, unique: true },
  fileName: { type: String, required: true, trim: true, maxlength: 255 },
  legacy: { type: Boolean, default: false },
  subjects: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Subject' }]
}, { timestamps: true });

module.exports = mongoose.model('SubjectUpload', schema);
