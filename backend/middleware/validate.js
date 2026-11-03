module.exports = (schema, src = 'body') => (req, res, next) => {
  const r = schema.safeParse(req[src]);
  if (!r.success) return res.status(422).json({ success: false, message: 'Validation failed', errors: r.error.issues.map(i => ({ field: i.path.join('.'), message: i.message })) });
  if (src === 'body') req.body = r.data; else req.validated = r.data;
  next();
};
