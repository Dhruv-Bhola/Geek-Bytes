// app.js — shared shell, global state manager and live REST API client.
// Serves every page with the Digital DMS header/sidebar, holds the JWT/session
// state, and exposes App.api for authenticated calls to the Express backend
// (port 5000) plus the FastAPI AI engine (port 8000).
const App = (function () {
  // -------------------------------------------------------------------------
  // Backend configuration
  // -------------------------------------------------------------------------
  const API_BASE = window.DMS_API || 'http://127.0.0.1:5000';
  const AI_BASE = window.DMS_AI_API || 'http://127.0.0.1:8000';
  const API_PREFIX = '/api/v1';

  const TOKEN_KEY = 'dms_access_token';
  const REFRESH_KEY = 'dms_refresh_token';
  const USER_KEY = 'dms_user';

  // -------------------------------------------------------------------------
  // Session / state manager
  // -------------------------------------------------------------------------
  const state = {
    user: null,
    caseId: localStorage.getItem('dms_case_id') || 'CYB-1042',
    complaintId: localStorage.getItem('dms_complaint_id') || 'CC-10482',
  };

  function loadSession() {
    try {
      state.user = JSON.parse(localStorage.getItem(USER_KEY) || 'null');
    } catch (e) {
      state.user = null;
    }
    return state.user;
  }

  function setSession(accessToken, refreshToken, user) {
    if (accessToken) {
      localStorage.setItem(TOKEN_KEY, accessToken);
      localStorage.setItem('accessToken', accessToken);
    }
    if (refreshToken) localStorage.setItem(REFRESH_KEY, refreshToken);
    if (user) {
      state.user = user;
      localStorage.setItem(USER_KEY, JSON.stringify(user));
      if (user.role) {
        localStorage.setItem('dms_role', user.role);
        localStorage.setItem('userRole', user.role);
      }
    } else {
      loadSession();
    }
  }

  function clearSession() {
    ['dms_role', 'dms_id', 'userRole', 'accessToken',
      TOKEN_KEY, REFRESH_KEY, USER_KEY,
      'dms_case_id', 'dms_complaint_id',
    ].forEach((k) => localStorage.removeItem(k));
    state.user = null;
  }

  const getToken = () => localStorage.getItem(TOKEN_KEY) || '';
  const isAuthed = () => Boolean(getToken());

  // -------------------------------------------------------------------------
  // REST client (Express + AI engine)
  // -------------------------------------------------------------------------
  async function request(base, path, opts = {}) {
    const { token = true, ...rest } = opts;
    const isForm = rest.body instanceof FormData;
    const headers = Object.assign({}, rest.headers || {});
    // The browser sets the multipart boundary for FormData; forcing a JSON
    // Content-Type would corrupt the body.
    if (!isForm) headers['Content-Type'] = 'application/json';
    if (token) {
      const t = getToken();
      if (t) headers.Authorization = `Bearer ${t}`;
    }
    const resp = await fetch(base + path, Object.assign({}, rest, { headers }));
    if (!resp.ok) {
      let message = `Request failed (${resp.status})`;
      try {
        const body = await resp.json();
        message = body.error || body.detail || message;
      } catch (e) { /* keep default message */ }
      const err = new Error(message);
      err.status = resp.status;
      throw err;
    }
    return resp.json();
  }

  // Authenticated Express API helper.
  const api = {
    base: API_BASE,
    get: (path, o = {}) => request(API_BASE, API_PREFIX + path, { ...o, method: 'GET' }),
    post: (path, body, o = {}) =>
      request(API_BASE, API_PREFIX + path, { ...o, method: 'POST', body: JSON.stringify(body) }),
    patch: (path, body, o = {}) =>
      request(API_BASE, API_PREFIX + path, { ...o, method: 'PATCH', body: JSON.stringify(body) }),
    upload: (path, formData, o = {}) =>
      request(API_BASE, API_PREFIX + path, { ...o, method: 'POST', body: formData, headers: undefined }),
    // Returns both the relative server path and a raw-bytes fallback.
    fullURL: (path) => API_BASE + API_PREFIX + path,
  };

  const AI_PREFIX = '/api/ai';
  const ai = {
    base: AI_BASE,
    get: (path) => request(AI_BASE, AI_PREFIX + path, { token: false, method: 'GET' }),
    post: (path, body) =>
      request(AI_BASE, AI_PREFIX + path, { token: false, method: 'POST', body: JSON.stringify(body) }),
    upload: (path, formData) =>
      request(AI_BASE, AI_PREFIX + path, { token: false, method: 'POST', body: formData }),
  };

  // -------------------------------------------------------------------------
  // UI shell (preserved across pages)
  // -------------------------------------------------------------------------
  const demo = {
    user: { role: localStorage.getItem('dms_role') || 'victim', id: localStorage.getItem('dms_id') || 'demo' },
    caseId: state.caseId,
    complaintId: state.complaintId,
    evidences: [],
  };

  const flow = [
    ['login.html', 'Role Selection'],
    ['dashboard.html', 'Role Dashboard'],
    ['victim-complaint.html', 'Complaint'],
    ['classification.html', 'Classification'],
    ['victim-evidence.html', 'Victim Evidence'],
    ['social-evidence.html', 'Social Evidence'],
    ['police-dashboard.html', 'Dashboard'],
    ['case-management.html', 'Case Management'],
    ['evidence-vault.html', 'Evidence Vault'],
    ['police-upload.html', 'Police Upload'],
    ['verification.html', 'Verification'],
    ['custody.html', 'Chain of Custody'],
    ['ai-investigation.html', 'AI Analysis'],
    ['report.html', 'Final Report'],
    ['admin.html', 'System Admin'],
  ];
  const TOTAL_STEPS = flow.length - 1;
  const currentFile = () => location.pathname.split('/').pop() || 'login.html';
  const currentIndex = () => flow.findIndex((x) => x[0] === currentFile());
  const go = (file) => { if (file) location.href = file; };

  function header() {
    const active = isAuthed() ? 'LIVE BACKEND' : 'DEMO MODE';
    return `<div class="gov-strip"><div class="inner"><span>Government of India</span><span>Ministry of Home Affairs • Cyber Crime Evidence Management</span></div></div>
      <header class="site-header"><div class="inner">
        <div class="brand-lockup">
          <img class="emblem" src="../assets/emblem-dark.png" alt="Government emblem">
          <img class="i4c" src="../assets/i4c.png" alt="I4C">
          <div class="brand-title"><strong>National Cyber Crime Evidence Portal</strong><span>Secure Digital Evidence Management • Digital DMS</span></div>
        </div><div class="header-badge">${active}${state.user ? `<br><span class="muted">${state.user.customUserId || state.user.role}</span>` : ''}</div>
      </div></header>
      <nav class="main-nav"><div class="inner">
        <a href="../pages/police-dashboard.html">Home</a><a href="../pages/victim-complaint.html">Report Crime</a><a href="../pages/evidence-vault.html">Evidence Vault</a><a href="../pages/ai-investigation.html">Forensic Analysis</a><a href="../pages/report.html">Reports</a><a href="../pages/login.html">Role / Login</a>
      </div></nav>`;
  }

  function sidebar() {
    return `<aside class="sidebar"><div class="sidebar-head"><strong>Digital DMS Workflow</strong><span>${TOTAL_STEPS}-step evidence lifecycle</span></div><nav>
      ${flow.map((x, i) => `<a href="../pages/${x[0]}" data-page="${x[0]}"><span class="step-no">${i + 1}</span><span>${x[1]}</span></a>`).join('')}
    </nav><div class="sidebar-foot"><strong>${isAuthed() ? 'Live environment' : 'Demo environment'}</strong><br><span class="muted">${isAuthed() ? 'Data sourced from backend APIs.' : 'Login to connect to the backend.'}</span></div></aside>`;
  }

  function workflow() {
    const idx = currentIndex();
    if (idx < 1) return '';
    return `<div class="workflow" aria-label="Workflow progress">${flow.slice(1).map((x, i) => `<div class="wf ${i + 2 === idx ? 'current' : ''} ${i + 2 < idx ? 'done' : ''}"><span class="n">${i + 2 < idx ? '✓' : i + 2}</span>${x[1]}</div>`).join('')}</div>`;
  }

  function footer() {
    return `<footer class="page-footer"><div>Website Content Managed by Secure Legal & Investigation Document Management System (SIH26190) • Inspired by Indian government cyber-crime portal design conventions.</div><div class="right">${isAuthed() ? 'Connected to live backend • Last sync: ' + new Date().toLocaleString() : 'Frontend demo — connect via Login'}</div></footer>`;
  }

  function injectShell() {
    const layout = document.getElementById('layout');
    const main = document.querySelector('main.content');
    if (!layout || !main) return;
    layout.innerHTML = header();
    const shell = document.createElement('div');
    shell.className = 'app-shell';
    const side = document.createElement('div');
    side.innerHTML = sidebar();
    shell.appendChild(side.firstElementChild);
    shell.appendChild(main);
    layout.insertAdjacentElement('afterend', shell);
    shell.insertAdjacentHTML('afterend', footer());
    const page = main.querySelector('.page,.dashboard');
    if (page && currentIndex() > 0) page.insertAdjacentHTML('afterbegin', workflow());
    const active = currentFile();
    document.querySelectorAll('.sidebar a,.main-nav a').forEach((a) => {
      if (a.getAttribute('href') === `../pages/${active}`) a.classList.add('active');
    });
    const idx = currentIndex();
    if (idx > 0) {
      const nav = document.createElement('div');
      nav.className = 'flow-actions actions';
      nav.innerHTML = `<button class="btn ghost" data-flow="back" ${idx <= 1 ? 'disabled' : ''}>← Back</button><span class="muted small" style="align-self:center">Step ${idx} of ${TOTAL_STEPS}</span><button class="btn primary" data-flow="next">${idx === flow.length - 1 ? 'Finish & Return to Dashboard' : 'Next Step →'}</button>`;
      main.appendChild(nav);
      nav.querySelector('[data-flow="back"]').onclick = () => idx > 1 && go('../pages/' + flow[idx - 1][0]);
      nav.querySelector('[data-flow="next"]').onclick = () => idx === flow.length - 1 ? go('../pages/dashboard.html') : go('../pages/' + flow[idx + 1][0]);
    }
    const routeMap = {
      acceptClass: '../pages/victim-evidence.html',
      createCase: '../pages/evidence-vault.html',
    };
    Object.entries(routeMap).forEach(([id, target]) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('click', () => setTimeout(() => go(target), 350));
    });
    const vaultUpload = [...main.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Upload Evidence');
    if (vaultUpload) vaultUpload.dataset.go = '../pages/police-upload.html';
  }

  function animateCounters() {
    document.querySelectorAll('.num[data-target]').forEach((el) => {
      const target = +el.dataset.target;
      let cur = 0;
      const step = Math.max(1, Math.round(target / 45));
      const t = setInterval(() => {
        cur += step;
        if (cur >= target) {
          el.textContent = target;
          clearInterval(t);
        } else el.textContent = cur;
      }, 20);
    });
  }

  function renderEvidence() {
    const wrap = document.getElementById('evidenceList');
    if (!wrap) return;
    const items = demo.evidences.length ? demo.evidences : [
      { id: 'E-001', title: 'Instagram Screenshot', source: 'Victim', status: 'Pending' },
      { id: 'E-002', title: 'Threat Video', source: 'Victim', status: 'Verified' },
      { id: 'E-009', title: 'CCTV Footage', source: 'Police', status: 'Verified' },
      { id: 'E-004', title: 'Device Extraction', source: 'Forensic', status: 'Verified' },
    ];
    wrap.innerHTML = items.map((z) => `<article class="evidence-card"><div class="title">${z.id} — ${z.title || z.evidenceType || ''}</div><div class="meta">Source: ${z.source || z.sourceType}</div><div class="meta">Status: ${z.status === 'Verified' || z.integrityStatus === 'verified' ? '<span class="pill success">Verified</span>' : '<span class="pill warn">Pending Verification</span>'}</div><div class="actions"><button class="btn ghost small" data-go="../pages/verification.html">View Details</button></div></article>`).join('');
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------
  return {
    init: () => {
      loadSession();
      if (document.querySelector('main.content')) {
        injectShell();
        animateCounters();
        renderEvidence();
      }
      document.addEventListener('click', (e) => {
        const a = e.target.closest('[data-go]');
        if (a) { e.preventDefault(); go(a.dataset.go); }
      });
    },
    api, ai, state, demo, go,
    session: { getToken, setSession, clearSession, isAuthed, loadSession },
  };
})();

window.App = App;

// Lightweight toast utility shared by every module.
window.Toast = {
  show(msg, type = 'info', timeout = 3000) {
    const t = document.createElement('div');
    t.className = 'toast ' + type;
    t.textContent = msg;
    t.style.cssText =
      'position:fixed;right:18px;bottom:18px;padding:10px 14px;border-radius:8px;background:rgba(0,0,0,0.65);color:#fff;backdrop-filter:blur(6px);z-index:9999';
    document.body.appendChild(t);
    t.style.transition = 'opacity 0.2s';
    t.style.opacity = '0';
    setTimeout(() => (t.style.opacity = '1'), 40);
    setTimeout(() => {
      t.style.opacity = '0';
      setTimeout(() => t.remove(), 400);
    }, timeout);
  },
};

window.addEventListener('DOMContentLoaded', () => App.init());
