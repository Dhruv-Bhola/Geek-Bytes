// custody.js - chain of custody timeline management
(function(){
  const timeline = document.getElementById('custodyTimeline');
  const addBtn = document.getElementById('addCustody');
  const entries = [
    {time:'14:32','actor':'Victim','action':'uploaded','eid':'E-001'},
    {time:'15:12','actor':'Officer Rahul','action':'verified','eid':'E-002'},
    {time:'15:40','actor':'Officer Rahul','action':'accessed','eid':'E-002'},
    {time:'16:05','actor':'Forensic Officer','action':'received','eid':'E-002'},
    {time:'17:20','actor':'AI System','action':'analysis completed','eid':'E-002'},
    {time:'18:10','actor':'Senior Officer','action':'report generated','eid':'CYB-1042'}
  ];

  function render(){
    if(!timeline) return;
    timeline.innerHTML='';
    entries.forEach(e=>{
      const node = document.createElement('div');
      node.className='entry glass';
      node.innerHTML=`<div><strong>${e.actor}</strong> • <span class="muted">${e.time}</span></div>
        <div class="muted">${e.action} <em>${e.eid}</em></div>`;
      timeline.appendChild(node);
    });
  }
  render();

  if(addBtn){
    addBtn.addEventListener('click', ()=>{
      const time = new Date().toLocaleTimeString();
      entries.push({time, actor:'Officer Rahul', action:'accessed', eid:'E-002'});
      render();
      Toast.show('Chain of custody updated', 'success');
    });
  }
})();