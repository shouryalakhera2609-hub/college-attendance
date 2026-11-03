const r = require('express').Router(), { z } = require('zod'), FA = require('../models/FacultyAssignment'), En = require('../models/Enrollment'), S = require('../models/AttendanceSession'), CR = require('../models/CorrectionRequest'), U = require('../models/User'), Subject = require('../models/Subject'), Section = require('../models/Section'), HodFileUpload = require('../models/HodFileUpload');
const { authenticate } = require('../middleware/authenticate'), authorize = require('../middleware/authorize'), validate = require('../middleware/validate'), { ah, fail, oid } = require('../utils/helpers');
const { uploadedSubjectsFromFiles } = require('../utils/uploadedSubjects');
const { backfillHodFileCampuses } = require('../utils/hodFileCampus');
r.use(authenticate, authorize('faculty'));
const asg = req => FA.find({ faculty: req.user._id }).populate('subject', 'code name').populate('section', 'name');
r.get('/assignments', ah(async (req, res) => res.json({ success: true, data: await asg(req) })));
async function subjectsForCampus(campus) {
  if (!campus) return [];
  await backfillHodFileCampuses();
  const [departments, files] = await Promise.all([
    Section.distinct('department', { campus }),
    HodFileUpload.find({ campus }).select('fileName content department').populate('department', 'name').sort('-createdAt').limit(100).lean()
  ]);
  const databaseSubjects = departments.length ? await Subject.find({ department: { $in: departments } })
    .select('code name department semester')
    .populate('department', 'name')
    .populate('semester', 'number')
    .sort('code name')
    .lean() : [];
  const uploadedSubjects = uploadedSubjectsFromFiles({ files });
  const catalog = new Map();
  for (const subject of databaseSubjects) {
    const catalogId = `subject:${subject._id}`;
    catalog.set(catalogId, {
      id: catalogId,
      code: subject.code,
      name: subject.name,
      department: subject.department?.name || '',
      semester: subject.semester?.number
    });
  }
  for (const subject of uploadedSubjects) {
    const catalogId = `upload:${subject.code.toLowerCase()}`;
    const alreadyListed = [...catalog.values()].some(item => item.code.toLowerCase() === subject.code.toLowerCase());
    if (!alreadyListed && !catalog.has(catalogId)) catalog.set(catalogId, {
      id: catalogId,
      code: subject.code,
      name: subject.name,
      department: subject.department,
      semester: subject.semester
    });
  }
  return [...catalog.values()].sort((a, b) => a.code.localeCompare(b.code));
}
r.get('/subject-catalog', ah(async (req, res) => {
  res.json({ success: true, data: await subjectsForCampus(req.user.campus) });
}));
r.put('/my-subjects', validate(z.object({
  subjects: z.array(z.string().min(1).max(100)).max(500)
}).strict()), ah(async (req, res) => {
  const subjects = [...new Set(req.body.subjects)];
  const allowed = await subjectsForCampus(req.user.campus);
  const allowedSubjects = new Map(allowed.map(subject => [subject.id, subject]));
  if (subjects.some(subject => !allowedSubjects.has(subject))) throw fail(422, 'Select subjects from your college subject list.');
  const selected = subjects.map(subject => allowedSubjects.get(subject));
  const user = await U.findById(req.user._id);
  if (!user) throw fail(404, 'Faculty account not found.');
  user.savedSubjects = selected
    .filter(subject => subject.id.startsWith('subject:'))
    .map(subject => subject.id.slice('subject:'.length));
  user.savedUploadedSubjects = selected
    .filter(subject => subject.id.startsWith('upload:'))
    .map(subject => ({
      catalogId: subject.id,
      code: subject.code,
      name: subject.name,
      department: subject.department,
      semester: subject.semester
    }));
  await user.save();
  await user.populate({ path: 'savedSubjects', select: 'code name department semester', populate: [{ path: 'department', select: 'name' }, { path: 'semester', select: 'number' }] });
  const savedSubjects = [
    ...user.savedSubjects.map(subject => ({
      catalogId: `subject:${subject._id}`,
      code: subject.code,
      name: subject.name,
      department: subject.department?.name || '',
      semester: subject.semester?.number
    })),
    ...user.savedUploadedSubjects
  ];
  res.json({ success: true, data: savedSubjects });
}));
r.get('/dashboard', ah(async (req, res) => {
  const a = await asg(req), recent = await S.find({ faculty: req.user._id }).sort('-date').limit(6).populate('subject', 'code name').populate('section', 'name');
  const user = await U.findById(req.user._id).populate({ path: 'savedSubjects', select: 'code name department semester', populate: [{ path: 'department', select: 'name' }, { path: 'semester', select: 'number' }] }).lean();
  const savedSubjects = [
    ...(user?.savedSubjects || []).map(subject => ({
      catalogId: `subject:${subject._id}`,
      code: subject.code,
      name: subject.name,
      department: subject.department?.name || '',
      semester: subject.semester?.number
    })),
    ...(user?.savedUploadedSubjects || [])
  ];
  res.json({ success: true, data: { subjects: new Set(a.map(x => String(x.subject._id))).size, sections: new Set(a.map(x => String(x.section._id))).size, sessions: await S.countDocuments({ faculty: req.user._id, status: 'submitted' }), pending: await CR.countDocuments({ faculty: req.user._id, status: 'pending' }), savedSubjects, recent } });
}));
r.get('/sections/:sectionId/students', ah(async (req, res) => {
  const section = oid(req.params.sectionId), term = req.query.term ? String(req.query.term) : null;
  if (!await FA.exists({ faculty: req.user._id, section, ...(term && { term }) })) throw fail(403, 'Not assigned to this section');
  const en = await En.find({ section, ...(term && { term }) }).populate('student', 'name rollNo instId');
  res.json({ success: true, data: en.map(e => e.student).filter(Boolean) });
}));
r.get('/sessions', ah(async (req, res) => res.json({ success: true, data: await S.find({ faculty: req.user._id }).sort('-date').limit(100).populate('subject', 'code name').populate('section', 'name') })));
r.get('/correction-requests', ah(async (req, res) => res.json({ success: true, data: await CR.find({ faculty: req.user._id }).sort('-createdAt').limit(100).populate('subject', 'code name').populate('student', 'name rollNo') })));
module.exports = r;
