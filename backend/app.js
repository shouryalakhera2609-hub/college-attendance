const path = require('path'), express = require('express'), helmet = require('helmet'), cors = require('cors');
const cookieParser = require('cookie-parser'), hpp = require('hpp'), sanitize = require('express-mongo-sanitize'), rateLimit = require('express-rate-limit');
const { csrf } = require('./middleware/authenticate'), errorHandler = require('./middleware/errorHandler');
const app = express();
app.disable('x-powered-by');
app.set('trust proxy', process.env.TRUST_PROXY === '1' ? 1 : 0);
app.use(helmet({
  contentSecurityPolicy: { directives: { defaultSrc: ["'self'"], scriptSrc: ["'self'"], styleSrc: ["'self'"], imgSrc: ["'self'", 'data:'], connectSrc: ["'self'"], objectSrc: ["'none'"], frameAncestors: ["'none'"], baseUri: ["'self'"], formAction: ["'self'"] } },
  referrerPolicy: { policy: 'no-referrer' }, crossOriginResourcePolicy: { policy: 'same-origin' }
}));
const origins = (process.env.CORS_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
app.use(cors({ origin: (o, cb) => cb(null, !o || origins.includes(o)), credentials: true }));
app.use(express.json({ limit: '100kb' }));
app.use(cookieParser());
app.use(sanitize());
app.use(hpp());
app.use('/api', rateLimit({ windowMs: 60000, limit: 300, standardHeaders: true, legacyHeaders: false }));
app.use('/api/v1', csrf);
const v1 = express.Router();
v1.use('/auth', require('./routes/auth.routes'));
v1.use('/student', require('./routes/student.routes'));
v1.use('/faculty', require('./routes/faculty.routes'));
v1.use('/attendance', require('./routes/attendance.routes'));
v1.use('/hod', require('./routes/hod.routes'));
v1.use('/admin', require('./routes/admin.routes'));
v1.use('/reports', require('./routes/reports.routes'));
v1.use('/profile', require('./routes/profile.routes'));
app.use('/api/v1', v1);
app.use('/api', (req, res) => res.status(404).json({ success: false, message: 'Not found' }));
app.use(express.static(path.join(__dirname, '../frontend'), { dotfiles: 'ignore', index: 'index.html' }));
app.use(errorHandler);
module.exports = app;
