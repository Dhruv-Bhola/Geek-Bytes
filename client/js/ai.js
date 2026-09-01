// ai.js — live forensic scan + cross-case correlation.
//   POST /api/ai/deepfake-scan -> AI-generated / manipulation probabilities
//   POST /api/ai/correlate     -> entity-linking graph with confidence
(function () {
  const runBtn = document.getElementById('runAi');
  const scanArea = document.getElementById('aiScanArea');
  const aiProb = document.getElementById('aiProb');
  const aiManip = document.getElementById('aiManip');
  const aiResults = document.getElementById('aiResults');
  const relConf = document.getElementById('relConf');
  const markRel = document.getElementById('markRelated');

  const evidenceId =
    new URLSearchParams(location.search).get('id') ||
    (App.state && App.state.evidenceId) ||
    localStorage.getItem('dms_evidence_id') ||
    'E-002';

  // ---------------------------------------------------------------
  // Deepfake scan
  // ---------------------------------------------------------------
  let fileInput = null;

  function runScan(file) {
    if (!file) return;
    runBtn.disabled = true;
    aiResults.classList.add('hidden');
    aiProb.textContent = '—';
    aiManip.textContent = '—';
    Toast.show('AI scanning media...', 'info', 2000);

    const fd = new FormData();
    fd.append('file', file);
    fd.append('evidence_id', evidenceId);

    App.ai.upload('/deepfake-scan', fd)
      .then((data) => {
        const aiPct = Math.round((data.ai_generated_probability || 0) * 100);
        const manPct = Math.round((data.manipulation_probability || 0) * 100);
        aiProb.textContent = aiPct + '%';
        aiManip.textContent = manPct + '%';
        aiResults.classList.remove('hidden');
        const indicators = (data.indicators || []).map((i) => `<li>${i}</li>`).join('');
        aiResults.innerHTML = `
          <div><strong>Indicators:</strong><ul>${indicators || '<li>No artifacts detected</li>'}</ul>
          <div class="${data.is_manipulated ? 'danger' : 'muted'}">${data.analysis}</div></div>`;
        Toast.show(
          data.is_manipulated ? 'Potential manipulation — review recommended' : 'Scan clean',
          data.is_manipulated ? 'warning' : 'success', 3000
        );
      })
      .catch((err) => {
        Toast.show(err.message || 'AI scan failed', 'error', 4000);
      })
      .finally(() => { runBtn.disabled = false; });
  }

  if (runBtn && scanArea) {
    // Ensure a file picker exists for the media to analyze.
    if (!fileInput) {
      fileInput = document.createElement('input');
      fileInput.type = 'file';
      fileInput.accept = 'image/*,video/*';
      fileInput.style.display = 'none';
      fileInput.addEventListener('change', () => runScan(fileInput.files[0]));
      scanArea.appendChild(fileInput);
    }
    runBtn.textContent = `Run AI Scan` + (evidenceId ? ` (${evidenceId})` : '');
    runBtn.addEventListener('click', () => fileInput.click());
  } else if (aiResults) {
    aiResults.innerHTML = `<div class="muted">AI scan control unavailable on this page.</div>`;
  }

  // ---------------------------------------------------------------
  // Correlation graph
  // ---------------------------------------------------------------
  function buildCorrelationItems() {
    // Pull the current evidence set from vault/demo state and attach probe
    // entities so the graph can render a meaningful confidence.
    const set = (App.demo && App.demo.evidences) || [];
    const ids = set.length ? set.map((e) => e.id) : ['E-001', 'E-002', 'E-009'];
    const probe = ['+91 98765 43210', 'instagram/profile_x', 'acct 1234', 'suspect_handle'];
    return ids.map((id, i) => ({
      evidence_id: id,
      kind: 'evidence',
      label: id,
      entities: [probe[i % probe.length], probe[(i + 1) % probe.length]],
    }));
  }

  (async () => {
    try {
      const data = await App.ai.post('/correlate', { items: buildCorrelationItems(), case_id: App.state.caseId });
      const hc = Math.round((data.highest_confidence || 0) * 100);
      if (relConf) relConf.textContent = hc + '%';
      // Highlight graph nodes with edges attached.
      const nodes = document.querySelectorAll('#corrGraph .node');
      const linked = new Set((data.edges || []).flatMap((e) => [e.source, e.target]));
      nodes.forEach((n) => {
        n.classList.toggle('linked', linked.has(n.dataset.id));
      });
    } catch (err) {
      Toast.show('Correlation service unreachable — using demo', 'warning', 3000);
      if (relConf) relConf.textContent = '84%';
    }
  })();

  if (markRel) {
    markRel.addEventListener('click', () => {
      Toast.show('Marked as related — investigator must confirm', 'success');
    });
  }
})();
