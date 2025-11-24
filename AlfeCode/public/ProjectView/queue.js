(function(){
  async function fetchProjects(){
    const res = await fetch('/ProjectView/api/projects');
    if (!res.ok) return [];
    return await res.json();
  }
  async function fetchQueue(){
    const res = await fetch('/ProjectView/api/queue');
    if (!res.ok) return [];
    return await res.json();
  }
  function el(tag, props={}, ...children){
    const e=document.createElement(tag);
    for(const k in props){ if(k.startsWith('on')) e.addEventListener(k.slice(2), props[k]); else e.setAttribute(k, props[k]); }
    children.forEach(c=>{ if(typeof c==='string') e.appendChild(document.createTextNode(c)); else if(c) e.appendChild(c); });
    return e;
  }

  async function renderProjects(){
    const projects = await fetchProjects();
    const sel = document.getElementById('project-select');
    sel.innerHTML = '<option value="">(select project)</option>';
    projects.forEach(p=>{
      const opt = document.createElement('option'); opt.value = p.id; opt.textContent = p.name; sel.appendChild(opt);
    });
  }

  async function renderQueue(){
    const tasks = await fetchQueue();
    const container = document.getElementById('tasks');
    container.innerHTML = '';
    if(!tasks || tasks.length===0){ container.textContent='No tasks in queue.'; return; }
    tasks.forEach(t=>{
      const row = el('div',{class:'queue-row'},
        el('div',{class:'queue-title'}, t.title + (t.description? ' — '+t.description:'')),
        el('div',{class:'queue-actions'},
          el('button',{onClick: async ()=>{ await sendTask(t.id); }}, 'Send to project')
        )
      );
      container.appendChild(row);
    });
  }

  async function enqueue(){
    const title = document.getElementById('task-title').value.trim();
    const desc = document.getElementById('task-desc').value.trim();
    if(!title) return alert('Enter a title');
    const res = await fetch('/ProjectView/api/queue',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({title,description:desc})});
    if(!res.ok) return alert('Failed to add task');
    document.getElementById('task-title').value=''; document.getElementById('task-desc').value='';
    await refresh();
  }

  async function sendTask(taskId){
    const sel = document.getElementById('project-select');
    const projectId = sel.value;
    if(!projectId) return alert('Select a project first');
    const res = await fetch('/ProjectView/api/queue/send',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({taskId,projectId})});
    if(!res.ok){ const t=await res.json().catch(()=>null); return alert('Failed to send: '+(t&&t.message||res.status)); }
    await refresh();
  }

  async function refresh(){ await renderProjects(); await renderQueue(); }

  document.addEventListener('DOMContentLoaded', ()=>{
    document.getElementById('enqueue').addEventListener('click', enqueue);
    refresh();
  });
})();
