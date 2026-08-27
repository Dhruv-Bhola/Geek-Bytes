// ai.js - AI scan and correlation demo interactions
(function(){
  const runBtn = document.getElementById('runAi');
  const aiProb = document.getElementById('aiProb');
  const aiManip = document.getElementById('aiManip');
  const aiResults = document.getElementById('aiResults');
  const relConf = document.getElementById('relConf');
  const markRel = document.getElementById('markRelated');

  if(runBtn){
    runBtn.addEventListener('click', async ()=>{
      // scanning animation
      runBtn.disabled=true;
      aiResults.classList.add('hidden');
      aiProb.textContent='—'; aiManip.textContent='—';
      Toast.show('AI scanning in progress...', 'info', 1800);
      await new Promise(r=>setTimeout(r,1600));
      const p = 91; const m = 78;
      aiProb.textContent = p + '%';
      aiManip.textContent = m + '%';
      aiResults.classList.remove('hidden');
      aiResults.innerHTML = `<div><strong>Indicators:</strong><ul><li>Face inconsistencies</li><li>Frame artifacts</li><li>Audio/video mismatch</li></ul><div class="muted">Potentially manipulated — forensic review recommended</div></div>`;
      Toast.show('AI scan complete — review recommended', 'warning', 2200);
      runBtn.disabled=false;
    });
  }

  // correlation graph
  if(relConf) relConf.textContent='84%';
  if(markRel){
    markRel.addEventListener('click', ()=>{
      Toast.show('Marked as related (demo). Investigator must confirm.', 'success');
    });
  }
})();