import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {Store} from '../src/store.js';
import {OpenRouterProvider,normalizeUsage} from '../src/providers.js';
import {modelInfo,reviewEntries,reservePlan} from '../src/catalog.js';
import {createApp} from '../src/server.js';
const cfg=()=>({provider:'openrouter',apiKey:'fixture-key',liveEnabled:true,dailyUsd:5,maxOutput:1024,maxInputBytes:24000,accessCode:'fixture-code',testers:['a@test.local','b@test.local'],admins:['a@test.local'],origin:'http://localhost:3131'});
const model={id:'test/model',name:'Test model',pricing:{prompt:'0.000001',completion:'0.000002'},architecture:{input_modalities:['text'],output_modalities:['text'],tokenizer:'test'},context_length:32768,top_provider:{max_completion_tokens:4096},supported_parameters:['max_tokens','tools','tool_choice','temperature','top_p','stop']};
const entry={id:'common',name:'Test',tier:'common',weight:100,model:model.id,inputPrice:1,outputPrice:2};
async function fixture(t,{gen,configuration={}}={}){
 const c={...cfg(),...configuration};const db=new Store(':memory:',c);let calls=0;const bodies=[];
 const router=new OpenRouterProvider(c.apiKey,{fetcher:async(url,options)=>{
  if(url.endsWith('/models'))return Response.json({data:[model]});
  if(url.endsWith('/key'))return Response.json({data:{limit:10,limit_remaining:9,label:'must-not-leak',usage:1}});
  if(url.includes('/generation?'))return Response.json({data:{model:model.id,finish_reason:'stop',native_tokens_prompt:8,native_tokens_completion:4,total_cost:.000016}});
  calls++;const b=JSON.parse(options.body);bodies.push(b);if(gen)return gen(b);
  return Response.json({id:'gen-'+calls,model:model.id,object:'chat.completion',choices:[{index:0,message:{role:'assistant',content:'real adapter, simulated upstream'},finish_reason:'stop'}],usage:{prompt_tokens:8,completion_tokens:4,total_tokens:12,cost:.000016}});
 }});
 const instance=createApp(c,{store:db,provider:router,openrouter:router});const server=instance.app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const url='http://127.0.0.1:'+server.address().port;
 t.after(()=>{server.closeAllConnections();server.close();db.close();});
 const user=db.user('a@test.local'),other=db.user('b@test.local');const key=db.credential(user).key,otherKey=db.credential(other).key;
 async function call(route,body,method='POST',auth=key){const res=await fetch(url+route,{method,headers:{Authorization:`Bearer ${auth}`,'Content-Type':'application/json','Idempotency-Key':'fixture-spin'},body:body===undefined?undefined:JSON.stringify(body)});return {status:res.status,data:await res.json(),headers:res.headers};}
 return {c,db,router,user,other,key,otherKey,url,call,bodies,calls:()=>calls,...instance};
}

test('catalog cache coalesces concurrent fetches and fails closed after expiry',async()=>{
 let at=0,count=0;let fail=false;const provider=new OpenRouterProvider('key',{now:()=>at,ttl:100,fetcher:async()=>{count++;await new Promise(r=>setTimeout(r,5));if(fail)throw Error('offline');return Response.json({data:[model]});}});
 await Promise.all([provider.catalog(),provider.catalog(),provider.catalog()]);assert.equal(count,1);at=99;await provider.catalog();assert.equal(count,1);at=101;fail=true;await assert.rejects(provider.catalog(),e=>e.code==='catalog_unavailable');assert.equal(count,2);
});

test('connection diagnostics omit sensitive upstream metadata and classify failures',async()=>{
 let calls=0;const missing=new OpenRouterProvider('',{fetcher:async()=>{calls++;}});assert.equal((await missing.connection()).status,'key_missing');assert.equal(calls,0);
 for(const [data,status] of [[{limit:10,limit_remaining:5},'connected'],[{limit:10,limit_remaining:0},'key_limit_exhausted'],[{expires_at:'2020-01-01'},'key_expired']]){
  const p=new OpenRouterProvider('secret',{fetcher:async()=>Response.json({data:{...data,label:'secret-key-fragment',creator_user_id:'private'}})});const r=await p.connection();assert.equal(r.status,status);assert.doesNotMatch(JSON.stringify(r),/secret|private/);
 }
 const p=new OpenRouterProvider('key',{fetcher:async()=>new Response('{}',{status:401})});assert.equal((await p.connection()).status,'key_rejected');
});

