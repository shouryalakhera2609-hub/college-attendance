const HodFileUpload = require('../models/HodFileUpload');
const AuditLog = require('../models/AuditLog');
const Section = require('../models/Section');
const { inferDepartmentCampus } = require('./campusForDepartment');

exports.backfillHodFileCampuses = async department => {
  const filter = { campus: { $exists: false } };
  if (department) filter.department = department;
  const files = await HodFileUpload.find(filter).select('_id department').lean();
  if (!files.length) return;

  const ids = files.map(file => file._id);
  const departments = [...new Set(files.map(file => String(file.department)))];
  for (const departmentId of departments) {
    const departmentFiles = files.filter(file => String(file.department) === departmentId);
    const departmentCampus = inferDepartmentCampus(await Section.distinct('campus', {
      department: departmentId,
      campus: { $in: ['BIRT', 'BIRTS', 'BIST'] }
    }));
    if (!departmentCampus) continue;
    await HodFileUpload.updateMany(
      { _id: { $in: departmentFiles.map(file => file._id) }, department: departmentId, campus: { $exists: false } },
      { $set: { campus: departmentCampus } }
    );
  }

  const uploads = await AuditLog.find({
    action: 'hod.file.upload',
    entity: 'HodFileUpload',
    entityId: { $in: ids }
  }).populate('actor', 'department campus').lean();

  for (const upload of uploads) {
    const actorDepartment = upload.actor && upload.actor.department;
    if (!actorDepartment || (department && String(actorDepartment) !== String(department)) || !['BIRT', 'BIRTS', 'BIST'].includes(upload.actor.campus)) continue;
    await HodFileUpload.updateOne(
      { _id: upload.entityId, department: actorDepartment, campus: { $exists: false } },
      { $set: { campus: upload.actor.campus } }
    );
  }
};
