const express = require('express');
const { requireAuth, requireRole } = require('../middleware/auth');
const complaintService = require('../services/complaintService');
const notificationService = require('../services/notificationService');
const router = express.Router();

const VALID_UTILITIES = ['Electricity', 'Water', 'Sanitation', 'Telecommunications'];
const MIN_DESCRIPTION_LENGTH = 15;

// Citizen: submit a complaint
router.post('/', requireAuth, requireRole('citizen'), (req, res) => {
  const { utility, title, description, location, phone, attachmentName } = req.body || {};
  if (!utility || !title || !description || !location) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Utility, title, description, and location are required.' });
  }
  if (!VALID_UTILITIES.includes(utility)) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Invalid utility type selected.' });
  }
  if (String(description).trim().length < MIN_DESCRIPTION_LENGTH) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: `Description must be at least ${MIN_DESCRIPTION_LENGTH} characters so we can classify it accurately.` });
  }
  try {
    const { complaint, classification } = complaintService.submitComplaint({
      userId: req.user.id, utility, title, description, location, phone, attachmentName
    });
    return res.status(201).json({ complaint, classification });
  } catch (e) {
    return res.status(500).json({ error: 'SERVER_ERROR', message: 'Could not submit complaint. Please try again.' });
  }
});

// Citizen: list own complaints
router.get('/mine', requireAuth, requireRole('citizen'), (req, res) => {
  const complaints = complaintService.listComplaintsForUser(req.user.id);
  return res.json({ complaints });
});

// Citizen: notifications (must be declared before the /:id catch-all below)
router.get('/notifications/mine', requireAuth, (req, res) => {
  return res.json({ notifications: notificationService.listForUser(req.user.id) });
});

router.post('/notifications/:id/read', requireAuth, (req, res) => {
  const updated = notificationService.markRead(req.params.id, req.user.id);
  if (!updated) return res.status(404).json({ error: 'NOT_FOUND', message: 'Notification not found.' });
  return res.json({ notification: updated });
});

// Citizen: view own complaint detail (with timeline)
router.get('/:id', requireAuth, (req, res) => {
  const full = complaintService.getComplaintFull(req.params.id);
  if (!full) return res.status(404).json({ error: 'NOT_FOUND', message: 'Complaint not found.' });
  if (req.user.role === 'citizen' && full.complaint.userId !== req.user.id) {
    return res.status(403).json({ error: 'FORBIDDEN', message: 'You can only view your own complaints.' });
  }
  return res.json(full);
});

module.exports = router;
