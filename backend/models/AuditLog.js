const m = require('mongoose'), R = (n, req = true) => ({ type: m.Schema.Types.ObjectId, ref: n, required: req });
module.exports = m.model('AuditLog', new m.Schema({ actor: R('User', false), action: String, entity: String, entityId: m.Schema.Types.Mixed, before: m.Schema.Types.Mixed, after: m.Schema.Types.Mixed, ip: String }, { timestamps: true }));