test('pricing includes cache/context tiers; optional search does not disqualify text inference',()=>{
 const info=modelInfo({...model,pricing:{...model.pricing,web_search:'0.01',input_cache_write:'0.00000125',overrides:[{min_prompt_tokens:200000,prompt:'0.000002',completion:'0.000004',input_cache_write:'0.000003'}]}});
 assert.equal(info.inputCeiling,3);assert.equal(info.outputCeiling,4);
 assert.equal(modelInfo({...model,pricing:{...model.pricing,internal_reasoning:'0.000005'}}).outputCeiling,5);
 assert.throws(()=>modelInfo({...model,pricing:{...model.pricing,request:'0.01'}}),e=>e.code==='unsupported_pricing');
 assert.throws(()=>modelInfo({...model,pricing:{...model.pricing,new_fee:'0.1'}}),e=>e.code==='unsupported_pricing');
 assert.throws(()=>modelInfo({...model,pricing:{prompt:null,completion:'0.000001'}}),e=>e.code==='invalid_pricing');
});

test('review rejects underpriced and dynamic model entries',async()=>{
 const provider={catalog:async()=>[model]};assert.equal((await reviewEntries(provider,[entry]))[0].capabilities.tokenizer,'test');
 await assert.rejects(reviewEntries(provider,[{...entry,inputPrice:.5}]),e=>e.code==='price_ceiling');
 await assert.rejects(reviewEntries(provider,[{...entry,model:'openrouter/auto'}]),e=>e.code==='dynamic_model');
});

test('live setup, exact supplier routing, ceilings, request snapshot and owner-only status',async t=>{
 const f=await fixture(t);assert.equal((await f.call('/internal/spins',{})).status,503);
 assert.equal((await f.call('/internal/admin/pool',{supplier:'openrouter',entries:[entry]},'PUT')).status,200);
 const result=await f.call('/internal/spins',{});assert.equal(result.status,200);const a=result.data.award;assert.equal(a.supplier,'openrouter');
 const answer=await f.call('/v1/chat/completions',{model:a.id,messages:[{role:'user',content:'Hi'}],max_tokens:32});assert.equal(answer.status,200);
 assert.deepEqual(f.bodies[0].provider.max_price,{prompt:1,completion:2,request:0});assert.equal(f.bodies[0].provider.allow_fallbacks,false);
 const rid=answer.data.lootlm_request_id;const status=await f.call('/v1/requests/'+rid,undefined,'GET');assert.equal(status.data.supplier,'openrouter');assert.equal(status.data.debited_tokens,12);assert.equal(status.data.price_snapshot.inputCeiling,1);assert.equal(status.data.price_snapshot.catalog.tokenizer,'test');assert.equal(status.data.result,undefined);
 assert.equal((await f.call('/v1/requests/'+rid,undefined,'GET',f.otherKey)).status,404);
 const connection=await f.call('/internal/admin/openrouter',undefined,'GET');assert.equal(connection.data.status,'connected');assert.doesNotMatch(JSON.stringify(connection.data),/must-not-leak/);
 assert.equal((await f.call('/internal/admin/catalog',undefined,'GET',f.otherKey)).status,403);
});

test('demo awards remain demo when server switches to live; models list filters them',async t=>{
 const f=await fixture(t);f.c.provider='demo';const a=f.db.spin(f.user,'demo',()=>0).award;f.c.provider='openrouter';
 assert.equal((await f.call('/v1/chat/completions',{model:a.id,messages:[{role:'user',content:'hi'}]})).status,409);assert.equal(f.calls(),0);
 assert.equal((await f.call('/v1/models',undefined,'GET')).data.data.length,0);assert.equal(f.db.award(f.user,a.id).supplier,'demo');
 await f.call('/internal/admin/pool',{supplier:'openrouter',entries:[entry]},'PUT');assert.equal(f.db.pool('demo').entries.length,24);assert.equal(f.db.pool('openrouter').entries.length,1);
});

test('default output shrinks near exhaustion without weakening input reservations',()=>{
 const b={messages:[{role:'user',content:'hi'}]},a={supplier:'openrouter',available:900,choice:entry};const p=reservePlan(b,a,cfg(),modelInfo(model));assert.equal(p.tokens,900);assert.ok(p.max>0&&p.max<1024);
 assert.throws(()=>reservePlan({...b,max_tokens:1024},a,cfg(),modelInfo(model)),e=>e.code==='insufficient_tokens');
 assert.throws(()=>reservePlan({...b,parallel_tool_calls:true}, {...a,available:10000},cfg(),modelInfo(model)),e=>e.code==='unsupported_model_parameter');
});

