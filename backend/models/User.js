const m = require('mongoose');
const savedUploadedSubjectSchema = new m.Schema({
  catalogId: { type: String, required: true },
  code: { type: String, required: true, trim: true },
  name: { type: String, trim: true, default: '' },
  department: { type: String, trim: true, default: '' },
  semester: Number,
  campus: { type: String, enum: ['BIRT', 'BIRTS', 'BIST'] }
}, { _id: false });
const savedSubjectCampusSchema = new m.Schema({
  catalogId: { type: String, required: true },
  campus: { type: String, enum: ['BIRT', 'BIRTS', 'BIST'], required: true }
}, { _id: false });
const s = new m.Schema({
  name: { type: String, required: true, trim: true, maxlength: 100 },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  instId: { type: String, unique: true, sparse: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true, select: false },
  role: { type: String, enum: ['student', 'faculty', 'hod', 'admin'], required: true, index: true },
  campus: { type: String, enum: ['BIRT', 'BIRTS', 'BIST'], uppercase: true, trim: true },
  attendanceSection: { type: String, enum: ['Birt', 'Birts'] },
  branch: { type: String, trim: true, maxlength: 40 },
  department: { type: m.Schema.Types.ObjectId, ref: 'Department' },
  semester: { type: m.Schema.Types.ObjectId, ref: 'Semester' },
  savedSubjects: [{ type: m.Schema.Types.ObjectId, ref: 'Subject' }],
  savedSubjectCampuses: [savedSubjectCampusSchema],
  savedUploadedSubjects: [savedUploadedSubjectSchema],
  phone: { type: String, trim: true, maxlength: 20 },
  rollNo: { type: String, trim: true }, active: { type: Boolean, default: true },
  failedLogins: { type: Number, default: 0 }, lockUntil: Date, tokenVersion: { type: Number, default: 0 }
}, { timestamps: true, toJSON: { transform: (d, r) => { delete r.passwordHash; delete r.failedLogins; delete r.lockUntil; delete r.tokenVersion; delete r.__v; return r; } } });
s.methods.toSafe = function () { return { id: this.id, name: this.name, email: this.email, instId: this.instId, role: this.role, campus: this.campus, attendanceSection: this.attendanceSection, branch: this.branch, department: this.department, phone: this.phone, rollNo: this.rollNo }; };
module.exports = m.model('User', s);
