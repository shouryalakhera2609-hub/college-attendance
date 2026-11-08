const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  key: { type: String, required: true, unique: true, default: 'admin-classes' },
  fileName: { type: String, required: true, trim: true, maxlength: 255 },
  originalFile: { type: Buffer },
  legacy: { type: Boolean, default: false },
  sections: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Section' }]
}, { timestamps: true });

module.exports = mongoose.model('ClassUpload', schema);
