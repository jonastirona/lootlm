#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createInterface} from 'node:readline/promises';
import {stdin,stdout,stderr} from 'node:process';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const raw=process.argv.slice(2);const flags={};const args=[];
for(let i=0;i<raw.length;i++){const x=raw[i];if(x.startsWith('--')){const [k,v]=x.slice(2).split('=',2);if(['url','email','model','max-tokens','name','id','file','input','output','cost','note'].includes(k)){flags[k]=v??raw[++i];if(!flags[k]||flags[k].startsWith('--'))throw Error(`--${k} needs a value`);}else flags[k]=v??true;}else args.push(x);}
const cmd=args.shift()||'help';
const dir=process.env.LOOTLM_CONFIG_DIR||path.join(os.homedir(),'.config','lootlm');const configFile=path.join(dir,'config.json');
let cfg={};try{cfg=JSON.parse(fs.readFileSync(configFile,'utf8'));}catch(e){if(e.code!=='ENOENT')throw Error(`Cannot read ${configFile}: ${e.message}`);}
const color=stdout.isTTY&&!process.env.NO_COLOR&&!flags.json;
const safeText=s=>String(s).replace(/[\x00-\x08\x0b-\x1f\x7f-\x9f]/g,'');
const c=(code,s)=>color?`\x1b[${code}m${safeText(s)}\x1b[0m`:safeText(s);
const lime=s=>c('38;5;191',s),dim=s=>c('2',s),bold=s=>c('1',s);
const fmt=n=>new Intl.NumberFormat('en-US').format(n);
const writeConfig=()=>{fs.mkdirSync(dir,{recursive:true,mode:0o700});const temp=configFile+'.tmp';fs.writeFileSync(temp,JSON.stringify(cfg,null,2)+'\n',{mode:0o600});fs.renameSync(temp,configFile);fs.chmodSync(configFile,0o600);};
function base(){const value=flags.url||process.env.LOOTLM_URL||cfg.url||'http://localhost:3131';const u=new URL(value);if(u.protocol!=='https:'&&!(u.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(u.hostname)))throw Error('Remote servers require HTTPS.');if(u.username||u.password||u.search||u.hash)throw Error('Use a clean server URL without credentials or query parameters.');return value.replace(/\/$/,'');}
async function api(endpoint,{body,method,headers={}}={}){
 const key=process.env.LOOTLM_API_KEY||cfg.key;
 if(!key&&endpoint!=='/auth/login')throw Error('Run lootlm login first, or set LOOTLM_API_KEY.');
 // Do not send a saved key to a different host via an accidental --url override.
 if(key===cfg.key&&cfg.url&&new URL(base()).origin!==new URL(cfg.url).origin&&endpoint!=='/auth/login')throw Error('Saved credentials belong to another server. Log in to this URL first.');
 const response=await fetch(base()+endpoint,{method:method||(body?'POST':'GET'),headers:{'Content-Type':'application/json',...(key?{Authorization:`Bearer ${key}`}:{ }),...headers},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(200000),redirect:'error'});
 if(!response.ok){let data;try{data=await response.json();}catch{}const error=new Error(data?.error?.message||`HTTP ${response.status}`);error.code=data?.error?.code;throw error;}return response;
}
const json=async(endpoint,options)=>await(await api(endpoint,options)).json();
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function banner(){stdout.write(lime(`\n  ▄▄▄  lootlm\n  █▄   `)+dim('THE MODEL ARCADE')+'\n\n');}
async function question(prompt,secret=false){
 if(!stdin.isTTY)throw Error('Interactive login needs a terminal. For automation, set LOOTLM_API_KEY or LOOTLM_ACCESS_CODE with --email.');
 if(!secret){const r=createInterface({input:stdin,output:stdout});try{return await r.question(prompt);}finally{r.close();}}
 stdout.write(prompt);stdin.setRawMode(true);stdin.resume();let text='';
 return new Promise((resolve,reject)=>{const done=()=>{stdin.setRawMode(false);stdin.off('data',read);stdin.pause();stdout.write('\n');};const read=buf=>{for(const char of buf.toString()){if(char==='\r'||char==='\n'){done();resolve(text);return;}if(char==='\u0003'){done();reject(Error('Canceled'));return;}if(char==='\u007f'){text=text.slice(0,-1);}else if(char>=' ')text+=char;}};stdin.on('data',read);});
}
function table(rows){if(!rows.length){stdout.write(dim('  Nothing here yet.\n'));return;}const widths=rows[0].map((_,i)=>Math.max(...rows.map(r=>String(r[i]).length)));for(let n=0;n<rows.length;n++)stdout.write('  '+rows[n].map((v,i)=>safeText(v).padEnd(widths[i])).join('   ')+'\n');}
async function animation(award){
 if(flags.json||flags['no-animation']||!stdout.isTTY||(stdout.columns&&stdout.columns<48)||process.env.LOOTLM_REDUCED_MOTION==='1')return;
 const symbols=['*','+','#','@','%','&'];const final={bust:'.',common:'*',strong:'#',rare:'@'}[award.choice.tier];
 const started=Date.now();let rendered=false;stdout.write('\x1b[?25l');
 const restore=()=>stdout.write('\x1b[?25h');process.once('SIGINT',()=>{restore();process.exit(130);});
 try{
  for(let frame=0;frame<39;frame++){
   const elapsed=Date.now()-started;const cells=[0,1,2].map((_,i)=>frame>=19+i*7?final:symbols[(frame+i*2)%symbols.length]);
   const locked=[0,1,2].map(i=>frame>=19+i*7);const progress=Math.min(24,Math.floor(frame/38*24));
   const lines=[lime('  +-----------------------------------------+'),lime('  |')+'               '+bold('L O O T L M')+'               '+lime('|'),lime('  |')+dim('         ONE MILLION POSSIBILITIES        ')+lime('|'),lime('  +-------------+-------------+-------------+'),
    lime('  |')+cells.map((x,i)=>`     ${locked[i]?lime(x):bold(x)}       `).join(lime('|'))+lime('|'),
    lime('  |')+cells.map((_,i)=>`   ${locked[i]?'LOCKED':'ROLL  '}    `).join(lime('|'))+lime('|'),lime('  +-------------+-------------+-------------+'),'',
    '  '+lime('━'.repeat(progress))+dim('─'.repeat(24-progress))+`  ${frame<19?'CHARGING':frame<33?'REVEALING':'UNLOCKED!'}   `,
    '  '+dim(frame<19?'Your next brain is on the way.':frame<33?'A million tokens. A new possibility.':'Go make something brilliant.          ')];
   if(rendered)stdout.write(`\x1b[${lines.length}A`);for(const line of lines)stdout.write('\x1b[2K'+line+'\n');rendered=true;
   await sleep(frame>30?90:frame>18?65:40);
  }
 }finally{restore();}
}
function result(award,replayed=false){const tier=award.choice.tier.toUpperCase();stdout.write('\n'+lime('  ✦ '+tier+' UNLOCKED')+(replayed?dim('  (recovered roll)'):'')+'\n');stdout.write('  '+bold(award.choice.name)+'\n  '+dim(award.choice.model)+'\n\n  '+lime(fmt(award.remaining))+' tokens in your vault.\n  '+dim(award.id)+'\n\n  '+dim('Next: ')+`lootlm chat "What should we build?"\n\n`);}
async function main(){
 if(cmd==='help'||flags.help){stdout.write(`\nLootLM — your terminal model arcade\n\n  lootlm login [--url URL] [--email EMAIL]\n  lootlm roll [--no-animation] [--json]\n  lootlm inventory [--json]\n  lootlm use <award_id>\n  lootlm chat "prompt" [--model award_id] [--max-tokens 256] [--json]\n  lootlm odds [--json]\n  lootlm usage [--json]\n  lootlm keys list|create|revoke [--name NAME] [--id ID]\n  lootlm config\n  lootlm logout\n  lootlm serve           Start the private server in the current directory\n  lootlm admin status|pause|resume|pool|resolve\n\nEnvironment: LOOTLM_URL, LOOTLM_API_KEY, LOOTLM_ACCESS_CODE,\nLOOTLM_CONFIG_DIR, LOOTLM_REDUCED_MOTION=1, NO_COLOR=1.\n\nInternal testing only. No purchases or cash redemption.\n`);return;}
 if(cmd==='serve'){const {spawn}=await import('node:child_process');const p=spawn(process.execPath,[fileURLToPath(new URL('./server.js',import.meta.url))],{stdio:'inherit',env:process.env});p.on('exit',code=>process.exit(code||0));return;}
 if(cmd==='login'){
  const url=base();const email=flags.email||await question('Email [demo@lootlm.local]: ')||'demo@lootlm.local';const code=process.env.LOOTLM_ACCESS_CODE||await question('Access code (hidden): ',true);
  const data=await json('/auth/login',{body:{email,code,cli:true}});cfg={url,key:data.key,email:data.user.email};writeConfig();if(flags.json)stdout.write(JSON.stringify({ok:true,email,url})+'\n');else{banner();stdout.write(`  Signed in as ${email}\n  Credentials saved with owner-only permissions.\n\n  Start with ${lime('lootlm roll')}\n\n`);}return;
 }
 if(cmd==='logout'){if(cfg.key){try{const keys=(await json('/internal/api-keys')).data;const own=keys.find(k=>cfg.key.startsWith(k.prefix));if(own)await json(`/internal/api-keys/${own.id}`,{method:'DELETE'});}catch{stderr.write('Could not revoke remotely. Revoke the CLI key in the dashboard.\n');}}cfg={url:cfg.url};writeConfig();stdout.write('Signed out locally.\n');return;}
 if(cmd==='config'){stdout.write(JSON.stringify({url:base(),email:cfg.email,model:cfg.model,authenticated:!!(cfg.key||process.env.LOOTLM_API_KEY),configFile},null,2)+'\n');return;}
 if(cmd==='roll'){
  const info=await json('/internal/me');if(!flags.json){banner();stdout.write(dim(`  ${info.provider==='demo'?'DEMO PROVIDER · SIMULATED INFERENCE':'LIVE PROVIDER · SHARED SPEND CAP'}\n  Internal test roll. No payment.\n\n`));}
  const rollId=cfg.pendingRoll||randomUUID();cfg.pendingRoll=rollId;writeConfig();
  const data=await json('/internal/spins',{body:{},headers:{'Idempotency-Key':rollId}});cfg.pendingRoll=null;cfg.model=data.award.id;writeConfig();await animation(data.award);if(flags.json)stdout.write(JSON.stringify(data)+'\n');else result(data.award,data.replayed);return;
 }
 if(cmd==='inventory'||cmd==='vault'){
  const data=await json('/v1/allowances');if(flags.json){stdout.write(JSON.stringify(data)+'\n');return;}banner();table([['MODEL','TIER','AVAILABLE','AWARD'],...data.data.map(a=>[a.choice.name,a.choice.tier,fmt(a.available),a.id+(cfg.model===a.id?' *':'')])]);stdout.write('\n  '+dim('* selected · lootlm use <award_id>')+'\n\n');return;
 }
 if(cmd==='use'){const aid=args[0];const a=(await json('/v1/allowances')).data.find(a=>a.id===aid);if(!a)throw Error('Allowance not found. Run lootlm inventory.');cfg.model=aid;writeConfig();stdout.write(`Selected ${a.choice.name} (${aid}).\n`);return;}
 if(cmd==='odds'){const data=await json('/internal/pool');if(flags.json)stdout.write(JSON.stringify(data)+'\n');else{banner();table([['MODEL','TIER','CHANCE'],...data.entries.map(e=>[e.name,e.tier,`${(e.probability*100).toFixed(1)}%`])]);stdout.write(`\n  Each roll grants ${fmt(data.tokens)} tokens.\n  ${dim(data.version)}\n\n`);}return;}
 if(cmd==='usage'){const data=await json('/v1/usage');if(flags.json)stdout.write(JSON.stringify(data)+'\n');else table([['REQUEST','STATUS','INPUT','GENERATED','COST'],...data.data.map(r=>[r.id,r.status,r.input_tokens??'—',r.output_tokens??'—',r.cost===null?'—':`$${r.cost.toFixed(6)}`])]);return;}
 if(cmd==='keys'){
  const sub=args[0]||'list';if(sub==='list'){const data=await json('/internal/api-keys');if(flags.json)stdout.write(JSON.stringify(data)+'\n');else table([['ID','NAME','PREFIX'],...data.data.map(k=>[k.id,k.name,k.prefix+'…'])]);}
  else if(sub==='create'){const k=await json('/internal/api-keys',{body:{name:flags.name||'CLI-created key'}});stdout.write(flags.json?JSON.stringify(k)+'\n':`Copy now; shown only once:\n${k.key}\n`);}
  else if(sub==='revoke'){if(!flags.id)throw Error('Use --id key_ID');stdout.write(JSON.stringify(await json(`/internal/api-keys/${encodeURIComponent(flags.id)}`,{method:'DELETE'}))+'\n');}
  else throw Error('keys list|create|revoke');return;
 }
 if(cmd==='chat'){
  const prompt=args.join(' ');if(!prompt)throw Error('Use lootlm chat "your prompt".');const model=flags.model||cfg.model;if(!model)throw Error('Roll or select an allowance first.');
  const body={model,messages:[{role:'user',content:prompt}],max_tokens:Number(flags['max-tokens']||256),stream:!flags.json};
  const response=await api('/v1/chat/completions',{body,headers:{'Idempotency-Key':randomUUID()}});
  if(flags.json){stdout.write(JSON.stringify(await response.json())+'\n');return;}
  let buffer='',usage=null;const decoder=new TextDecoder();stdout.write('\n');
  const consume=line=>{if(!line.startsWith('data:'))return;const value=line.slice(5).trim();if(!value||value==='[DONE]')return;const data=JSON.parse(value);if(data.error)throw Error(data.error.message);if(data.usage)usage=data.usage;const delta=data.choices?.[0]?.delta;if(delta?.content)stdout.write(safeText(delta.content));if(delta?.tool_calls)stdout.write(JSON.stringify(delta.tool_calls));};
  for await(const chunk of response.body){buffer+=decoder.decode(chunk,{stream:true});let n;while((n=buffer.indexOf('\n'))>=0){consume(buffer.slice(0,n));buffer=buffer.slice(n+1);}}
  buffer+=decoder.decode();if(buffer.trim())consume(buffer);stdout.write('\n\n'+dim(usage?`${fmt(usage.prompt_tokens)} input + ${fmt(usage.completion_tokens)} generated tokens`:'Usage pending reconciliation')+'\n');return;
 }
 if(cmd==='admin'){
  const sub=args[0]||'status';let data;
  if(sub==='status')data=await json('/internal/admin');
  else if(sub==='pause'||sub==='resume')data=await json('/internal/admin',{method:'PATCH',body:{inferenceEnabled:sub==='resume',spinsEnabled:sub==='resume'}});
  else if(sub==='pool'){if(!flags.file)throw Error('Use --file pool.json');const body=JSON.parse(fs.readFileSync(flags.file,'utf8'));data=await json('/internal/admin/pool',{method:'PUT',body:{entries:Array.isArray(body)?body:body.entries}});}
  else if(sub==='resolve'){data=await json('/internal/admin/resolve',{body:{requestId:flags.id,input:Number(flags.input),output:Number(flags.output),cost:Number(flags.cost),note:flags.note}});}
  else throw Error('admin status|pause|resume|pool --file FILE|resolve --id ID --input N --output N --cost USD --note EVIDENCE');
  stdout.write(JSON.stringify(data,null,2)+'\n');return;
 }
 throw Error(`Unknown command: ${cmd}. Run lootlm help.`);
}
main().catch(e=>{if(flags.json)stderr.write(JSON.stringify({error:{code:e.code||'cli_error',message:e.message}})+'\n');else stderr.write(c('31',`\n  ${e.message}`)+'\n\n');process.exitCode=1;});
