// DEVELOPMENT ONLY. Run explicitly: SEED_PASSWORD='YourStrongPass1' npm run seed  (safe to re-run: upserts by email/code)
require('dotenv').config();
const bcrypt = require('bcrypt'), mongoose = require('mongoose');
const M = n => require('../models/' + n);
(async () => {
  if (process.env.NODE_ENV === 'production') { console.error('Refusing to seed in production'); process.exit(1); }
  const pw = process.env.SEED_PASSWORD; if (!pw || pw.length !== 6) { console.error('Set SEED_PASSWORD (exactly 6 characters) in .env'); process.exit(1); }
  await require('../config/db')();
  const hash = await bcrypt.hash(pw, 12), term = '2026-ODD';
  const up = (Model, f, d) => Model.findOneAndUpdate(f, { $setOnInsert: d }, { upsert: true, new: true });
  const departmentDefinitions = [
    ['CSE', 'CSE'],
    ['EC', 'EC'],
    ['EX', 'EX'],
    ['ME', 'ME'],
    ['IT', 'IT'],
    ['MCA', 'MCA'],
    ['MBA', 'MBA'],
    ['BBA', 'BBA']
  ];
  const departments = [];
  for (const [name, code] of departmentDefinitions) departments.push(await up(M('Department'), { code }, { name, code }));
  const dep = departments.find(department => department.name === 'CSE') || departments[0], sem = await up(M('Semester'), { number: 3 }, { name: 'Semester 3', number: 3 });
  const sec = await up(M('Section'), { name: 'A', department: dep._id, semester: sem._id }, { name: 'A', department: dep._id, semester: sem._id });
  const subs = []; for (const [code, name] of [['BT301', 'Data Structures'], ['BT302', 'Algorithms'], ['MSS', 'Mathematics'], ['MCC', 'Computer Organization']]) subs.push(await up(M('Subject'), { code }, { code, name, department: dep._id, semester: sem._id }));
  const mk = (email, name, role, extra = {}) => up(M('User'), { email }, { email, name, role, passwordHash: hash, department: role === 'admin' ? undefined : dep._id, ...extra });
  await mk('admin@campusattend.dev', 'Admin (dev)', 'admin', { campus: 'BIST' }); await mk('hod@campusattend.dev', 'Dr. Meena Verma (dev)', 'hod', { instId: 'hod001' });
  const fac = await mk('faculty@campusattend.dev', 'Dr. Rajesh Sharma (dev)', 'faculty', { instId: 'fac001' });
  const studs = []; for (const [i, n] of ['Anand Kumar Rai', 'Priya Singh', 'Rohit Verma', 'Neha Sharma', 'Saurabh Patel'].entries()) studs.push(await mk(`student${i + 1}@campusattend.dev`, n, 'student', { instId: `ds00${i + 1}`, rollNo: `DS00${i + 1}` }));
  for (const s of studs) await up(M('Enrollment'), { student: s._id, term }, { student: s._id, section: sec._id, term });
  for (const s of subs) await up(M('FacultyAssignment'), { faculty: fac._id, subject: s._id, section: sec._id, term }, { faculty: fac._id, subject: s._id, section: sec._id, term });
  let p = 1; for (let d = 1; d <= 8; d++) for (const s of subs.slice(0, 2)) {
    const date = new Date(Date.now() - d * 864e5); date.setUTCHours(0, 0, 0, 0);
    const key = { subject: s._id, section: sec._id, date, period: p, term };
    if (await M('AttendanceSession').exists(key)) continue;
    const ses = await M('AttendanceSession').create({ ...key, faculty: fac._id, department: dep._id, semester: sem._id, status: 'submitted', submittedAt: new Date() });
    await M('AttendanceRecord').insertMany(studs.map(st => ({ session: ses._id, student: st._id, subject: s._id, section: sec._id, department: dep._id, semester: sem._id, faculty: fac._id, term, date, status: Math.random() < 0.8 ? 'present' : 'absent' })));
    p = p % 6 + 1;
  }
  console.log('Seeded (dev only). Logins: admin@/hod@/faculty@/student1..5@campusattend.dev with SEED_PASSWORD'); await mongoose.disconnect();
})().catch(e => { console.error(e); process.exit(1); });
