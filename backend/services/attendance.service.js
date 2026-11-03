const Setting = require('../models/Setting'), AR = require('../models/AttendanceRecord'), { pct } = require('../utils/helpers');
const cnt = s => ({ $sum: { $cond: [{ $eq: ['$status', s] }, 1, 0] } });
exports.cnt = cnt;
exports.threshold = async () => { const s = await Setting.findOne({ key: 'threshold' }); return s ? s.value : Number(process.env.DEFAULT_THRESHOLD || 75); };
// % = present / (present + absent). Excused records are excluded; cancelled sessions have no records, so never count as absences.
exports.subjectStats = match => AR.aggregate([{ $match: match }, { $group: { _id: '$subject', present: cnt('present'), absent: cnt('absent'), excused: cnt('excused') } },
  { $lookup: { from: 'subjects', localField: '_id', foreignField: '_id', as: 's' } }, { $unwind: '$s' },
  { $project: { code: '$s.code', name: '$s.name', present: 1, absent: 1, excused: 1 } }, { $sort: { code: 1 } }])
  .then(a => a.map(x => ({ ...x, id: x._id, total: x.present + x.absent, percentage: pct(x.present, x.absent) })));
exports.summary = async match => {
  const th = await exports.threshold(), subjects = await exports.subjectStats(match);
  const p = subjects.reduce((a, s) => a + s.present, 0), ab = subjects.reduce((a, s) => a + s.absent, 0);
  return { threshold: th, overall: { present: p, absent: ab, total: p + ab, percentage: pct(p, ab) }, subjects: subjects.map(s => ({ ...s, low: s.percentage !== null && s.percentage < th })) };
};
