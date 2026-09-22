const { v4: uuidv4 } = require('uuid');
const db = require('./db');
const { classifyComplaint } = require('./aiService');
const { createNotification } = require('./notificationService');

const STATUS_FLOW = ['Submitted', 'Under Review', 'Assigned', 'In Progress', 'Resolved', 'Closed'];

let complaintCounter = null;
function nextComplaintNumber() {
  if (complaintCounter === null) {
    const existing = db.readAll('complaints');
    complaintCounter = existing.length;
  }
  complaintCounter += 1;
  const year = new Date().getFullYear();
  return `PUC-${year}-${String(complaintCounter).padStart(6, '0')}`;
}

function isValidTransition(from, to) {
  if (from === to) return false;
  const fromIdx = STATUS_FLOW.indexOf(from);
  const toIdx = STATUS_FLOW.indexOf(to);
  if (fromIdx === -1 || toIdx === -1) return false;
  // Allow forward progression, and also allow "Closed" from "Resolved" only.
  // Allow a small amount of flexibility (e.g. skipping "Assigned") but never backward.
  return toIdx > fromIdx;
}

function addHistory(complaintId, event, actorId, actorRole) {
  db.insert('statusHistory', {
    id: uuidv4(),
    complaintId,
    event,
    actorId: actorId || null,
    actorRole: actorRole || 'system',
    timestamp: new Date().toISOString()
  });
}

function submitComplaint({ userId, utility, title, description, location, phone, attachmentName }) {
  const now = new Date().toISOString();
  const complaint = {
    id: uuidv4(),
    complaintNumber: nextComplaintNumber(),
    userId,
    utility,
    title,
    description,
    location,
    phone: phone || null,
    attachmentName: attachmentName || null,
    category: null,
    aiCategory: null,
    aiConfidence: null,
    priority: 'Medium',
    status: 'Submitted',
    assignedAdminId: null,
    assignedTeam: null,
    createdAt: now,
    updatedAt: now,
    resolvedAt: null
  };

  db.insert('complaints', complaint);
  addHistory(complaint.id, 'Complaint submitted', userId, 'citizen');

  // Run AI classification. Never lose the complaint if this fails.
  let aiResult;
  try {
    aiResult = classifyComplaint(description);
  } catch (e) {
    aiResult = {
      category: 'General', utility: 'General', confidence: 0, priority: 'Medium',
      keywords: [], requiresManualReview: true, error: 'AI_CLASSIFICATION_FAILED'
    };
  }

  const classification = {
    id: uuidv4(),
    complaintId: complaint.id,
    aiCategory: aiResult.category,
    aiUtility: aiResult.utility,
    aiConfidence: aiResult.confidence,
    aiPriority: aiResult.priority,
    keywords: aiResult.keywords,
    requiresManualReview: !!aiResult.requiresManualReview,
    correctedCategory: null,
    correctedByAdminId: null,
    correctedAt: null,
    originalCategory: aiResult.category,
    originalConfidence: aiResult.confidence,
    createdAt: new Date().toISOString()
  };
  db.insert('aiClassifications', classification);

  const updated = db.updateById('complaints', complaint.id, {
    category: aiResult.category,
    aiCategory: aiResult.category,
    aiConfidence: aiResult.confidence,
    priority: aiResult.priority,
    updatedAt: new Date().toISOString()
  });

  addHistory(complaint.id, `AI classified as ${aiResult.category} (${Math.round(aiResult.confidence * 100)}% confidence)`, null, 'system');

  createNotification(userId, `Your complaint ${complaint.complaintNumber} has been submitted and classified as "${aiResult.category}".`, complaint.id);

  return { complaint: updated, classification };
}

function getComplaintFull(complaintId) {
  const complaint = db.findById('complaints', complaintId);
  if (!complaint) return null;
  const classification = db.findOne('aiClassifications', (c) => c.complaintId === complaintId);
  const history = db.find('statusHistory', (h) => h.complaintId === complaintId)
    .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  const responses = db.find('responses', (r) => r.complaintId === complaintId)
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  return { complaint, classification, history, responses };
}

