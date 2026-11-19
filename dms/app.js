const sb = supabase.createClient(DMS_CONFIG.SUPABASE_URL, DMS_CONFIG.SUPABASE_ANON_KEY);
const $ = s => document.querySelector(s), today = () => new Date().toISOString().slice(0,10);
const STEPS = [['imported','Imported'],['assigned','Assigned'],['accepted','Accepted'],['dispatched','Dispatched'],['in_transit','In transit'],['delivered','Delivered'],['closed','Closed']];
let me, invoices = [], dealers = [], transporters = [], tab, filter = {q:'',s:''};
const toast = m => { const t=$('#toast'); t.textContent=m; t.classList.add('on'); setTimeout(()=>t.classList.remove('on'),2600); };
const fmt = d => d ? new Date(d+'T00:00').toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}) : '—';
const due = i => i.revised_date || i.expected_date;
const overdue = i => !['delivered','closed'].includes(i.status) && due(i) && due(i) < today();
const dName = id => dealers.find(d=>d.id===id)?.name || '—', tName = id => transporters.find(t=>t.id===id)?.name || '—';
const esc = s => String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const pill = i => overdue(i) ? `<span class="pill overdue">Overdue</span>` : `<span class="pill ${i.status}">${STEPS.find(s=>s[0]===i.status)[1]}</span>`;

$('#loginBtn').onclick = async () => {
  const { error } = await sb.auth.signInWithPassword({ email: $('#email').value, password: $('#pass').value });
  if (error) $('#loginErr').textContent = 'Check your email and password, then try again.'; else boot();
};
$('#logout').onclick = async () => { await sb.auth.signOut(); location.reload(); };

async function boot() {
  const { data: { user } } = await sb.auth.getUser(); if (!user) return;
  const { data: p } = await sb.from('profiles').select('*').eq('id', user.id).single();
  if (!p) { $('#loginErr').textContent = 'Your account has no role yet. Ask HQ to set it up.'; return; }
  me = p; $('#login').hidden = true; $('#app').hidden = false;
  $('#who').textContent = `${p.name || user.email} · ${p.role === 'admin' ? 'HQ' : 'Transporter'}`;
  const nav = p.role === 'admin' ? [['dash','Dashboard'],['inv','Invoices'],['pod','POD review'],['mas','Masters']] : [['inv','My deliveries']];
  $('#nav').innerHTML = nav.map(n=>`<button data-t="${n[0]}">${n[1]}</button>`).join('');
  $('#nav').onclick = e => e.target.dataset.t && go(e.target.dataset.t);
  await load(); go(nav[0][0]);
}
async function load() {
  const [i,d,t] = await Promise.all([sb.from('invoices').select('*').order('invoice_date',{ascending:false}), sb.from('dealers').select('*').order('name'), sb.from('transporters').select('*').order('name')]);
  invoices = i.data||[]; dealers = d.data||[]; transporters = t.data||[];
}
function go(t) {
  tab = t; document.querySelectorAll('#nav button').forEach(b=>b.classList.toggle('on',b.dataset.t===t));
  $('#actions').innerHTML = ''; ({dash,inv,pod,mas})[t]();
}
async function refresh() { await load(); go(tab); }

/* ---------- Dashboard ---------- */
function dash() {
  $('#title').textContent = 'Delivery overview';
  const c = f => invoices.filter(f).length;
  const k = [['Pending assignment',c(i=>['imported','assigned'].includes(i.status)),'var(--blue)'],['In transit',c(i=>['accepted','dispatched','in_transit'].includes(i.status)&&!overdue(i)),'var(--teal)'],['Overdue',c(overdue),'var(--red)'],['POD to review',c(i=>i.pod_status==='pending'),'var(--amber)'],['Closed',c(i=>i.status==='closed'),'var(--green)']];
  const perf = transporters.map(t => { const mine = invoices.filter(i=>i.transporter_id===t.id); const done = mine.filter(i=>['delivered','closed'].includes(i.status)); const late = mine.filter(overdue).length; return {n:t.name,total:mine.length,done:done.length,late}; }).filter(p=>p.total);
  $('#view').innerHTML = `<div class="kpis">${k.map(x=>`<div class="kpi" style="--c:${x[2]}"><b>${x[1]}</b><span>${x[0]}</span></div>`).join('')}</div>
  <div class="panel"><h3>Transporter performance</h3><p class="muted">Delivered share of assigned invoices. Overdue count shown on the right.</p><div class="bars">${perf.map(p=>`<div class="bar"><span>${esc(p.n)}</span><div><i style="width:${p.total?Math.round(p.done/p.total*100):0}%"></i></div><span>${p.done}/${p.total}${p.late?` · <b style="color:var(--red)">${p.late} late</b>`:''}</span></div>`).join('')||'<p class="muted">Assign invoices to see performance.</p>'}</div></div>
  <div class="panel"><h3>Needs attention</h3>${table(invoices.filter(i=>overdue(i)||i.pod_status==='pending').slice(0,8))}</div>`;
  bindRows();
}

