// evidence.js — live multi-modal upload (victim/police/social), SHA-256 +
// blockchain tx receipt handling, and evidence-vault loader.
//   POST /api/v1/evidence/victim          -> victim upload (50MB)
//   POST /api/v1/evidence/police          -> police/CCTV upload (5GB, streamed)
//   POST /api/v1/evidence/social-preserve -> social media preservation
//   GET  /api/v1/evidence/case/:caseId    -> evidence vault list
(function () {
  // Map display labels from the forms to the server EvidenceType enum.
  const TYPE_MAP = {
    screenshot: 'screenshot', image: 'screenshot',
    video: 'video', cctv: 'cctv', 'cctv / video': 'cctv',
    audio: 'audio', 'chat export': 'chat_export', chat: 'chat_export',
    document: 'document', other: 'other',
  };
  const toType = (label) => TYPE_MAP[String(label || '').trim().toLowerCase()] || 'other';

  function complaintId() {
    return App.state.complaintId ||
      localStorage.getItem('dms_complaint_id') ||
      document.getElementById('ev_complaint')?.value ||
      '';
  }
  function caseId() {
    return App.state.caseId || localStorage.getItem('dms_case_id') || '';
  }

  function stageResult(fields) {
    Object.entries(fields).forEach(([id, val]) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    });
  }

  function reveal(id) {
    const el = document.getElementById(id);
    if (el) el.classList.remove('hidden');
  }

  // Remember the latest evidence id so verification/custody pages can target it.
  function rememberEvidence(id) {
    if (id) {
      localStorage.setItem('dms_evidence_id', id);
      App.state.evidenceId = id;
    }
  }

  // -------------------------------------------------------------------------
  // 1. Victim evidence upload (victim-evidence.html)
  // -------------------------------------------------------------------------
  const drop = document.getElementById('dropzone');
  const fileInput = document.getElementById('ev_file');
  let stagedFile = null;

  if (drop && fileInput) {
    drop.addEventListener('click', () => fileInput.click());
    drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('active'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('active'));
    drop.addEventListener('drop', (e) => {
      e.preventDefault();
      drop.classList.remove('active');
      if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
    });
    fileInput.addEventListener('change', () => { if (fileInput.files[0]) handleFile(fileInput.files[0]); });

    function handleFile(f) {
      stagedFile = f;
      const inner = drop.querySelector('.dz-inner');
      if (inner) inner.textContent = `Selected: ${f.name} (${(f.size / 1024).toFixed(1)} KB)`;
    }
  }

  const evForm = document.getElementById('evidenceForm');
  if (evForm) {
    evForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!stagedFile) {
        const url = (document.getElementById('ev_url') || {}).value;
        if (!url) { Toast.show('Select a file to upload evidence', 'error'); return; }
      }
      const complaint = complaintId();
      if (!complaint) { Toast.show('Complaint ID is missing', 'error'); return; }

      const btn = document.getElementById('submitEvidence');
      if (btn) { btn.disabled = true; btn.textContent = 'Uploading...'; }

      const fd = new FormData();
      if (stagedFile) fd.append('file', stagedFile);
      fd.append('complaintId', complaint);
      if (caseId()) fd.append('caseId', caseId());
      fd.append('evidenceType', toType(document.getElementById('ev_type')?.value));
      if (document.getElementById('ev_url').value) fd.append('source', document.getElementById('ev_url').value);

      try {
        Toast.show('Uploading + encrypting evidence...', 'info', 2000);
        const data = await App.api.upload('/evidence/victim', fd);
        const ev = data.evidence || {};
        rememberEvidence(ev.evidenceId);
        stageResult({
          evidId: ev.evidenceId || 'E-ERROR',
          evidTs: new Date().toLocaleString(),
          evidHash: ev.sha256Hash || '—',
        });
        reveal('evidenceResult');

        const tx = data.txHash;
        Toast.show(
          tx
            ? `Evidence anchored on-chain • tx ${String(tx).slice(0, 10)}...`
            : 'Evidence submitted (offline chain) — Pending Verification',
          tx ? 'success' : 'warning', 3500
        );

        // Refresh any live vault list.
        App.demo.evidences.unshift({
          id: ev.evidenceId, title: ev.evidenceType, source: 'Victim', status: ev.integrityStatus || 'Pending',
        });
        if (document.getElementById('evidenceList')) App.init();
      } catch (err) {
        Toast.show(err.message || 'Evidence upload failed', 'error', 4000);
      } finally {
        if (btn) { btn.disabled = false; btn.textContent = 'Upload Evidence'; }
      }
    });
  }

  // -------------------------------------------------------------------------
  // 2. Social media preservation (social-evidence.html)
  // -------------------------------------------------------------------------
  const preserveBtn = document.getElementById('preserveBtn');
  if (preserveBtn) {
    preserveBtn.addEventListener('click', async () => {
      const platform = document.getElementById('sm_platform')?.value || 'Instagram';
      const url = document.getElementById('sm_url')?.value || '';
      const capturedAt = document.getElementById('sm_ts')?.value || new Date().toISOString();
      const notes = document.getElementById('sm_notes')?.value || '';
      const complaint = complaintId();

      const fd = new FormData();
      fd.append('platform', platform);
      fd.append('sourceUrl', url);
      fd.append('capturedAt', new Date(capturedAt).toISOString());
      fd.append('evidenceType', 'screenshot');
      if (complaint) fd.append('complaintId', complaint);
      if (caseId()) fd.append('caseId', caseId());
      if (notes) fd.append('caption', notes);

      preserveBtn.disabled = true;
      try {
        const data = await App.api.upload('/evidence/social-preserve', fd);
        const ev = data.evidence || {};
        stageResult({
          sm_eid: ev.evidenceId || 'E-ERROR',
          sm_hash: ev.sha256Hash || '—',
          sm_ts_out: ev.metadata && ev.metadata.social ? ev.metadata.social.capturedAt : new Date().toISOString(),
        });
        reveal('preserveResult');
        Toast.show('Social evidence preserved', 'success');
      } catch (err) {
        Toast.show(err.message || 'Preservation failed', 'error', 4000);
      } finally {
        preserveBtn.disabled = false;
      }
    });
  }

  // -------------------------------------------------------------------------
  // 3. Police large upload (police-upload.html)
  // -------------------------------------------------------------------------
  const polForm = document.getElementById('policeUpload');
  if (polForm) {
    const file = document.getElementById('pol_file');
    const progress = document.getElementById('pol_progress');
    const bar = progress ? progress.querySelector('.progress-bar > div') : null;
    const pct = document.getElementById('pol_pct');

    polForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!file.files[0]) { Toast.show('Select a file to upload', 'error'); return; }

      const complaint = complaintId();
      if (!complaint) { Toast.show('No complaint linked — provide a Complaint ID first', 'error'); return; }

      const fd = new FormData();
      fd.append('file', file.files[0]);
      fd.append('complaintId', complaint);
      if (caseId()) fd.append('caseId', caseId());
      fd.append('evidenceType', toType(document.getElementById('pol_evtype')?.value || 'cctv'));
      if (document.getElementById('pol_source')?.value) fd.append('source', document.getElementById('pol_source').value);

      const btn = document.getElementById('pol_upload_btn');
      if (btn) btn.disabled = true;
      progress.classList.remove('hidden');

      try {
        // Native upload progress where the browser supports it.
        const xhr = new XMLHttpRequest();
        const result = await new Promise((resolve, reject) => {
          xhr.open('POST', App.api.fullURL('/evidence/police'));
          const token = App.session.getToken();
          if (token) xhr.setRequestHeader('Authorization', 'Bearer ' + token);
          xhr.upload.onprogress = (ev) => {
            if (!ev.lengthComputable) return;
            const p = Math.round((ev.loaded / ev.total) * 100);
            if (bar) bar.style.width = p + '%';
            if (pct) pct.textContent = p + '%';
          };
          xhr.onload = () => resolve(JSON.parse(xhr.responseText || '{}'));
          xhr.onerror = () => reject(new Error('Upload failed'));
          xhr.send(fd);
        });

        const ev = result.evidence || {};
        rememberEvidence(ev.evidenceId);
        stageResult({
          pol_new_eid: ev.evidenceId || 'E-ERROR',
          pol_related_out: document.getElementById('pol_related')?.value || ev.evidenceId,
        });
        reveal('pol_result');
        Toast.show(
          result.txHash
            ? 'Upload complete and anchored on-chain'
            : 'Upload complete (offline chain)',
          'success'
        );
      } catch (err) {
        Toast.show(err.message || 'Police upload failed', 'error', 4000);
      } finally {
        if (btn) btn.disabled = false;
        if (bar) bar.style.width = '0%';
        if (pct) pct.textContent = '0%';
      }
    });
  }

  // -------------------------------------------------------------------------
  // 4. Evidence vault loader (evidence-vault.html)
  // -------------------------------------------------------------------------
  const vault = document.getElementById('evidenceList');
  if (vault) {
    (async () => {
      const cid = caseId();
      if (!cid) {
        // No live case yet — fall back to demo records for a usable page.
        App.init();
        return;
      }
      try {
        const data = await App.api.get('/evidence/case/' + encodeURIComponent(cid));
        const evidences = data.evidences || [];
        App.demo.evidences = evidences.map((ev) => ({
          id: ev.evidenceId,
          title: ev.evidenceType,
          source: ev.sourceType,
          status: ev.integrityStatus,
        }));
        App.init();
      } catch (err) {
        Toast.show('Could not load evidence vault — showing demo', 'warning', 3500);
        App.init();
      }
    })();
  }
})();
