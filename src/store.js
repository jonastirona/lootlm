import {DatabaseSync} from 'node:sqlite';
import {randomBytes,randomInt,createHash} from 'node:crypto';
import {initialPool} from './config.js';
export const id=(prefix)=>prefix+'_'+randomBytes(12).toString('hex');
export const hash=(value)=>createHash('sha256').update(value).digest('hex');
export class Fault extends Error {constructor(status,code,message){super(message);this.status=status;this.code=code;}}
const fail=(status,code,message)=>{throw new Fault(status,code,message);};
export class Store {
 constructor(filename,cfg){
  this.cfg=cfg;this.db=new DatabaseSync(filename);
  this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,email TEXT UNIQUE NOT NULL,created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS credentials(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),hash TEXT UNIQUE NOT NULL,kind TEXT NOT NULL,name TEXT NOT NULL,prefix TEXT NOT NULL,expires_at TEXT,created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS pools(version TEXT PRIMARY KEY,body TEXT NOT NULL,created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS awards(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),pool_version TEXT NOT NULL REFERENCES pools(version),choice TEXT NOT NULL,total INTEGER NOT NULL,remaining INTEGER NOT NULL,reserved INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS spins(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),idem TEXT NOT NULL,award_id TEXT NOT NULL REFERENCES awards(id),created_at TEXT NOT NULL,UNIQUE(user_id,idem));
    CREATE TABLE IF NOT EXISTS requests(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),award_id TEXT NOT NULL REFERENCES awards(id),idem TEXT NOT NULL,fingerprint TEXT NOT NULL,status TEXT NOT NULL,reserved_tokens INTEGER NOT NULL,reserved_usd REAL NOT NULL,input_tokens INTEGER,output_tokens INTEGER,cost REAL,provider_id TEXT,result TEXT,error TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,UNIQUE(user_id,idem));
    CREATE TABLE IF NOT EXISTS ledger(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,award_id TEXT NOT NULL,request_id TEXT,kind TEXT NOT NULL,tokens INTEGER NOT NULL,created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS audit(id TEXT PRIMARY KEY,actor TEXT NOT NULL,action TEXT NOT NULL,detail TEXT NOT NULL,created_at TEXT NOT NULL);`);
  if(!this.setting('pool'))this.publishPool(initialPool,'system');
  for(const [k,v] of [['spinsEnabled','true'],['inferenceEnabled','true'],['rareEnabled','false']])if(this.setting(k)===null)this.set(k,v);
 }
 now(){return new Date().toISOString();}
 tx(fn){this.db.exec('BEGIN IMMEDIATE');try{const value=fn();this.db.exec('COMMIT');return value;}catch(e){this.db.exec('ROLLBACK');throw e;}}
 setting(k){return this.db.prepare('SELECT value FROM settings WHERE key=?').get(k)?.value??null;}
 set(k,v){this.db.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(k,String(v));}
 audit(actor,action,detail){this.db.prepare('INSERT INTO audit VALUES(?,?,?,?,?)').run(id('audit'),actor,action,JSON.stringify(detail),this.now());}
 user(email){let u=this.db.prepare('SELECT * FROM users WHERE email=?').get(email);if(!u){u={id:id('usr'),email,created_at:this.now()};this.db.prepare('INSERT INTO users VALUES(?,?,?)').run(u.id,u.email,u.created_at);}return u;}
 credential(user,kind='key',name='API key'){
  const raw=(kind==='session'?'session_':'loot_')+randomBytes(32).toString('base64url');const cid=id('key');
  const expires=kind==='session'?new Date(Date.now()+7*86400000).toISOString():null;
  this.db.prepare('INSERT INTO credentials VALUES(?,?,?,?,?,?,?,?)').run(cid,user.id,hash(raw),kind,name,raw.slice(0,12),expires,this.now());
  return {id:cid,key:raw,name,prefix:raw.slice(0,12)};
 }
 authenticate(raw){if(!raw)return null;return this.db.prepare('SELECT users.*,credentials.kind,credentials.id AS credential_id FROM credentials JOIN users ON users.id=credentials.user_id WHERE hash=? AND (expires_at IS NULL OR expires_at>?)').get(hash(raw),this.now())||null;}
 keys(user){return this.db.prepare("SELECT id,name,prefix,created_at FROM credentials WHERE user_id=? AND kind='key' ORDER BY created_at DESC,rowid DESC").all(user.id);}
 revoke(user,key){return this.db.prepare('DELETE FROM credentials WHERE id=? AND user_id=?').run(key,user.id).changes;}
 publishPool(entries,actor){
  if(!Array.isArray(entries)||entries.length<1||entries.length>12)fail(400,'invalid_pool','Pool needs 1–12 entries.');
  const ids=new Set();let total=0;
  const body=entries.map(e=>{
   if(!e||typeof e.id!=='string'||!/^[a-z0-9_-]{1,40}$/.test(e.id)||ids.has(e.id))fail(400,'invalid_pool','Entry IDs must be unique.');ids.add(e.id);
   if(typeof e.name!=='string'||e.name.length>80||!e.name.length||typeof e.model!=='string'||e.model.length>150||!e.model.length||!['bust','common','strong','rare'].includes(e.tier))fail(400,'invalid_pool','Invalid model metadata.');
   if(!Number.isSafeInteger(e.weight)||e.weight<1||e.weight>10000)fail(400,'invalid_pool','Weights must be positive integers.');total+=e.weight;
   for(const k of ['inputPrice','outputPrice'])if(!Number.isFinite(e[k])||e[k]<0||e[k]>10000)fail(400,'invalid_pool','Prices must be USD per million tokens.');
   return {id:e.id,name:e.name,model:e.model,tier:e.tier,weight:e.weight,inputPrice:e.inputPrice,outputPrice:e.outputPrice};
  });
  return this.tx(()=>{const version=id('pool');this.db.prepare('INSERT INTO pools VALUES(?,?,?)').run(version,JSON.stringify(body),this.now());this.set('pool',version);this.audit(actor,'pool.publish',{version,total});return version;});
 }
 pool(){const p=this.db.prepare('SELECT * FROM pools WHERE version=?').get(this.setting('pool'));return {version:p.version,entries:JSON.parse(p.body)};}
 viewAward(a){return {...a,choice:JSON.parse(a.choice),available:a.remaining-a.reserved};}
 awards(user){return this.db.prepare('SELECT * FROM awards WHERE user_id=? ORDER BY created_at DESC,rowid DESC').all(user.id).map(a=>this.viewAward(a));}
 award(user,aid){const a=this.db.prepare('SELECT * FROM awards WHERE id=? AND user_id=?').get(aid,user.id);if(!a)fail(404,'award_not_found','Allowance not found.');return this.viewAward(a);}
 spin(user,idem,draw=randomInt){return this.tx(()=>{
  const prior=this.db.prepare('SELECT award_id FROM spins WHERE user_id=? AND idem=?').get(user.id,idem);if(prior)return {award:this.award(user,prior.award_id),replayed:true};
  if(this.setting('spinsEnabled')!=='true')fail(503,'spins_paused','New rolls are paused.');
  const count=this.db.prepare('SELECT COUNT(*) AS n FROM spins WHERE user_id=? AND created_at>=?').get(user.id,new Date(Date.now()-86400000).toISOString()).n;
  if(count>=50)fail(429,'roll_limit','Internal testing limit: 50 rolls per 24 hours.');
  const pool=this.pool();const n=pool.entries.reduce((a,b)=>a+b.weight,0);let pick=draw(n),choice;
  for(const e of pool.entries){if(pick<e.weight){choice=e;break;}pick-=e.weight;}
  if(!choice)throw Error('Invalid random draw');const aid=id('award'),now=this.now();
  this.db.prepare('INSERT INTO awards VALUES(?,?,?,?,?,?,?,?)').run(aid,user.id,pool.version,JSON.stringify(choice),1000000,1000000,0,now);
  this.db.prepare('INSERT INTO spins VALUES(?,?,?,?,?)').run(id('spin'),user.id,idem,aid,now);
  this.db.prepare('INSERT INTO ledger VALUES(?,?,?,?,?,?,?)').run(id('led'),user.id,aid,null,'grant',1000000,now);
  return {award:this.award(user,aid),replayed:false};
 });}
 reserve(user,aid,idem,fingerprint,tokens,usd){return this.tx(()=>{
  const prior=this.db.prepare('SELECT * FROM requests WHERE user_id=? AND idem=?').get(user.id,idem);
  if(prior){if(prior.fingerprint!==fingerprint)fail(409,'idempotency_conflict','This idempotency key belongs to a different request.');return {prior};}
  if(this.setting('inferenceEnabled')!=='true')fail(503,'inference_paused','Inference is paused.');
  const a=this.award(user,aid);
  if(this.cfg.provider==='openrouter'&&a.choice.tier==='rare'&&this.setting('rareEnabled')!=='true')fail(403,'rare_paused','Rare-model live inference is disabled by the administrator.');
  if(tokens>a.available)fail(402,'insufficient_tokens','Not enough unreserved tokens for this request. Lower max_tokens or shorten the prompt.');
  const concurrent=this.db.prepare("SELECT COUNT(*) AS n FROM requests WHERE user_id=? AND status IN ('reserved','pending')").get(user.id).n;
  if(concurrent>=2)fail(429,'concurrency_limit','At most two active or pending requests per tester.');
  const day=this.now().slice(0,10);
  const spent=this.db.prepare("SELECT COALESCE(SUM(CASE WHEN status='complete' AND substr(updated_at,1,10)=? THEN cost WHEN status IN ('reserved','pending') THEN reserved_usd ELSE 0 END),0) AS total FROM requests").get(day).total;
  if(spent+usd>this.cfg.dailyUsd)fail(429,'daily_budget','The daily inference budget is exhausted or reserved.');
  const rid=id('req'),now=this.now();this.db.prepare('UPDATE awards SET reserved=reserved+? WHERE id=?').run(tokens,aid);
  this.db.prepare('INSERT INTO requests(id,user_id,award_id,idem,fingerprint,status,reserved_tokens,reserved_usd,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)').run(rid,user.id,aid,idem,fingerprint,'reserved',tokens,usd,now,now);
  this.db.prepare('INSERT INTO ledger VALUES(?,?,?,?,?,?,?)').run(id('led'),user.id,aid,rid,'reserve',tokens,now);
  return {request:this.request(rid),award:a};
 });}
 request(rid){return this.db.prepare('SELECT * FROM requests WHERE id=?').get(rid);}
 providerId(rid,pid){this.db.prepare('UPDATE requests SET provider_id=?,updated_at=? WHERE id=?').run(pid,this.now(),rid);}
 settle(rid,usage,result=null){return this.tx(()=>{
  const r=this.request(rid);if(!r||['complete','failed'].includes(r.status))return r;
  const {input,output,cost}=usage;if(!Number.isSafeInteger(input)||input<0||!Number.isSafeInteger(output)||output<0||!Number.isFinite(cost)||cost<0)throw Error('Untrustworthy provider usage');
  const amount=input+output;
  if(amount>r.reserved_tokens||cost>r.reserved_usd+0.000001){this.set('inferenceEnabled','false');this.audit('system','reservation.exceeded',{rid,reserved:r.reserved_tokens,actual:amount,reservedCost:r.reserved_usd,cost});}
  this.db.prepare('UPDATE awards SET reserved=reserved-?,remaining=remaining-? WHERE id=?').run(r.reserved_tokens,amount,r.award_id);
  this.db.prepare("UPDATE requests SET status='complete',input_tokens=?,output_tokens=?,cost=?,result=?,updated_at=? WHERE id=?").run(input,output,cost,result?JSON.stringify(result):null,this.now(),rid);
  this.db.prepare('INSERT INTO ledger VALUES(?,?,?,?,?,?,?)').run(id('led'),r.user_id,r.award_id,rid,'consume',amount,this.now());
  return this.request(rid);
 });}
 release(rid,message){return this.tx(()=>{
  const r=this.request(rid);if(!r||['complete','failed'].includes(r.status))return;
  this.db.prepare('UPDATE awards SET reserved=reserved-? WHERE id=?').run(r.reserved_tokens,r.award_id);
  this.db.prepare("UPDATE requests SET status='failed',error=?,updated_at=? WHERE id=?").run(message,this.now(),rid);
  this.db.prepare('INSERT INTO ledger VALUES(?,?,?,?,?,?,?)').run(id('led'),r.user_id,r.award_id,rid,'release',r.reserved_tokens,this.now());
 });}
 pending(rid,message){this.db.prepare("UPDATE requests SET status='pending',error=?,updated_at=? WHERE id=? AND status IN ('reserved','pending')").run(message,this.now(),rid);}
 usage(user){return this.db.prepare('SELECT id,award_id,status,input_tokens,output_tokens,cost,error,created_at FROM requests WHERE user_id=? ORDER BY created_at DESC,rowid DESC LIMIT 100').all(user.id);}
 pendingRequests(){return this.db.prepare("SELECT * FROM requests WHERE status='pending'").all();}
 recover(){this.db.prepare("UPDATE requests SET status='pending',error='Server restarted before settlement' WHERE status='reserved'").run();}
 stats(){return {requests:this.db.prepare('SELECT status,COUNT(*) AS count,COALESCE(SUM(cost),0) AS cost FROM requests GROUP BY status').all(),pending:this.pendingRequests().map(r=>({id:r.id,provider_id:r.provider_id,error:r.error})),settings:Object.fromEntries(this.db.prepare('SELECT * FROM settings').all().map(s=>[s.key,s.value])),audit:this.db.prepare('SELECT * FROM audit ORDER BY created_at DESC,rowid DESC LIMIT 30').all()};}
 close(){this.db.close();}
}
