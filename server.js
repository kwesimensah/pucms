const express = require('express');
const cors = require('cors');
const path = require('path');
const config = require('./config');

const authRoutes = require('./routes/auth');
const complaintRoutes = require('./routes/complaints');
const adminRoutes = require('./routes/admin');
const reportRoutes = require('./routes/reports');

const app = express();

app.use(cors());
app.use(express.json({ limit: '2mb' }));

// ---- Application layer: API routes ----
app.use('/api/auth', authRoutes);
app.use('/api/complaints', complaintRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/admin/reports', reportRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ---- Presentation layer: static frontend ----
app.use(express.static(path.join(__dirname, 'public')));

// Fallback 404 for unknown API routes
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'NOT_FOUND', message: 'API route not found.' });
});

// Generic error handler (last resort)
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'SERVER_ERROR', message: 'Something went wrong. Please try again.' });
});

app.listen(config.PORT, () => {
  console.log(`PUCMS server running on http://localhost:${config.PORT}`);
});