test('overages preserve actual usage without taking another reservation or going negative',()=>{
 const c={...cfg(),provider:'demo'},db=new Store(':memory:',c),u=db.user('a');const a=db.spin(u,'s',()=>0).award;db.db.prepare('UPDATE awards SET remaining=100 WHERE id=?').run(a.id);
 const one=db.reserve(u,a.id,'one','one',60,0).request,two=db.reserve(u,a.id,'two','two',40,0).request;
 db.settle(one.id,{input:50,output:40,cost:0});assert.equal(db.award(u,a.id).remaining,40);assert.equal(db.award(u,a.id).reserved,40);assert.equal(db.request(one.id).overage_tokens,30);
 db.settle(two.id,{input:20,output:20,cost:0});assert.equal(db.award(u,a.id).remaining,0);assert.equal(db.setting('inferenceEnabled'),'false');db.close();
});

test('pending work backs off durably and escalates without freeing tokens',()=>{
 const c={...cfg(),provider:'demo'},db=new Store(':memory:',c),u=db.user('a'),a=db.spin(u,'s',()=>0).award,r=db.reserve(u,a.id,'r','r',100,0).request;
 db.pending(r.id,'network');assert.equal(db.dueRequests().length,1);db.retryLater(r.id,'not final');assert.equal(db.request(r.id).reconcile_attempts,1);assert.equal(db.dueRequests().length,0);
 for(let i=0;i<7;i++)db.retryLater(r.id,'not final');assert.equal(db.request(r.id).manual_review,1);assert.equal(db.award(u,a.id).reserved,100);assert.equal(db.stats().alerts.length,1);
 db.retryNow(r.id,u.id);assert.equal(db.dueRequests().length,1);assert.equal(db.request(r.id).reconcile_attempts,0);db.close();
});

test('interrupted live generation settles from terminal upstream metadata once',async t=>{
 const f=await fixture(t,{gen:async()=>new Response('data: {"id":"gen-broken","model":"test/model","choices":[]}\n\n')});await f.call('/internal/admin/pool',{supplier:'openrouter',entries:[entry]},'PUT');const a=(await f.call('/internal/spins',{})).data.award;
 const response=await fetch(f.url+'/v1/chat/completions',{method:'POST',headers:{Authorization:`Bearer ${f.key}`,'Content-Type':'application/json'},body:JSON.stringify({model:a.id,messages:[{role:'user',content:'hi'}],stream:true,max_tokens:32})});const text=await response.text();assert.match(text,/upstream_incomplete/);assert.ok(f.db.award(f.user,a.id).reserved>0);
 await f.reconcile();await f.reconcile();assert.equal(f.db.award(f.user,a.id).remaining,999988);assert.equal(f.db.award(f.user,a.id).reserved,0);
});

test('missing generation ID escalates to manual review and remains reserved',async t=>{
 const f=await fixture(t,{gen:async()=>{throw Error('connection reset');}});await f.call('/internal/admin/pool',{supplier:'openrouter',entries:[entry]},'PUT');const a=(await f.call('/internal/spins',{})).data.award;
 await f.call('/v1/chat/completions',{model:a.id,messages:[{role:'user',content:'hi'}],max_tokens:32});await f.reconcile();const r=f.db.pendingRequests()[0];assert.equal(r.manual_review,1);assert.ok(f.db.award(f.user,a.id).reserved>0);
});

test('reconciliation does not settle nonterminal usage or double-count reasoning',async()=>{
 const p=new OpenRouterProvider('key',{fetcher:async()=>Response.json({data:{native_tokens_prompt:2,native_tokens_completion:3,total_cost:.001}})});assert.equal(await p.reconcile('gen',entry),null);
 assert.throws(()=>normalizeUsage({prompt_tokens:2,completion_tokens:3,total_tokens:7,cost:0},entry),/Inconsistent/);
});

test('model mismatch pauses inference and never substitutes silently',async t=>{
 const f=await fixture(t,{gen:async()=>Response.json({id:'gen-other',model:'other/model',choices:[],usage:{prompt_tokens:2,completion_tokens:3,cost:.00001}})});await f.call('/internal/admin/pool',{supplier:'openrouter',entries:[entry]},'PUT');const a=(await f.call('/internal/spins',{})).data.award;
 assert.equal((await f.call('/v1/chat/completions',{model:a.id,messages:[{role:'user',content:'hi'}]})).status,502);assert.equal(f.db.setting('inferenceEnabled'),'false');assert.equal(f.db.pendingRequests().length,1);
});

