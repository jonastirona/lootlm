import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {timingSafeEqual,randomUUID} from 'node:crypto';
import {modelInfo,reviewEntries,reservePlan} from './catalog.js';
import {config} from './config.js';
import {Store,Fault,hash} from './store.js';
import {DemoProvider,OpenRouterProvider} from './providers.js';
const dirname=path.dirname(fileURLToPath(import.meta.url));
const eq=(a,b)=>{const aa=Buffer.from(String(a)),bb=Buffer.from(String(b));return aa.length===bb.length&&timingSafeEqual(aa,bb);};
const reject=(status,code,message)=>{throw new Fault(status,code,message);};
export function createApp(cfg,options={}){
 const store=options.store||new Store(path.join(cfg.dataDir,'lootlm.sqlite'),cfg);
 const provider=options.provider||(cfg.provider==='openrouter'?new OpenRouterProvider(cfg.apiKey):new DemoProvider());
 const openrouter=options.openrouter||(cfg.provider==='openrouter'?provider:new OpenRouterProvider(cfg.apiKey));
 store.recover();
 const app=express();app.disable('x-powered-by');app.use(express.json({limit:'256kb'}));
 app.use((req,res,next)=>{
  res.set({'X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin','Cache-Control':'no-store','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"});
  if(!['GET','HEAD','OPTIONS'].includes(req.method)&&req.get('origin')&&req.get('origin')!==cfg.origin)return res.status(403).json({error:{code:'origin_rejected',message:`Use the configured origin ${cfg.origin}.`}});
  next();
 });
 const attempts=new Map();
 app.post('/auth/login',(req,res)=>{
  for(const [ip,value] of attempts)if(value.until<Date.now())attempts.delete(ip);
  const address=req.ip;let bucket=attempts.get(address);if(!bucket||bucket.until<Date.now()){bucket={n:0,until:Date.now()+60000};attempts.set(address,bucket);}if(++bucket.n>10)reject(429,'login_limit','Too many sign-in attempts. Try again in a minute.');
  req.body??={};
  const email=String(req.body.email||'').trim().toLowerCase();
  if(!cfg.testers.includes(email)||!eq(req.body.code||'',cfg.accessCode))reject(401,'invalid_login','Email or access code is incorrect.');
  const user=store.user(email);
  if(req.body.cli===true){if(store.keys(user).length>=20)reject(400,'key_limit','Revoke an old key with `loot keys revoke` before logging in another CLI.');const key=store.credential(user,'key','LootLM CLI');return res.json({user,key:key.key});}
  const session=store.credential(user,'session','Browser');
  res.cookie('lootlm_session',session.key,{httpOnly:true,sameSite:'strict',secure:cfg.secureCookie,maxAge:7*86400000,path:'/'});
  res.json({user});
 });
 app.get('/health',(_req,res)=>res.json({ok:true,provider:cfg.provider,version:'0.8.0'}));
 app.use(['/v1','/internal','/auth/logout'],(req,res,next)=>{
  const bearer=req.get('authorization')?.match(/^Bearer (.+)$/)?.[1];
  const cookie=req.headers.cookie?.split(';').map(s=>s.trim()).find(s=>s.startsWith('lootlm_session='))?.slice(15);
  const user=store.authenticate(bearer||cookie);
  if(!user||!cfg.testers.includes(user.email))return res.status(401).json({error:{code:'unauthorized',message:'Sign in or provide a valid LootLM API key.'}});
  req.user=user;next();
 });
 const admin=(req,_res,next)=>{if(!cfg.admins.includes(req.user.email))reject(403,'admin_required','Administrator access required.');next();};
 app.post('/auth/logout',(req,res)=>{store.revoke(req.user,req.user.credential_id);res.clearCookie('lootlm_session',{path:'/'});res.json({ok:true});});
 app.get('/internal/download',(req,res)=>{const file=path.join(dirname,'../../lootlm-0.8.0.tgz');if(!fs.existsSync(file))reject(404,'package_missing','Build the CLI artifact with npm run package first.');res.download(file,'lootlm-0.8.0.tgz');});
 app.get('/internal/me',(req,res)=>res.json({user:{id:req.user.id,email:req.user.email},admin:cfg.admins.includes(req.user.email),provider:cfg.provider,liveEnabled:cfg.liveEnabled,maxOutput:cfg.maxOutput,dailyUsd:cfg.dailyUsd}));
 app.get('/internal/pool',(req,res)=>{const supplier=req.query.supplier||cfg.provider;if(!['demo','openrouter'].includes(supplier))reject(400,'invalid_supplier','Unknown supplier.');const pool=store.pool(supplier),total=pool.entries.reduce((n,e)=>n+e.weight,0);res.json({...pool,entries:pool.entries.map(e=>({...e,probability:e.weight/total})),tokens:1000000});});
 const idem=req=>{const value=req.get('idempotency-key');if(!value||value.length>150||!/^[-a-zA-Z0-9_:]+$/.test(value))reject(400,'idempotency_required','Send an Idempotency-Key header (up to 150 characters).');return value;};
 app.post('/internal/spins',(req,res)=>{if(cfg.provider==='openrouter'&&(!cfg.liveEnabled||!cfg.apiKey))reject(503,'live_disabled','Configure and enable OpenRouter before granting live awards.');res.json(store.spin(req.user,idem(req)));});
 app.get('/v1/allowances',(req,res)=>res.json({data:store.awards(req.user)}));
 app.get('/v1/models',(req,res)=>res.json({object:'list',data:store.awards(req.user).filter(a=>a.available>0&&a.supplier===cfg.provider).map(a=>({id:a.id,object:'model',created:Math.floor(Date.parse(a.created_at)/1000),owned_by:'lootlm',underlying_model:a.choice.model,supplier:a.supplier,capabilities:a.choice.capabilities||null,remaining_tokens:a.remaining,available_tokens:a.available}))}));
 app.get('/v1/requests/:id',(req,res)=>res.json(store.requestFor(req.user,req.params.id)));
 app.get('/v1/usage',(req,res)=>res.json({data:store.usage(req.user)}));
 app.get('/internal/api-keys',(req,res)=>res.json({data:store.keys(req.user)}));
 app.post('/internal/api-keys',(req,res)=>{if(store.keys(req.user).length>=20)reject(400,'key_limit','Revoke a key before creating another.');res.status(201).json(store.credential(req.user,'key',String(req.body.name||'API key').slice(0,80)));});
 app.delete('/internal/api-keys/:id',(req,res)=>res.json({revoked:!!store.revoke(req.user,req.params.id)}));
 app.get('/internal/admin',admin,(_req,res)=>res.json(store.stats()));
 app.patch('/internal/admin',admin,(req,res)=>{
  for(const k of Object.keys(req.body))if(!['spinsEnabled','inferenceEnabled','rareEnabled'].includes(k)||typeof req.body[k]!=='boolean')reject(400,'invalid_setting','Expected boolean admin switches.');
  store.tx(()=>{for(const [k,v] of Object.entries(req.body))store.set(k,v);store.audit(req.user.id,'settings.update',req.body);});res.json(store.stats());
 });

 app.get('/internal/admin/openrouter',admin,async(_req,res)=>{
  const connection=await openrouter.connection();res.json({...connection,provider:cfg.provider,liveEnabled:cfg.liveEnabled,dailyUsd:cfg.dailyUsd,poolReady:store.pool('openrouter').entries.length>0});
 });
 app.get('/internal/admin/catalog',admin,async(_req,res)=>{
  const rows=await openrouter.catalog();const data=[];
  for(const raw of rows){try{if(raw.id.includes(':')||raw.id.startsWith('openrouter/'))continue;data.push(modelInfo(raw));}catch{/* Unsupported pricing or non-text model: not eligible. */}}
  res.json({data,cachedAt:openrouter.cached?.at||null});
 });
 app.post('/internal/admin/pool/preview',admin,async(req,res)=>{
  if(!Array.isArray(req.body?.entries))reject(400,'invalid_pool','Supply entries.');
  const catalog=await openrouter.catalog();
  const entries=req.body.entries.map(e=>{const m=catalog.find(m=>m.id===e.model);if(!m)reject(400,'unknown_model',`Unavailable: ${e.model}`);const info=modelInfo(m);return {...e,inputPrice:info.inputCeiling,outputPrice:info.outputCeiling};});
  res.json({supplier:'openrouter',entries:await reviewEntries(openrouter,entries)});
 });
 app.put('/internal/admin/pool',admin,async(req,res)=>{
  const supplier=req.body?.supplier||cfg.provider;if(!['demo','openrouter'].includes(supplier))reject(400,'invalid_supplier','Unknown supplier.');
  const entries=supplier==='openrouter'?await reviewEntries(openrouter,req.body.entries):req.body.entries;
  const version=store.publishPool(entries,req.user.id,supplier);res.json({version,supplier});
 });
 app.post('/internal/admin/requests/:id/retry',admin,(req,res)=>{store.retryNow(req.params.id,req.user.id);res.json({ok:true});});
 app.post('/internal/admin/resolve',admin,(req,res)=>{
  const {requestId,input,output,cost,note}=req.body;
  if(typeof note!=='string'||note.length<10)reject(400,'note_required','Document the verified upstream evidence (at least 10 characters).');
  const r=store.request(requestId);if(!r||r.status!=='pending')reject(400,'not_pending','Only pending requests can be resolved.');
  if(!Number.isSafeInteger(input)||input<0||!Number.isSafeInteger(output)||output<0||!Number.isFinite(cost)||cost<0)reject(400,'invalid_usage','Supply verified nonnegative input, output and cost.');
  store.settle(requestId,{input,output,cost});store.audit(req.user.id,'request.manual_resolution',{requestId,input,output,cost,note});res.json({ok:true});
 });
 app.post('/v1/chat/completions',async(req,res)=>{
  const b=req.body||{};
  const supported=['model','messages','stream','stream_options','max_tokens','max_completion_tokens','temperature','top_p','tools','tool_choice','parallel_tool_calls','stop'];
  for(const key of Object.keys(b))if(!supported.includes(key))reject(400,'unsupported_parameter',`Unsupported parameter: ${key}`);
  if(typeof b.model!=='string'||!Array.isArray(b.messages)||!b.messages.length||b.messages.length>100)reject(400,'invalid_request','Supply an award model ID and 1–100 messages.');
  for(const m of b.messages){if(!m||!['system','developer','user','assistant','tool'].includes(m.role)||(typeof m.content!=='string'&&!(m.role==='assistant'&&m.content===null&&Array.isArray(m.tool_calls))))reject(400,'unsupported_message','MVP supports text messages and assistant tool calls only.');}
  if(b.stream!==undefined&&typeof b.stream!=='boolean')reject(400,'invalid_stream','stream must be boolean.');
  if(b.tools!==undefined&&(!Array.isArray(b.tools)||b.tools.length>20||b.tools.some(t=>t.type!=='function'||typeof t.function?.name!=='string')))reject(400,'invalid_tools','Supply up to 20 function tools.');
  for(const key of ['temperature','top_p'])if(b[key]!==undefined&&(!Number.isFinite(b[key])||b[key]<0||b[key]>(key==='temperature'?2:1)))reject(400,'invalid_parameter',`Invalid ${key}.`);

  if(b.max_tokens!==undefined&&b.max_completion_tokens!==undefined)reject(400,'ambiguous_limit','Supply only one output token limit.');
  const award=store.award(req.user,b.model);
  if(cfg.provider==='openrouter'&&(!cfg.liveEnabled||!cfg.apiKey))reject(503,'live_disabled','Live inference requires OPENROUTER_API_KEY and LOOTLM_LIVE_ENABLED=true.');
  if(award.supplier!==cfg.provider)reject(409,'supplier_mismatch',`This is a ${award.supplier} allowance; the server is in ${cfg.provider} mode. Select a matching allowance.`);
  const capabilities=award.supplier==='openrouter'?(await reviewEntries(openrouter,[award.choice]))[0].capabilities:null;
  const plan=reservePlan(b,award,cfg,capabilities),max=plan.max;
  const fingerprint=hash(JSON.stringify(b));const requestIdem=req.get('idempotency-key')?idem(req):randomUUID();
  const entry=store.reserve(req.user,b.model,requestIdem,fingerprint,plan.tokens,plan.dollars,plan.priceSnapshot);
  if(entry.prior){
   if(entry.prior.status==='complete')reject(409,'already_completed','This request already completed. Inspect /v1/usage; content is not retained for replay.');
   reject(409,'request_exists',`Request already exists (${entry.prior.status}); it will not be sent twice.`);
  }
  const rid=entry.request.id;res.set('X-LootLM-Request-Id',rid);res.set('X-LootLM-Max-Output',String(max));res.set('X-LootLM-Model',award.choice.model);
  const payload={...b,model:award.choice.model,max_tokens:max};delete payload.max_completion_tokens;
  let disconnected=false;res.on('close',()=>{disconnected=true;});
  const chunk=b.stream?(event)=>{
   if(disconnected)return;
   if(!res.headersSent)res.set({'Content-Type':'text/event-stream','Connection':'keep-alive','Cache-Control':'no-cache'});
   res.write(`data: ${JSON.stringify({...event,id:rid,model:b.model,lootlm_model:award.choice.model})}\n\n`);
  }:null;
  try{
   const generated=await provider.generate(payload,award.choice,{onChunk:chunk,onId:pid=>store.providerId(rid,pid)});
   store.settle(rid,generated.usage); // Do not persist prompts or completion contents.
   if(disconnected)return;
   if(b.stream){chunk({id:rid,object:'chat.completion.chunk',choices:[],usage:{prompt_tokens:generated.usage.input,completion_tokens:generated.usage.output,total_tokens:generated.usage.input+generated.usage.output}});res.end('data: [DONE]\n\n');}
   else res.json({...generated.response,model:b.model,lootlm_model:award.choice.model,lootlm_request_id:rid});
  }catch(e){
   if(e.code==='model_mismatch'){store.set('inferenceEnabled','false');store.audit('system','provider.model_mismatch',{rid});}
   if(e.safeToRelease)store.release(rid,e.message);else store.pending(rid,'Awaiting provider usage reconciliation');
   if(disconnected)return;
   if(res.headersSent){res.write(`data: ${JSON.stringify({error:{code:'upstream_incomplete',message:'Request incomplete; usage reconciliation is pending.',request_id:rid}})}\n\n`);res.end('data: [DONE]\n\n');}
   else res.status(e.status||502).json({error:{code:e.code||'upstream_incomplete',message:e.safeToRelease?e.message:'Upstream request incomplete. Reserved tokens remain held until reconciliation.',request_id:rid}});
  }
 });
 app.use((_req,res)=>res.status(404).json({error:{code:'not_found',message:'LootLM is a terminal-only product. Run `loot help`.'}}));
 app.use((error,_req,res,_next)=>{if(res.headersSent)return res.end();res.status(error.status||500).json({error:{code:error.code||'internal_error',message:error.status?error.message:'Internal server error.'}});if(!error.status)console.error(error);});
 let reconciling=false;
 const reconcile=async()=>{
  if(reconciling)return;reconciling=true;

  try{for(const r of store.dueRequests()){
   if(!r.provider_id){store.retryLater(r.id,'No upstream generation ID; verify upstream activity manually.',true);continue;}
   if(r.supplier==='legacy_unknown'||r.supplier==='demo'&&cfg.provider!=='demo'){store.retryLater(r.id,'This environment needs manual reconciliation.',true);continue;}
   const adapter=r.supplier==='openrouter'?openrouter:provider;
   if(r.supplier==='openrouter'&&!cfg.apiKey){store.retryLater(r.id,'OpenRouter key is not configured.');continue;}
   try{const a=store.award({id:r.user_id},r.award_id);const usage=await adapter.reconcile(r.provider_id,a.choice);
    if(usage)store.settle(r.id,usage);else store.retryLater(r.id,'Upstream usage is not finalized or available.');
   }catch(e){store.retryLater(r.id,e.code==='model_mismatch'?'Upstream model does not match the award.':'Provider reconciliation failed.',e.code==='model_mismatch');}
  }}finally{reconciling=false;}

 };
 return {app,store,reconcile};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{process.loadEnvFile();}catch{}
 const cfg=config();if(!['demo','openrouter'].includes(cfg.provider))throw Error('Unknown provider');
 const {app,store,reconcile}=createApp(cfg);
 const server=app.listen(cfg.port,cfg.host,()=>console.log(`\nLootLM · ${cfg.provider.toUpperCase()} · internal testing\n${cfg.origin}\nLogin: ${cfg.testers[0]}\nAccess code: ${path.join(cfg.dataDir,'access-code')} (or configured LOOTLM_ACCESS_CODE)\nDaily live budget: $${cfg.dailyUsd}\n`));
 const timer=setInterval(reconcile,30000);timer.unref();
 for(const sig of ['SIGINT','SIGTERM'])process.on(sig,()=>{clearInterval(timer);server.close(()=>{store.close();process.exit(0);});setTimeout(()=>process.exit(1),10000).unref();});
}
