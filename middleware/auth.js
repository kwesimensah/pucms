const { verifyToken } = require('../services/authService');

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: 'UNAUTHORIZED', message: 'Authentication token required.' });
  }
  const payload = verifyToken(token);
  if (!payload) {
    return res.status(401).json({ error: 'INVALID_TOKEN', message: 'Session expired or invalid. Please log in again.' });
  }
  req.user = payload; // { id, role, email }
  next();
}

function requireRole(role) {
  return (req, res, next) => {
    if (!req.user || req.user.role !== role) {
      return res.status(403).json({ error: 'FORBIDDEN', message: 'You do not have permission to perform this action.' });
    }
    next();
  };
}

module.exports = { requireAuth, requireRole };
