/**
 * Integration tests for PUCMS. Requires the server to be running
 * (npm start) on the configured PORT. Exercises the full citizen -> AI ->
 * admin workflow described in the project spec.
 */
const BASE = `http://localhost:${process.env.PORT || 4000}`;

let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (cond) {
    passed += 1;
    console.log(`  PASS: ${msg}`);
  } else {
    failed += 1;
    console.log(`  FAIL: ${msg}`);
  }
}

async function req(method, path, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(BASE + path, {
    method, headers, body: body ? JSON.stringify(body) : undefined
  });
  let json = null;
  try { json = await res.json(); } catch (e) { /* non-JSON (e.g. CSV) */ }
  return { status: res.status, body: json };
}

async function run() {
  console.log('=== Registration & duplicate email ===');
  const uniqueEmail = `test.citizen.${Date.now()}@example.com`;
  const reg1 = await req('POST', '/api/auth/register', {
    fullName: 'Test Citizen', email: uniqueEmail, password: 'Test@1234', phone: '+233200000000'
  });
  assert(reg1.status === 201 && reg1.body.token, 'Citizen registration succeeds and returns a token');

  const reg2 = await req('POST', '/api/auth/register', {
    fullName: 'Test Citizen', email: uniqueEmail, password: 'Test@1234', phone: '+233200000000'
  });
  assert(reg2.status === 409, 'Duplicate registration is rejected with 409');

  console.log('=== Login ===');
  const badLogin = await req('POST', '/api/auth/login', { email: uniqueEmail, password: 'wrongpass' });
  assert(badLogin.status === 401, 'Invalid login is rejected with 401');

  const citizenLogin = await req('POST', '/api/auth/login', { email: 'yaw.boateng@example.com', password: 'Citizen@123' });
  assert(citizenLogin.status === 200 && citizenLogin.body.token, 'Seeded citizen can log in');
  const citizenToken = citizenLogin.body.token;

  const adminLogin = await req('POST', '/api/auth/admin/login', { email: 'admin@pucms.gov.gh', password: 'Admin@2026' });
  assert(adminLogin.status === 200 && adminLogin.body.token, 'Seeded admin can log in');
  const adminToken = adminLogin.body.token;

  console.log('=== Role-based access control ===');
  const citizenAsAdmin = await req('GET', '/api/admin/dashboard', null, citizenToken);
  assert(citizenAsAdmin.status === 403, 'Citizen token cannot access admin dashboard (403)');

  const noToken = await req('GET', '/api/complaints/mine', null, null);
  assert(noToken.status === 401, 'Unauthenticated request to protected route is rejected (401)');

  console.log('=== Complaint submission validation ===');
  const missingFields = await req('POST', '/api/complaints', { utility: 'Electricity' }, citizenToken);
  assert(missingFields.status === 400, 'Missing required fields rejected with 400');

  const tooShort = await req('POST', '/api/complaints', {
    utility: 'Electricity', title: 'Short', description: 'too short', location: 'Accra'
  }, citizenToken);
  assert(tooShort.status === 400, 'Description below minimum length rejected with 400');

  console.log('=== Complaint submission + AI classification ===');
  const submit = await req('POST', '/api/complaints', {
    utility: 'Electricity',
    title: 'No power for two days',
    description: 'My entire community has been without electricity since yesterday and nobody has come to fix it.',
    location: 'Test Location, Accra'
  }, citizenToken);
  assert(submit.status === 201, 'Complaint submission succeeds (201)');
  assert(/^PUC-\d{4}-\d{6}$/.test(submit.body.complaint.complaintNumber), 'Complaint number follows PUC-YYYY-###### format');
  assert(submit.body.complaint.category === 'Power Outage', 'AI classifies as Power Outage');
  assert(submit.body.complaint.priority === 'High', 'AI assigns High priority for "entire community...since yesterday"');
  assert(submit.body.complaint.status === 'Submitted', 'Initial status is Submitted');
  assert(submit.body.classification.aiConfidence > 0, 'AI confidence score is present and > 0');
  const complaintId = submit.body.complaint.id;

  const lowPriority = await req('POST', '/api/complaints', {
    utility: 'Electricity', title: 'Billing address question',
    description: 'How can I change my billing address on my account please?',
    location: 'Accra'
  }, citizenToken);
  assert(lowPriority.body.complaint.priority === 'Low', 'AI assigns Low priority to informational billing question');

  console.log('=== Citizen tracking ===');
  const mine = await req('GET', '/api/complaints/mine', null, citizenToken);
  assert(mine.status === 200 && mine.body.complaints.some((c) => c.id === complaintId), 'Citizen can list their own complaints');

  const detail = await req('GET', `/api/complaints/${complaintId}`, null, citizenToken);
  assert(detail.status === 200 && detail.body.history.length >= 2, 'Citizen complaint detail includes status history timeline');

  console.log('=== Unauthorized complaint access ===');
  const otherCitizenLogin = await req('POST', '/api/auth/login', { email: 'abena.asante@example.com', password: 'Citizen@123' });
  const otherToken = otherCitizenLogin.body.token;
  const forbiddenView = await req('GET', `/api/complaints/${complaintId}`, null, otherToken);
  assert(forbiddenView.status === 403, 'A citizen cannot view another citizen\'s complaint (403)');

  const notFound = await req('GET', '/api/complaints/does-not-exist', null, citizenToken);
  assert(notFound.status === 404, 'Viewing a non-existent complaint returns 404');

  console.log('=== Admin review, AI correction, assignment, status workflow ===');
  const adminView = await req('GET', `/api/admin/complaints/${complaintId}`, null, adminToken);
  assert(adminView.status === 200 && adminView.body.classification.aiCategory === 'Power Outage', 'Admin can view full AI classification detail');

  const correction = await req('POST', `/api/admin/complaints/${complaintId}/classification`, { category: 'Billing Dispute' }, adminToken);
  assert(correction.status === 200 && correction.body.classification.correctedCategory === 'Billing Dispute', 'Admin can correct AI classification, original is preserved');
  assert(correction.body.classification.originalCategory === 'Power Outage', 'Original AI category is retained for audit after correction');

  // revert back for realism
  await req('POST', `/api/admin/complaints/${complaintId}/classification`, { category: 'Power Outage' }, adminToken);

  const priorityChange = await req('POST', `/api/admin/complaints/${complaintId}/priority`, { priority: 'Critical' }, adminToken);
  assert(priorityChange.status === 200 && priorityChange.body.complaint.priority === 'Critical', 'Admin can manually override priority');

  const assign = await req('POST', `/api/admin/complaints/${complaintId}/assign`, { team: 'Electricity Operations' }, adminToken);
  assert(assign.status === 200 && assign.body.complaint.assignedTeam === 'Electricity Operations', 'Admin can assign a complaint to a team');
  assert(assign.body.complaint.status === 'Assigned', 'Assigning a Submitted complaint auto-advances status to Assigned');

  const badTransition = await req('POST', `/api/admin/complaints/${complaintId}/status`, { status: 'Submitted' }, adminToken);
  assert(badTransition.status === 400, 'Backward status transition is rejected (400)');

  const advance = await req('POST', `/api/admin/complaints/${complaintId}/status`, { status: 'In Progress' }, adminToken);
  assert(advance.status === 200 && advance.body.complaint.status === 'In Progress', 'Admin can advance status to In Progress');

  const respond = await req('POST', `/api/admin/complaints/${complaintId}/respond`, { message: 'A technician has been dispatched.' }, adminToken);
  assert(respond.status === 201, 'Admin can respond to a complaint');

  const resolve = await req('POST', `/api/admin/complaints/${complaintId}/resolve`, { resolutionNotes: 'Fault repaired, power restored.' }, adminToken);
  assert(resolve.status === 200 && resolve.body.complaint.status === 'Resolved', 'Admin can resolve a complaint with resolution notes');
  assert(!!resolve.body.complaint.resolvedAt, 'resolvedAt timestamp is set upon resolution');

  console.log('=== Citizen sees resolution ===');
  const finalView = await req('GET', `/api/complaints/${complaintId}`, null, citizenToken);
  assert(finalView.body.complaint.status === 'Resolved', 'Citizen sees the Resolved status');
  assert(finalView.body.responses.length >= 2, 'Citizen sees administrator responses and resolution notes');
  assert(finalView.body.history.some((h) => h.event.includes('corrected classification')), 'Citizen-visible timeline includes AI correction event');

  console.log('=== Notifications ===');
  const notifs = await req('GET', '/api/complaints/notifications/mine', null, citizenToken);
  assert(notifs.status === 200 && notifs.body.notifications.length > 0, 'Citizen has notifications generated by the workflow');

  console.log('=== Admin dashboard, filtering, analytics, reports ===');
  const dash = await req('GET', '/api/admin/dashboard', null, adminToken);
  assert(dash.status === 200 && dash.body.stats.total >= 40, 'Admin dashboard reports aggregate stats');

  const filtered = await req('GET', '/api/admin/complaints?utility=Water&status=Resolved', null, adminToken);
  assert(filtered.status === 200 && filtered.body.complaints.every((c) => c.utility === 'Water' && c.status === 'Resolved'), 'Admin complaint filtering by utility+status works');

  const searched = await req('GET', '/api/admin/complaints?search=power', null, adminToken);
  assert(searched.status === 200 && searched.body.complaints.length > 0, 'Admin complaint search works');

  const analytics = await req('GET', '/api/admin/reports/analytics', null, adminToken);
  assert(analytics.status === 200 && analytics.body.analytics.totalComplaints >= 40, 'Analytics endpoint returns totals');
  assert(analytics.body.analytics.isSimulatedData === true, 'Analytics response is labeled as simulated/demo data');
  assert(typeof analytics.body.analytics.avgResolutionTimeHours === 'number', 'Average resolution time is calculated');

  const csvRes = await fetch(BASE + '/api/admin/reports/export.csv', { headers: { Authorization: `Bearer ${adminToken}` } });
  const csvText = await csvRes.text();
  assert(csvRes.status === 200 && csvText.startsWith('"Complaint Number"'), 'CSV export returns a valid CSV with header row');

  console.log('=== AI classification failure fallback ===');
  const emptyDescComplaint = await req('POST', '/api/complaints', {
    utility: 'Electricity', title: 'xxxxxxxxxxxxxxx', description: 'zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz', location: 'Accra'
  }, citizenToken);
  assert(emptyDescComplaint.status === 201, 'Complaint with no keyword matches is still stored (never lost)');
  assert(emptyDescComplaint.body.complaint.category === 'General', 'Unclassifiable complaint defaults to General category');

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

run().catch((e) => {
  console.error('Test run crashed:', e);
  process.exit(1);
});
