let sb = supabase.createClient(DMS_CONFIG.SUPABASE_URL, DMS_CONFIG.SUPABASE_ANON_KEY);
const $ = s => document.querySelector(s), today = () => new Date().toISOString().slice(0,10);
const STEPS = [['imported','Imported'],['assigned','Assigned'],['accepted','Accepted'],['dispatched','Dispatched'],['in_transit','In transit'],['delivered','Delivered'],['closed','Closed']];
let me, invoices = [], dealers = [], transporters = [], tab, filter = {q:'',s:'',t:'',d:''};
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
$('#demoHQ').onclick = () => { sb = mockClient('admin'); boot(); };
$('#demoTR').onclick = () => { sb = mockClient('transporter'); boot(); };
$('#logout').onclick = async () => { await sb.auth.signOut(); location.reload(); };

async function boot() {
  const { data: { user } } = await sb.auth.getUser(); if (!user) return;
  const { data: p, error: pe } = await sb.from('profiles').select('*').eq('id', user.id).maybeSingle();
  if (!p) { $('#loginErr').textContent = pe ? 'Could not load your profile: ' + pe.message : 'Your account has no role yet. Ask HQ to set it up.'; return; }
  me = p; $('#login').hidden = true; $('#app').hidden = false;
  $('#who').textContent = `${p.name || user.email} · ${p.role === 'admin' ? 'HQ' : 'Transporter'}${sb.isDemo ? ' · DEMO' : ''}`;
  const nav = p.role === 'admin' ? [['dash','Dashboard',''],['inv','All invoices',''],['inv','POD review','pod'],['mas','Masters','']] : [['tdash','Dashboard',''],['inv','New requests','await'],['inv','All deliveries','']];
  $('#nav').innerHTML = nav.map(n=>`<button data-t="${n[0]}" data-p="${n[2]}">${n[1]}</button>`).join('');
  $('#nav').onclick = e => e.target.dataset.t && go(e.target.dataset.t, e.target.dataset.p);
  $('#view').onclick = e => { const el = e.target.closest('[data-drill]'); if (el) drill(el.dataset.drill, {t:el.dataset.t, d:el.dataset.d}); };
  await load(); go(nav[0][0], nav[0][2]);
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

/* ---------- Helpers, filters ---------- */
const inr = n => '₹'+Number(n||0).toLocaleString('en-IN');
const dayDiff = (a,b) => Math.round((new Date(b+'T00:00')-new Date(a+'T00:00'))/864e5);
const late = i => overdue(i) ? dayDiff(due(i), today()) : 0;
const open_ = i => !['delivered','closed'].includes(i.status);
const dCity = id => dealers.find(d=>d.id===id)?.city || '';
const F = {
  '':{l:'All invoices',f:()=>true}, assign:{l:'Needs assignment',f:i=>i.status==='imported'}, await:{l:'Awaiting acceptance',f:i=>i.status==='assigned'},
  progress:{l:'In progress',f:i=>['accepted','dispatched','in_transit'].includes(i.status)&&!overdue(i)}, overdue:{l:'Overdue',f:overdue},
  late1:{l:'Overdue 1–2 days',f:i=>overdue(i)&&late(i)<=2}, late3:{l:'Overdue 3–5 days',f:i=>overdue(i)&&late(i)>=3&&late(i)<=5}, late6:{l:'Overdue 6+ days',f:i=>overdue(i)&&late(i)>=6},
  delayed:{l:'Delay reported',f:i=>i.delay_reason&&open_(i)}, pod:{l:'POD to review',f:i=>i.pod_status==='pending'},
  rejected:{l:'POD rejected',f:i=>i.pod_status==='rejected'&&i.status!=='closed'}, closed:{l:'Closed',f:i=>i.status==='closed'}
};
function stat(l) {
  const dn = l.filter(i=>['delivered','closed'].includes(i.status)&&i.delivery_date), ot = dn.filter(i=>i.delivery_date<=due(i)).length;
  const days = dn.map(i=>dayDiff(i.invoice_date,i.delivery_date)).filter(x=>x>=0);
  return {total:l.length, done:l.filter(i=>!open_(i)).length, ontime:dn.length?Math.round(ot/dn.length*100):null, avg:days.length?(days.reduce((a,b)=>a+b,0)/days.length).toFixed(1):null,
    overdue:l.filter(overdue).length, progress:l.filter(F.progress.f).length, value:l.filter(open_).reduce((s,i)=>s+(+i.amount||0),0), delivered:l.filter(i=>!open_(i)).reduce((s,i)=>s+(+i.amount||0),0)};
}
const kpi = (label,n,color,key) => `<button class="kpi" data-drill="${key}" style="--c:${color}"><b>${n}</b><span>${label}</span><small>View list →</small></button>`;
const ins = (label,val,sub) => `<div class="ins"><span>${label}</span><b>${val}</b><small>${sub||''}</small></div>`;
const pc = v => v==null ? '—' : v+'%';
function drill(s,o={}) { filter = {q:'',s:s||'',t:o.t||'',d:o.d||''}; go('inv'); }
function go(t,p) {
  if (p!==undefined) filter = {q:'',s:p,t:'',d:''};
  tab = t; const bs = [...document.querySelectorAll('#nav button')];
  const m = bs.find(b=>b.dataset.t===t&&(t!=='inv'||b.dataset.p===filter.s)) || bs.find(b=>b.dataset.t===t); bs.forEach(b=>b.classList.toggle('on',b===m));
  $('#actions').innerHTML = ''; ({dash,tdash,inv,mas})[t]();
}
async function refresh() { await load(); go(tab); }
function bindRows() { document.querySelectorAll('tr.row').forEach(r=>r.onclick=()=>openInvoice(r.dataset.id)); }
function table(list) {
  if (!list.length) return '<p class="muted">Nothing here yet.</p>';
  return `<table><tr><th>Invoice</th><th>Dealer</th><th>Transporter</th><th>Due</th><th>Status</th></tr>${list.map(i=>`<tr class="row" data-id="${i.id}"><td><b>${esc(i.invoice_no)}</b></td><td>${esc(dName(i.dealer_id))}</td><td>${esc(tName(i.transporter_id))}</td><td>${fmt(due(i))}${late(i)?`<br><small style="color:var(--red)">${late(i)}d late</small>`:''}</td><td>${pill(i)}</td></tr>`).join('')}</table>`;
}
async function feed() {
  const t0 = tab, {data} = await sb.from('activity_log').select('*').order('created_at',{ascending:false}).limit(10);
  if (tab!==t0 || !$('#feed')) return;
  $('#feed').innerHTML = `<h3>Recent activity</h3>${(data||[]).length?`<table>${data.map(l=>{const i=invoices.find(x=>x.id===l.invoice_id);return `<tr class="row" data-id="${l.invoice_id}"><td><b>${esc(i?.invoice_no||'')}</b></td><td>${esc(l.action)}</td><td>${esc(l.actor)}</td><td class="muted">${new Date(l.created_at).toLocaleString('en-IN',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})}</td></tr>`}).join('')}</table>`:'<p class="muted">No activity yet.</p>'}`; bindRows();
}

/* ---------- HQ dashboard ---------- */
function dash() {
  $('#title').textContent = 'Delivery overview';
  const c = k => invoices.filter(F[k].f).length, S = stat(invoices), mo = today().slice(0,7), thisMonth = invoices.filter(i=>i.delivery_date&&i.delivery_date.startsWith(mo)).length;
  const perf = transporters.map(t=>{const l=invoices.filter(i=>i.transporter_id===t.id);return {t,l,s:stat(l)}}).filter(p=>p.l.length).sort((a,b)=>b.l.length-a.l.length);
  const chip = (k,l) => `<button class="chip" data-drill="${k}"><b>${c(k)}</b> ${l}</button>`;
  $('#view').innerHTML = `<div class="kpis">${kpi('Needs assignment',c('assign'),'var(--blue)','assign')}${kpi('Awaiting acceptance',c('await'),'#7a5cd6','await')}${kpi('In progress',c('progress'),'var(--teal)','progress')}${kpi('Overdue',c('overdue'),'var(--red)','overdue')}${kpi('POD to review',c('pod'),'var(--amber)','pod')}${kpi('Closed',c('closed'),'var(--green)','closed')}</div>
  <div class="kpis">${ins('On-time delivery',pc(S.ontime),'of delivered invoices')}${ins('Avg delivery time',S.avg==null?'—':S.avg+' days','invoice to delivery')}${ins('Value in transit',inr(S.value),'open invoices')}${ins('Delivered this month',thisMonth,'invoices')}</div>
  <div class="split"><div class="panel"><h3>Transporter performance</h3><p class="muted">Select a transporter to see all their invoices.</p><table><tr><th>Transporter</th><th>Assigned</th><th>Active</th><th>Overdue</th><th>Delivered</th><th>On-time</th></tr>${perf.map(p=>`<tr class="crow" data-drill="" data-t="${p.t.id}"><td><b>${esc(p.t.name)}</b></td><td>${p.s.total}</td><td>${p.l.filter(open_).length}</td><td style="color:${p.s.overdue?'var(--red)':'inherit'}">${p.s.overdue}</td><td>${p.s.done}</td><td>${pc(p.s.ontime)}</td></tr>`).join('')||'<tr><td colspan="6" class="muted">Assign invoices to see performance.</td></tr>'}</table></div>
  <div class="panel"><h3>Overdue ageing</h3><p class="muted">How late open invoices are.</p><div class="chips">${chip('late1','1–2 days')}${chip('late3','3–5 days')}${chip('late6','6+ days')}</div><h3 style="margin-top:22px">Other flags</h3><div class="chips">${chip('delayed','delay reported')}${chip('rejected','POD rejected')}</div></div></div>
  <div class="panel"><h3>Needs attention</h3>${table(invoices.filter(i=>overdue(i)||i.pod_status==='pending').sort((a,b)=>late(b)-late(a)).slice(0,10))}<p><button class="link" data-drill="overdue">View all overdue →</button></p></div>
  <div class="panel" id="feed"><h3>Recent activity</h3><p class="muted">Loading…</p></div>`;
  bindRows(); feed();
}

/* ---------- Transporter dashboard ---------- */
function tdash() {
  $('#title').textContent = `Welcome, ${me.name||'transporter'}`;
  const c = k => invoices.filter(F[k].f).length, S = stat(invoices);
  const next = i => i.pod_status==='rejected'&&i.status!=='closed' ? 'Re-upload POD' : ({assigned:'Accept invoice',accepted:'Add LR and dispatch',dispatched:'Mark in transit',in_transit:'Update status or deliver'})[i.status];
  const act = invoices.filter(open_).sort((a,b)=>(due(a)||'')>(due(b)||'')?1:-1);
  const ms = [...Array(6)].map((_,k)=>{const d=new Date();d.setMonth(d.getMonth()-5+k,1);return d.toISOString().slice(0,7)});
  const mc = ms.map(m=>invoices.filter(i=>!open_(i)&&(i.delivery_date||'').startsWith(m)).length), mx = Math.max(1,...mc);
  const byD = {}; invoices.forEach(i=>(byD[i.dealer_id]=byD[i.dealer_id]||[]).push(i));
  $('#view').innerHTML = `<div class="kpis">${kpi('New requests',c('await'),'#7a5cd6','await')}${kpi('In progress',c('progress'),'var(--teal)','progress')}${kpi('Overdue',c('overdue'),'var(--red)','overdue')}${kpi('POD with HQ',c('pod'),'var(--amber)','pod')}${kpi('POD rejected',c('rejected'),'var(--red)','rejected')}${kpi('Completed',c('closed'),'var(--green)','closed')}</div>
  <div class="kpis">${ins('On-time delivery',pc(S.ontime),'of your deliveries')}${ins('Avg delivery time',S.avg==null?'—':S.avg+' days','invoice to delivery')}${ins('Total handled',S.total,'invoices')}${ins('Value delivered',inr(S.delivered),'completed')}</div>
  <div class="panel"><h3>Needs your action</h3>${act.length?`<table><tr><th>Invoice</th><th>Dealer</th><th>Due</th><th>Next step</th><th>Status</th></tr>${act.slice(0,10).map(i=>`<tr class="row" data-id="${i.id}"><td><b>${esc(i.invoice_no)}</b></td><td>${esc(dName(i.dealer_id))}</td><td>${fmt(due(i))}${late(i)?`<br><small style="color:var(--red)">${late(i)}d late</small>`:''}</td><td><b>${next(i)||''}</b></td><td>${pill(i)}</td></tr>`).join('')}</table>`:'<p class="muted">You are all caught up.</p>'}</div>
  <div class="split"><div class="panel"><h3>Deliveries per month</h3><div class="bars">${ms.map((m,k)=>`<div class="bar"><span>${new Date(m+'-01').toLocaleString('en-IN',{month:'short',year:'2-digit'})}</span><div><i style="width:${mc[k]/mx*100}%"></i></div><span>${mc[k]}</span></div>`).join('')}</div></div>
  <div class="panel"><h3>By dealer</h3><table><tr><th>Dealer</th><th>Shipments</th><th>Delivered</th><th>On-time</th></tr>${Object.entries(byD).map(([id,l])=>[id,l,stat(l)]).sort((a,b)=>b[1].length-a[1].length).slice(0,8).map(([id,l,s])=>`<tr class="crow" data-drill="" data-d="${id}"><td>${esc(dName(id))}</td><td>${l.length}</td><td>${s.done}</td><td>${pc(s.ontime)}</td></tr>`).join('')}</table></div></div>
  <div class="panel" id="feed"><h3>Recent activity</h3><p class="muted">Loading…</p></div>`;
  bindRows(); feed();
}

/* ---------- Invoice list (drill-down) ---------- */
function inv() {
  const admin = me.role==='admin', P = F[filter.s]||F[''];
  $('#title').textContent = filter.s==='' ? (admin?'All invoices':'My deliveries') : (filter.s==='await'&&!admin ? 'New requests' : P.l);
  $('#actions').innerHTML = `${admin?`<label class="btn primary">Upload invoice PDF<input type="file" accept=".pdf" hidden id="impPdf"></label><label class="btn">Import CSV<input type="file" accept=".csv" hidden id="impInv"></label>`:''}<button class="btn" id="exp">Export CSV</button>`;
  const full = l => !l.length ? '<p class="muted">Nothing here yet.</p>' : `<table><tr><th>Invoice</th><th>Dealer</th><th>Units</th><th>Amount</th>${admin?'<th>Transporter</th>':''}<th>LR</th><th>Due</th><th>Status</th></tr>${l.map(i=>`<tr class="row" data-id="${i.id}"><td><b>${esc(i.invoice_no)}</b><br><small class="muted">${fmt(i.invoice_date)}</small></td><td>${esc(dName(i.dealer_id))}<br><small class="muted">${esc(dCity(i.dealer_id))}</small></td><td>${i.units??'—'}</td><td>${inr(i.amount)}</td>${admin?`<td>${esc(tName(i.transporter_id))}</td>`:''}<td>${esc(i.lr_no||'—')}</td><td>${fmt(due(i))}${late(i)?`<br><small style="color:var(--red)">${late(i)}d late</small>`:''}</td><td>${pill(i)}</td></tr>`).join('')}</table>`;
  $('#view').innerHTML = `<div class="panel"><div class="tools"><button class="link" id="back">← Dashboard</button><input id="q" placeholder="Search invoice or dealer" value="${esc(filter.q)}"><select id="fs">${Object.entries(F).map(([k,v])=>`<option value="${k}">${k===''?'All statuses':v.l}</option>`).join('')}</select>${filter.t?`<span class="chip">Transporter: ${esc(tName(filter.t))} <button class="link" data-clear="t">✕</button></span>`:''}${filter.d?`<span class="chip">Dealer: ${esc(dName(filter.d))} <button class="link" data-clear="d">✕</button></span>`:''}</div><p class="muted" id="sum"></p><div id="tbl"></div></div>`;
  $('#fs').value = filter.s; let cur = [];
  const draw = () => { filter.q=$('#q').value; filter.s=$('#fs').value; const q=filter.q.toLowerCase(), f=(F[filter.s]||F['']).f;
    cur = invoices.filter(i=>f(i)&&(!filter.t||i.transporter_id===filter.t)&&(!filter.d||i.dealer_id===filter.d)&&(!q||i.invoice_no.toLowerCase().includes(q)||dName(i.dealer_id).toLowerCase().includes(q)));
    $('#sum').textContent = `${cur.length} invoices · ${inr(cur.reduce((s,i)=>s+(+i.amount||0),0))}`; $('#tbl').innerHTML = full(cur); bindRows(); };
  $('#q').oninput = draw; $('#fs').onchange = () => { $('#title').textContent = $('#fs').value===''?(admin?'All invoices':'My deliveries'):F[$('#fs').value].l; draw(); }; draw();
  $('#back').onclick = () => go(admin?'dash':'tdash');
  document.querySelectorAll('[data-clear]').forEach(b=>b.onclick=()=>{filter[b.dataset.clear]='';inv();});
  $('#exp').onclick = () => { const q=v=>'"'+String(v??'').replace(/"/g,'""')+'"', h=['invoice_no','invoice_date','dealer','units','amount','transporter','lr_no','expected_date','revised_date','delivery_date','status'];
    const csv=[h.join(','),...cur.map(i=>[i.invoice_no,i.invoice_date,dName(i.dealer_id),i.units,i.amount,tName(i.transporter_id),i.lr_no,i.expected_date,i.revised_date,i.delivery_date,i.status].map(q).join(','))].join('\n');
    const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'})); a.download='dms-invoices.csv'; a.click(); };
  if (admin) { $('#impInv').onchange = importInvoices; $('#impPdf').onchange = importPdf; }
}

/* ---------- Invoice drawer ---------- */
async function openInvoice(id) {
  const i = invoices.find(x=>x.id===id), admin = me.role==='admin';
  const { data: log } = await sb.from('activity_log').select('*').eq('invoice_id',id).order('created_at',{ascending:false});
  const idx = STEPS.findIndex(s=>s[0]===i.status), late = overdue(i);
  const link = async (path,label) => { if(!path) return '—'; const {data}=await sb.storage.from('docs').createSignedUrl(path,3600); return `<a class="link" target="_blank" href="${data?.signedUrl}">${label}</a>`; };
  let act = '';
  if (admin && ['imported','assigned'].includes(i.status)) act += `<div class="form"><h4>Assign transporter</h4>${i.suggested_transporter_id?`<span class="muted">Dealer\'s usual transporter: ${esc(tName(i.suggested_transporter_id))}</span>`:''}<select id="aT"><option value="">Select transporter</option>${transporters.map(t=>`<option value="${t.id}" ${t.id===i.transporter_id?'selected':''}>${esc(t.name)}</option>`).join('')}</select><button class="btn primary" onclick="assign('${id}')">Confirm assignment</button></div>`;
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
const assign = id => !$('#aT').value ? toast('Select a transporter first.') : step(id,{transporter_id:$('#aT').value,status:'assigned'},'Assigned to '+tName($('#aT').value));
const delay = id => { const r=$('#dr').value,d=$('#dd').value; if(!r||!d) return toast('Add a reason and a revised date.'); step(id,{delay_reason:r,revised_date:d},'Delay reported',`${r} · new date ${d}`); };
async function upload(file, id, kind) { const path=`${kind}/${id}-${Date.now()}-${file.name.replace(/[^\w.]/g,'_')}`; const {error}=await sb.storage.from('docs').upload(path,file); if(error){toast('Upload failed: '+error.message);return null;} return path; }
async function dispatch(id) { const lr=$('#lr').value, f=$('#lrf').files[0]; if(!lr) return toast('Enter the LR number.'); const p = f ? await upload(f,id,'lr') : null; step(id,{lr_no:lr,lr_url:p,status:'dispatched'},'LR updated and dispatched',lr); }
async function deliver(id) { const f=$('#pf').files[0]; if(!f) return toast('Choose the stamped POD file.'); const p=await upload(f,id,'pod'); if(p) step(id,{status:'delivered',pod_url:p,pod_status:'pending',pod_note:null},'Delivered, POD uploaded'); }
function podDecide(id, ok) { const n=$('#pN').value; if(!ok&&!n) return toast('Add a note explaining the rejection.'); step(id, ok?{status:'closed',pod_status:'approved',pod_note:n||null}:{status:'in_transit',pod_status:'rejected',pod_note:n}, ok?'POD approved, invoice closed':'POD rejected', n); }

/* ---------- Masters + CSV import ---------- */
function parseCSV(t) { const rows=[]; let r=[],c='',q=false; for(let k=0;k<t.length;k++){const ch=t[k]; if(q){ if(ch==='"'&&t[k+1]==='"'){c+='"';k++;} else if(ch==='"') q=false; else c+=ch; } else if(ch==='"') q=true; else if(ch===','){r.push(c);c='';} else if(ch==='\n'||ch==='\r'){ if(ch==='\r'&&t[k+1]==='\n')k++; r.push(c);c=''; if(r.some(x=>x.trim()))rows.push(r); r=[]; } else c+=ch; } if(c||r.length){r.push(c);rows.push(r);} const h=rows.shift().map(x=>x.trim().toLowerCase()); return rows.map(r=>Object.fromEntries(h.map((k,n)=>[k,(r[n]||'').trim()]))); }
const readCSV = async e => { const f=e.target.files[0]; e.target.value=''; return f ? parseCSV(await f.text()) : null; };
const nd = x => x ? x : null;
function toInvoice(r) {
  const key = s => (s||'').toUpperCase().replace(/\s+/g,'');
  const d = dealers.find(x => (r.dealer_code && x.code===r.dealer_code) || (r.dealer_name && key(x.name)===key(r.dealer_name)));
  if (!d || !r.invoice_no || !r.invoice_date) return null;
  const exp = new Date(r.invoice_date+'T00:00'); exp.setDate(exp.getDate()+(d.transit_days||3));
  const tr = transporters.find(t => key(t.name)===key(r.transporter));
  const st = r.status==='delivered' ? 'closed' : r.status==='in_transit' ? 'in_transit' : (tr ? 'assigned' : 'imported');
  return {invoice_no:r.invoice_no, invoice_date:r.invoice_date, amount:+r.amount||null, units:+r.units||null, dealer_id:d.id,
    expected_date:nd(r.expected_date)||exp.toISOString().slice(0,10), suggested_transporter_id:d.default_transporter_id,
    transporter_id:tr?.id||null, lr_no:nd(r.lr_no), dispatch_date:nd(r.dispatch_date), delivery_date:nd(r.delivery_date), status:st};
}
async function saveInvoices(rows) {
  const out = rows.map(toInvoice).filter(Boolean), skipped = rows.length-out.length;
  for (let n=0; n<out.length; n+=200) { const {error}=await sb.from('invoices').upsert(out.slice(n,n+200),{onConflict:'invoice_no',ignoreDuplicates:true}); if (error) return toast(error.message); }
  toast(`Imported ${out.length} invoices${skipped?` · skipped ${skipped} (dealer not found or fields missing)`:''}`); await refresh(); return out;
}
async function importInvoices(e) { const rows = await readCSV(e); if (rows) saveInvoices(rows); }
async function importPdf(e) {
  const f = e.target.files[0]; e.target.value=''; if (!f) return;
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  const doc = await pdfjsLib.getDocument({data: await f.arrayBuffer()}).promise; let txt = '';
  for (let p=1; p<=doc.numPages; p++) txt += (await (await doc.getPage(p)).getTextContent()).items.map(i=>i.str).join(' ') + ' ';
  txt = txt.replace(/\s+/g,' ');
  const no = (txt.match(/Invoice No\.?:?\s*([A-Z0-9\/-]+)/i)||[])[1], dt = (txt.match(/Invoice Date:?\s*(\d{1,2} \w{3} \d{4})/i)||[])[1];
  const amt = (txt.match(/Grand Total:?\s*([\d,.]+)/i)||[])[1], units = (txt.match(/Total\s+[\d.]+\s+([\d.]+)\s+[\d.]+/)||[])[1];
  const key = s => s.toUpperCase().replace(/\s+/g,''), T = key(txt);
  const d = [...dealers].sort((a,b)=>b.name.length-a.name.length).find(x => T.includes(key(x.name)));
  if (!no || !dt || !d) return toast('Could not read this PDF. Check that the invoice number, date and dealer name are in the dealer list.');
  const done = await saveInvoices([{invoice_no:no, invoice_date:new Date(dt+' 12:00').toISOString().slice(0,10), dealer_name:d.name, units, amount:(amt||'').replace(/,/g,'')}]);
  const inv = invoices.find(x => x.invoice_no===no); if (done && inv) { go('inv'); openInvoice(inv.id); }
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