/* ---------- Invoices ---------- */
function table(list) {
  if (!list.length) return '<p class="muted">Nothing here yet.</p>';
  return `<table><tr><th>Invoice</th><th>Dealer</th><th>Transporter</th><th>Due</th><th>Status</th></tr>${list.map(i=>`<tr class="row" data-id="${i.id}"><td><b>${esc(i.invoice_no)}</b></td><td>${esc(dName(i.dealer_id))}</td><td>${esc(tName(i.transporter_id))}</td><td>${fmt(due(i))}</td><td>${pill(i)}</td></tr>`).join('')}</table>`;
}
function bindRows() { document.querySelectorAll('tr.row').forEach(r=>r.onclick=()=>openInvoice(r.dataset.id)); }
function inv() {
  const admin = me.role==='admin'; $('#title').textContent = admin ? 'Invoices' : 'My deliveries';
  if (admin) $('#actions').innerHTML = `<label class="btn primary">Import invoices CSV<input type="file" accept=".csv" hidden id="impInv"></label>`;
  $('#view').innerHTML = `<div class="panel"><div class="tools"><input id="q" placeholder="Search invoice or dealer" value="${esc(filter.q)}"><select id="fs"><option value="">All statuses</option>${STEPS.map(s=>`<option value="${s[0]}">${s[1]}</option>`).join('')}<option value="overdue">Overdue</option></select></div><div id="tbl"></div></div>`;
  $('#fs').value = filter.s;
  const draw = () => { filter.q=$('#q').value; filter.s=$('#fs').value; const q=filter.q.toLowerCase();
    $('#tbl').innerHTML = table(invoices.filter(i=>(!q||i.invoice_no.toLowerCase().includes(q)||dName(i.dealer_id).toLowerCase().includes(q))&&(!filter.s||(filter.s==='overdue'?overdue(i):i.status===filter.s)))); bindRows(); };
  $('#q').oninput = draw; $('#fs').onchange = draw; draw();
  if (admin) $('#impInv').onchange = importInvoices;
}
function pod() {
  $('#title').textContent = 'POD review';
  $('#view').innerHTML = `<div class="panel">${table(invoices.filter(i=>i.pod_status==='pending'))}</div>`; bindRows();
}