test('v0 migration preserves balances and quarantines uncertain legacy suppliers',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lootlm-migration-')),file=path.join(dir,'old.sqlite');
 try{
  const old=new DatabaseSync(file);old.exec(`CREATE TABLE pools(version TEXT PRIMARY KEY,body TEXT NOT NULL,created_at TEXT NOT NULL);
   CREATE TABLE settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);
   CREATE TABLE awards(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,pool_version TEXT NOT NULL,choice TEXT NOT NULL,total INTEGER NOT NULL,remaining INTEGER NOT NULL,reserved INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL);
   CREATE TABLE requests(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,award_id TEXT NOT NULL,idem TEXT NOT NULL,fingerprint TEXT NOT NULL,status TEXT NOT NULL,reserved_tokens INTEGER NOT NULL,reserved_usd REAL NOT NULL,input_tokens INTEGER,output_tokens INTEGER,cost REAL,provider_id TEXT,result TEXT,error TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,UNIQUE(user_id,idem));`);
  for(const [id,e] of [['demo',{...entry,inputPrice:0,outputPrice:0}],['legacy',entry]]){old.prepare('INSERT INTO pools VALUES(?,?,?)').run(id,JSON.stringify([e]),'2026-01-01');old.prepare('INSERT INTO awards VALUES(?,?,?,?,?,?,?,?)').run(id,'old-user',id,JSON.stringify(e),1000000,999000,50,'2026-01-01');}
  old.prepare('INSERT INTO settings VALUES(?,?)').run('pool','demo');old.close();
  const db=new Store(file,{...cfg(),provider:'demo'});assert.equal(db.award({id:'old-user'},'demo').supplier,'demo');assert.equal(db.award({id:'old-user'},'demo').remaining,999000);assert.equal(db.award({id:'old-user'},'legacy').supplier,'legacy_unknown');assert.equal(db.pool('openrouter').entries.length,0);db.close();
  const again=new Store(file,{...cfg(),provider:'demo'});assert.equal(again.award({id:'old-user'},'demo').reserved,50);again.close();
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});


test('dynamic aliases and image-generating models are excluded',()=>{
 for(const id of ['~vendor/model-latest','vendor/model-latest','openrouter/auto','vendor/model:free'])assert.throws(()=>modelInfo({...model,id}),e=>e.code==='dynamic_model');
 assert.throws(()=>modelInfo({...model,architecture:{...model.architecture,output_modalities:['text','image']}}),e=>e.code==='unsupported_model');
});

test('HTTP timeout remains uncertain and does not free its reservation',async t=>{
 const f=await fixture(t,{gen:async()=>new Response('{}',{status:408})});
 await f.call('/internal/admin/pool',{supplier:'openrouter',entries:[entry]},'PUT');const a=(await f.call('/internal/spins',{})).data.award;
 await f.call('/v1/chat/completions',{model:a.id,messages:[{role:'user',content:'hi'}],max_tokens:32});
 assert.equal(f.db.pendingRequests().length,1);assert.ok(f.db.award(f.user,a.id).reserved>0);
});

test('client disconnect still consumes upstream usage and settles exactly once',async t=>{
 let finish;const encoder=new TextEncoder();
 const f=await fixture(t,{gen:async()=>new Response(new ReadableStream({start(controller){
  controller.enqueue(encoder.encode('data: '+JSON.stringify({id:'gen-disconnect',model:model.id,choices:[{delta:{content:'hello'}}]})+'\n\n'));
  finish=()=>{controller.enqueue(encoder.encode('data: '+JSON.stringify({id:'gen-disconnect',model:model.id,choices:[],usage:{prompt_tokens:8,completion_tokens:4,total_tokens:12,cost:.000016}})+'\n\ndata: [DONE]\n\n'));controller.close();};
 }}))});
 await f.call('/internal/admin/pool',{supplier:'openrouter',entries:[entry]},'PUT');const a=(await f.call('/internal/spins',{})).data.award;
 const abort=new AbortController();const response=await fetch(f.url+'/v1/chat/completions',{method:'POST',signal:abort.signal,headers:{Authorization:`Bearer ${f.key}`,'Content-Type':'application/json'},body:JSON.stringify({model:a.id,messages:[{role:'user',content:'hi'}],stream:true,max_tokens:32})});
 const rid=response.headers.get('x-lootlm-request-id');await response.body.getReader().read();abort.abort();finish();
 for(let i=0;i<100&&f.db.request(rid).status!=='complete';i++)await new Promise(r=>setTimeout(r,10));
 assert.equal(f.db.request(rid).status,'complete');await f.reconcile();assert.equal(f.db.award(f.user,a.id).remaining,999988);assert.equal(f.db.award(f.user,a.id).reserved,0);
});
