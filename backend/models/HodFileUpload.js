const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  department: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', required: true, index: true },
  campus: { type: String, enum: ['BIRT', 'BIRTS', 'BIST'], index: true },
  fileName: { type: String, required: true, trim: true, maxlength: 255 },
  contentType: { type: String, required: true },
  size: { type: Number, required: true, min: 0 },
  content: { type: Buffer, required: true }
}, { timestamps: true });

module.exports = mongoose.model('HodFileUpload', schema);
