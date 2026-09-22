const express = require('express');
const { requireAuth, requireRole } = require('../middleware/auth');
const reportService = require('../services/reportService');
const complaintService = require('../services/complaintService');
const router = express.Router();

router.use(requireAuth, requireRole('admin'));

router.get('/analytics', (req, res) => {
  const { utility, category, status, priority, dateFrom, dateTo } = req.query;
  const analytics = reportService.buildAnalytics({ utility, category, status, priority, dateFrom, dateTo });
  return res.json({ analytics });
});

router.get('/export.csv', (req, res) => {
  const { utility, category, status, priority, dateFrom, dateTo } = req.query;
  const complaints = complaintService.listAllComplaints({ utility, category, status, priority, dateFrom, dateTo });
  const csv = reportService.toCsv(complaints);
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="pucms-report.csv"');
  return res.send(csv);
});

module.exports = router;