/* ---------- Invoice drawer ---------- */
async function openInvoice(id) {
  const i = invoices.find(x=>x.id===id), admin = me.role==='admin';
  const { data: log } = await sb.from('activity_log').select('*').eq('invoice_id',id).order('created_at',{ascending:false});
  const idx = STEPS.findIndex(s=>s[0]===i.status), late = overdue(i);
  const link = async (path,label) => { if(!path) return '—'; const {data}=await sb.storage.from('docs').createSignedUrl(path,3600); return `<a class="link" target="_blank" href="${data?.signedUrl}">${label}</a>`; };
  let act = '';
  if (admin && ['imported','assigned'].includes(i.status)) act += `<div class="form"><h4>Assign transporter</h4>${i.suggested_transporter_id?`<span class="muted">Suggested: ${esc(tName(i.suggested_transporter_id))}</span>`:''}<select id="aT">${transporters.map(t=>`<option value="${t.id}" ${t.id===(i.transporter_id||i.suggested_transporter_id)?'selected':''}>${esc(t.name)}</option>`).join('')}</select><button class="btn primary" onclick="assign('${id}')">Confirm assignment</button></div>`;
  if (admin && i.pod_status==='pending') act += `<div class="form"><h4>Review proof of delivery</h4><input id="pN" placeholder="Note (required if rejecting)"><div style="display:flex;gap:8px"><button class="btn primary" onclick="podDecide('${id}',true)">Approve and close</button><button class="btn danger" onclick="podDecide('${id}',false)">Reject</button></div></div>`;
  if (!admin) {
    if (i.status==='assigned') act += `<div class="form"><h4>Review invoice</h4><textarea id="disc" placeholder="Report a discrepancy in goods received (optional)"></textarea><button class="btn primary" onclick="step('${id}',{status:'accepted',discrepancy:$('#disc').value||null},'Accepted invoice')">Accept invoice</button></div>`;
    if (i.status==='accepted') act += `<div class="form"><h4>Add LR and dispatch</h4><input id="lr" placeholder="LR number"><input id="lrf" type="file"><button class="btn primary" onclick="dispatch('${id}')">Save LR and dispatch</button></div>`;
    if (i.status==='dispatched') act += `<div class="form"><button class="btn primary" onclick="step('${id}',{status:'in_transit'},'Marked in transit')">Mark in transit</button></div>`;
    if (['dispatched','in_transit'].includes(i.status)) act += `<div class="form"><h4>Report a delay</h4><input id="dr" placeholder="Reason"><input id="dd" type="date" min="${today()}"><button class="btn" onclick="delay('${id}')">Submit delay</button></div><div class="form"><h4>Mark delivered</h4><input id="pf" type="file" accept="image/*,.pdf"><button class="btn primary" onclick="deliver('${id}')">Upload stamped POD</button></div>`;
  }
  $('#drawerBody').innerHTML = `<h3 style="font-size:26px">${esc(i.invoice_no)}</h3><p class="muted">${esc(dName(i.dealer_id))} · ₹${Number(i.amount||0).toLocaleString('en-IN')}</p>
  <div class="route">${STEPS.map((s,n)=>`<div class="stop ${n<=idx?'done':''} ${n===idx?'now':''} ${late?'late':''}"><i></i>${s[1]}</div>`).join('')}</div>
  <div class="grid2"><div><span>Invoice date</span>${fmt(i.invoice_date)}</div><div><span>Expected delivery</span>${fmt(i.expected_date)}</div><div><span>Revised date</span>${fmt(i.revised_date)}</div><div><span>Transporter</span>${esc(tName(i.transporter_id))}</div><div><span>LR number</span>${esc(i.lr_no||'—')}</div><div><span>LR document</span>${await link(i.lr_url,'Open LR')}</div><div><span>POD</span>${await link(i.pod_url,'Open POD')} ${i.pod_status!=='none'?`(${i.pod_status})`:''}</div><div><span>Status</span>${pill(i)}</div></div>
  ${i.delay_reason?`<p><b>Delay:</b> ${esc(i.delay_reason)}</p>`:''}${i.discrepancy?`<p><b>Discrepancy:</b> ${esc(i.discrepancy)}</p>`:''}${i.pod_note?`<p><b>POD note:</b> ${esc(i.pod_note)}</p>`:''}${act}
  <h4>Activity</h4><div class="log">${(log||[]).map(l=>`<div><b>${esc(l.action)}</b> · ${esc(l.actor)}<br>${new Date(l.created_at).toLocaleString('en-IN')}${l.note?'<br>'+esc(l.note):''}</div>`).join('')||'No activity yet.'}</div>`;
  $('#drawer').hidden = false;
}
function closeDrawer() { $('#drawer').hidden = true; }
$('#drawer').onclick = e => e.target.id==='drawer' && closeDrawer();

async function step(id, patch, action, note) {
  const { error } = await sb.from('invoices').update(patch).eq('id',id);
  if (error) return toast('Could not save: '+error.message);
  await sb.from('activity_log').insert({invoice_id:id, actor:me.name||me.role, action, note:note||null});
  toast('Saved'); closeDrawer(); refresh();
}
const assign = id => step(id,{transporter_id:$('#aT').value,status:'assigned'},'Assigned to '+tName($('#aT').value));
const delay = id => { const r=$('#dr').value,d=$('#dd').value; if(!r||!d) return toast('Add a reason and a revised date.'); step(id,{delay_reason:r,revised_date:d},'Delay reported',`${r} · new date ${d}`); };
async function upload(file, id, kind) { const path=`${kind}/${id}-${Date.now()}-${file.name.replace(/[^\w.]/g,'_')}`; const {error}=await sb.storage.from('docs').upload(path,file); if(error){toast('Upload failed: '+error.message);return null;} return path; }
async function dispatch(id) { const lr=$('#lr').value, f=$('#lrf').files[0]; if(!lr) return toast('Enter the LR number.'); const p = f ? await upload(f,id,'lr') : null; step(id,{lr_no:lr,lr_url:p,status:'dispatched'},'LR updated and dispatched',lr); }
async function deliver(id) { const f=$('#pf').files[0]; if(!f) return toast('Choose the stamped POD file.'); const p=await upload(f,id,'pod'); if(p) step(id,{status:'delivered',pod_url:p,pod_status:'pending',pod_note:null},'Delivered, POD uploaded'); }
function podDecide(id, ok) { const n=$('#pN').value; if(!ok&&!n) return toast('Add a note explaining the rejection.'); step(id, ok?{status:'closed',pod_status:'approved',pod_note:n||null}:{status:'in_transit',pod_status:'rejected',pod_note:n}, ok?'POD approved, invoice closed':'POD rejected', n); }

