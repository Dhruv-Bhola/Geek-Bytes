// custody.js — live chain-of-custody timeline.
//   GET  /api/v1/custody/:evidenceId -> chronological immutable timeline
//   POST /api/v1/custody/log         -> append a custody step (role-gated)
(function () {
  const timeline = document.getElementById('custodyTimeline');
  if (!timeline) return;

  const evidenceId =
    new URLSearchParams(location.search).get('id') ||
    (App.state && App.state.evidenceId) ||
    localStorage.getItem('dms_evidence_id') ||
    'E-002';

  const ACTION_STYLE = {
    uploaded: 'info', verified: 'success', accessed: 'warn',
    received: 'info', analysis_completed: 'info', transferred: 'warn',
    report_generated: 'success',
  };

  function render(entries) {
    timeline.innerHTML = '';
    if (!entries || !entries.length) {
      timeline.innerHTML = '<div class="entry glass muted">No custody records for this evidence yet.</div>';
      return;
    }
    entries.forEach((e) => {
      const node = document.createElement('div');
      node.className = 'entry glass';
      const action = String(e.action || '').toLowerCase();
      const pill = ACTION_STYLE[action] ? `<span class="pill ${ACTION_STYLE[action]}">${e.action}</span>` : e.action;
      const actor = (e.actor && (e.actor.fullName || e.actor.customUserId)) || e.actorRole || 'Unknown';
      node.innerHTML = `
        <div class="entry-top"><strong>${actor}</strong><span class="muted">${new Date(e.timestamp).toLocaleString()}</span></div>
        <div class="entry-body">${pill} <em>${e.recordedSha256Hash ? String(e.recordedSha256Hash).slice(0, 12) + '...' : ''}</em></div>
        ${e.remarks ? `<div class="muted small">${e.remarks}</div>` : ''}`;
      timeline.appendChild(node);
    });
  }

  (async () => {
    try {
      const data = await App.api.get('/custody/' + encodeURIComponent(evidenceId));
      render(data.timeline || []);
    } catch (err) {
      Toast.show('Custody service unreachable — showing demo', 'warning', 3500);
      render([
        { time: '14:32', actor: { fullName: 'Victim' }, action: 'uploaded', timestamp: new Date() },
        { time: '15:12', actor: { fullName: 'Officer Rahul' }, action: 'verified', timestamp: new Date() },
      ]);
    }
  })();

  const addBtn = document.getElementById('addCustody');
  if (addBtn) {
    addBtn.addEventListener('click', async () => {
      addBtn.disabled = true;
      try {
        const data = await App.api.post('/custody/log', {
          evidenceId,
          action: 'ACCESSED',
          remarks: 'Timeline entry added from evidence portal (' + new Date().toISOString() + ')',
        });
        Toast.show('Custody step recorded', 'success');
        const fresh = await App.api.get('/custody/' + encodeURIComponent(evidenceId));
        render(fresh.timeline || []);
      } catch (err) {
        Toast.show(err.message || 'Only police/investigator/judge may append custody', 'error', 4000);
      } finally {
        addBtn.disabled = false;
      }
    });
  }
})();
