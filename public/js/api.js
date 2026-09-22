/* Shared API helper + auth/session utilities used across all pages. */
const API_BASE = '/api';

const Session = {
  get token() { return localStorage.getItem('pucms_token'); },
  get role() { return localStorage.getItem('pucms_role'); },
  get name() { return localStorage.getItem('pucms_name'); },
  set(token, role, name) {
    localStorage.setItem('pucms_token', token);
    localStorage.setItem('pucms_role', role);
    localStorage.setItem('pucms_name', name);
  },
  clear() {
    localStorage.removeItem('pucms_token');
    localStorage.removeItem('pucms_role');
    localStorage.removeItem('pucms_name');
  },
  isLoggedIn() { return !!this.token; }
};

async function apiRequest(method, path, body) {
  const headers = { 'Content-Type': 'application/json' };
  if (Session.token) headers.Authorization = `Bearer ${Session.token}`;
  let res;
  try {
    res = await fetch(API_BASE + path, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined
    });
  } catch (netErr) {
    throw { status: 0, message: 'Could not reach the server. Please check your connection and try again.' };
  }
  let data = null;
  try { data = await res.json(); } catch (e) { /* no body */ }
  if (!res.ok) {
    if (res.status === 401 && path !== '/auth/login' && path !== '/auth/admin/login') {
      Session.clear();
    }
    throw { status: res.status, message: (data && data.message) || 'Something went wrong. Please try again.', code: data && data.error };
  }
  return data;
}

const Api = {
  get: (path) => apiRequest('GET', path),
  post: (path, body) => apiRequest('POST', path, body || {})
};

function requireLogin(expectedRole) {
  if (!Session.isLoggedIn() || (expectedRole && Session.role !== expectedRole)) {
    const target = expectedRole === 'admin' ? 'admin-login.html' : 'index.html';
    window.location.href = target;
  }
}

function logout() {
  Session.clear();
  window.location.href = 'index.html';
}

function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) +
    ' ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function statusClass(status) {
  return 'status-' + String(status).toLowerCase().replace(/\s+/g, '-');
}
function priorityClass(priority) {
  return 'priority-' + String(priority).toLowerCase();
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str == null ? '' : String(str);
  return div.innerHTML;
}

function showAlert(containerId, message, type) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = `<div class="alert ${type || 'error'}">${escapeHtml(message)}</div>`;
}
function clearAlert(containerId) {
  const el = document.getElementById(containerId);
  if (el) el.innerHTML = '';
}

function renderTopbar(active) {
  const role = Session.role;
  const isAdmin = role === 'admin';
  const links = isAdmin ? [
    ['admin-dashboard.html', 'Dashboard', 'dashboard'],
    ['admin-complaints.html', 'Complaints', 'complaints'],
    ['admin-reports.html', 'Reports', 'reports']
  ] : [
    ['citizen-dashboard.html', 'Dashboard', 'dashboard'],
    ['submit-complaint.html', 'Submit Complaint', 'submit'],
    ['my-complaints.html', 'My Complaints', 'mine']
  ];
  const navHtml = links.map(([href, label, key]) =>
    `<a href="${href}" style="${key === active ? 'text-decoration:underline;font-weight:600;color:#fff;' : ''}">${label}</a>`
  ).join('');
  return `
    <header class="topbar">
      <div class="brand"><span>PUCMS</span><span class="badge">${isAdmin ? 'ADMIN' : 'CITIZEN PORTAL'}</span></div>
      <nav>
        ${navHtml}
        <span class="user-pill">${escapeHtml(Session.name || '')}</span>
        <button onclick="logout()">Logout</button>
      </nav>
    </header>
  `;
}
