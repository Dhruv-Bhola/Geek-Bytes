// auth.js - login and role routing
(function(){
  const form = document.getElementById('loginForm');
  const roleBtns = document.querySelectorAll('.role-btn');
  let role='victim';
  roleBtns.forEach(b=>{
    b.addEventListener('click', e=>{
      roleBtns.forEach(x=>x.classList.remove('active'));
      b.classList.add('active');
      role = b.dataset.role;
      document.getElementById('mfaIndicator').querySelector('.pill').textContent = role==='victim'?'Optional':'Required';
    });
  });

  if(form){
    form.addEventListener('submit', e=>{
      e.preventDefault();
      const id = document.getElementById('userId').value || role+'_demo';
      localStorage.setItem('proofledger_role', role);
      localStorage.setItem('proofledger_id', id);
      const path = {
        victim:'../pages/victim-complaint.html',
        police:'../pages/police-dashboard.html',
        forensic:'../pages/ai-investigation.html',
        legal:'../pages/report.html'
      }[role] || '../pages/login.html';
      // small toast
      Toast.show('Secure login successful — routing...', 'success');
      setTimeout(()=>location.href=path,800);
    });
  }

  // lightweight toast utility used across modules
  window.Toast = {
    show(msg, type='info', timeout=3000){
      let t = document.createElement('div');
      t.className = 'toast '+type;
      t.textContent = msg;
      t.style.cssText = 'position:fixed;right:18px;bottom:18px;padding:10px 14px;border-radius:8px;background:rgba(0,0,0,0.6);backdrop-filter:blur(6px);z-index:9999';
      document.body.appendChild(t);
      setTimeout(()=>t.style.opacity=1,40);
      setTimeout(()=>{t.style.opacity=0;setTimeout(()=>t.remove(),400)}, timeout);
    }
  };
})();