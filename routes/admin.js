const express = require('express');
const { requireAuth, requireRole } = require('../middleware/auth');
const complaintService = require('../services/complaintService');
const db = require('../services/db');
const { v4: uuidv4 } = require('uuid');
const router = express.Router();

router.use(requireAuth, requireRole('admin'));

function auditLog(adminId, action, details) {
  db.insert('auditLog', { id: uuidv4(), adminId, action, details, timestamp: new Date().toISOString() });
}

// Dashboard summary stats
router.get('/dashboard', (req, res) => {
  const complaints = db.readAll('complaints');
  const stats = {
    total: complaints.length,
    new: complaints.filter((c) => c.status === 'Submitted').length,
    underReview: complaints.filter((c) => c.status === 'Under Review').length,
    inProgress: complaints.filter((c) => c.status === 'In Progress' || c.status === 'Assigned').length,
    resolved: complaints.filter((c) => c.status === 'Resolved' || c.status === 'Closed').length,
    critical: complaints.filter((c) => c.priority === 'Critical').length
  };
  return res.json({ stats });
});

// List / filter / search all complaints
router.get('/complaints', (req, res) => {
  const { utility, category, status, priority, minConfidence, search, dateFrom, dateTo } = req.query;
  const complaints = complaintService.listAllComplaints({ utility, category, status, priority, minConfidence, search, dateFrom, dateTo });
  const users = db.readAll('users');
  const enriched = complaints.map((c) => {
    const citizen = users.find((u) => u.id === c.userId);
    return { ...c, citizenName: citizen ? citizen.fullName : 'Unknown' };
  });
  return res.json({ complaints: enriched });
});

// Full detail for one complaint (AI classification + history + responses + citizen info)
router.get('/complaints/:id', (req, res) => {
  const full = complaintService.getComplaintFull(req.params.id);
  if (!full) return res.status(404).json({ error: 'NOT_FOUND', message: 'Complaint not found.' });
  const citizen = db.findById('users', full.complaint.userId);
  return res.json({ ...full, citizen: citizen ? { id: citizen.id, fullName: citizen.fullName, email: citizen.email, phone: citizen.phone } : null });
});

// Accept AI classification (no-op besides audit) or change classification
router.post('/complaints/:id/classification', (req, res) => {
  const { category, utility } = req.body || {};
  const VALID_CATEGORIES = ['Power Outage', 'Billing Dispute', 'Water Supply Issue', 'Network Connectivity', 'Sanitation', 'General'];
  if (!category || !VALID_CATEGORIES.includes(category)) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'A valid category is required.' });
  }
  try {
    const result = complaintService.correctClassification(req.params.id, req.user.id, category, utility);
    auditLog(req.user.id, 'CORRECT_CLASSIFICATION', { complaintId: req.params.id, category });
    return res.json(result);
  } catch (e) {
    return res.status(e.code === 'NOT_FOUND' ? 404 : 500).json({ error: e.code || 'SERVER_ERROR', message: e.message });
  }
});

// Update priority
router.post('/complaints/:id/priority', (req, res) => {
  const { priority } = req.body || {};
  try {
    const updated = complaintService.updatePriority(req.params.id, req.user.id, priority);
    auditLog(req.user.id, 'UPDATE_PRIORITY', { complaintId: req.params.id, priority });
    return res.json({ complaint: updated });
  } catch (e) {
    return res.status(e.code === 'INVALID_PRIORITY' ? 400 : 500).json({ error: e.code || 'SERVER_ERROR', message: e.message });
  }
});

// Assign complaint to a team/staff
router.post('/complaints/:id/assign', (req, res) => {
  const { team } = req.body || {};
  if (!team) return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Team/staff name is required.' });
  try {
    const updated = complaintService.assignComplaint(req.params.id, req.user.id, team);
    auditLog(req.user.id, 'ASSIGN_COMPLAINT', { complaintId: req.params.id, team });
    return res.json({ complaint: updated });
  } catch (e) {
    return res.status(e.code === 'NOT_FOUND' ? 404 : 500).json({ error: e.code || 'SERVER_ERROR', message: e.message });
  }
});

// Update status
router.post('/complaints/:id/status', (req, res) => {
  const { status } = req.body || {};
  try {
    const updated = complaintService.updateStatus(req.params.id, status, req.user.id);
    auditLog(req.user.id, 'UPDATE_STATUS', { complaintId: req.params.id, status });
    return res.json({ complaint: updated });
  } catch (e) {
    const code = e.code === 'NOT_FOUND' ? 404 : (e.code === 'INVALID_STATUS' || e.code === 'INVALID_TRANSITION' ? 400 : 500);
    return res.status(code).json({ error: e.code || 'SERVER_ERROR', message: e.message });
  }
});

// Respond to a complaint (optionally marking as a resolution note)
router.post('/complaints/:id/respond', (req, res) => {
  const { message, isResolutionNote } = req.body || {};
  if (!message || !message.trim()) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'A response message is required.' });
  }
  try {
    const response = complaintService.addResponse(req.params.id, req.user.id, message.trim(), isResolutionNote);
    auditLog(req.user.id, 'RESPOND', { complaintId: req.params.id });
    return res.status(201).json({ response });
  } catch (e) {
    return res.status(e.code === 'NOT_FOUND' ? 404 : 500).json({ error: e.code || 'SERVER_ERROR', message: e.message });
  }
});

// Mark resolved (convenience wrapper)
router.post('/complaints/:id/resolve', (req, res) => {
  const { resolutionNotes } = req.body || {};
  try {
    if (resolutionNotes && resolutionNotes.trim()) {
      complaintService.addResponse(req.params.id, req.user.id, resolutionNotes.trim(), true);
    }
    const updated = complaintService.updateStatus(req.params.id, 'Resolved', req.user.id);
    auditLog(req.user.id, 'RESOLVE', { complaintId: req.params.id });
    return res.json({ complaint: updated });
  } catch (e) {
    const code = e.code === 'NOT_FOUND' ? 404 : (e.code === 'INVALID_TRANSITION' ? 400 : 500);
    return res.status(code).json({ error: e.code || 'SERVER_ERROR', message: e.message });
  }
});

module.exports = router;
