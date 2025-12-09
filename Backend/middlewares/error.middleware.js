export function errorHandler(err, req, res, next) {
  console.error('Unhandled error:', err);
  res.status(500).json({ ok: false, message: err?.message || 'Server error' });
}
