// Shared shell, navigation and frontend-only workflow routing.
const App = (function(){
  const demo = {
    user: {role:localStorage.getItem('proofledger_role')||'victim',id:localStorage.getItem('proofledger_id')||'demo'},
    caseId:'CYB-1042', complaintId:'CC-10482',
    evidences:[
      {id:'E-001',title:'Instagram Screenshot',source:'Victim',status:'Pending'},
      {id:'E-002',title:'Threat Video',source:'Victim',status:'Verified'},
      {id:'E-009',title:'CCTV Footage',source:'Police',status:'Verified'},
      {id:'E-004',title:'Device Extraction',source:'Forensic',status:'Verified'}
    ]
  };
  const flow = [
    ['login.html','Role Selection'],
    ['victim-complaint.html','Complaint'],
    ['classification.html','Classification'],
    ['victim-evidence.html','Victim Evidence'],
    ['social-evidence.html','Social Evidence'],
    ['police-dashboard.html','Dashboard'],
    ['case-management.html','Case Management'],
    ['evidence-vault.html','Evidence Vault'],
    ['police-upload.html','Police Upload'],
    ['verification.html','Verification'],
    ['custody.html','Chain of Custody'],
    ['ai-investigation.html','AI Analysis'],
    ['report.html','Final Report']
  ];
  const currentFile = () => location.pathname.split('/').pop() || 'login.html';
  const currentIndex = () => flow.findIndex(x=>x[0]===currentFile());
  const go = (file) => { if(file) location.href = file; };

  function header(){
    return `<div class="gov-strip"><div class="inner"><span>Government of India</span><span>Ministry of Home Affairs • Cyber Crime Evidence Management</span></div></div>
      <header class="site-header"><div class="inner">
        <div class="brand-lockup">
          <img class="emblem" src="../assets/emblem-dark.png" alt="Government emblem">
          <img class="i4c" src="../assets/i4c.png" alt="I4C">
          <div class="brand-title"><strong>National Cyber Crime Evidence Portal</strong><span>Secure Digital Evidence Management • ProofLedger</span></div>
        </div><div class="header-badge">FRONTEND DEMO<br><span class="muted">No backend connected</span></div>
      </div></header>
      <nav class="main-nav"><div class="inner">
        <a href="../pages/police-dashboard.html">Home</a><a href="../pages/victim-complaint.html">Report Crime</a><a href="../pages/evidence-vault.html">Evidence Vault</a><a href="../pages/ai-investigation.html">Forensic Analysis</a><a href="../pages/report.html">Reports</a><a href="../pages/login.html">Role / Login</a>
      </div></nav>`;
  }
  function sidebar(){
    return `<aside class="sidebar"><div class="sidebar-head"><strong>ProofLedger Workflow</strong><span>13-step evidence lifecycle</span></div><nav>
      ${flow.map((x,i)=>`<a href="../pages/${x[0]}" data-page="${x[0]}"><span class="step-no">${i+1}</span><span>${x[1]}</span></a>`).join('')}
    </nav><div class="sidebar-foot"><strong>Demo environment</strong><br><span class="muted">All records shown are mock frontend data.</span></div></aside>`;
  }
  function workflow(){
    const idx=currentIndex();
    if(idx<1) return '';
    return `<div class="workflow" aria-label="Workflow progress">${flow.slice(1).map((x,i)=>`<div class="wf ${i+2===idx?'current':''} ${i+2<idx?'done':''}"><span class="n">${i+2<idx?'✓':i+2}</span>${x[1]}</div>`).join('')}</div>`;
  }
  function footer(){return `<footer class="page-footer"><div>Website Content Managed by ProofLedger Demo • Inspired by Indian government cyber-crime portal design conventions.</div><div class="right">Frontend-only prototype • Last Updated: 27/08/2026</div></footer>`;}

  function injectShell(){
    const layout=document.getElementById('layout');
    const main=document.querySelector('main.content');
    if(!layout || !main) return;
    layout.innerHTML=header();
    const shell=document.createElement('div');
    shell.className='app-shell';
    const side=document.createElement('div');
    side.innerHTML=sidebar();
    shell.appendChild(side.firstElementChild);
    shell.appendChild(main);
    layout.insertAdjacentElement('afterend',shell);
    shell.insertAdjacentHTML('afterend',footer());
    const page=main.querySelector('.page,.dashboard');
    if(page && currentIndex()>0) page.insertAdjacentHTML('afterbegin',workflow());
    const active=currentFile();
    document.querySelectorAll('.sidebar a,.main-nav a').forEach(a=>{
      if(a.getAttribute('href')===`../pages/${active}`) a.classList.add('active');
    });
    const idx=currentIndex();
    if(idx>0){
      const nav=document.createElement('div'); nav.className='flow-actions actions';
      nav.innerHTML=`<button class="btn ghost" data-flow="back" ${idx<=1?'disabled':''}>← Back</button><span class="muted small" style="align-self:center">Step ${idx} of 13</span><button class="btn primary" data-flow="next">${idx===flow.length-1?'Finish & Return to Dashboard':'Next Step →'}</button>`;
      main.appendChild(nav);
      nav.querySelector('[data-flow="back"]').onclick=()=>idx>1&&go('../pages/'+flow[idx-1][0]);
      nav.querySelector('[data-flow="next"]').onclick=()=>idx===flow.length-1?go('../pages/police-dashboard.html'):go('../pages/'+flow[idx+1][0]);
    }
    const routeMap={
      acceptClass:'../pages/victim-evidence.html',
      createCase:'../pages/evidence-vault.html'
    };
    Object.entries(routeMap).forEach(([id,target])=>{const el=document.getElementById(id);if(el)el.addEventListener('click',()=>setTimeout(()=>go(target),350))});
    const vaultUpload=[...main.querySelectorAll('button')].find(b=>b.textContent.trim()==='Upload Evidence');
    if(vaultUpload) vaultUpload.dataset.go='../pages/police-upload.html';
  }

  function animateCounters(){document.querySelectorAll('.num[data-target]').forEach(el=>{const target=+el.dataset.target;let cur=0;const step=Math.max(1,Math.round(target/45));const t=setInterval(()=>{cur+=step;if(cur>=target){el.textContent=target;clearInterval(t)}else el.textContent=cur},20)})}
  function renderEvidence(){const wrap=document.getElementById('evidenceList');if(!wrap)return;wrap.innerHTML=demo.evidences.map(z=>`<article class="evidence-card"><div class="title">${z.id} — ${z.title}</div><div class="meta">Source: ${z.source}</div><div class="meta">Status: ${z.status==='Verified'?'<span class="pill success">Verified</span>':'<span class="pill warn">Pending Verification</span>'}</div><div class="actions"><button class="btn ghost small" data-go="../pages/verification.html">View Details</button></div></article>`).join('')}
  return {init:()=>{ if(document.querySelector('main.content')){injectShell();animateCounters();renderEvidence()} document.addEventListener('click',e=>{const a=e.target.closest('[data-go]');if(a){e.preventDefault();go(a.dataset.go)}}); },demo,go};
})();
window.addEventListener('DOMContentLoaded',()=>App.init());
