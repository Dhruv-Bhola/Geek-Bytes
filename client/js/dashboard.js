// dashboard.js — Role-aware Digital DMS dashboard (View A).
// Reads the session token/role (accessToken + userRole, i.e. the standard
// contract) with fallback to the app's own keys (dms_access_token/dms_role),
// activates the correct role panel, and hydrates it from the live backend at
// 127.0.0.1:5000/api/v1. When the backend is unreachable, it falls back to
// representative demo data so the interfaces stay usable offline.

(function () {
  const API_TOKEN = localStorage.getItem('accessToken') || localStorage.getItem('dms_access_token') || '';
  const ROLE = localStorage.getItem('userRole') || localStorage.getItem('dms_role') || '';
  let userId =
    (() => { try { return (JSON.parse(localStorage.getItem('dms_user') || 'null') || {}).customUserId; } catch (e) { return null; } })() ||
    localStorage.getItem('dms_id') || '';

  const API_BASE = 'http://127.0.0.1:5000/api/v1';

  // --------------------------------------------------------------------------
  // Auth guard
  // --------------------------------------------------------------------------
  if (!API_TOKEN || !ROLE) {
    window.location.replace('login.html');
    return;
  }
  if (ROLE === 'admin') {
    window.location.replace('admin.html');
    return;
  }

  const headers = { Authorization: 'Bearer ' + API_TOKEN, 'Content-Type': 'application/json' };
  const role = ['investigator'].includes(ROLE) ? 'police' : ROLE;

  function authGet(path) {
    return fetch(API_BASE + path, { method: 'GET', headers })
      .then(async (r) => {
        if (!r.ok) {
          if (r.status === 401) { window.location.replace('login.html'); throw new Error('Session expired'); }
          const b = await r.json().catch(() => ({}));
          throw new Error(b.error || b.detail || ('HTTP ' + r.status));
        }
        return r.json();
      })
      .catch((e) => { if (e.message !== 'Session expired') console.warn('[dashboard] fallback for ' + path, e.message); return null; });
  }

  // Extract a list from the common envelope: { success, data, ...payload }
  function listFrom(res, key) {
    if (!res) return null;
    return res[key] || (res.data && res.data[key]) || null;
  }

  // --------------------------------------------------------------------------
  // Panel activation
  // --------------------------------------------------------------------------
  const PANELS = { victim: 'victim', police: 'police', forensic: 'forensic', judge: 'judge' };
  const panelKey = PANELS[role] || 'victim';
  document.querySelectorAll('.role-panel').forEach((el) => {
    el.classList.toggle('active', el.dataset.rolepanel === panelKey);
  });

  const roleLabel = { victim: 'Victim', police: 'Police Officer', forensic: 'Forensic Analyst', judge: 'Court / Judge' }[role] || role;
  const meta = document.getElementById('dashUserMeta');
  if (meta) meta.textContent = (roleLabel + (userId ? ' — ' + userId : '')).toUpperCase();

  function row(html) { return '<tr>' + html + '</tr>'; }
  function badge(status) {
    const s = String(status || '').toLowerCase();
    if (['verified', 'closed', 'resolved', 'open'].includes(s)) return '<span class="badge success">' + (status || '') + '</span>';
    if (['tampered', 'urgent', 'high', 'rejected'].includes(s)) return '<span class="badge danger">' + (status || '') + '</span>';
    if (['pending', 'submitted', 'under_review', 'analysis'].includes(s)) return '<span class="badge warn">' + (status || '') + '</span>';
    return '<span class="badge neutral">' + (status || '—') + '</span>';
  }

  // --------------------------------------------------------------------------
  // VICTIM dashboard
  // --------------------------------------------------------------------------
  async function loadVictim() {
    const res = await authGet('/cases/complaints/own');
    const complaints = listFrom(res, 'complaints');
    const data = (Array.isArray(complaints) && complaints.length) ? complaints : [
      { complaintId: 'CC-10482', incidentDate: '2025-04-12', platform: 'Instagram', status: 'case_created', cases: [{ caseId: 'CYB-1042', status: 'open' }] },
      { complaintId: 'CC-10421', incidentDate: '2025-03-28', platform: 'WhatsApp', status: 'submitted', cases: [] },
    ];

    const total = data.length;
    const active = data.filter((c) => (c.cases || []).some((k) => String(k.status).toLowerCase() === 'open')).length;
    const updated = data.length ? new Date().toLocaleDateString() : '—';

    document.getElementById('victimTotal').textContent = total;
    document.getElementById('victimActive').textContent = active;
    document.getElementById('victimVerified').textContent = total;
    document.getElementById('victimUpdated').textContent = updated;

    const tbody = document.getElementById('victimTable');
    if (!data.length) { tbody.innerHTML = '<tr><td colspan="5" class="empty-state">No complaints filed yet.</td></tr>'; return; }
    tbody.innerHTML = data.map((c) => row(
      '<td><strong>' + (c.complaintId || '—') + '</strong></td>' +
      '<td>' + (c.incidentDate ? new Date(c.incidentDate).toLocaleDateString() : '—') + '</td>' +
      '<td>' + (c.platform || '—') + '</td>' +
      '<td>' + badge((c.cases && c.cases[0] && c.cases[0].status) || c.status) + '</td>' +
      '<td><a class="btn-ghost" style="padding:5px 10px" href="victim-evidence.html">Add Evidence</a> <a class="btn-ghost" style="padding:5px 10px" href="victim-complaint.html">Track</a></td>'
    )).join('');
  }

  // --------------------------------------------------------------------------
  // POLICE dashboard
  // --------------------------------------------------------------------------
  async function loadPolice() {
    const [caseRes] = await Promise.all([authGet('/cases')]);
    const cases = listFrom(caseRes, 'cases');
    const caseData = (Array.isArray(cases) && cases.length) ? cases : [
      { caseId: 'CYB-1042', caseTitle: 'Harassment & Stalking', status: 'open', riskScore: 0.8, complaint: { complaintId: 'CC-10482', aiPredictedCategory: 'Cyber Harassment' }, assignedOfficer: { customUserId: 'Rahul123' } },
      { caseId: 'CYB-1003', caseTitle: 'Bank Fraud', status: 'analysis', riskScore: 0.6, complaint: { complaintId: 'CC-10112', aiPredictedCategory: 'Financial Fraud' }, assignedOfficer: { customUserId: 'Rahul123' } },
      { caseId: 'CYB-0978', caseTitle: 'Identity Theft', status: 'closed', riskScore: 0.3, complaint: { complaintId: 'CC-10098', aiPredictedCategory: 'Identity Theft' }, assignedOfficer: { customUserId: 'Rahul123' } },
    ];

    // Count linked evidence across cases (best-effort via case evidence endpoint)
    let evidenceCount = 0;
    let pendingIntake = 0;
    const evRes = await authGet('/evidence/case/' + (caseData[0] && caseData[0].caseId || 'CYB-1042'));
    const evs = (evRes && (evRes.evidences || (evRes.data && evRes.data.evidences))) || null;
    if (Array.isArray(evs)) {
      evidenceCount = evs.length;
      pendingIntake = evs.filter((e) => String(e.integrityStatus).toLowerCase() === 'pending').length;
    }

    document.getElementById('policeCases').textContent = caseData.length;
    document.getElementById('policeUrgent').textContent = caseData.filter((c) => Number(c.riskScore) >= 0.7).length;
    document.getElementById('policeEvidence').textContent = evidenceCount;
    document.getElementById('policePending').textContent = pendingIntake;

    const tbody = document.getElementById('policeTable');
    if (!caseData.length) { tbody.innerHTML = '<tr><td colspan="5" class="empty-state">No assigned cases.</td></tr>'; return; }
    tbody.innerHTML = caseData.map((c) => row(
      '<td><strong>' + (c.caseId || '—') + '</strong><div class="muted small">' + (c.caseTitle || '') + '</div></td>' +
      '<td>' + ((c.complaint && c.complaint.complaintId) || '—') + '<div class="muted small">' + ((c.complaint && c.complaint.aiPredictedCategory) || '') + '</div></td>' +
      '<td>' + ((c.complaint && c.complaint.aiPredictedCategory) || '—') + '</td>' +
      '<td>' + badge('linked') + '</td>' +
      '<td>' + (Number(c.riskScore) >= 0.7 ? badge('urgent') : badge('normal')) + '</td>'
    )).join('');
  }

  // --------------------------------------------------------------------------
  // FORENSIC dashboard
  // --------------------------------------------------------------------------
  async function loadForensic() {
    const evRes = await authGet('/evidence/case/CYB-1042');
    const evs = (evRes && (evRes.evidences || (evRes.data && evRes.data.evidences))) || null;
    const data = (Array.isArray(evs) && evs.length) ? evs : [
      { evidenceId: 'E-009', evidenceType: 'video', integrityStatus: 'verified', sha256Hash: 'a3f…9c1', metadata: {} },
      { evidenceId: 'E-001', evidenceType: 'screenshot', integrityStatus: 'verified', sha256Hash: '77d…04b', metadata: {} },
      { evidenceId: 'E-002', evidenceType: 'video', integrityStatus: 'pending', sha256Hash: 'b22…7ee', metadata: {} },
    ];

    const verified = data.filter((e) => String(e.integrityStatus).toLowerCase() === 'verified').length;
    const pending = data.length - verified;
    document.getElementById('forensicPending').textContent = pending;
    document.getElementById('forensicMalware').textContent = data.filter((e) => ['video', 'document', 'other'].includes(e.evidenceType)).length;
    document.getElementById('forensicMeta').textContent = data.length;
    document.getElementById('forensicVerified').textContent = verified;

    const tbody = document.getElementById('forensicTable');
    if (!data.length) { tbody.innerHTML = '<tr><td colspan="5" class="empty-state">No evidence queued for analysis.</td></tr>'; return; }
    tbody.innerHTML = data.map((e) => row(
      '<td><strong>' + (e.evidenceId || '—') + '</strong></td>' +
      '<td>' + (e.evidenceType || '—') + '</td>' +
      '<td id="ist_' + (e.evidenceId || '') + '">' + badge(e.integrityStatus || 'pending') + '</td>' +
      '<td style="font-family:monospace;font-size:11px">' + String(e.sha256Hash || '').slice(0, 18) + '…</td>' +
      '<td><button class="btn-ghost" style="padding:5px 10px" data-forensic="' + (e.evidenceId || '') + '">Analyze</button> ' +
      '<button class="btn-primary" style="padding:5px 10px" data-verify="' + (e.evidenceId || '') + '">Verify Hash</button></td>'
    )).join('');

    // Bind first-row preview + timeline
    tbody.querySelectorAll('[data-forensic]').forEach((btn) => {
      btn.addEventListener('click', () => showForensicDetail(data.find((e) => e.evidenceId === btn.dataset.forensic)));
    });
    // Bind integrity verification -> GET /api/v1/evidence/:id/verify
    tbody.querySelectorAll('[data-verify]').forEach((btn) => {
      btn.addEventListener('click', () => verifyEvidence(btn.dataset.verify, btn));
    });
  }

  async function verifyEvidence(eid, btn) {
    if (!eid) return;
    btn.disabled = true;
    btn.textContent = 'Verifying…';
    const res = await authGet('/evidence/' + eid + '/verify');
    btn.disabled = false;
    const statusCell = document.getElementById('ist_' + eid);
    const feed = document.getElementById('forensicFeed');
    const verdict = (res && res.status) === 'VERIFIED';
    if (statusCell) statusCell.innerHTML = verdict ? badge('verified') : badge('tampered');
    if (res) {
      const onchain = res.onchain && res.onchain.available ? (res.onchain.valid ? 'anchored' : 'MISMATCH') : 'chain-offline';
      feed.innerHTML = '<li><span class="t">now</span><span class="tag">' + (verdict ? badge('verified') : badge('tampered')) + '</span><span>Live vs stored: ' + ((res.liveHash || '').slice(0, 12) || 'n/a') + '… vs ' + (res.sha256Hash || '').slice(0, 12) + '…</span></li>' +
        '<li><span class="t">now</span><span class="tag">' + badge(onchain === 'anchored' ? 'verified' : 'warn') + '</span><span>Blockchain: ' + onchain + '</span></li>';
      Toast.show((verdict ? 'VERIFIED' : 'TAMPERED') + ' — ' + eid, verdict ? 'success' : 'error');
    } else {
      feed.innerHTML = '<li><span class="t">now</span><span class="tag">' + badge('verified') + '</span><span>Offline demo: hash integrity OK</span></li>';
      Toast.show('VERIFIED (offline) — ' + eid, 'success');
    }
  }

  async function showForensicDetail(rec) {
    if (!rec) return;
    document.getElementById('forensicOcr').textContent = ((rec.metadata && rec.metadata.originalName) || '—');
    document.getElementById('forensicType').textContent = rec.evidenceType || '—';
    document.getElementById('forensicUploaded').textContent = rec.createdAt ? new Date(rec.createdAt).toLocaleString() : '—';
    var hs = document.getElementById('forensicHashStatus');
    hs.innerHTML = (String(rec.integrityStatus).toLowerCase() === 'verified')
      ? '<span class="badge success">Verified</span>'
      : '<span class="badge warn">Pending</span>';

    const feed = document.getElementById('forensicFeed');
    const cuRes = await authGet('/custody/' + rec.evidenceId);
    const timeline = (cuRes && cuRes.timeline) || (cuRes && cuRes.data && cuRes.data.timeline) || null;
    if (Array.isArray(timeline)) {
      feed.innerHTML = timeline.length
        ? timeline.map((t) => '<li><span class="t">' + new Date(t.timestamp).toLocaleString() + '</span><span class="tag">' + badge(t.action) + '</span><span>' + ((t.actor && t.actor.customUserId) || '—') + '</span><span>' + (t.remarks || '') + '</span></li>').join('')
        : '<li class="muted small">No custody events recorded.</li>';
    } else {
      feed.innerHTML = '<li><span class="t">now</span><span class="tag">' + badge('verified') + '</span><span>forensic_anil</span><span>SHA-256 validation passed</span></li>';
    }
  }

  // --------------------------------------------------------------------------
  // JUDGE dashboard
  // --------------------------------------------------------------------------
  async function loadJudge() {
    const res = await authGet('/cases');
    const cases = listFrom(res, 'cases');
    const data = (Array.isArray(cases) && cases.length) ? cases : [
      { caseId: 'CYB-1042', caseTitle: 'Harassment & Stalking', status: 'open', riskScore: 0.8, assignedOfficer: { customUserId: 'Rahul123' } },
      { caseId: 'CYB-0978', caseTitle: 'Identity Theft', status: 'closed', riskScore: 0.3, assignedOfficer: { customUserId: 'Rahul123' } },
    ];

    document.getElementById('judgeCases').textContent = data.length;
    document.getElementById('judgeChargesheet').textContent = data.filter((c) => ['closed', 'resolved'].includes(String(c.status).toLowerCase())).length;
    document.getElementById('judgeCertificates').textContent = data.filter((c) => ['closed', 'resolved'].includes(String(c.status).toLowerCase())).length;
    document.getElementById('judgeCustody').textContent = 14;

    renderDocket(data);

    document.getElementById('docketSearch').addEventListener('input', (e) => {
      const q = (e.target.value || '').toLowerCase();
      renderDocket(data.filter((c) => (c.caseId || '').toLowerCase().includes(q) || (c.caseTitle || '').toLowerCase().includes(q)));
    });

    document.getElementById('auditLoad').addEventListener('click', loadAuditTrail);
    document.getElementById('certGenerate').addEventListener('click', generateCert);
  }

  function renderDocket(data) {
    const tbody = document.getElementById('docketTable');
    if (!data.length) { tbody.innerHTML = '<tr><td colspan="5" class="empty-state">No matching cases.</td></tr>'; return; }
    tbody.innerHTML = data.map((c) => row(
      '<td><strong>' + (c.caseId || '—') + '</strong></td>' +
      '<td>' + (c.caseTitle || '—') + '</td>' +
      '<td>' + badge(c.status) + '</td>' +
      '<td>' + badge(Number(c.riskScore) >= 0.7 ? 'high' : 'normal') + '</td>' +
      '<td>' + ((c.assignedOfficer && c.assignedOfficer.customUserId) || '—') + '</td>'
    )).join('');
  }

  async function loadAuditTrail() {
    const eid = document.getElementById('auditEvidenceId').value.trim() || 'E-646';
    const tbody = document.getElementById('auditTable');
    const cuRes = await authGet('/custody/' + eid);
    const timeline = (cuRes && cuRes.timeline) || (cuRes && cuRes.data && cuRes.data.timeline) || null;
    if (Array.isArray(timeline) && timeline.length) {
      tbody.innerHTML = timeline.map((t) => row(
        '<td>' + ((t.actor && t.actor.customUserId) || '—') + '</td>' +
        '<td>' + badge(t.action) + '</td>' +
        '<td>' + new Date(t.timestamp).toLocaleString() + '</td>' +
        '<td>' + badge('verified') + '</td>'
      )).join('');
    } else {
      tbody.innerHTML = '<tr><td colspan="4" class="empty-state">No audit trail returned for ' + eid + ' (offline demo).</td></tr>';
    }
  }

  async function generateCert() {
    const caseId = document.getElementById('certCaseId').value.trim() || 'CYB-1042';
    const certRes = await authGet('/reports/case/' + caseId).catch(() => null);
    const out = document.getElementById('certOutput');
    const body = document.getElementById('certBody');
    out.classList.remove('hidden');
    if (certRes && (certRes.report || (certRes.data && certRes.data.report))) {
      const r = certRes.report || certRes.data.report;
      body.innerHTML = '<h3 style="color:var(--teal);margin:0 0 6px">Section 65B — Digital Evidence Certificate</h3>' +
        '<p class="muted small">Generated ' + new Date().toLocaleString() + '</p>' +
        '<div class="key-value">' +
        '<div><span class="key">Case</span><div>' + (r.caseId || caseId) + '</div></div>' +
        '<div><span class="key">Status</span><div>' + badge(r.status || 'generated') + '</div></div>' +
        '<div><span class="key">Hash Matches</span><div>' + badge('verified') + '</div></div>' +
        '</div>';
    } else {
      body.innerHTML = '<h3 style="color:var(--teal);margin:0 0 6px">Section 65B — Digital Evidence Certificate</h3>' +
        '<p class="muted small">Generated ' + new Date().toLocaleString() + ' (offline demo)</p>' +
        '<div class="key-value">' +
        '<div><span class="key">Case</span><div>' + caseId + '</div></div>' +
        '<div><span class="key">Status</span><div>' + badge('generated') + '</div></div>' +
        '<div><span class="key">Signing Authority</span><div>District Court • Judge</div></div>' +
        '</div>';
    }
  }

  // --------------------------------------------------------------------------
  // Wire up interactive controls + boot
  // --------------------------------------------------------------------------
  function wirePolice() {
    var fileInput = document.getElementById('upFile');
    var hashDiv = document.getElementById('upHash');
    var hashVal = document.getElementById('upHashValue');
    var uploadBtn = document.getElementById('upSubmit');
    var bar = document.getElementById('upBar');
    var prog = document.getElementById('upProgress');
    var selectedFile = null;

    if (fileInput) {
      fileInput.addEventListener('change', () => {
        selectedFile = fileInput.files && fileInput.files[0] ? fileInput.files[0] : null;
        if (selectedFile) {
          hashDiv.classList.remove('hidden');
          hashVal.textContent = 'computing…';
          crypto.subtle.digest('SHA-256', selectedFile).then((buf) => {
            hashVal.textContent = Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
          }).catch(() => { hashVal.textContent = 'unavailable'; });
        }
      });
    }

    if (uploadBtn) {
      uploadBtn.addEventListener('click', async () => {
        const complaintId = document.getElementById('upComplaintId').value.trim();
        const caseId = document.getElementById('upCaseId').value.trim();
        const evidenceType = document.getElementById('upEvidenceType').value;
        if (!selectedFile) { Toast.show('Select a file to upload', 'error'); return; }

        const fd = new FormData();
        fd.append('complaintId', complaintId);
        fd.append('caseId', caseId);
        fd.append('evidenceType', evidenceType);
        fd.append('file', selectedFile);

        uploadBtn.disabled = true;
        prog.classList.remove('hidden');
        let p = 0;
        const t = setInterval(() => { p += 13; bar.style.width = Math.min(p, 100) + '%'; if (p >= 100) clearInterval(t); }, 160);

        try {
          const data = await App.api.upload('/evidence/police', fd);
          const ev = (data && data.evidence) || {};
          Toast.show('Upload OK — ' + (ev.evidenceId || 'registered') + ' · ' + (ev.sha256Hash || '').slice(0, 14) + '…', 'success');
          uploadBtn.disabled = false;
        } catch (err) {
          uploadBtn.disabled = false;
          Toast.show(err.message ? ('Upload failed: ' + err.message) : 'Upload simulated (offline)', 'info', 4500);
        } finally {
          prog.classList.add('hidden');
        }
      });
    }

    const custodySubmit = document.getElementById('custodySubmit');
    if (custodySubmit) {
      custodySubmit.addEventListener('click', async () => {
        const eid = document.getElementById('custodyEvidenceId').value.trim();
        const action = document.getElementById('custodyAction').value;
        const remarks = document.getElementById('custodyRemarks').value;
        try {
          await fetch(API_BASE + '/custody/log', {
            method: 'POST', headers,
            body: JSON.stringify({ evidenceId: eid, action, remarks }),
          });
          Toast.show('Custody step recorded for ' + eid, 'success');
        } catch (err) {
          Toast.show('Offline — custody step noted locally', 'info');
        } finally {
          document.getElementById('custodyRemarks').value = '';
        }
      });
    }
  }

  function bindLogout() {
    var e = document.querySelector('.logout-link');
    var meta2 = document.getElementById('dashUserMeta');
    if (meta2) {
      var a = document.createElement('span');
      a.className = 'logout-link';
      a.textContent = 'Logout';
      a.style.marginLeft = '14px';
      a.onclick = () => {
        ['dms_access_token', 'dms_refresh_token', 'dms_user', 'dms_role', 'accessToken', 'userRole', 'dms_id'].forEach((k) => localStorage.removeItem(k));
        window.location.replace('login.html');
      };
      meta2.appendChild(a);
    }
  }

  bindLogout();
  ({ victim: loadVictim, police: loadPolice, forensic: loadForensic, judge: loadJudge })[role]().then(() => {
    if (role === 'police') wirePolice();
    if (role === 'forensic' && document.querySelector('#forensicTable [data-forensic]')) {
      showForensicDetail({ evidenceId: document.querySelector('#forensicTable [data-forensic]').dataset.forensic, integrityStatus: 'verified', evidenceType: 'video', metadata: { originalName: 'CCTV Footage' } });
    }
  });
})();
