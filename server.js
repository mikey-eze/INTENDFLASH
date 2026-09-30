require('dotenv').config();
const express=require('express'), path=require('path'), crypto=require('crypto'), bcrypt=require('bcryptjs');
const { query } = require('./db');
const app=express(), PORT=process.env.PORT||3000;
app.set('view engine','ejs'); app.set('views',path.join(__dirname,'views'));
app.use(express.urlencoded({extended:true})); app.use(express.json()); app.use(express.static(path.join(__dirname,'public')));
const sessions=new Map();
function tabId(req){return String(req.query.tab||req.body?.tab||'').trim();}
function me(req){const id=tabId(req); return id && sessions.has(id) ? db().users.find(u=>u.id===sessions.get(id))||null : null;}
async function persistSession(token,userId){
  await query('INSERT INTO sessions (token,user_id,expires_at) VALUES ($1,$2,NOW()+INTERVAL \'7 days\') ON CONFLICT (token) DO UPDATE SET user_id=EXCLUDED.user_id, expires_at=EXCLUDED.expires_at',[token,userId]);
}
async function loadSessions(){
  const r=await query('SELECT token,user_id FROM sessions WHERE expires_at>NOW()');
  for(const row of r.rows) sessions.set(row.token,row.user_id);
  await query('DELETE FROM sessions WHERE expires_at<=NOW()');
}
function withTab(pathname, req){const t=tabId(req); return t ? pathname+(pathname.includes('?')?'&':'?')+'tab='+encodeURIComponent(t) : pathname;}
app.use((req,res,next)=>{req.tab=tabId(req); next();});
let memoryData={users:[],events:[],registrations:[],attendance:[],permissionRequests:[],auditLogs:[],notifications:[]};
let persistQueue=Promise.resolve();
function db(){return memoryData}
async function loadData(){
 const [u,e,r,a,p,l,n]=await Promise.all([
  query('SELECT id, role, roll_no AS "rollNo", name, password, department, year, section, class_name AS "className", gender, club, active FROM users ORDER BY created_at ASC'),
  query('SELECT id, name, club, description, date, time, venue, deadline, max_participants AS "maxParticipants", created_by AS "createdBy", status, attendance_completed AS "attendanceCompleted", attendance_completed_at AS "attendanceCompletedAt" FROM events ORDER BY date ASC, time ASC'),
  query('SELECT id, event_id AS "eventId", student_id AS "studentId", status, registered_at AS "registeredAt" FROM registrations ORDER BY registered_at ASC'),
  query('SELECT id, event_id AS "eventId", student_id AS "studentId", status, accepted, marked_by AS "markedBy", marked_at AS "markedAt" FROM attendance ORDER BY marked_at ASC'),
  query('SELECT id, student_id AS "studentId", purpose, letter_text AS "letterText", file_path AS "filePath", status, created_at AS "createdAt", saved_at AS "savedAt", saved_by AS "savedBy" FROM permission_requests ORDER BY created_at ASC'),
  query('SELECT id, time, type, role, user_id AS "userId", detail, event_id AS "eventId", student_id AS "studentId", account_id AS "accountId" FROM audit_logs ORDER BY time ASC'),
  query('SELECT id, user_id AS "userId", type, message, created_at AS "createdAt", read, event_id AS "eventId", permission_id AS "permissionId" FROM notifications ORDER BY created_at ASC')
 ]);
 memoryData={users:u.rows,events:e.rows,registrations:r.rows,attendance:a.rows,permissionRequests:p.rows,auditLogs:l.rows,notifications:n.rows};
 return memoryData;
}

