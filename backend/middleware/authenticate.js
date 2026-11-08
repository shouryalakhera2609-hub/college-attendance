const jwt = require('jsonwebtoken'), crypto = require('crypto'), User = require('../models/User');
const COOKIE = 'ca_token', CSRF = 'ca_csrf', TTL = 365 * 24 * 60 * 60 * 1000;
const opts = () => ({ secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/' });
exports.setSession = (res, u) => {
  const t = jwt.sign({ sub: u.id, tv: u.tokenVersion }, process.env.JWT_SECRET, { expiresIn: '365d', algorithm: 'HS256' });
  res.cookie(COOKIE, t, { ...opts(), httpOnly: true, maxAge: TTL });
  res.cookie(CSRF, crypto.randomBytes(24).toString('hex'), { ...opts(), httpOnly: false, maxAge: TTL });
};
exports.clearSession = res => { res.clearCookie(COOKIE, opts()); res.clearCookie(CSRF, opts()); };
// Double-submit CSRF token for every state-changing request (login excluded: no session yet)
exports.csrf = (req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method) || ['/auth/login', '/auth/register/request-otp', '/auth/register/resend-otp', '/auth/register/verify-otp', '/auth/register/hod/request-otp', '/auth/register/faculty/request-otp'].includes(req.path)) return next();
  const c = req.cookies[CSRF], h = req.get('x-csrf-token');
  if (!c || !h || c.length !== h.length || !crypto.timingSafeEqual(Buffer.from(c), Buffer.from(h))) return res.status(403).json({ success: false, message: 'Invalid CSRF token' });
  next();
};
exports.authenticate = async (req, res, next) => {
  try {
    const t = req.cookies[COOKIE];
    if (!t) return res.status(401).json({ success: false, message: 'Authentication required' });
    const p = jwt.verify(t, process.env.JWT_SECRET, { algorithms: ['HS256'] });
    const u = await User.findById(p.sub);
    if (!u || !u.active || u.tokenVersion !== p.tv) return res.status(401).json({ success: false, message: 'Session expired' });
    req.user = u; next();
  } catch { res.status(401).json({ success: false, message: 'Session expired' }); }
};
