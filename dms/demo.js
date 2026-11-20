/* Demo mode: in-memory sample data using real names from the tracker. Nothing is saved to Supabase. */
function mockClient(role) {
  const iso = n => new Date(Date.now()+n*864e5).toISOString().slice(0,10), ts = n => new Date(Date.now()+n*864e5).toISOString();
  let uid = 0; const tid = n => 't-'+n;
  const T = ['ICON','JRS','JRS / SMART LINE','PRAKITHI','RECOX','SAFE EXPRESS','SMART LINE','UMMER TRANSPORT','VRL'].map((n,i)=>({id:tid(n),name:n,contact:'Dispatch desk',phone:'90000 0010'+i,email:'demo@example.com'}));
  const D = [['ROYAL MAX FOOTCARE, KADALUNDI','Kozhikode','Kerala',1,'SMART LINE'],['VEEJAY FOOTWEARS,KTM','Kottayam','Kerala',1,'SMART LINE'],['LEO FOOTWEARS, KTM','Kottayam','Kerala',1,'SMART LINE'],['FALCON AGENCIES PVT LTD,CHNGRY','Kottayam','Kerala',1,'SMART LINE'],['MAJESTIC FOOTWEAR, KOLLAM','Kollam','Kerala',1,'SMART LINE'],['G.K.FOOTWEAR, KUNNAMKULAM','Thrissur','Kerala',2,'SMART LINE'],
    ['WALKON AGENCIES, PERUMBAVOOR','Ernakulam','Kerala',1,'ICON'],['NATIONAL TRADELINKS, MUKKOM','Kozhikode','Kerala',1,'RECOX'],['MAXON AGENCIES, KASARGOD','Kasaragod','Kerala',1,'JRS / SMART LINE'],
    ['ADDA MARKETING','Raipur','Chhattisgarh',8,'SAFE EXPRESS'],['SHIV GANESH FOOT WEAR','Pune','Maharashtra',6,'SAFE EXPRESS'],['TEJ SALES','Udaipur','Rajasthan',7,'SAFE EXPRESS'],
    ['AHAMED TRADERS','Coimbatore','Tamil Nadu',3,'UMMER TRANSPORT'],['PROMISE FOOTWEAR','Coimbatore','Tamil Nadu',3,'UMMER TRANSPORT'],['CHOICE DISTRIBUTERS','Bengaluru Rural','Karnataka',4,'VRL'],['KALA SHOE CENTRE','Davanagere','Karnataka',4,'VRL']]
    .map((x,i)=>({id:'d'+i,code:'D'+String(i+1).padStart(3,'0'),name:x[0],city:x[1],state:x[2],transit_days:x[3],default_transporter_id:tid(x[4])}));
  const P = ['imported','assigned','accepted','dispatched','transit','transit','pod','closed','closed','transit','pod'], I = [], L = [];
  for (let i=0; i<64; i++) {
    const d = D[i%D.length], k = i>=40?'closed':P[i%P.length], age = i>=40?15+(i-40)*7:(i%9)+1, tn = T.find(t=>t.id===d.default_transporter_id).name;
    const b = {id:'i'+i,invoice_no:'JL/26-27/'+(6400+i),invoice_date:iso(-age),amount:6000+((i*7919)%52000),units:10+((i*13)%60),dealer_id:d.id,expected_date:iso(-age+d.transit_days),transporter_id:null,suggested_transporter_id:d.default_transporter_id,status:'imported',discrepancy:null,lr_no:null,lr_url:null,delay_reason:null,revised_date:null,pod_url:null,pod_status:'none',pod_note:null,dispatch_date:null,delivery_date:null,created_at:ts(-age)};
    const log = (a,n,x) => L.push({id:L.length+1,invoice_id:b.id,actor:a,action:n,note:x||null,created_at:ts(-age+L.length%3*0.1)});
    log('System','Invoice imported');
    if (k!=='imported') { b.transporter_id = d.default_transporter_id; b.status='assigned'; log('HQ Admin','Assigned to '+tn); }
    if (!['imported','assigned'].includes(k)) { b.status='accepted'; if (k==='accepted'&&i%2===0) b.discrepancy='Short by 2 pairs in carton 3'; log(tn,'Accepted invoice'); }
    if (!['imported','assigned','accepted'].includes(k)) { Object.assign(b,{status:'dispatched',lr_no:'LR'+(52000+i),lr_url:'lr/demo.pdf',dispatch_date:iso(-age)}); log(tn,'LR updated and dispatched',b.lr_no); }
    if (k==='transit') { b.status='in_transit'; log(tn,'Marked in transit'); if (i%4===0) { Object.assign(b,{delay_reason:'Vehicle breakdown on route',revised_date:iso(1)}); log(tn,'Delay reported','Vehicle breakdown on route · new date '+iso(1)); } if (i%7===3) { Object.assign(b,{pod_status:'rejected',pod_note:'Stamp not visible. Please re-upload.'}); log('HQ Admin','POD rejected',b.pod_note); } }
    if (k==='pod') { Object.assign(b,{status:'delivered',pod_url:'pod/demo.pdf',pod_status:'pending',delivery_date:iso(-1)}); log(tn,'Delivered, POD uploaded'); }
    if (k==='closed') { Object.assign(b,{status:'closed',pod_url:'pod/demo.pdf',pod_status:'approved',delivery_date:iso(Math.min(0,-age+d.transit_days+(i%3===0?1:0)))}); log(tn,'Delivered, POD uploaded'); log('HQ Admin','POD approved, invoice closed'); }
    I.push(b);
  }
  const me = role==='admin' ? {id:'demo-admin',role:'admin',name:'HQ Admin'} : {id:'demo-tr',role:'transporter',name:'Smart Line Ops',transporter_id:tid('SMART LINE')};
  const DB = {profiles:[me],transporters:T,dealers:D,invoices:I,activity_log:L};
  class Q {
    constructor(t){this.t=t;this.op='select';this.f=[];}
    select(){return this} order(c,o={}){this.ord=[c,o.ascending!==false];return this} eq(c,v){this.f.push([c,v]);return this}
    limit(n){this.lim=n;return this} single(){this.one=true;return this} maybeSingle(){this.one=true;return this}
    insert(r){this.op='insert';this.rows=[].concat(r);return this} update(p){this.op='update';this.patch=p;return this} upsert(r,o={}){this.op='upsert';this.rows=[].concat(r);this.o=o;return this}
    vis(){let r=DB[this.t]; if(this.t==='invoices'&&me.role==='transporter') r=r.filter(x=>x.transporter_id===me.transporter_id); if(this.t==='activity_log'&&me.role==='transporter'){const ids=new Set(DB.invoices.filter(x=>x.transporter_id===me.transporter_id).map(x=>x.id)); r=r.filter(x=>ids.has(x.invoice_id));} return r.filter(x=>this.f.every(([c,v])=>x[c]===v));}
    add(x){DB[this.t].push({id:'n'+(++uid),created_at:ts(0),...(this.t==='invoices'?{pod_status:'none'}:{}),...x});}
    run(){
      if(this.op==='select'){let r=this.vis(); if(this.ord) r=[...r].sort((a,b)=>(a[this.ord[0]]>b[this.ord[0]]?1:-1)*(this.ord[1]?1:-1)); if(this.lim) r=r.slice(0,this.lim); return {data:this.one?(r[0]||null):r,error:null};}
      if(this.op==='update'){this.vis().forEach(x=>Object.assign(x,this.patch));return {error:null};}
      if(this.op==='insert'){this.rows.forEach(x=>this.add(x));return {error:null};}
      this.rows.forEach(x=>{const e=DB[this.t].find(y=>y[this.o.onConflict]===x[this.o.onConflict]); if(!e) this.add(x); else if(!this.o.ignoreDuplicates) Object.assign(e,x);}); return {error:null};
    }
    then(a,b){return Promise.resolve(this.run()).then(a,b)}
  }
  const doc = 'data:image/svg+xml;utf8,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="420" height="260"><rect width="100%" height="100%" fill="#fff" stroke="#999"/><text x="24" y="70" font-size="24" font-family="Arial">Sample document</text><text x="24" y="110" font-size="15" font-family="Arial">Demo LR / stamped POD copy</text></svg>');
  return {isDemo:true, auth:{getUser:async()=>({data:{user:{id:me.id,email:'demo@dms.local'}}}),signOut:async()=>({}),getSession:async()=>({data:{session:null}}),signInWithPassword:async()=>({})},
    from:t=>new Q(t), storage:{from:()=>({upload:async()=>({error:null}),createSignedUrl:async()=>({data:{signedUrl:doc}})})}};
}
