const db = require('./db');

function filterByRange(complaints, dateFrom, dateTo) {
  let results = complaints;
  if (dateFrom) results = results.filter((c) => new Date(c.createdAt) >= new Date(dateFrom));
  if (dateTo) results = results.filter((c) => new Date(c.createdAt) <= new Date(dateTo));
  return results;
}

function avgHours(pairs) {
  if (!pairs.length) return 0;
  const totalMs = pairs.reduce((sum, [start, end]) => sum + (new Date(end) - new Date(start)), 0);
  return Math.round((totalMs / pairs.length / 3600000) * 10) / 10;
}

function buildAnalytics(filters = {}) {
  let complaints = db.readAll('complaints');
  if (filters.utility) complaints = complaints.filter((c) => c.utility === filters.utility);
  if (filters.category) complaints = complaints.filter((c) => c.category === filters.category);
  if (filters.status) complaints = complaints.filter((c) => c.status === filters.status);
  if (filters.priority) complaints = complaints.filter((c) => c.priority === filters.priority);
  complaints = filterByRange(complaints, filters.dateFrom, filters.dateTo);

  const byUtility = {};
  const byCategory = {};
  const byStatus = {};
  const byPriority = {};
  const byDate = {};

  const history = db.readAll('statusHistory');

  complaints.forEach((c) => {
    byUtility[c.utility] = (byUtility[c.utility] || 0) + 1;
    byCategory[c.category] = (byCategory[c.category] || 0) + 1;
    byStatus[c.status] = (byStatus[c.status] || 0) + 1;
    byPriority[c.priority] = (byPriority[c.priority] || 0) + 1;
    const day = c.createdAt.slice(0, 10);
    byDate[day] = (byDate[day] || 0) + 1;
  });

  // Average response time: submission -> first admin-authored history event
  const responsePairs = [];
  const resolutionPairs = [];
  complaints.forEach((c) => {
    const events = history.filter((h) => h.complaintId === c.id).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    const firstAdminEvent = events.find((e) => e.actorRole === 'admin');
    if (firstAdminEvent) responsePairs.push([c.createdAt, firstAdminEvent.timestamp]);
    if (c.resolvedAt) resolutionPairs.push([c.createdAt, c.resolvedAt]);
  });

  return {
    totalComplaints: complaints.length,
    resolvedComplaints: complaints.filter((c) => c.status === 'Resolved' || c.status === 'Closed').length,
    pendingComplaints: complaints.filter((c) => !['Resolved', 'Closed'].includes(c.status)).length,
    criticalComplaints: complaints.filter((c) => c.priority === 'Critical').length,
    avgResponseTimeHours: avgHours(responsePairs),
    avgResolutionTimeHours: avgHours(resolutionPairs),
    byUtility, byCategory, byStatus, byPriority, byDate,
    isSimulatedData: true
  };
}

function toCsv(complaints) {
  const headers = [
    'Complaint Number', 'Utility', 'Category', 'Priority', 'Status',
    'AI Confidence', 'Submitted', 'Last Updated', 'Resolved'
  ];
  const rows = complaints.map((c) => [
    c.complaintNumber, c.utility, c.category, c.priority, c.status,
    c.aiConfidence != null ? Math.round(c.aiConfidence * 100) + '%' : '',
    c.createdAt, c.updatedAt, c.resolvedAt || ''
  ]);
  const escape = (v) => `"${String(v).replace(/"/g, '""')}"`;
  return [headers, ...rows].map((row) => row.map(escape).join(',')).join('\n');
}

module.exports = { buildAnalytics, toCsv };
