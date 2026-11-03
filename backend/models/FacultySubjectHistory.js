const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  faculty: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  catalogId: { type: String, required: true, trim: true, maxlength: 100 },
  code: { type: String, required: true, trim: true, maxlength: 20 },
  date: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
  students: [{
    id: { type: String, required: true },
    name: { type: String, required: true },
    rollNo: { type: String, trim: true, default: '' }
  }]
}, { timestamps: true });

schema.index({ faculty: 1, catalogId: 1, date: 1 }, { unique: true });

module.exports = mongoose.model('FacultySubjectHistory', schema);
