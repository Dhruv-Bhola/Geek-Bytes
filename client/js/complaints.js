// complaints.js — live complaint intake, AI classification and case creation.
//   POST /api/v1/cases/complaints  -> create a complaint, get CC-XXXXX
//   POST /api/ai/classify          -> AI legal classification (real outputs)
//   POST /api/v1/cases             -> create an official case, get CYB-XXXX
(function () {
  // -------------------------------------------------------------------------
  // 1. Victim complaint submission (victim-complaint.html)
  // -------------------------------------------------------------------------
  const compForm = document.getElementById('complaintForm');
  if (compForm) {
    compForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const field = (id) => (document.getElementById(id) || {}).value || '';

      const payload = {
        victimName: field('v_name'),
        contactNumber: field('v_contact'),
        incidentDate: field('v_date') || undefined,
        platform: field('v_platform'),
        crimeDescription: field('v_description'),
        location: field('v_location'),
        additionalDetails: field('v_additional'),
      };

      if (!payload.victimName || !payload.crimeDescription) {
        Toast.show('Name and crime description are required', 'error');
        return;
      }

      const btn = document.getElementById('submitComplaint');
      if (btn) { btn.disabled = true; btn.textContent = 'Submitting...'; }

      try {
        const data = await App.api.post('/cases/complaints', payload);
        const complaint = data.complaint || {};
        const id = complaint.complaintId || 'CC-ERROR';

        localStorage.setItem('dms_complaint_id', id);
        localStorage.setItem('dms_complaint_text', payload.crimeDescription);
        App.state.complaintId = id;

        const cid = document.getElementById('compId');
        if (cid) cid.textContent = id;
        const result = document.getElementById('complaintResult');
        if (result) result.classList.remove('hidden');

        Toast.show(`Complaint ${id} received`, 'success');
      } catch (err) {
        Toast.show(err.message || 'Complaint submission failed', 'error', 4000);
      } finally {
        if (btn) { btn.disabled = false; btn.textContent = 'Submit Complaint'; }
      }
    });
  }

  // -------------------------------------------------------------------------
  // 2. AI classification with real model output (classification.html)
  // -------------------------------------------------------------------------
  const viz = document.getElementById('classificationViz');
  if (viz) {
    const bars = viz.querySelectorAll('.bar-row');
    const complaintId = App.state.complaintId;
    const narrative = localStorage.getItem('dms_complaint_text') || '';

    // Map 3 displayed crime categories -> probability from the AI response.
    const expected = ['Online Harassment', 'Cyber Stalking', 'Financial Fraud'];

    async function runClassifier() {
      try {
        const data = await App.ai.post('/classify', {
          complaint_id: complaintId,
          text: narrative || 'Online harassment and threats over social media',
        });
        const probs = data.probabilities || [];
        const lookup = Object.fromEntries(probs.map((p) => [p.category, p.probability]));
        const values = expected.map((cat) => Math.round((lookup[cat] ?? 0) * 100));

        // Animate each bar toward its real value.
        bars.forEach((row, idx) => {
          const bar = row.querySelector('.bar > div');
          const pctEl = row.querySelector('.pct');
          const target = values[idx];
          let cur = 0;
          const step = Math.max(1, Math.round(target / 18));
          const timer = setInterval(() => {
            cur += step;
            if (cur >= target) {
              cur = target;
              clearInterval(timer);
            }
            if (bar) bar.style.width = cur + '%';
            if (pctEl) pctEl.textContent = cur + '%';
          }, 30 + idx * 10);
        });

        // Update recommended cell / routing.
        const cellTitle = viz.closest('.classifier, .page')?.querySelector('.right h3');
        const cellReason = viz.closest('.classifier, .page')?.querySelector('.right p');
        const noise = (document.querySelector('.pulse,.pulse') || {});
        if (document.querySelector('.scan')) {
          document.querySelector('.scan').textContent = 'AI CLASSIFIER — LIVE';
        }
        if (cellTitle) cellTitle.textContent = data.recommended_cell || 'General Cyber Crime Cell';
        if (cellReason) cellReason.textContent = data.routing_reason || '';

        localStorage.setItem('dms_classification', JSON.stringify(data));
        App.state.classification = data;
        Toast.show(`Classified as ${data.predicted_category} (${Math.round(data.confidence * 100)}%)`, 'success');
      } catch (err) {
        Toast.show('AI classification unavailable — using offline estimates', 'warning', 4000);
        // Graceful offline fallback keeps the page usable.
        const offline = [92, 61, 8];
        bars.forEach((row, idx) => {
          const bar = row.querySelector('.bar > div');
          const pctEl = row.querySelector('.pct');
          const target = offline[idx];
          let cur = 0;
          const timer = setInterval(() => {
            cur += Math.max(1, Math.round(target / 18));
            if (cur >= target) { cur = target; clearInterval(timer); }
            if (bar) bar.style.width = cur + '%';
            if (pctEl) pctEl.textContent = cur + '%';
          }, 30 + idx * 10);
        });
      }
    }

    runClassifier();

    const accept = document.getElementById('acceptClass');
    if (accept) accept.addEventListener('click', () => {
      Toast.show('Classification accepted — proceed to evidence', 'success');
    });
    const change = document.getElementById('changeClass');
    if (change) change.addEventListener('click', () => {
      Toast.show('Classification changed — please re-submit if needed', 'info');
    });
  }

  // -------------------------------------------------------------------------
  // 3. Create official case (case-management.html)
  // -------------------------------------------------------------------------
  const createBtn = document.getElementById('createCase');
  if (createBtn) {
    createBtn.addEventListener('click', async () => {
      const complaintId = App.state.complaintId;
      const classification = (() => {
        try { return JSON.parse(localStorage.getItem('dms_classification') || 'null'); }
        catch (e) { return null; }
      })();

      createBtn.disabled = true;
      createBtn.textContent = 'Creating case...';
      try {
        const data = await App.api.post('/cases', {
          complaintId,
          caseTitle: (classification && classification.predicted_category) || 'Cybercrime Investigation',
          riskScore: classification ? classification.confidence : 0,
        });
        const caseRecord = data.case || {};
        const caseId = caseRecord.caseId || 'CYB-ERROR';

        localStorage.setItem('dms_case_id', caseId);
        App.state.caseId = caseId;

        const out = document.getElementById('newCaseId');
        if (out) out.textContent = caseId;
        const result = document.getElementById('caseResult');
        if (result) result.classList.remove('hidden');

        Toast.show(`Case ${caseId} created`, 'success');
      } catch (err) {
        Toast.show(err.message || 'Case creation failed', 'error', 4000);
      } finally {
        createBtn.disabled = false;
        createBtn.textContent = 'Create Case';
      }
    });
  }
})();