/* ---------- Masters + CSV import ---------- */
function parseCSV(t) { const rows=[]; let r=[],c='',q=false; for(let k=0;k<t.length;k++){const ch=t[k]; if(q){ if(ch==='"'&&t[k+1]==='"'){c+='"';k++;} else if(ch==='"') q=false; else c+=ch; } else if(ch==='"') q=true; else if(ch===','){r.push(c);c='';} else if(ch==='\n'||ch==='\r'){ if(ch==='\r'&&t[k+1]==='\n')k++; r.push(c);c=''; if(r.some(x=>x.trim()))rows.push(r); r=[]; } else c+=ch; } if(c||r.length){r.push(c);rows.push(r);} const h=rows.shift().map(x=>x.trim().toLowerCase()); return rows.map(r=>Object.fromEntries(h.map((k,n)=>[k,(r[n]||'').trim()]))); }
const readCSV = async e => { const f=e.target.files[0]; e.target.value=''; return f ? parseCSV(await f.text()) : null; };
async function importInvoices(e) {
  const rows = await readCSV(e); if(!rows) return; const bad=[];
  const out = rows.map(r => { const d=dealers.find(x=>x.code===r.dealer_code); if(!d||!r.invoice_no||!r.invoice_date){bad.push(r.invoice_no||'(blank)');return null;}
    const exp=new Date(r.invoice_date+'T00:00'); exp.setDate(exp.getDate()+d.transit_days);
    return {invoice_no:r.invoice_no,invoice_date:r.invoice_date,amount:+r.amount||0,dealer_id:d.id,expected_date:exp.toISOString().slice(0,10),suggested_transporter_id:d.default_transporter_id}; }).filter(Boolean);
  if (out.length) { const {error}=await sb.from('invoices').upsert(out,{onConflict:'invoice_no',ignoreDuplicates:true}); if(error) return toast(error.message); }
  toast(`Imported ${out.length} invoices${bad.length?` · skipped ${bad.length} (unknown dealer code or missing fields)`:''}`); refresh();
}
function mas() {
  $('#title').textContent = 'Masters';
  $('#actions').innerHTML = `<label class="btn">Import transporters<input type="file" accept=".csv" hidden id="impT"></label><label class="btn">Import dealers<input type="file" accept=".csv" hidden id="impD"></label>`;
  $('#view').innerHTML = `<div class="panel"><h3>Transporters (${transporters.length})</h3><table><tr><th>Name</th><th>Contact</th><th>Phone</th><th>Email</th></tr>${transporters.map(t=>`<tr><td>${esc(t.name)}</td><td>${esc(t.contact)}</td><td>${esc(t.phone)}</td><td>${esc(t.email)}</td></tr>`).join('')}</table></div>
  <div class="panel"><h3>Dealers (${dealers.length})</h3><table><tr><th>Code</th><th>Name</th><th>City</th><th>Transit days</th><th>Default transporter</th></tr>${dealers.map(d=>`<tr><td>${esc(d.code)}</td><td>${esc(d.name)}</td><td>${esc(d.city)}, ${esc(d.state)}</td><td>${d.transit_days}</td><td>${esc(tName(d.default_transporter_id))}</td></tr>`).join('')}</table></div>`;
  $('#impT').onchange = async e => { const r=await readCSV(e); if(!r) return; const {error}=await sb.from('transporters').insert(r.map(x=>({name:x.name,contact:x.contact,phone:x.phone,email:x.email}))); toast(error?error.message:'Transporters imported'); refresh(); };
  $('#impD').onchange = async e => { const r=await readCSV(e); if(!r) return; const {error}=await sb.from('dealers').upsert(r.map(x=>({code:x.code,name:x.name,city:x.city,state:x.state,transit_days:+x.transit_days||3,default_transporter_id:transporters.find(t=>t.name===x.default_transporter)?.id||null})),{onConflict:'code'}); toast(error?error.message:'Dealers imported'); refresh(); };
}
sb.auth.getSession().then(({data})=>data.session&&boot());
