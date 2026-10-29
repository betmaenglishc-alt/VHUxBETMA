const express=require('express'),Database=require('better-sqlite3'),crypto=require('crypto'),fs=require('fs'),path=require('path');
if(fs.existsSync('.env'))fs.readFileSync('.env','utf8').split('\n').forEach(l=>{const m=l.match(/^\s*([A-Z_]+)\s*=\s*(.*)$/);if(m&&!process.env[m[1]])process.env[m[1]]=m[2].trim()});
const PORT=process.env.PORT||3000,SECRET=process.env.SESSION_SECRET||crypto.randomBytes(32).toString('hex');
const DATA=path.join(__dirname,'data'),UP=path.join(DATA,'uploads');fs.mkdirSync(UP,{recursive:true});
const db=new Database(path.join(DATA,'betma.db'));db.pragma('journal_mode=WAL');db.pragma('foreign_keys=ON');
db.exec(`CREATE TABLE IF NOT EXISTS players(id INTEGER PRIMARY KEY,name TEXT,phone TEXT,email TEXT,year TEXT,consent INTEGER,created_at TEXT DEFAULT(datetime('now','localtime')));
CREATE TABLE IF NOT EXISTS attempts(id INTEGER PRIMARY KEY,code TEXT UNIQUE,token TEXT UNIQUE,player_id INTEGER REFERENCES players(id),started_at TEXT DEFAULT(datetime('now','localtime')),finished_at TEXT,score INTEGER,duration_s INTEGER);
CREATE TABLE IF NOT EXISTS questions(id INTEGER PRIMARY KEY,position INTEGER,image TEXT,options TEXT,correct INTEGER,active INTEGER DEFAULT 1);
CREATE TABLE IF NOT EXISTS answers(attempt_id INTEGER REFERENCES attempts(id),question_id INTEGER,chosen INTEGER,is_correct INTEGER,answered_at TEXT DEFAULT(datetime('now','localtime')),PRIMARY KEY(attempt_id,question_id));
CREATE TABLE IF NOT EXISTS admins(id INTEGER PRIMARY KEY,username TEXT UNIQUE,hash TEXT,role TEXT);`);
const hash=(p,s=crypto.randomBytes(8).toString('hex'))=>s+':'+crypto.scryptSync(p,s,32).toString('hex');
const verify=(p,h)=>{const s=h.split(':')[0];const a=Buffer.from(hash(p,s)),b=Buffer.from(h);return a.length===b.length&&crypto.timingSafeEqual(a,b)};
if(!db.prepare('SELECT 1 FROM admins').get()){const p=process.env.ADMIN_PASS||'betma2026';db.prepare('INSERT INTO admins(username,hash,role) VALUES(?,?,?)').run(process.env.ADMIN_USER||'admin',hash(p),'admin');if(!process.env.ADMIN_PASS)console.warn('⚠ Chưa đặt ADMIN_PASS, mật khẩu tạm: betma2026 — hãy đổi ngay!')}
if(!db.prepare('SELECT 1 FROM questions').get()){const ins=db.prepare('INSERT INTO questions(position,image,options,correct) VALUES(?,?,?,?)');
for(let i=1;i<=10;i++){const f=`mau-${i}.svg`;fs.writeFileSync(path.join(UP,f),`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 500"><rect width="800" height="500" fill="#F5F5F5"/><text x="400" y="250" font-family="Arial" font-size="64" font-weight="700" fill="#D3222B" text-anchor="middle">Câu ${i}</text><text x="400" y="310" font-family="Arial" font-size="26" fill="#222" text-anchor="middle">Thay hình trong Admin → Câu hỏi</text></svg>`);
ins.run(i,'/uploads/'+f,JSON.stringify(['Mô tả A','Mô tả B','Mô tả C','Mô tả D']),0)}}
const app=express();app.disable('x-powered-by');app.use(express.json({limit:'8mb'}));
app.use((q,r,n)=>{r.set({'X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Referrer-Policy':'same-origin'});n()});
app.use('/uploads',express.static(UP,{setHeaders:r=>r.set('Content-Security-Policy',"default-src 'none'; style-src 'unsafe-inline'")}));
app.use(express.static(path.join(__dirname,'public')));
const wrap=f=>(q,r)=>{try{f(q,r)}catch(e){console.error(e);r.status(500).json({error:'Lỗi hệ thống'})}};
const qs=()=>db.prepare('SELECT * FROM questions WHERE active=1 ORDER BY position,id LIMIT 10').all();
const newAttempt=pid=>{const token=crypto.randomBytes(18).toString('hex');const id=db.prepare('INSERT INTO attempts(code,token,player_id) VALUES(?,?,?)').run('tmp'+token,token,pid).lastInsertRowid;const code='BC-'+String(id).padStart(5,'0');db.prepare('UPDATE attempts SET code=? WHERE id=?').run(code,id);return{token,code}};
const getAt=(q,r)=>{const a=db.prepare('SELECT * FROM attempts WHERE token=?').get(q.params.token);if(!a)r.status(404).json({error:'Không tìm thấy lượt chơi'});return a};
// ---------- Người chơi ----------
app.post('/api/register',wrap((q,r)=>{let{name,phone,email,year,consent}=q.body||{};name=String(name||'').trim();phone=String(phone||'').replace(/[\s.\-]/g,'');email=String(email||'').trim().toLowerCase();
const e={};if(name.length<2||name.length>80)e.name='Nhập họ và tên';if(!/^(0|\+84)\d{9}$/.test(phone))e.phone='Số điện thoại chưa đúng (VD: 0901234567)';if(!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)||email.length>120)e.email='Email chưa đúng';if(!['Năm 1','Năm 2','Năm 3','Năm 4','Khác'].includes(year))e.year='Chọn sinh viên năm';if(consent!==true)e.consent='Cần đồng ý để tham gia';
if(Object.keys(e).length)return r.status(400).json({errors:e});
const pid=db.prepare('INSERT INTO players(name,phone,email,year,consent) VALUES(?,?,?,?,1)').run(name,phone,email,year).lastInsertRowid;r.json(newAttempt(pid))}));
app.post('/api/replay',wrap((q,r)=>{const a=db.prepare('SELECT player_id FROM attempts WHERE token=?').get(String(q.body.token||''));if(!a)return r.status(404).json({error:'Không tìm thấy'});r.json(newAttempt(a.player_id))}));
app.get('/api/attempt/:token/question',wrap((q,r)=>{const a=getAt(q,r);if(!a)return;const all=qs(),done=new Set(db.prepare('SELECT question_id FROM answers WHERE attempt_id=?').all(a.id).map(x=>x.question_id));
const i=all.findIndex(x=>!done.has(x.id));if(i<0||a.finished_at)return r.json({done:true});const x=all[i];r.json({index:i+1,total:all.length,id:x.id,image:x.image,options:JSON.parse(x.options)})}));
app.post('/api/attempt/:token/answer',wrap((q,r)=>{const a=getAt(q,r);if(!a)return;if(a.finished_at)return r.status(400).json({error:'Lượt chơi đã kết thúc'});
const all=qs(),done=new Set(db.prepare('SELECT question_id FROM answers WHERE attempt_id=?').all(a.id).map(x=>x.question_id));const cur=all.find(x=>!done.has(x.id));const c=Number(q.body.chosen);
if(!cur||cur.id!==Number(q.body.questionId)||![0,1,2,3].includes(c))return r.status(400).json({error:'Câu trả lời không hợp lệ'});
const ok=c===cur.correct?1:0;db.prepare('INSERT INTO answers(attempt_id,question_id,chosen,is_correct) VALUES(?,?,?,?)').run(a.id,cur.id,c,ok);r.json({correct:!!ok,correctIndex:cur.correct})}));
app.post('/api/attempt/:token/finish',wrap((q,r)=>{const a=getAt(q,r);if(!a)return;const n=qs().length,cnt=db.prepare('SELECT COUNT(*) n,COALESCE(SUM(is_correct),0) s FROM answers WHERE attempt_id=?').get(a.id);
if(cnt.n<n)return r.status(400).json({error:'Bạn chưa trả lời hết các câu'});
if(!a.finished_at)db.prepare("UPDATE attempts SET finished_at=datetime('now','localtime'),score=?,duration_s=CAST((julianday('now','localtime')-julianday(started_at))*86400 AS INTEGER) WHERE id=?").run(cnt.s,a.id);
const f=db.prepare('SELECT score,duration_s,code FROM attempts WHERE id=?').get(a.id);r.json({score:f.score,total:n,duration:f.duration_s,code:f.code})}));
app.get('/api/attempt/:token/review',wrap((q,r)=>{const a=getAt(q,r);if(!a)return;if(!a.finished_at)return r.status(403).json({error:'Hoàn thành thử thách để xem đáp án'});
r.json(db.prepare('SELECT q.position,q.image,q.options,q.correct,w.chosen FROM answers w JOIN questions q ON q.id=w.question_id WHERE w.attempt_id=? ORDER BY q.position,q.id').all(a.id).map(x=>({...x,options:JSON.parse(x.options)})))}));
// ---------- Admin ----------
const sign=(u,role)=>{const b=Buffer.from(JSON.stringify({u,role,exp:Date.now()+12*3600e3})).toString('base64url');return b+'.'+crypto.createHmac('sha256',SECRET).update(b).digest('base64url')};
const auth=need=>(q,r,n)=>{const c=(q.headers.cookie||'').split(/;\s*/).find(x=>x.startsWith('bs='));if(c){const[b,s]=c.slice(3).split('.');const ex=crypto.createHmac('sha256',SECRET).update(b||'').digest('base64url');if(s&&s.length===ex.length&&crypto.timingSafeEqual(Buffer.from(s),Buffer.from(ex))){const p=JSON.parse(Buffer.from(b,'base64url'));if(p.exp>Date.now()){if(need==='admin'&&p.role!=='admin')return r.status(403).json({error:'Không đủ quyền'});q.admin=p;return n()}}}r.status(401).json({error:'Chưa đăng nhập'})};
const tries={};
app.post('/api/admin/login',wrap((q,r)=>{const k=q.ip,t=tries[k]=(tries[k]||[]).filter(x=>Date.now()-x<9e5);if(t.length>=8)return r.status(429).json({error:'Thử quá nhiều lần, vui lòng đợi 15 phút'});
const u=db.prepare('SELECT * FROM admins WHERE username=?').get(String(q.body.username||''));if(!u||!verify(String(q.body.password||''),u.hash)){t.push(Date.now());return r.status(401).json({error:'Sai tài khoản hoặc mật khẩu'})}
r.set('Set-Cookie',`bs=${sign(u.username,u.role)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200`+(q.secure?'; Secure':''));r.json({user:u.username,role:u.role})}));
app.post('/api/admin/logout',(q,r)=>{r.set('Set-Cookie','bs=; HttpOnly; Path=/; Max-Age=0');r.json({ok:1})});
app.get('/api/admin/me',auth(),(q,r)=>r.json({user:q.admin.u,role:q.admin.role}));
app.get('/api/admin/stats',auth(),wrap((q,r)=>{const g=s=>db.prepare(s).get();const done=g('SELECT COUNT(*) n,AVG(score) a,SUM(score>=8) h FROM attempts WHERE finished_at IS NOT NULL'),att=g('SELECT COUNT(*) n FROM attempts').n;
const dist=Array(11).fill(0);db.prepare('SELECT score,COUNT(*) n FROM attempts WHERE finished_at IS NOT NULL GROUP BY score').all().forEach(x=>dist[x.score]=x.n);
r.json({players:g('SELECT COUNT(*) n FROM players').n,attempts:att,completed:done.n,rate:att?done.n/att:0,avg:done.a||0,high:done.h||0,dist})}));
function filt(q){const w=['1=1'],p=[],{q:s,year,from,to,min,max,status}=q.query;
if(s){w.push('(p.name LIKE ? OR p.phone LIKE ? OR p.email LIKE ? OR a.code LIKE ?)');p.push(...Array(4).fill('%'+s+'%'))}
if(year){w.push('p.year=?');p.push(year)}if(from){w.push('date(a.started_at)>=?');p.push(from)}if(to){w.push('date(a.started_at)<=?');p.push(to)}
if(min!==undefined&&min!==''){w.push('a.score>=?');p.push(+min)}if(max!==undefined&&max!==''){w.push('a.score<=?');p.push(+max)}
if(status==='done')w.push('a.finished_at IS NOT NULL');if(status==='open')w.push('a.finished_at IS NULL');
return{w:w.join(' AND '),p}}
const SEL=`SELECT a.id,a.code,p.name,p.phone,p.email,p.year,a.started_at,a.score,a.duration_s,a.finished_at,(a.finished_at IS NOT NULL) done FROM attempts a JOIN players p ON p.id=a.player_id`;
app.get('/api/admin/attempts',auth(),wrap((q,r)=>{const{w,p}=filt(q),pg=Math.max(1,+q.query.page||1),n=db.prepare(`SELECT COUNT(*) n FROM attempts a JOIN players p ON p.id=a.player_id WHERE ${w}`).get(...p).n;
r.json({total:n,rows:db.prepare(`${SEL} WHERE ${w} ORDER BY a.id DESC LIMIT 25 OFFSET ?`).all(...p,(pg-1)*25)})}));
app.get('/api/admin/attempts/:id',auth(),wrap((q,r)=>{const a=db.prepare(`${SEL} WHERE a.id=?`).get(q.params.id);if(!a)return r.status(404).json({error:'Không tìm thấy'});
a.answers=db.prepare('SELECT q.position,q.image,q.options,q.correct,w.chosen,w.is_correct FROM answers w JOIN questions q ON q.id=w.question_id WHERE w.attempt_id=? ORDER BY q.position,q.id').all(a.id).map(x=>({...x,options:JSON.parse(x.options)}));r.json(a)}));
app.get('/api/admin/export.csv',auth('admin'),wrap((q,r)=>{const{w,p}=filt(q),rows=db.prepare(`${SEL} WHERE ${w} ORDER BY a.id DESC`).all(...p);
const esc=v=>{v=v==null?'':String(v);if(/^[=+\-@\t\r]/.test(v))v="'"+v;return'"'+v.replace(/"/g,'""')+'"'};
const head=['Mã lượt chơi','Họ và tên','Số điện thoại','Email','Sinh viên năm','Thời gian tham gia','Điểm','Số câu đúng','Thời gian (giây)','Trạng thái'];
const csv='\ufeff'+[head,...rows.map(x=>[x.code,x.name,x.phone,x.email,x.year,x.started_at,x.score,x.score,x.duration_s,x.done?'Hoàn thành':'Chưa hoàn thành'])].map(l=>l.map(esc).join(',')).join('\r\n');
r.set({'Content-Type':'text/csv; charset=utf-8','Content-Disposition':`attachment; filename="betma-challenge-${new Date().toISOString().slice(0,10)}.csv"`});r.send(csv)}));
const parseQ=b=>{const o=(b.options||[]).map(x=>String(x).trim());if(o.length!==4||o.some(x=>!x))throw 'Cần đủ 4 đáp án';if(![0,1,2,3].includes(+b.correct))throw 'Chọn đáp án đúng';if(!/^\/uploads\/[\w.\-]+$/.test(b.image||''))throw 'Cần hình ảnh';return[+b.position||99,b.image,JSON.stringify(o),+b.correct,b.active===false?0:1]};
app.get('/api/admin/questions',auth(),(q,r)=>r.json(db.prepare('SELECT * FROM questions ORDER BY position,id').all().map(x=>({...x,options:JSON.parse(x.options)}))));
app.post('/api/admin/questions',auth('admin'),(q,r)=>{try{r.json({id:db.prepare('INSERT INTO questions(position,image,options,correct,active) VALUES(?,?,?,?,?)').run(...parseQ(q.body)).lastInsertRowid})}catch(e){r.status(400).json({error:String(e)})}});
app.put('/api/admin/questions/:id',auth('admin'),(q,r)=>{try{db.prepare('UPDATE questions SET position=?,image=?,options=?,correct=?,active=? WHERE id=?').run(...parseQ(q.body),q.params.id);r.json({ok:1})}catch(e){r.status(400).json({error:String(e)})}});
app.delete('/api/admin/questions/:id',auth('admin'),wrap((q,r)=>{db.prepare('UPDATE questions SET active=0 WHERE id=?').run(q.params.id);r.json({ok:1})}));
app.post('/api/admin/upload',auth('admin'),wrap((q,r)=>{const m=/^data:image\/(png|jpeg|webp);base64,(.+)$/.exec(q.body.dataUrl||'');if(!m)return r.status(400).json({error:'Chỉ nhận PNG, JPG, WebP'});
const buf=Buffer.from(m[2],'base64');if(buf.length>5e6)return r.status(400).json({error:'Ảnh tối đa 5MB'});const f=crypto.randomBytes(8).toString('hex')+'.'+(m[1]==='jpeg'?'jpg':m[1]);fs.writeFileSync(path.join(UP,f),buf);r.json({image:'/uploads/'+f})}));
app.post('/api/admin/users',auth('admin'),wrap((q,r)=>{const{username,password,role}=q.body;if(!username||String(password||'').length<8||!['admin','staff'].includes(role))return r.status(400).json({error:'Tài khoản, mật khẩu ≥ 8 ký tự, quyền admin/staff'});
try{db.prepare('INSERT INTO admins(username,hash,role) VALUES(?,?,?)').run(username,hash(password),role);r.json({ok:1})}catch{r.status(400).json({error:'Tài khoản đã tồn tại'})}}));
app.listen(PORT,()=>console.log('BETMA CHALLENGE chạy tại http://localhost:'+PORT+'  |  Admin: /admin.html'));
