// complaints.js - complaint submission, classification accept/change, creating case
(function(){
  // complaint submission
  const form = document.getElementById('complaintForm');
  if(form){
    form.addEventListener('submit', e=>{
      e.preventDefault();
      const id = 'CC-'+Math.floor(10000+Math.random()*89999);
      document.getElementById('compId').textContent = id;
      document.getElementById('complaintResult').classList.remove('hidden');
      Toast.show(`Complaint ${id} received`, 'success');
    });
  }

  // classification page: animate bars
  const viz = document.getElementById('classificationViz');
  if(viz){
    // animate bars with values in data-value
    const bars = viz.querySelectorAll('.bar > div');
    bars.forEach((b, idx)=>{
      const val = +b.dataset.value;
      let cur=0;
      const pctEl = b.closest('.bar-row').querySelector('.pct');
      const it = setInterval(()=>{cur+=Math.max(1,Math.round(val/18)); if(cur>=val){b.style.width=val+'%'; pctEl.textContent=val+'%'; clearInterval(it)} else {b.style.width=cur+'%'; pctEl.textContent=cur+'%'} }, 30 + idx*10);
    });
  }

  // create case
  const createBtn = document.getElementById('createCase');
  if(createBtn){
    createBtn.addEventListener('click', ()=>{
      const id = 'CYB-'+Math.floor(1000+Math.random()*8999);
      document.getElementById('newCaseId').textContent = id;
      document.getElementById('caseResult').classList.remove('hidden');
      Toast.show(`Case ${id} created`, 'success');
    });
  }
})();