module.exports = (err, req, res, next) => {
  if (err.code === 11000) return res.status(409).json({ success: false, message: 'Duplicate record' });
  if (err.name === 'CastError' || err.name === 'ValidationError') return res.status(400).json({ success: false, message: 'Invalid data' });
  const s = err.status || 500;
  if (s === 500) console.error(err);
  res.status(s).json({ success: false, message: s === 500 ? 'Server error' : err.message });
};
