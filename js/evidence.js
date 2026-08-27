// evidence.js - victim + police uploads, dropzone, sha simulation, block anchor animation, evidence list update
(function(){
  function shaDemo(str){
    // simple deterministic demo hash (not real SHA-256, used for UI)
    let h=0; for(let i=0;i<str.length;i++){h=((h<<5)-h)+str.charCodeAt(i);h=h&h}
    return (h>>>0).toString(16).toUpperCase().padStart(8,'0')+'...';
  }

  // Victim evidence upload
  const form = document.getElementById('evidenceForm');
  const drop = document.getElementById('dropzone');
  const fileInput = document.getElementById('ev_file');
  if(drop){
    drop.addEventListener('click', ()=>fileInput.click());
    drop.addEventListener('dragover', e=>{e.preventDefault();drop.classList.add('active')});
    drop.addEventListener('dragleave', e=>{drop.classList.remove('active')});
    drop.addEventListener('drop', e=>{e.preventDefault();drop.classList.remove('active'); if(e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0])});
    fileInput.addEventListener('change', ()=>{if(fileInput.files[0]) handleFile(fileInput.files[0])});
  }

  let stagedFile=null;
  function handleFile(f){
    stagedFile=f;
    drop.querySelector('.dz-inner').textContent = `Selected: ${f.name} (${Math.round(f.size/1024)} KB)`;
  }

  if(form){
    form.addEventListener('submit', async e=>{
      e.preventDefault();
      const id = 'E-'+String(Math.floor(1+Math.random()*899)).padStart(3,'0');
      const ts = new Date().toLocaleString();
      const hash = stagedFile? shaDemo(stagedFile.name+stagedFile.size+ts) : shaDemo((document.getElementById('ev_url')||{value:''}).value+ts);
      // animate small upload progress
      const res = document.getElementById('evidenceResult');
      res.classList.remove('hidden');
      document.getElementById('evidId').textContent = id;
      document.getElementById('evidTs').textContent = ts;
      document.getElementById('evidHash').textContent = hash;

      // simulate upload
      Toast.show('Uploading evidence...', 'info', 1600);
      await new Promise(r=>setTimeout(r,800));
      // show blockchain anchor animation
      Toast.show('Anchoring evidence to blockchain (simulated)...', 'info', 1600);
      await new Promise(r=>setTimeout(r,900));
      Toast.show('Evidence submitted — Pending Police Verification', 'success', 2200);

      // update global demo
      window.App && window.App.demo && window.App.demo.evidences.unshift({id,title:document.getElementById('ev_type').value + ' — '+(stagedFile?stagedFile.name:'link'),source:'Victim',status:'Pending'});
      // refresh evidence vault if open
      const evList = document.getElementById('evidenceList');
      if(evList) App.init();
    });
  }

  // Social preserve
  const preserveBtn = document.getElementById('preserveBtn');
  if(preserveBtn){
    preserveBtn.addEventListener('click', async ()=>{
      const id = 'E-'+String(Math.floor(1+Math.random()*899)).padStart(3,'0');
      const ts = new Date().toLocaleString();
      const hash = shaDemo(id + ts);
      document.getElementById('sm_eid').textContent = id;
      document.getElementById('sm_hash').textContent = hash;
      document.getElementById('sm_ts_out').textContent = ts;
      document.getElementById('preserveResult').classList.remove('hidden');
      Toast.show('Social evidence preserved (demo)', 'success');
      window.App && window.App.demo && window.App.demo.evidences.unshift({id,title:'Social Capture',source:'Victim',status:'Pending'});
    });
  }

  // Police upload (large)
  const polForm = document.getElementById('policeUpload');
  if(polForm){
    const file = document.getElementById('pol_file');
    const progress = document.querySelector('#pol_progress');
    const bar = progress?progress.querySelector('.progress-bar > div'):null;
    polForm.addEventListener('submit', e=>{
      e.preventDefault();
      if(!file.files[0]) { Toast.show('Select a file to upload', 'error'); return; }
      progress.classList.remove('hidden');
      let pct=0;
      const it = setInterval(()=>{pct+=Math.random()*12; if(pct>=100){pct=100; clearInterval(it); setTimeout(()=>{document.getElementById('pol_new_eid').textContent='E-'+Math.floor(100+Math.random()*899); document.getElementById('pol_related_out').textContent=document.getElementById('pol_related').value; document.getElementById('pol_result').classList.remove('hidden'); Toast.show('Upload complete and linked', 'success');},300)} bar.style.width=pct+'%'; document.getElementById('pol_pct').textContent=Math.floor(pct)+'%'; }, 300);
    });
  }

  // Evidence vault filters
  const vault=document.getElementById('evidenceList');
  const tabs=document.querySelectorAll('.tabs .tab');
  if(vault && tabs.length){
    const renderFilter=(filter)=>{
      vault.querySelectorAll('.evidence-card').forEach(card=>{
        const source=(card.querySelector('.meta')?.textContent||'').toLowerCase();
        card.style.display=(filter==='all' || source.includes(filter))?'':'none';
      });
    };
    tabs.forEach(tab=>tab.addEventListener('click',()=>{
      tabs.forEach(t=>t.classList.remove('active')); tab.classList.add('active'); renderFilter(tab.dataset.filter||'all');
    }));
  }

})();
