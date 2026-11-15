/* LiftLog: offline-first personal strength tracker. Public code, private user records. */
const root=document.querySelector('#app');
const CONFIG=window.LIFTLOG_CONFIG||{};
const hasConfig=Boolean(CONFIG.url && CONFIG.anonKey);
const sb=(hasConfig&&window.supabase?.createClient)
  ?window.supabase.createClient(CONFIG.url,CONFIG.anonKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}}):null;
const PROGRAM={
 A:{name:'Squat + push',focus:'Lower body strength and upper push',warmup:'5 min bike, then 2 light squat sets',finisher:'Rowing machine: 8 rounds of 30 sec hard / 30 sec easy',items:[
 ['squat','Barbell back squat','Quads',6,8,180,'','Brace your core|Keep your feet planted|Drive through midfoot'],
 ['db-bench','Dumbbell bench press','Chest',8,10,120,'','Retract shoulder blades|Keep wrists stacked|Lower with control'],
 ['cable-row','Seated cable row','Back',10,12,90,'','Keep torso stable|Pull elbows toward hips|Control the return'],
 ['rdl','Romanian deadlift','Hamstrings',8,10,120,'','Hinge at your hips|Keep weight close|Stop when hamstrings stretch'],
 ['lateral','Dumbbell lateral raise','Shoulders',12,15,0,'5a','Lead with elbows|Avoid swinging|Raise to shoulder height'],
 ['pushdown','Cable triceps pushdown','Triceps',10,15,60,'5b','Elbows at your sides|Extend fully|Return slowly']]},
 B:{name:'Pull + legs',focus:'Back, legs and shoulders',warmup:'5 min bike, then 1 light set of pulldown and leg press',finisher:'Bike: 8 rounds of 30 sec hard / 30 sec easy',items:[
 ['pulldown','Lat pulldown','Back',8,12,120,'','Keep chest lifted|Pull elbows down|Avoid excessive leaning'],
 ['leg-press','Leg press','Quads',10,12,120,'','Keep lower back on pad|Control depth|Avoid locking knees'],
 ['shoulder-press','Seated dumbbell shoulder press','Shoulders',8,10,120,'','Brace core|Press above shoulders|Lower under control'],
 ['lunges','Dumbbell walking lunges','Legs',10,10,90,'','Take controlled steps|Keep front foot flat|Count per leg'],
 ['curl','Dumbbell biceps curl','Biceps',10,12,0,'5a','Keep elbows still|Avoid momentum|Lower slowly'],
 ['face-pull','Cable face pull','Rear delts',12,15,60,'5b','Pull toward face|Keep elbows high|Squeeze shoulder blades'],
 ['knee-raise','Hanging knee raise','Core',10,15,60,'','Avoid swinging|Curl pelvis upward|Lower slowly']]},
 C:{name:'Hinge + arms',focus:'Posterior chain and arms',warmup:'5 min incline walk, then 2 light deadlift sets',finisher:'Incline treadmill: 8 min brisk walk',items:[
 ['deadlift','Trap bar deadlift','Full body',5,8,180,'','Brace before lifting|Push the floor away|Stand tall, do not lean back'],
 ['incline-press','Incline dumbbell press','Chest',8,12,120,'','Bench near 30 degrees|Neutral wrists|Control the lowering'],
 ['one-row','Single-arm dumbbell row','Back',10,10,90,'','Keep hips square|Pull elbow toward hip|Count per arm'],
 ['hip-thrust','Hip thrust','Glutes',8,12,90,'','Slight chin tuck|Drive through heels|Pause at top'],
 ['lateral','Dumbbell lateral raise','Shoulders',12,15,0,'5a','Lead with elbows|Avoid swinging|Raise to shoulder height'],
 ['overhead-triceps','Overhead triceps extension','Triceps',10,12,60,'5b','Upper arms steady|Lower behind head|Extend smoothly'],
 ['farmers','Farmer’s carry','Grip and core',30,40,60,'','Stand tall|Keep shoulders level|Walk in controlled steps','m']]}
};
const workouts=Object.keys(PROGRAM);
const uniqueExercises=[...new Map(Object.values(PROGRAM).flatMap(w=>w.items).map(e=>[e[0],e])).values()];
const TODAY=({1:'A',3:'B',5:'C'})[new Date().getDay()]||'A';
let tab=TODAY,uid=null,email='',sessions=[],metrics=[],draft=null,chart=null,restTimer=null,bootNonce=0,progressExercise='squat',progressMode='e1rm';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
const fmt=v=>Number.isFinite(Number(v))?Number(Number(v).toFixed(1)):0;
const dateLabel=v=>new Date(v).toLocaleDateString('en-SE',{day:'numeric',month:'short',year:'numeric'});
const genId=()=>crypto.randomUUID();
const draftKey=()=> 'liftlog-draft-'+uid;
const dbName=()=> 'liftlog-cache-v2-'+uid;
function openDb(){if(!uid)throw Error('Login required');return new Promise((resolve,reject)=>{const r=indexedDB.open(dbName(),1);r.onupgradeneeded=()=>{for(const n of ['sessions','metrics','pending'])r.result.createObjectStore(n,{keyPath:'id'});};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
async function op(name,mode,action){const db=await openDb();return new Promise((resolve,reject)=>{const transaction=db.transaction(name,mode);const req=action(transaction.objectStore(name));let value;req.onsuccess=()=>value=req.result;transaction.oncomplete=()=>{db.close();resolve(value)};transaction.onerror=()=>{db.close();reject(transaction.error)};});}
const all=n=>op(n,'readonly',s=>s.getAll());
const put=(n,v)=>op(n,'readwrite',s=>s.put(v));
const del=(n,k)=>op(n,'readwrite',s=>s.delete(k));
async function clearLocal(){const name=dbName();localStorage.removeItem(draftKey());const d=await openDb();d.close();return new Promise((resolve,reject)=>{const r=indexedDB.deleteDatabase(name);r.onsuccess=resolve;r.onerror=()=>reject(r.error);r.onblocked=()=>reject(Error('Close other LiftLog tabs to sign out'))});}
function backup(){return JSON.stringify({version:2,exportedAt:new Date().toISOString(),sessions,metrics},null,2);}
function download(name,text,type){const url=URL.createObjectURL(new Blob([text],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
async function save(kind,value){if(!uid)throw Error('Login required');await put(kind==='session'?'sessions':'metrics',value);await put('pending',{id:kind+':'+value.id,kind,payload:value});await sync();}
let syncing=false;
async function sync(){
 if(syncing||!uid||!sb||!navigator.onLine)return;
 const user=uid;syncing=true;
 try{
  const auth=await sb.auth.getUser();
  if(auth.error||auth.data.user?.id!==user)return;
  for(const item of await all('pending')){
   if(uid!==user)return;
   try{
    if(item.kind==='session'){
     const s=item.payload;
     const {error}=await sb.from('sessions').upsert({id:s.id,user_id:user,template:s.template,started_at:s.startedAt,finished_at:s.finishedAt,finisher_done:s.finisherDone,notes:s.notes});
     if(error)throw error;
     const rows=s.sets.filter(x=>x.done).map(x=>({id:x.id,session_id:s.id,user_id:user,exercise_id:x.exerciseId,set_no:x.setNo,weight_kg:x.weight,reps:x.reps,done:true}));
     if(rows.length){const r=await sb.from('sets').upsert(rows);if(r.error)throw r.error;}
    }else{
     const m=item.payload;
     const r=await sb.from('body_metrics').upsert({id:m.id,user_id:user,measured_at:m.date,weight_kg:m.weight||null,waist_cm:m.waist||null});if(r.error)throw r.error;
    }
    await del('pending',item.id);
   }catch(e){console.warn('Sync deferred',e);}
  }
 }finally{syncing=false;}
}
async function pull(){
 if(!uid||!sb||!navigator.onLine)return;
 const user=uid;
 const auth=await sb.auth.getUser();
 if(auth.error||auth.data.user?.id!==user)return;
 const [sr,st,mr]=await Promise.all([sb.from('sessions').select('*').order('finished_at',{ascending:false}),sb.from('sets').select('*'),sb.from('body_metrics').select('*')]);
 if(sr.error||st.error||mr.error)throw Error('Cloud data temporarily unavailable');
 if(uid!==user)return;
 const pending=new Set((await all('pending')).map(x=>x.id));
 for(const s of sr.data||[]){
  if(pending.has('session:'+s.id))continue;
  await put('sessions',{id:s.id,template:s.template,startedAt:s.started_at,finishedAt:s.finished_at,finisherDone:s.finisher_done,notes:s.notes||'',sets:(st.data||[]).filter(x=>x.session_id===s.id).map(x=>({id:x.id,exerciseId:x.exercise_id,setNo:x.set_no,weight:Number(x.weight_kg),reps:x.reps,done:x.done}))});
 }
 for(const m of mr.data||[]){
  if(pending.has('metric:'+m.id))continue;
  await put('metrics',{id:m.id,date:m.measured_at,weight:Number(m.weight_kg||0),waist:Number(m.waist_cm||0)});
 }
}
function lastSets(id){const match=sessions.find(s=>s.sets.some(x=>x.exerciseId===id&&x.done));return match?match.sets.filter(x=>x.exerciseId===id&&x.done).sort((a,b)=>a.setNo-b.setNo):[];}
function progression(last,e,required){if(last.length<required)return 'Build your baseline';if(last.slice(0,required).every(s=>s.reps>=e[4]))return 'Ready to add weight next time';return 'Try to beat last time by one rep';}
const e1rm=s=>s.weight*(1+s.reps/30);
const volume=sets=>sets.filter(s=>s.done).reduce((sum,s)=>sum+s.weight*s.reps,0);
function loadDraft(){try{draft=JSON.parse(localStorage.getItem(draftKey())||'null');}catch{draft=null;}}
function saveDraft(){if(!uid)return;if(draft)localStorage.setItem(draftKey(),JSON.stringify(draft));else localStorage.removeItem(draftKey());}
function ensureDraft(k){if(draft?.template===k)return;draft={id:genId(),template:k,startedAt:new Date().toISOString(),finishedAt:'',sets:[],finisherDone:false,notes:''};saveDraft();}
function cycle(){const first=sessions.length?Math.min(...sessions.map(s=>new Date(s.finishedAt).getTime())):Date.now();const week=Math.floor((Date.now()-first)/(7*86400000));return ((week%9)+9)%9+1;}
function setCount(e,i){const week=cycle();return week===9?Math.max(1,Math.ceil(3/2)):week>=5&&week<=8&&i<2?4:3;}
function svgFigure(id){
 const leg=/squat|leg-press|lunges|deadlift|rdl|hip-thrust|farmers/.test(id),pull=/row|pulldown|curl|face-pull/.test(id);
 return '<svg viewBox="0 0 100 100" aria-label="Stylized figure; use Watch demo for technique" role="img"><circle cx="50" cy="17" r="9" fill="none" stroke="currentColor" stroke-width="4"/><path d="M50 28V57 '+(leg?'L34 77 29 92 M50 57L67 77 72 92':pull?'L42 77 39 92 M50 57L60 77 63 92':'L39 77 38 92 M50 57L62 77 63 92')+'" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round"/><path d="'+(pull?'M50 35L29 47 23 30 M50 35L70 47 77 30':leg?'M50 35L29 49 24 63 M50 35L71 49 76 63':'M50 35L28 25 22 10 M50 35L72 25 78 10')+'" stroke="#a9ec70" stroke-width="5" stroke-linecap="round" fill="none"/></svg>';
}
function stopTimer(){clearInterval(restTimer);restTimer=null;document.querySelector('.timer')?.remove();}
function startTimer(sec){
 stopTimer();if(!sec)return;const end=Date.now()+sec*1000;const el=document.createElement('div');el.className='timer';document.body.append(el);
 const tick=()=>{let s=Math.max(0,Math.ceil((end-Date.now())/1000));el.innerHTML='<small>REST</small><strong>'+Math.floor(s/60)+':'+String(s%60).padStart(2,'0')+'</strong><button type="button">Skip ×</button>';el.querySelector('button').onclick=stopTimer;if(s===0){navigator.vibrate?.([120,80,120]);stopTimer();}};
 tick();restTimer=setInterval(tick,500);
}
function authPage(message=''){
 stopTimer();
 root.innerHTML='<div class="auth"><div class="logo">L</div><div class="eyebrow">PRIVATE TRAINING SPACE</div><h1>Lift<span class="accent">Log</span></h1><p class="muted auth-lead">Train smarter. Track every rep. Return stronger.</p><section class="auth-panel"><div class="eyebrow">'+(hasConfig?'SECURE ACCESS':'ONE-TIME SETUP')+'</div><h2>'+(hasConfig?'Welcome back.':'Almost ready.')+'</h2><p class="muted">'+(hasConfig?'Sign in with your email to unlock your private workout journal.':'Connect a free Supabase project in GitHub Actions secrets, then redeploy. The repository README explains how.')+'</p>'+(!hasConfig?'<a class="secondary setup-link" href="https://github.com/Sura34/liftlog#readme" target="_blank" rel="noopener">Open setup guide ↗</a>':'<form id="login"><label class="field">Email<input type="email" name="email" placeholder="you@example.com" autocomplete="email" required></label><button class="primary" type="submit">Send magic link →</button><p id="status" class="footnote" role="status"></p></form>')+(message?'<p class="notice">'+esc(message)+'</p>':'')+'</section><p class="footnote">Private history · Offline workout logs after sign in · No subscription</p></div>';
 const form=root.querySelector('#login');
 if(form)form.onsubmit=async e=>{e.preventDefault();const button=form.querySelector('button');const out=root.querySelector('#status');button.disabled=true;out.textContent='Sending sign-in link…';const r=await sb.auth.signInWithOtp({email:new FormData(form).get('email'),options:{emailRedirectTo:location.origin+location.pathname}});out.textContent=r.error?r.error.message:'Check your inbox for the sign-in link.';button.disabled=false;};
}
function shell(body){
 const start=new Date();start.setDate(start.getDate()-((start.getDay()+6)%7));start.setHours(0,0,0,0);
 const weekly=sessions.filter(s=>new Date(s.finishedAt)>=start).length;
 root.innerHTML='<div class="app"><header><div class="brand"><div class="brand-logo">L</div><div><div class="eyebrow">TRAIN. TRACK. PROGRESS.</div><div class="brand-name">Lift<em>Log</em></div></div></div><div class="right"><span class="network" id="network">'+(navigator.onLine?'● Online':'○ Offline')+'</span><button class="icon-button" id="account" title="Sign out">Sign out</button></div></header><section class="hero"><div class="eyebrow">YOUR TRAINING WEEK</div><h1>'+weekly+' <span class="muted">/ 3 sessions</span></h1><div class="pips">'+[0,1,2].map(i=>'<span class="pip '+(i<weekly?'on':'')+'"></span>').join('')+'</div><div class="metrics"><div class="metric"><small>All-time sessions</small><strong>'+sessions.length+'</strong></div><div class="metric"><small>Volume lifted</small><strong>'+fmt(sessions.reduce((v,s)=>v+volume(s.sets),0)/1000)+'t</strong></div></div></section><main>'+body+'</main><nav class="nav">'+['A','B','C','Progress','Log'].map(t=>'<button type="button" data-tab="'+t+'" class="'+(tab===t?'current':'')+'"><span>'+({Progress:'▥',Log:'☷'}[t]||t)+'</span><small>'+t+'</small></button>').join('')+'</nav></div>';
 root.querySelector('#account').onclick=signOut;
 root.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{tab=b.dataset.tab;render();});
}
function workout(k){
 const w=PROGRAM[k],active=draft?.template===k?draft:null,phase=cycle();
 let html='<div class="heading"><div><div class="eyebrow">WORKOUT '+k+' · '+esc(w.focus)+'</div><h2>'+w.name+'</h2></div><span class="chip">Week '+phase+'/9</span></div><p class="muted">'+esc(w.warmup)+'</p><div class="info"><span>◷ ~60–65 min</span><span>◈ '+(phase===9?'Deload week':'Progressive overload')+'</span><span>Tap any session anytime</span></div><div class="heading"><h3>Exercises</h3><span class="muted">'+w.items.length+' movements</span></div>';
 for(const [i,e] of w.items.entries()){
  const [id,name,muscle,min,max,rest,tag,cues,unit]=e;
  const n=setCount(e,i),last=lastSets(id),current=active?.sets.filter(s=>s.exerciseId===id)||[],complete=current.filter(s=>s.done).length;
  html+='<article class="card"><div class="exercise-head"><div class="exercise-art">'+svgFigure(id)+'</div><div class="exercise-title"><div class="eyebrow">'+esc(tag||String(i+1).padStart(2,'0'))+' · '+esc(muscle)+'</div><h3>'+esc(name)+'</h3><div class="prescription">'+n+' sets × '+min+(min===max?'':'–'+max)+' '+(unit||'reps')+'</div></div><div class="count">'+complete+'/'+n+'</div></div><div class="exercise-meta"><span>◷ '+(rest?rest+'s rest':'Superset: next move')+'</span><a target="_blank" rel="noopener noreferrer" href="https://www.youtube.com/results?search_query='+encodeURIComponent(name+' exercise correct form')+'">Watch demo ↗</a></div><details><summary>Form tips and progression</summary><ul>'+cues.split('|').map(c=>'<li>'+esc(c)+'</li>').join('')+'</ul><p class="recommend">'+progression(last,e,3)+'</p></details><div class="previous">'+(last.length?'LAST SESSION · '+last.map(s=>fmt(s.weight)+' kg × '+s.reps).join(' / '):'FIRST TIME · Establish your starting weight')+'</div><div class="setgrid column-label"><span>SET</span><span>KG</span><span>'+(unit||'REPS').toUpperCase()+'</span><span>DONE</span></div>';
  for(let j=1;j<=n;j++){
   const set=current.find(s=>s.setNo===j),prev=last[j-1];
   html+='<div class="setgrid"><span class="setnum">'+j+'</span><input data-e="'+id+'" data-n="'+j+'" data-f="weight" type="number" inputmode="decimal" min="0" max="1000" step=".5" placeholder="'+(prev?.weight??'kg')+'" value="'+(set?.weight??'')+'" aria-label="'+esc(name)+' set '+j+' kilograms"><input data-e="'+id+'" data-n="'+j+'" data-f="reps" type="number" inputmode="numeric" min="0" max="1000" step="1" placeholder="'+(prev?.reps??min)+'" value="'+(set?.reps??'')+'" aria-label="'+esc(name)+' set '+j+' '+(unit||'repetitions')+'"><button class="done '+(set?.done?'checked':'')+'" data-done="'+id+':'+j+'" aria-label="Toggle set complete">'+(set?.done?'✓':'○')+'</button></div>';
  }
  html+='</article>';
 }
 html+='<section class="card finisher"><div class="eyebrow">FINISHER</div><h3>One last push</h3><p class="muted">'+esc(w.finisher)+'</p><label class="field"><input id="finisher" type="checkbox" '+(active?.finisherDone?'checked':'')+'> Finisher completed</label></section><label class="field">SESSION NOTES<textarea id="notes" placeholder="How did today feel?">'+esc(active?.notes||'')+'</textarea></label><button class="primary" id="finish">Finish workout →</button><p class="footnote">Draft saves on this device as you train. Completed sessions sync when online.</p><details><summary>Training and recovery guidelines</summary><p>Stop 1–2 reps before failure. Lower for 2 seconds. When all sets reach the top of the rep range, add weight next time. Weeks 5–8 add a fourth set to the first two exercises. Week 9 deload.</p><p>Protein 1.6–2.2 g/kg daily. Small calorie deficit if losing weight. Regular walking, 7–9 hours of sleep, and recovery matter. Fat loss is overall, not localized.</p></details>';
 shell(html);
 root.querySelectorAll('input[data-f]').forEach(el=>el.oninput=()=>{
  ensureDraft(k);
  const id=el.dataset.e,num=Number(el.dataset.n),field=el.dataset.f;
  let s=draft.sets.find(s=>s.exerciseId===id&&s.setNo===num);
  if(!s){s={id:genId(),exerciseId:id,setNo:num,weight:0,reps:0,done:false};draft.sets.push(s);}
  s[field]=Number(el.value);saveDraft();
 });
 root.querySelectorAll('[data-done]').forEach(b=>b.onclick=()=>{
  ensureDraft(k);
  const [id,n]=b.dataset.done.split(':'),num=Number(n);
  let s=draft.sets.find(s=>s.exerciseId===id&&s.setNo===num);
  if(!s){s={id:genId(),exerciseId:id,setNo:num,weight:0,reps:0,done:false};draft.sets.push(s);}
  if(!s.done){
   const previous=lastSets(id)[num-1];
   if(!s.weight&&previous)s.weight=previous.weight;
   if(!s.reps&&previous)s.reps=previous.reps;
   if(!s.reps)return alert('Enter reps or distance to complete this set.');
   s.done=true;
   startTimer(PROGRAM[k].items.find(e=>e[0]===id)[5]);
  }else s.done=false;
  saveDraft();render();
 });
 root.querySelector('#finisher').onchange=e=>{ensureDraft(k);draft.finisherDone=e.target.checked;saveDraft();};
 root.querySelector('#notes').oninput=e=>{ensureDraft(k);draft.notes=e.target.value;saveDraft();};
 root.querySelector('#finish').onclick=async()=>{
  ensureDraft(k);if(!draft.sets.some(s=>s.done))return alert('Complete at least one set before finishing.');
  const complete={...draft,finishedAt:new Date().toISOString()};
  const button=root.querySelector('#finish');button.disabled=true;
  try{await save('session',complete);draft=null;saveDraft();await load();tab='Log';render();}
  catch(e){button.disabled=false;alert('Could not save workout: '+e.message);}
 };
}
function historyFor(id){return sessions.filter(s=>s.sets.some(x=>x.done&&x.exerciseId===id)).slice().reverse().map(s=>{
 const sets=s.sets.filter(x=>x.done&&x.exerciseId===id);
 return {date:dateLabel(s.finishedAt),raw:s.finishedAt,e1rm:Math.max(...sets.map(e1rm)),top:Math.max(...sets.map(x=>x.weight)),volume:volume(sets)};
});}
function lineGraph(canvas,values){
 const ctx=canvas.getContext('2d'),width=canvas.clientWidth,height=200,dpr=devicePixelRatio||1;
 canvas.width=width*dpr;canvas.height=height*dpr;ctx.scale(dpr,dpr);ctx.clearRect(0,0,width,height);
 ctx.font='11px system-ui';ctx.fillStyle='#93a4b4';
 if(!values.length){ctx.fillText('Your progress chart will appear after your first workout.',15,100);return;}
 const min=Math.min(...values),max=Math.max(...values),low=Math.max(0,min-(max-min||1)*.35),high=max+(max-min||1)*.35;
 const left=45,right=width-12,top=22,bottom=height-28;
 for(let i=0;i<4;i++){let y=top+(bottom-top)*i/3;ctx.strokeStyle='#2b3949';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(left,y);ctx.lineTo(right,y);ctx.stroke();ctx.fillStyle='#93a4b4';ctx.fillText(fmt(high-(high-low)*i/3),3,y+4);}
 const coord=(v,i)=>({x:left+(right-left)*(values.length===1?.5:i/(values.length-1)),y:bottom-(v-low)/(high-low)*(bottom-top)});
 ctx.beginPath();values.forEach((v,i)=>{const p=coord(v,i);if(i===0)ctx.moveTo(p.x,p.y);else ctx.lineTo(p.x,p.y)});ctx.strokeStyle='#a9ec70';ctx.lineWidth=3;ctx.lineJoin='round';ctx.stroke();
 values.forEach((v,i)=>{const p=coord(v,i);ctx.beginPath();ctx.arc(p.x,p.y,3.5,0,Math.PI*2);ctx.fillStyle='#a9ec70';ctx.fill();});
 ctx.fillStyle='#8798a9';ctx.fillText('First',left,bottom+17);ctx.textAlign='right';ctx.fillText('Latest',right,bottom+17);ctx.textAlign='left';
}
function progress(){
 const h=historyFor(progressExercise);const latest=h.at(-1),previous=h.at(-2);
 shell('<div class="eyebrow">YOUR PERFORMANCE</div><div class="heading"><h2>Getting stronger.</h2></div><p class="muted">Your numbers tell the story. Compare top sets, estimated strength and training volume.</p><div class="stats"><div class="card"><div class="eyebrow">Sessions</div><strong>'+sessions.length+'</strong></div><div class="card"><div class="eyebrow">Volume lifted</div><strong>'+fmt(sessions.reduce((v,s)=>v+volume(s.sets),0)/1000)+'t</strong></div></div><section class="card"><label class="field">EXERCISE<select id="exercise-select">'+uniqueExercises.map(e=>'<option value="'+e[0]+'" '+(e[0]===progressExercise?'selected':'')+'>'+esc(e[1])+'</option>').join('')+'</select></label><div class="buttonrow">'+[['e1rm','Est. 1RM'],['top','Top weight'],['volume','Volume']].map(([key,name])=>'<button class="'+(progressMode===key?'chip':'secondary')+'" data-chart="'+key+'">'+name+'</button>').join('')+'</div><canvas class="chart" id="chart" aria-label="Exercise performance chart"></canvas><p class="footnote">Estimated 1RM uses the Epley formula, not an actual max attempt.</p></section><div class="heading"><h3>Exercise history</h3>'+(latest&&previous?'<span class="chip">'+(latest[progressMode]-previous[progressMode]>=0?'+':'')+fmt(latest[progressMode]-previous[progressMode])+' vs previous</span>':'')+'</div>'+(h.length?h.slice().reverse().map((p,i)=>'<div class="entry"><div><strong>'+p.date+'</strong><small>'+fmt(p.volume)+' kg volume</small></div><div><strong>'+fmt(p.top)+' kg</strong><small>'+(i===0?'LATEST':'Top set')+'</small></div></div>').join(''):'<div class="empty">Your workouts will show up here after your first session.</div>'));
 root.querySelector('#exercise-select').onchange=e=>{progressExercise=e.target.value;render();};
 root.querySelectorAll('[data-chart]').forEach(b=>b.onclick=()=>{progressMode=b.dataset.chart;render();});
 lineGraph(root.querySelector('#chart'),h.map(x=>x[progressMode]));
}
function journal(){
 shell('<div class="eyebrow">TRAINING JOURNAL</div><div class="heading"><h2>Workout history.</h2></div><p class="muted">Every session, every set. Your personal records are yours alone.</p><div class="buttonrow"><button class="secondary" id="json">Export JSON</button><button class="secondary" id="csv">Export CSV</button><label class="secondary">Import JSON <input type="file" id="import" accept="application/json" hidden></label></div><section class="card"><h3>Body measurements</h3><p class="muted">Track your weight and waist without confusing fat loss with scale fluctuations.</p><form id="measure"><label class="field">Date<input id="measured-date" type="date" required value="'+new Date().toLocaleDateString('en-CA')+'"></label><label class="field">Bodyweight (kg)<input id="bodyweight" type="number" inputmode="decimal" min="1" max="500" step=".1" placeholder="kg"></label><label class="field">Waist (cm)<input id="waist" type="number" inputmode="decimal" min="1" max="300" step=".1" placeholder="cm, optional"></label><button class="primary">Save measurement</button></form><div class="heading"><h3>Bodyweight trend</h3></div><canvas id="bodychart" class="chart"></canvas></section><div class="heading"><h3>Completed sessions</h3></div>'+(sessions.length?sessions.map(s=>'<div class="entry"><div><strong>'+dateLabel(s.finishedAt)+' · Workout '+esc(s.template)+'</strong><small>'+s.sets.filter(x=>x.done).length+' completed sets</small></div><div><strong>'+fmt(volume(s.sets))+' kg</strong><small>Volume</small></div></div>').join(''):'<div class="empty">No sessions yet. Start any workout to build your history.</div>')+'<div class="heading"><h3>Body measurement log</h3></div>'+(metrics.length?metrics.slice().reverse().map(m=>'<div class="entry"><strong>'+esc(m.date)+'</strong><span class="muted">'+(m.weight?fmt(m.weight)+' kg':'–')+' · '+(m.waist?fmt(m.waist)+' cm':'–')+'</span></div>').join(''):'<div class="empty">Log your first body measurement above.</div>'));
 root.querySelector('#json').onclick=()=>download('liftlog-backup.json',backup(),'application/json');
 root.querySelector('#csv').onclick=()=>{const lines=['date,workout,exercise,set,weight_kg,reps'];for(const s of sessions)for(const x of s.sets.filter(x=>x.done))lines.push([s.finishedAt,s.template,x.exerciseId,x.setNo,x.weight,x.reps].join(','));download('liftlog-sets.csv',lines.join('\n'),'text/csv');};
 root.querySelector('#import').onchange=async e=>{
  const file=e.target.files?.[0];if(!file)return;
  try{
   const data=JSON.parse(await file.text());
   if(!Array.isArray(data.sessions)||!Array.isArray(data.metrics)||data.sessions.length>10000)throw Error('Invalid backup');
   if(!confirm('Import '+data.sessions.length+' sessions and '+data.metrics.length+' measurements into your private account?'))return;
   for(const s of data.sessions){if(!s.id||!['A','B','C'].includes(s.template)||!Array.isArray(s.sets)||!s.finishedAt)throw Error('Invalid session');await save('session',s);}
   for(const m of data.metrics){if(!m.id||!m.date)throw Error('Invalid measurement');await save('metric',m);}
   await load();render();
  }catch(err){alert('Could not import: '+err.message);}
 };
 root.querySelector('#measure').onsubmit=async e=>{
  e.preventDefault();const date=root.querySelector('#measured-date').value,weight=Number(root.querySelector('#bodyweight').value),waist=Number(root.querySelector('#waist').value);
  if(!weight&&!waist)return alert('Enter your weight or waist.');
  const button=e.target.querySelector('button');button.disabled=true;
  try{await save('metric',{id:genId(),date,weight,waist});await load();render();}catch(err){alert(err.message);button.disabled=false;}
 };
 const weights=metrics.filter(m=>m.weight>0);
 const moving=weights.map(m=>{const t=new Date(m.date).getTime();const recent=weights.filter(x=>{const xTime=new Date(x.date).getTime();return xTime<=t&&xTime>=t-6*86400000});return recent.reduce((v,x)=>v+x.weight,0)/recent.length;});
 lineGraph(root.querySelector('#bodychart'),moving);
}
function render(){if(!uid)return authPage();if(tab==='Progress')progress();else if(tab==='Log')journal();else workout(tab);}
async function load(){
 if(!uid)return;sessions=(await all('sessions')).sort((a,b)=>b.finishedAt.localeCompare(a.finishedAt));
 metrics=(await all('metrics')).sort((a,b)=>a.date.localeCompare(b.date));
 loadDraft();render();
}
async function signOut(){
 if(!sb||!uid)return;
 const n=(await all('pending')).length;
 const message=n?'There are '+n+' unsynced changes. Export a backup before signing out. Signing out clears local copies. Continue?':'Sign out and clear all workout data stored on this device?';
 if(!confirm(message))return;
 try{await clearLocal();await sb.auth.signOut();uid=null;email='';sessions=[];metrics=[];draft=null;authPage('Signed out from this device.');}
 catch(e){alert('Sign out was not completed: '+e.message);}
}
async function boot(){
 const nonce=++bootNonce;
 if(!sb){authPage();return;}
 try{
  const {data,error}=await sb.auth.getSession();
  if(nonce!==bootNonce)return;
  if(error||!data.session?.user){uid=null;authPage();return;}
  const user=data.session.user;
  if(uid!==user.id){uid=user.id;email=user.email||'';sessions=[];metrics=[];draft=null;}
  await load();
  if(navigator.onLine){try{await sync();await pull();await load();}catch(e){console.warn('Cloud sync deferred',e);}}
 }catch(e){console.warn('Auth startup',e);authPage('Could not restore session. Please sign in again.');}
}
window.addEventListener('online',async()=>{const network=document.querySelector('#network');if(network)network.textContent='● Online';if(uid){try{await sync();await pull();await load();}catch(e){console.warn('Reconnect delayed',e);}}});
window.addEventListener('offline',()=>{const network=document.querySelector('#network');if(network)network.textContent='○ Offline';});
if(sb)sb.auth.onAuthStateChange(()=>{setTimeout(()=>{void boot();},0);});
if('serviceWorker' in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(console.warn));
void boot();
