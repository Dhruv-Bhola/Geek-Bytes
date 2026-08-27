// verification.js - toggle verified/tampered demo
(function(){
  const toggle = document.getElementById('toggleTamper');
  const tamper = document.getElementById('tamperState');
  const verified = document.getElementById('verifyState');
  const resolve = document.getElementById('resolveTamper');

  if(toggle){
    toggle.addEventListener('click', ()=>{
      verified.classList.add('hidden');
      tamper.classList.remove('hidden');
      Toast.show('Tamper simulated — Integrity violation', 'danger');
    });
  }
  if(resolve){
    resolve.addEventListener('click', ()=>{
      tamper.classList.add('hidden');
      verified.classList.remove('hidden');
      Toast.show('Tamper marked resolved (demo)', 'success');
    });
  }
})();