function listComplaintsForUser(userId) {
  return db.find('complaints', (c) => c.userId === userId)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

function listAllComplaints(filters = {}) {
  let results = db.readAll('complaints');
  if (filters.utility) results = results.filter((c) => c.utility === filters.utility);
  if (filters.category) results = results.filter((c) => c.category === filters.category);
  if (filters.status) results = results.filter((c) => c.status === filters.status);
  if (filters.priority) results = results.filter((c) => c.priority === filters.priority);
  if (filters.minConfidence !== undefined) {
    results = results.filter((c) => (c.aiConfidence || 0) >= Number(filters.minConfidence));
  }
  if (filters.search) {
    const q = filters.search.toLowerCase();
    results = results.filter((c) =>
      c.complaintNumber.toLowerCase().includes(q) ||
      c.title.toLowerCase().includes(q) ||
      c.description.toLowerCase().includes(q)
    );
  }
  if (filters.dateFrom) results = results.filter((c) => new Date(c.createdAt) >= new Date(filters.dateFrom));
  if (filters.dateTo) results = results.filter((c) => new Date(c.createdAt) <= new Date(filters.dateTo));
  return results.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

function updateStatus(complaintId, newStatus, adminId) {
  const complaint = db.findById('complaints', complaintId);
  if (!complaint) {
    const err = new Error('Complaint not found.');
    err.code = 'NOT_FOUND';
    throw err;
  }
  if (!STATUS_FLOW.includes(newStatus)) {
    const err = new Error('Invalid status value.');
    err.code = 'INVALID_STATUS';
    throw err;
  }
  if (!isValidTransition(complaint.status, newStatus)) {
    const err = new Error(`Cannot move complaint from "${complaint.status}" to "${newStatus}".`);
    err.code = 'INVALID_TRANSITION';
    throw err;
  }
  const patch = { status: newStatus, updatedAt: new Date().toISOString() };
  if (newStatus === 'Resolved') patch.resolvedAt = new Date().toISOString();
  const updated = db.updateById('complaints', complaintId, patch);

  addHistory(complaintId, `Status changed to ${newStatus}`, adminId, 'admin');
  createNotification(complaint.userId, `Your complaint ${complaint.complaintNumber} status changed to "${newStatus}".`, complaintId);

  return updated;
}

function assignComplaint(complaintId, adminId, team) {
  const complaint = db.findById('complaints', complaintId);
  if (!complaint) {
    const err = new Error('Complaint not found.');
    err.code = 'NOT_FOUND';
    throw err;
  }
  const updated = db.updateById('complaints', complaintId, {
    assignedAdminId: adminId,
    assignedTeam: team,
    updatedAt: new Date().toISOString()
  });
  addHistory(complaintId, `Assigned to ${team}`, adminId, 'admin');
  createNotification(complaint.userId, `Your complaint ${complaint.complaintNumber} was assigned to ${team}.`, complaintId);
  if (complaint.status === 'Submitted' || complaint.status === 'Under Review') {
    updateStatus(complaintId, 'Assigned', adminId);
  }
  return db.findById('complaints', complaintId);
}

function correctClassification(complaintId, adminId, newCategory, newUtility) {
  const classification = db.findOne('aiClassifications', (c) => c.complaintId === complaintId);
  const complaint = db.findById('complaints', complaintId);
  if (!classification || !complaint) {
    const err = new Error('Complaint or classification not found.');
    err.code = 'NOT_FOUND';
    throw err;
  }
  db.updateById('aiClassifications', classification.id, {
    correctedCategory: newCategory,
    correctedByAdminId: adminId,
    correctedAt: new Date().toISOString()
  });
  db.updateById('complaints', complaintId, {
    category: newCategory,
    utility: newUtility || complaint.utility,
    updatedAt: new Date().toISOString()
  });
  addHistory(complaintId, `Administrator corrected classification: "${classification.aiCategory}" → "${newCategory}"`, adminId, 'admin');
  return getComplaintFull(complaintId);
}

function updatePriority(complaintId, adminId, newPriority) {
  const valid = ['Low', 'Medium', 'High', 'Critical'];
  if (!valid.includes(newPriority)) {
    const err = new Error('Invalid priority value.');
    err.code = 'INVALID_PRIORITY';
    throw err;
  }
  const updated = db.updateById('complaints', complaintId, { priority: newPriority, updatedAt: new Date().toISOString() });
  addHistory(complaintId, `Priority changed to ${newPriority}`, adminId, 'admin');
  return updated;
}

function addResponse(complaintId, adminId, message, isResolutionNote) {
  const complaint = db.findById('complaints', complaintId);
  if (!complaint) {
    const err = new Error('Complaint not found.');
    err.code = 'NOT_FOUND';
    throw err;
  }
  const response = {
    id: uuidv4(),
    complaintId,
    adminId,
    message,
    isResolutionNote: !!isResolutionNote,
    createdAt: new Date().toISOString()
  };
  db.insert('responses', response);
  addHistory(complaintId, isResolutionNote ? 'Resolution notes added' : 'Administrator responded', adminId, 'admin');
  createNotification(complaint.userId, `Administrator responded to your complaint ${complaint.complaintNumber}.`, complaintId);
  return response;
}

module.exports = {
  STATUS_FLOW, submitComplaint, getComplaintFull, listComplaintsForUser, listAllComplaints,
  updateStatus, assignComplaint, correctClassification, updatePriority, addResponse, isValidTransition
};