// Keep the UI fast by working from memory, but persist every mutation to PostgreSQL.
// Writes are serialized so a route followed immediately by an audit write cannot overwrite newer data.
function save(d){
 const snapshot=JSON.parse(JSON.stringify(d));
 persistQueue=persistQueue.then(async()=>{
  await query('BEGIN');
  try {
   await query('TRUNCATE notifications, audit_logs, attendance, registrations, permission_requests, events, users RESTART IDENTITY CASCADE');
   for(const u of snapshot.users||[]) await query(`INSERT INTO users (id,role,roll_no,name,password,department,year,section,class_name,gender,club,active) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,[u.id,u.role,u.rollNo||null,u.name,u.password,u.department||null,u.year||null,u.section||null,u.className||null,u.gender||null,u.club||null,u.active!==false]);
   for(const e of snapshot.events||[]) await query(`INSERT INTO events (id,name,club,description,date,time,venue,deadline,max_participants,created_by,status,attendance_completed,attendance_completed_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,[e.id,e.name,e.club||null,e.description||null,e.date,e.time,e.venue,e.deadline||null,e.maxParticipants||0,e.createdBy||null,e.status||'OPEN',!!e.attendanceCompleted,e.attendanceCompletedAt||null]);
   for(const r of snapshot.registrations||[]) await query(`INSERT INTO registrations (id,event_id,student_id,status,registered_at) VALUES ($1,$2,$3,$4,$5)`,[r.id,r.eventId,r.studentId,r.status||'REGISTERED',r.registeredAt||new Date().toISOString()]);
   for(const a of snapshot.attendance||[]) await query(`INSERT INTO attendance (id,event_id,student_id,status,accepted,marked_by,marked_at) VALUES ($1,$2,$3,$4,$5,$6,$7)`,[a.id,a.eventId,a.studentId,a.status,!!a.accepted,a.markedBy||null,a.markedAt||new Date().toISOString()]);
   for(const pr of snapshot.permissionRequests||[]) await query(`INSERT INTO permission_requests (id,student_id,purpose,letter_text,file_path,status,created_at,saved_at,saved_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,[pr.id,pr.studentId,pr.purpose,pr.letterText,pr.filePath||null,pr.status||'PENDING',pr.createdAt||new Date().toISOString(),pr.savedAt||null,pr.savedBy||null]);
   for(const l of snapshot.auditLogs||[]) await query(`INSERT INTO audit_logs (id,time,type,role,user_id,detail,event_id,student_id,account_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,[l.id,l.time,l.type,l.role||null,l.userId||null,l.detail,l.eventId||null,l.studentId||null,l.accountId||null]);
   for(const n of snapshot.notifications||[]) await query(`INSERT INTO notifications (id,user_id,type,message,created_at,read,event_id,permission_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,[n.id,n.userId,n.type,n.message,n.createdAt||new Date().toISOString(),!!n.read,n.eventId||null,n.permissionId||null]);
   await query('COMMIT');
  } catch(err){ await query('ROLLBACK'); console.error('PostgreSQL persistence failed:',err); }
 });
 return persistQueue;
}
function notify(d,userId,type,message,extra={}){d.notifications=d.notifications||[];d.notifications.push({id:Date.now()+Math.random(),userId,type,message,createdAt:new Date().toISOString(),read:false,...extra});if(d.notifications.length>3000)d.notifications=d.notifications.slice(-3000)}
function login(req,res,next){const u=me(req);if(!u)return res.redirect('/login'+(req.tab?'?tab='+encodeURIComponent(req.tab):''));if(u.active===false){sessions.delete(req.tab);return res.status(403).send('This account is inactive. Contact the administrator.')}next()}
function role(...r){return(req,res,next)=>r.includes(me(req)?.role)?next():res.status(403).send('Access denied.')}
function flash(req,m){if(req.tab){const s=sessions.get(req.tab); if(s) s.message=m;}}
function getFlash(req){const s=req.tab?sessions.get(req.tab):null; const m=s?.message||''; if(s) delete s.message; return m;}

function audit(type, detail, req, extra={}) {
  const d=db(); d.auditLogs=d.auditLogs||[]; const u=me(req);
  const entry={id:Date.now()+Math.random(), time:new Date().toISOString(), type, role:u?.role||'SYSTEM', userId:u?.id||null, detail, ...extra};
  d.auditLogs.push(entry); if(d.auditLogs.length>2000)d.auditLogs=d.auditLogs.slice(-2000); save(d);
  console.log(`[${entry.time}] [${type}] [${entry.role}] ${detail}`);
}

// Record meaningful backend requests without flooding the log with static assets.
app.use((req,res,next)=>{
  const ignored=/^\/(css|js|assets|favicon\.ico)/.test(req.path)||req.path==='/admin/logs';
  if(!ignored && req.method!=='GET') {
    const originalEnd=res.end; res.end=function(...args){ try { const u=me(req); audit('HTTP', `${req.method} ${req.path} → ${res.statusCode}`, req); } catch(e){} return originalEnd.apply(this,args); };
  }
  next();
});

// Timetable from the submitted CSE-E 2026-27 timetable.
const timetable={
  1:[['09:10','10:10','COA'],['10:10','11:10','DBMS'],['11:10','12:10','LIBRARY'],['12:10','13:00','LUNCH'],['13:00','14:00','APT'],['14:00','15:00','AOA'],['15:00','17:00','DSUP LAB']],
  2:[['09:10','10:10','DMS'],['10:10','11:10','AOA'],['11:10','12:10','OOP'],['12:10','13:00','LUNCH'],['13:00','15:00','DBMS LAB'],['15:00','17:00','HOLISTIC HOUR']],
  3:[['09:10','10:10','OOP'],['10:10','11:10','DBMS'],['11:10','12:10','COA'],['12:10','13:00','LUNCH'],['13:00','14:00','MOOC'],['14:00','15:00','DMS'],['15:00','17:00','HOLISTIC HOUR']],
  4:[['09:10','10:10','OOP'],['10:10','11:10','DSUP'],['11:10','12:10','LIBRARY'],['12:10','13:00','LUNCH'],['13:00','14:00','MENTOR'],['14:00','15:00','COA'],['15:00','17:00','OOPS LAB']],
  5:[['09:10','10:10','AOA'],['10:10','12:10','CERTIFICATION I'],['12:10','13:00','LUNCH'],['13:00','14:00','DMS'],['14:00','15:00','DBMS'],['15:00','17:00','AOA LAB']],
  6:[],0:[]
};
function currentPeriod(){
  const now=new Date();
  const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Kolkata',weekday:'short',hour:'2-digit',minute:'2-digit',hour12:false}).formatToParts(now);
  const dayMap={Mon:1,Tue:2,Wed:3,Thu:4,Fri:5,Sat:6,Sun:0};
  const day=dayMap[parts.find(x=>x.type==='weekday')?.value] ?? 0;
  const hh=Number(parts.find(x=>x.type==='hour')?.value||0), mm=Number(parts.find(x=>x.type==='minute')?.value||0), minutes=hh*60+mm;
  const slots=timetable[day]||[];
  const slot=slots.find(s=>minutes>=toMin(s[0]) && minutes<toMin(s[1]));
  if(!slot) return {active:false,day,subject:'No class in session',start:'',end:''};
  return {active:true,day,subject:slot[2],start:slot[0],end:slot[1]};
}
function toMin(v){const [h,m]=v.split(':').map(Number);return h*60+m;}

app.get('/login',(req,res)=>{if(!req.tab)return res.render('login',{message:''}); if(me(req))return res.redirect(withTab('/',req)); res.render('login',{message:getFlash(req)});});
app.post('/login',async(req,res)=>{
  try {
    const d=db(), k=String(req.body.rollNo||'').trim().toUpperCase(), p=String(req.body.password||'');
    const u=d.users.find(x=>String(x.rollNo||'').toUpperCase()===k||String(x.id||'').toUpperCase()===k);
    if(!u||u.active===false)return res.status(401).render('login',{message:'Invalid login details.'});
    const valid=await bcrypt.compare(p,u.password);
    if(!valid)return res.status(401).render('login',{message:'Invalid login details.'});
    const t=tabId(req)||crypto.randomUUID();
    sessions.set(t,u.id);
    await persistSession(t,u.id);
    audit('AUTH', `Login: ${u.name} (${u.role})`, {query:{tab:t},body:{}}, {});
    res.redirect('/?tab='+encodeURIComponent(t));
  } catch(err) {
    console.error('Login failed:',err);
    res.status(500).render('login',{message:'Login service temporarily unavailable.'});
  }
});
app.get('/logout',async(req,res)=>{
  if(req.tab){
    audit('AUTH','Logout',req);
    sessions.delete(req.tab);
    await query('DELETE FROM sessions WHERE token=$1',[req.tab]).catch(()=>{});
  }
  res.redirect('/login'+(req.tab?'?tab='+encodeURIComponent(req.tab):''));
});
app.get('/profile',login,role('student'),(req,res)=>res.render('profile',{student:me(req),tab:req.tab}));

app.get('/',login,(req,res)=>{
  let d=db(),u=me(req),common={message:getFlash(req),tab:req.tab};
  if(u.role==='student')return res.render('student',{student:u,events:d.events,registrations:d.registrations,attendance:d.attendance,permissionRequests:d.permissionRequests||[],notifications:(d.notifications||[]).filter(n=>n.userId===u.id).slice().reverse(),currentPeriod:currentPeriod(),...common});
  if(u.role==='event_coordinator')return res.render('coordinator',{u,events:d.events,registrations:d.registrations,attendance:d.attendance,students:d.users.filter(x=>x.role==='student'),...common});
  if(u.role==='coordinator')return res.render('normal-coordinator',{u,permissionRequests:d.permissionRequests||[],students:d.users.filter(x=>x.role==='student'),...common});
  if(u.role==='teacher')return res.render('teacher',{u,events:d.events,attendance:d.attendance,registrations:d.registrations,students:d.users.filter(x=>x.role==='student'),...common});
  return res.render('admin',{u,events:d.events,users:d.users,registrations:d.registrations,attendance:d.attendance,permissionRequests:d.permissionRequests||[],notifications:(d.notifications||[]).filter(n=>n.userId===u.id).slice().reverse(),...common});
});

app.post('/event/create',login,role('event_coordinator','admin'),(req,res)=>{let d=db(),u=me(req),e={id:Date.now(),name:String(req.body.name||'').trim(),club:String(req.body.club||u.club||'').trim(),description:String(req.body.description||'').trim(),date:req.body.date,time:req.body.time,venue:String(req.body.venue||'').trim(),deadline:req.body.deadline||'',maxParticipants:Number(req.body.maxParticipants||0),createdBy:u.id,status:'OPEN',attendanceCompleted:false};if(!e.name||!e.date||!e.time||!e.venue){flash(req,'Please fill the required event details.');return res.redirect(withTab('/',req))}d.events.push(e);save(d);audit('EVENT', `Event published: ${e.name} (${e.date})`, req, {eventId:e.id});flash(req,'Event published successfully.');res.redirect(withTab('/',req))});
app.post('/event/:id/register',login,role('student'),(req,res)=>{let d=db(),u=me(req),id=Number(req.params.id),e=d.events.find(x=>x.id===id);if(!e||e.status!=='OPEN')return flash(req,'Registration is closed.'),res.redirect(withTab('/',req));if(d.registrations.some(r=>r.eventId===id&&r.studentId===u.id))return flash(req,'Already registered.'),res.redirect(withTab('/',req));if(e.deadline&&new Date(e.deadline+'T23:59:59')<new Date())return flash(req,'Registration deadline has passed.'),res.redirect(withTab('/',req));let n=d.registrations.filter(r=>r.eventId===id).length;if(e.maxParticipants&&n>=e.maxParticipants)return flash(req,'Event is full.'),res.redirect(withTab('/',req));const registration={id:Date.now(),eventId:id,studentId:u.id,status:'REGISTERED',registeredAt:new Date().toISOString()};d.registrations.push(registration);notify(d,u.id,'REGISTRATION',`Registration confirmed for ${e.name}.`,{eventId:id});save(d);audit('STUDENT', `Student registered: ${u.name} (${u.rollNo||u.id}) → ${e.name}`, req, {eventId:id,studentId:u.id});flash(req,'Registered successfully.');res.redirect(withTab('/',req))});
app.post('/event/:id/close',login,role('event_coordinator','admin'),(req,res)=>{let d=db(),e=d.events.find(x=>x.id===Number(req.params.id));if(e)e.status='CLOSED';save(d);if(e)audit('EVENT', `Registration closed: ${e.name}`, req, {eventId:e.id});flash(req,'Registration closed.');res.redirect(withTab('/',req))});
app.post('/event/:id/attendance',login,role('event_coordinator','admin'),(req,res)=>{let d=db(),u=me(req),id=Number(req.params.id),e=d.events.find(x=>x.id===id);if(!e)return res.redirect(withTab('/',req));let vals=req.body.present||[],present=new Set(Array.isArray(vals)?vals:[vals]);d.attendance=d.attendance.filter(a=>a.eventId!==id);d.registrations.filter(r=>r.eventId===id).forEach(r=>d.attendance.push({id:Date.now()+Math.random(),eventId:id,studentId:r.studentId,status:present.has(r.studentId)?'PRESENT':'ABSENT',accepted:true,markedBy:u.id,markedAt:new Date().toISOString()}));e.attendanceCompleted=true;e.attendanceCompletedAt=new Date().toISOString();d.registrations.filter(r=>r.eventId===id).forEach(r=>{const a=d.attendance.find(x=>x.eventId===id&&x.studentId===r.studentId);notify(d,r.studentId,'ATTENDANCE',`Attendance recorded for ${e.name}: ${a?.status||'—'}.`,{eventId:id});});save(d);audit('ATTENDANCE', `Attendance submitted: ${e.name} — ${d.attendance.filter(a=>a.eventId===id&&a.status==='PRESENT').length} present / ${d.attendance.filter(a=>a.eventId===id&&a.status==='ABSENT').length} absent`, req, {eventId:id});flash(req,'Attendance submitted and accepted.');res.redirect(withTab('/',req))});

// Student permission letter workflow: student writes it, normal coordinator saves it for later reference.
app.post('/permission/create',login,role('student'),(req,res)=>{let d=db(),u=me(req),text=String(req.body.letterText||'').trim(),purpose=String(req.body.purpose||'').trim();if(!text||!purpose){flash(req,'Please complete the purpose and permission letter.');return res.redirect(withTab('/',req)+'#permissions');}d.permissionRequests=d.permissionRequests||[];const permission={id:Date.now(),studentId:u.id,purpose,letterText:text,status:'PENDING',createdAt:new Date().toISOString(),savedAt:null,savedBy:null};d.permissionRequests.push(permission);notify(d,u.id,'PERMISSION','Permission letter submitted to the Academic Coordinator.',{permissionId:permission.id});save(d);audit('PERMISSION', `Permission letter submitted: ${u.name} (${u.rollNo||u.id}) — ${purpose}`, req, {permissionId:permission.id,studentId:u.id});flash(req,'Permission letter sent to the coordinator.');res.redirect(withTab('/',req)+'#permissions')});
app.post('/permission/:id/status',login,role('coordinator'),(req,res)=>{let d=db(),u=me(req),p=(d.permissionRequests||[]).find(x=>x.id===Number(req.params.id));if(!p)return res.redirect(withTab('/',req));const status=String(req.body.status||'SAVED').toUpperCase();if(!['SAVED','REJECTED'].includes(status))return res.redirect(withTab('/',req));p.status=status;p.savedAt=status==='SAVED'?new Date().toISOString():null;p.savedBy=u.id;notify(d,p.studentId,'PERMISSION',status==='SAVED'?'Permission letter approved and saved by the Academic Coordinator.':'Permission letter was rejected by the Academic Coordinator.',{permissionId:p.id});save(d);audit('PERMISSION', `Permission letter ${status.toLowerCase()}: ${p.id}`, req, {permissionId:p.id,studentId:p.studentId});flash(req,status==='SAVED'?'Permission letter saved for future reference.':'Permission letter rejected.');res.redirect(withTab('/',req))});

app.post('/admin/account/create',login,role('admin'),(req,res)=>{let d=db(),u=me(req);const roleName=String(req.body.role||'student').trim();const name=String(req.body.name||'').trim();const id=String(req.body.id||'').trim();const password=String(req.body.password||'').trim();if(!name||!id||!password||!['student','event_coordinator','coordinator','teacher'].includes(roleName)){flash(req,'Invalid account details.');return res.redirect(withTab('/',req)+'#accounts')}if(d.users.some(x=>x.id===id||x.rollNo===id)){flash(req,'Account ID already exists.');return res.redirect(withTab('/',req)+'#accounts')}const account={id,role:roleName,name,password,active:true};if(roleName==='student'){account.rollNo=id;account.department='CSE';account.className='CSE-E';account.gender='male'}bcrypt.hash(password,12).then(hash=>{account.password=hash;d.users.push(account);save(d);audit('ADMIN',`Account created: ${name} (${roleName})`,req,{accountId:id});}).catch(err=>console.error('Password hashing failed:',err));flash(req,'Account created.');res.redirect(withTab('/',req)+'#accounts')});
app.post('/admin/account/:id/toggle',login,role('admin'),(req,res)=>{let d=db(),target=d.users.find(x=>x.id===req.params.id);if(!target||target.id===me(req).id){flash(req,'Account cannot be changed.');return res.redirect(withTab('/',req)+'#accounts')}target.active=target.active===false;save(d);audit('ADMIN',`Account ${target.active?'activated':'deactivated'}: ${target.name}`,req,{accountId:target.id});flash(req,`Account ${target.active?'activated':'deactivated'}.`);res.redirect(withTab('/',req)+'#accounts')});
app.post('/admin/notifications/read',login,role('admin'),(req,res)=>{let d=db();d.notifications=(d.notifications||[]).map(n=>n.userId===me(req).id?{...n,read:true}:n);save(d);res.redirect(withTab('/',req))});
app.get('/admin/logs',login,role('admin'),(req,res)=>{ const d=db(); res.json((d.auditLogs||[]).slice(-500)); });

loadData().then(()=>loadSessions()).then(()=>app.listen(PORT,()=>console.log(`INTENDFLASH running: http://localhost:${PORT}`))).catch(err=>{console.error('Database connection failed:',err);process.exit(1);});
