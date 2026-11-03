const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 100 },
  email: { type: String, required: true, lowercase: true, trim: true, unique: true },
  instId: { type: String, trim: true, maxlength: 30 },
  rollNo: { type: String, trim: true, maxlength: 30 },
  branch: { type: String, trim: true, maxlength: 40 },
  campus: { type: String, enum: ['BIRT', 'BIRTS', 'BIST'] },
  department: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', required: true },
  phone: { type: String, trim: true, maxlength: 20 },
  role: { type: String, enum: ['student', 'hod', 'faculty'], default: 'student', required: true },
  semester: { type: mongoose.Schema.Types.ObjectId, ref: 'Semester' },
  section: { type: mongoose.Schema.Types.ObjectId, ref: 'Section' },
  term: { type: String, trim: true, maxlength: 20 },
  passwordHash: { type: String, required: true, select: false },
  otpHash: { type: String, required: true },
  expiresAt: { type: Date, required: true },
  attempts: { type: Number, default: 0, min: 0, max: 5 },
  lastSentAt: { type: Date, required: true }
}, { timestamps: true });
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
module.exports = mongoose.model('RegistrationOtp', schema);
