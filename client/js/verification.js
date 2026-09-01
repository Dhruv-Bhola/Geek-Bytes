// verification.js — live integrity verification.
// Fetches GET /api/v1/evidence/:id/verify and renders green/red status.
(function () {
  const evidenceId =
    new URLSearchParams(location.search).get('id') ||
    (App.state && App.state.evidenceId) ||
    localStorage.getItem('dms_evidence_id') ||
    'E-002';

  const verifyState = document.getElementById('verifyState');
  const tamperState = document.getElementById('tamperState');
  const origHash = document.getElementById('origHash');

  if (!verifyState && !tamperState) return;

  function show(state) {
    if (verifyState) verifyState.classList.toggle('hidden', state !== 'verified');
    if (tamperState) tamperState.classList.toggle('hidden', state !== 'tampered');
  }

  (async () => {
    try {
      const data = await App.api.get('/evidence/' + encodeURIComponent(evidenceId) + '/verify');
      if (origHash && data.sha256Hash) origHash.textContent = data.sha256Hash.slice(0, 12) + '...';
      if (data.status === 'VERIFIED') {
        show('verified');
        Toast.show(`Evidence ${evidenceId} verified — integrity intact`, 'success');
      } else {
        show('tampered');
        Toast.show(`Evidence ${evidenceId} TAMPERED — ${data.reason || 'hash mismatch'}`, 'danger', 4500);
      }
    } catch (err) {
      // Offline fallback keeps the demo interactive.
      Toast.show('Verification service unreachable — showing demo state', 'warning', 3500);
      show('verified');
    }
  })();

  // Explicit demo tamper toggles (represent a manual override for demo UX).
  const toggle = document.getElementById('toggleTamper');
  if (toggle) {
    toggle.addEventListener('click', () => {
      show('tampered');
      Toast.show('Tamper simulated — Integrity violation', 'danger');
    });
  }
  const resolve = document.getElementById('resolveTamper');
  if (resolve) {
    resolve.addEventListener('click', () => {
      show('verified');
      Toast.show('Tamper resolved (demo)', 'success');
    });
  }
})();
