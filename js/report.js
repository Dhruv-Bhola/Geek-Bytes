// report.js - report preview and actions
(function(){
  const pdf = document.getElementById('generatePdf');
  const sign = document.getElementById('digitalSign');
  const share = document.getElementById('shareSecure');

  if(pdf) pdf.addEventListener('click', ()=>{ Toast.show('Generating PDF (browser print)...', 'info'); setTimeout(()=>window.print(),700); });
  if(sign) sign.addEventListener('click', ()=>{ Toast.show('Digital sign (demo) — signature recorded locally.', 'success') });
  if(share) share.addEventListener('click', ()=>{ Toast.show('Share link generated (demo).', 'success') });
})();