#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createInterface} from 'node:readline/promises';
import {stdin,stdout,stderr} from 'node:process';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';

const raw=process.argv.slice(2);
const flags={};
const args=[];
for(let i=0;i<raw.length;i++){
 const x=raw[i];
 if(x.startsWith('--')){
  const [key,inline]=x.slice(2).split('=',2);
  if(['url','email','model','max-tokens','name','id','file','input','output','cost','note'].includes(key)){
   flags[key]=inline??raw[++i];
   if(!flags[key]||flags[key].startsWith('--'))throw Error(`--${key} needs a value`);
  }else flags[key]=inline??true;
 }else args.push(x);
}

const requested=args.shift();
const cmd=flags.help?'help':requested||(stdin.isTTY?'play':'help');
const configDir=process.env.LOOTLM_CONFIG_DIR||path.join(os.homedir(),'.config','lootlm');
const configFile=path.join(configDir,'config.json');
let cfg={};
try{cfg=JSON.parse(fs.readFileSync(configFile,'utf8'));}
catch(error){if(error.code!=='ENOENT')throw Error(`Cannot read ${configFile}: ${error.message}`);}

const color=stdout.isTTY&&!process.env.NO_COLOR&&!flags.json;
const safeText=value=>String(value).replace(/[\x00-\x08\x0b-\x1f\x7f-\x9f]/g,'');
const paint=(code,value)=>color?`\x1b[${code}m${safeText(value)}\x1b[0m`:safeText(value);
const lime=value=>paint('38;5;191',value);
const neutral=value=>paint('38;5;250',value);
const green=value=>paint('38;5;114',value);
const blue=value=>paint('38;5;75',value);
const purple=value=>paint('38;5;141',value);
const orange=value=>paint('38;5;214',value);
const gold=orange;
const violet=purple;
const red=value=>paint('38;5;203',value);
const dim=value=>paint('2',value);
const bold=value=>paint('1',value);
const fmt=value=>new Intl.NumberFormat('en-US').format(Number(value)||0);
const compact=value=>{
 const number=Number(value)||0;
 if(number>=1000000)return `${(number/1000000).toFixed(number%1000000?1:0)}m`;
 if(number>=100000)return `${Math.floor(number/1000)}k`;
 if(number>=1000){const scaled=(number/1000).toFixed(1);return `${scaled.endsWith('.0')?scaled.slice(0,-2):scaled}k`;}
 return fmt(number);
};
const moneyMinor=value=>`$${(Number(value)/100).toFixed(2)}`;
const short=value=>String(value||'').replace(/^[^_]+_/,'').slice(-8);
const termWidth=()=>Math.max(44,Math.min(stdout.columns||88,100));
const rarities={
 common:{label:'COMMON',glyph:'◆',paint:neutral},
 uncommon:{label:'UNCOMMON',glyph:'⬟',paint:green},
 rare:{label:'RARE',glyph:'✦',paint:blue},
 epic:{label:'EPIC',glyph:'✧',paint:purple},
 legendary:{label:'LEGENDARY',glyph:'✹',paint:orange}
};
// Temporary compatibility for Jonas's four-tier prototype pool.
const legacyRarities={bust:'common',strong:'epic'};
const tier=value=>rarities[value]||rarities[legacyRarities[value]]||{label:String(value||'MODEL').toUpperCase(),glyph:'◆',paint:neutral};
const ratio=(value,total)=>total>0?Math.max(0,Math.min(1,value/total)):0;
const meter=(value,total,width=18)=>{
 const full=Math.round(ratio(value,total)*width);
 return lime('━'.repeat(full))+dim('─'.repeat(width-full));
};
const label=(name,value)=>`  ${dim(String(name).toUpperCase().padEnd(11))}${value}\n`;
const projectName=()=>path.basename(process.cwd())||'/';

function writeConfig(){
 fs.mkdirSync(configDir,{recursive:true,mode:0o700});
 const temp=configFile+'.tmp';
 fs.writeFileSync(temp,JSON.stringify(cfg,null,2)+'\n',{mode:0o600});
 fs.renameSync(temp,configFile);
 fs.chmodSync(configFile,0o600);
}
function base(){
 const value=flags.url||process.env.LOOTLM_URL||cfg.url||'http://localhost:3131';
 const url=new URL(value);
 if(url.protocol!=='https:'&&!(url.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(url.hostname)))throw Error('Remote servers require HTTPS.');
 if(url.username||url.password||url.search||url.hash)throw Error('Use a clean server URL without credentials or query parameters.');
 return value.replace(/\/$/,'');
}
async function api(endpoint,{body,method,headers={}}={}){
 const key=process.env.LOOTLM_API_KEY||cfg.key;
 if(!key&&endpoint!=='/auth/login')throw Error('Run loot login first, or set LOOTLM_API_KEY.');
 if(key===cfg.key&&cfg.url&&new URL(base()).origin!==new URL(cfg.url).origin&&endpoint!=='/auth/login')throw Error('Saved credentials belong to another server. Log in to this URL first.');
 const response=await fetch(base()+endpoint,{
  method:method||(body?'POST':'GET'),
  headers:{'Content-Type':'application/json',...(key?{Authorization:`Bearer ${key}`}:{ }),...headers},
  body:body?JSON.stringify(body):undefined,
  signal:AbortSignal.timeout(200000),
  redirect:'error'
 });
 if(!response.ok){
  let data;
  try{data=await response.json();}catch{}
  const error=new Error(data?.error?.message||`HTTP ${response.status}`);
  error.code=data?.error?.code;
  throw error;
 }
 return response;
}
const json=async(endpoint,options)=>await(await api(endpoint,options)).json();
const sleep=milliseconds=>new Promise(resolve=>setTimeout(resolve,milliseconds));

function brand(mode){
 const badge=mode?`  ${dim('[')}${mode==='demo'?gold('DEMO'):lime('LIVE')}${dim(']')}`:'';
 stdout.write(`\n  ${lime('◈')}  ${bold('lootlm')}  ${dim('/ STOCHASTIC INFERENCE')}${badge}\n  ${dim('roll a brain. keep the work.')}\n\n`);
}
function rule(){stdout.write('  '+dim('─'.repeat(Math.min(58,termWidth()-4)))+'\n');}
async function question(prompt,secret=false){
 if(!stdin.isTTY)throw Error('Interactive login needs a terminal. For automation, set LOOTLM_API_KEY or LOOTLM_ACCESS_CODE with --email.');
 if(!secret){
  const reader=createInterface({input:stdin,output:stdout});
  try{return await reader.question(prompt);}finally{reader.close();}
 }
 stdout.write(prompt);stdin.setRawMode(true);stdin.resume();let text='';
 return new Promise((resolve,reject)=>{
  const done=()=>{stdin.setRawMode(false);stdin.off('data',read);stdin.pause();stdout.write('\n');};
  const read=buffer=>{for(const char of buffer.toString()){
   if(char==='\r'||char==='\n'){done();resolve(text);return;}
   if(char==='\u0003'){done();reject(Error('Canceled'));return;}
   if(char==='\u007f')text=text.slice(0,-1);else if(char>=' ')text+=char;
  }};
  stdin.on('data',read);
 });
}
function table(rows){
 if(rows.length<=1){stdout.write(dim('  Nothing here yet.\n'));return;}
 const widths=rows[0].map((_,index)=>Math.max(...rows.map(row=>safeText(row[index]).length)));
 for(let index=0;index<rows.length;index++){
  const line='  '+rows[index].map((value,column)=>safeText(value).padEnd(widths[column])).join('   ');
  stdout.write((index===0?dim(line):line)+'\n');
 }
}
const currentAward=awards=>awards.find(award=>award.id===cfg.model)||awards[0]||null;
const walletFrom=info=>info?.wallet&&Number.isSafeInteger(info.wallet.balanceMinor)?info.wallet:null;
const rollCostMinor=info=>Number.isSafeInteger(info?.roll?.costMinor)?info.roll.costMinor:null;
const allocationCopy=pool=>pool?.allocation
 ?`${compact(pool.allocation.freshInputTokens??pool.allocation.inputTokens)} fresh input + ${compact(pool.allocation.outputTokens)} output`
 :pool?.tokens?`${compact(pool.tokens)} shared tokens`:'bounded token session';
const rollTerms=(info,pool)=>rollCostMinor(info)!==null
 ?`${moneyMinor(rollCostMinor(info))} / roll · ${allocationCopy(pool)}`
 :info?.provider==='demo'?`test roll · no charge · ${allocationCopy(pool)}`
 :`internal roll · shared spend cap · ${allocationCopy(pool)}`;

function renderStatus(info,pool,awards,{withBrand=true}={}){
 const active=currentAward(awards);
 if(active&&cfg.model!==active.id){cfg.model=active.id;writeConfig();}
 if(withBrand)brand(info.provider);
 stdout.write(label('project',bold(projectName())));
 if(active){
  const meta=tier(active.choice.tier);const available=active.available??active.remaining;
  stdout.write(label('loadout',`${meta.paint(meta.glyph+' '+active.choice.name)}  ${dim(meta.label)}`));
  stdout.write(label('',dim(active.choice.model)));
  stdout.write(label('tokens',`${meter(available,active.total)}  ${bold(compact(available))} ${dim('available')}`));
 }else stdout.write(label('loadout',gold('EMPTY — roll your first model')));
 stdout.write(label('vault',`${awards.length} ${awards.length===1?'model':'models'} · ${new URL(base()).host}`));
 const wallet=walletFrom(info);
 if(wallet)stdout.write(label('balance',`${bold(moneyMinor(wallet.balanceMinor))} · ${rollCostMinor(info)===null?'debit unavailable':moneyMinor(rollCostMinor(info))+' per roll'}`));
 rule();
 if(active)stdout.write(`  ${lime('›')} ${bold('Type a prompt')} in ${lime('loot')}  ${dim('or')}  ${bold('loot chat "…"')}\n`);
 else stdout.write(`  ${lime('›')} ${bold('loot roll')}  ${dim(rollTerms(info,pool))}\n`);
 stdout.write(`  ${dim('odds: loot odds  ·  models: loot inventory')}\n\n`);
}
async function animation(award){
 if(flags.json||flags['no-animation']||!stdout.isTTY||(stdout.columns&&stdout.columns<54)||process.env.LOOTLM_REDUCED_MOTION==='1')return;
 const meta=tier(award.choice.tier),symbols=Object.values(rarities).map(item=>item.glyph);let rendered=false;
 stdout.write('\x1b[?25l');
 const restore=()=>stdout.write('\x1b[?25h');
 const interrupt=()=>{restore();process.exit(130);};
 process.once('SIGINT',interrupt);
 try{
  for(let frame=0;frame<30;frame++){
   const locks=[16,21,26].map(stop=>frame>=stop);
   const cells=locks.map((locked,index)=>locked?meta.glyph:symbols[(frame+index*2)%symbols.length]);
   const progress=Math.min(24,Math.floor(frame/29*24));
   const phase=frame<16?'ROLLING':frame<26?'LOCKING':'SECURED';
   const reel=`  ${lime('│')}     ${locks[0]?meta.paint(cells[0]):bold(cells[0])}     ${lime('│')}     ${locks[1]?meta.paint(cells[1]):bold(cells[1])}     ${lime('│')}     ${locks[2]?meta.paint(cells[2]):bold(cells[2])}     ${lime('│')}`;
   const lines=[
    '  '+lime('╭─────────── LOOT ROLL ───────────╮'),
    '  '+lime('│')+dim('       server result locked       ')+lime('│'),
    '  '+lime('├───────────┬───────────┬───────────┤'),
    reel,
    '  '+lime('├───────────┴───────────┴───────────┤'),
    `  ${lime('│')}  ${lime('━'.repeat(progress))}${dim('─'.repeat(24-progress))}  ${phase.padEnd(7)} ${lime('│')}`,
    '  '+lime('╰───────────────────────────────────╯')
   ];
   if(rendered)stdout.write(`\x1b[${lines.length}A`);
   for(const line of lines)stdout.write('\x1b[2K'+line+'\n');
   rendered=true;
   await sleep(frame>25?90:frame>15?65:42);
  }
 }finally{process.removeListener('SIGINT',interrupt);restore();}
}
function renderResult(award,replayed=false,roll){
 const meta=tier(award.choice.tier),available=award.available??award.remaining;
 stdout.write(`\n  ${meta.paint(meta.glyph+' '+meta.label+' ROLL')} ${replayed?dim('· recovered safely'):''}\n`);
 stdout.write(`  ${bold(award.choice.name)}\n  ${dim(award.choice.model)}\n\n`);
 stdout.write(label('allocation',`${meter(available,award.total)}  ${bold(fmt(available))}`));
 stdout.write(label('roll id',dim(short(award.id))));
 if(Number.isSafeInteger(roll?.balanceAfterMinor))stdout.write(label('balance',`${moneyMinor(roll.balanceAfterMinor)} remaining`));
 rule();
 stdout.write(`  ${lime('ACTIVE')} ${dim('Your next prompt routes here.')}\n  ${dim('Try')} ${bold('loot')} ${dim('or')} ${bold('loot chat "What should we build?"')}\n\n`);
}
async function confirmPaidRoll(info,pool,ask=question){
 const wallet=walletFrom(info),cost=rollCostMinor(info);
 if(!wallet||cost===null||cost===0)return true;
 if(wallet.balanceMinor<cost){const error=Error(`This roll needs ${moneyMinor(cost)}; your balance is ${moneyMinor(wallet.balanceMinor)}.`);error.code='insufficient_wallet';throw error;}
 if(flags.yes)return true;
 if(flags.json)throw Error('Paid JSON rolls require --yes.');
 if(!stdin.isTTY)throw Error('Paid noninteractive rolls require --yes.');
 stdout.write(`\n  ${bold('ROLL CONFIRMATION')}\n`);
 stdout.write(label('debit',moneyMinor(cost)));
 stdout.write(label('balance',`${moneyMinor(wallet.balanceMinor)} → ${moneyMinor(wallet.balanceMinor-cost)}`));
 stdout.write(label('allocation',allocationCopy(pool)));
 const answer=(await ask('  Roll? [y/N] ')).trim();
 if(!/^y(?:es)?$/i.test(answer)){stdout.write(`\n  ${dim('Roll canceled. Nothing was deducted.')}\n\n`);return false;}
 return true;
}
async function performRoll({compactOutput=false,ask=question}={}){
 const [info,pool]=await Promise.all([json('/internal/me'),json('/internal/pool')]);
 if(!flags.json&&!compactOutput){
  brand(info.provider);
  stdout.write(`  ${dim(rollTerms(info,pool))}\n  ${dim('The server chooses first; the reveal cannot change the result.')}\n\n`);
 }
 if(!await confirmPaidRoll(info,pool,ask))return null;
 const rollId=cfg.pendingRoll||randomUUID();cfg.pendingRoll=rollId;writeConfig();
 const data=await json('/internal/spins',{body:{},headers:{'Idempotency-Key':rollId}});
 cfg.pendingRoll=null;cfg.model=data.award.id;writeConfig();
 await animation(data.award);
 if(flags.json)stdout.write(JSON.stringify(data)+'\n');else renderResult(data.award,data.replayed,data.roll);
 return data.award;
}
function renderWallet(info,{withBrand=true}={}){
 if(withBrand)brand(info.provider);
 const wallet=walletFrom(info);
 if(!wallet){
  stdout.write(`  ${gold('WALLET NOT CONNECTED')}\n  ${dim('This internal build cannot accept or simulate funds.')}\n  ${dim('Jonas must land the wallet + webhook contract before paid testing.')}\n\n`);
  return;
 }
 stdout.write(`  ${bold('INFERENCE WALLET')}\n\n`);
 stdout.write(label('balance',bold(moneyMinor(wallet.balanceMinor))));
 stdout.write(label('roll debit',rollCostMinor(info)===null?'—':moneyMinor(rollCostMinor(info))));
 stdout.write(label('reload',Number.isSafeInteger(wallet.topupMinor)?moneyMinor(wallet.topupMinor):'$10.00'));
 rule();
 stdout.write(`  ${lime('›')} ${bold('loot topup')} ${dim('secure checkout, then return here')}\n\n`);
}
async function openCheckout(url){
 const parsed=new URL(url);if(parsed.protocol!=='https:')throw Error('Checkout URL must use HTTPS.');
 const {spawn}=await import('node:child_process');
 const command=process.platform==='darwin'?'open':process.platform==='win32'?'cmd':'xdg-open';
 const parameters=process.platform==='win32'?['/c','start','',url]:[url];
 const child=spawn(command,parameters,{detached:true,stdio:'ignore'});child.on('error',()=>{});child.unref();
}
async function topup(){
 const info=await json('/internal/me'),wallet=walletFrom(info);
 if(!wallet||wallet.topupEnabled!==true){const error=Error('Payments are not connected in this internal build.');error.code='payments_unavailable';throw error;}
 const checkout=await json('/internal/checkouts',{body:{amountMinor:wallet.topupMinor??1000},headers:{'Idempotency-Key':randomUUID()}});
 if(flags.json){stdout.write(JSON.stringify(checkout)+'\n');return;}
 brand(info.provider);
 stdout.write(`  ${bold('SECURE TOP-UP')}  ${moneyMinor(checkout.amountMinor??wallet.topupMinor??1000)}\n  ${dim('Card entry happens on the payment provider, never in LootLM.')}\n\n`);
 if(!flags['no-open'])await openCheckout(checkout.url);
 stdout.write(`  ${dim('Checkout:')} ${checkout.url}\n\n`);
 const glyphs=['◐','◓','◑','◒'];
 for(let attempt=0;attempt<240;attempt++){
  const state=await json(`/internal/checkouts/${encodeURIComponent(checkout.id)}`);
  if(['paid','credited','complete'].includes(state.status)){
   if(stdout.isTTY)stdout.write('\r\x1b[2K');
   stdout.write(`  ${lime('✓ FUNDED')} ${moneyMinor(state.creditedMinor??checkout.amountMinor??wallet.topupMinor??1000)} added.\n\n`);
   renderWallet(await json('/internal/me'),{withBrand:false});return;
  }
  if(['expired','failed','canceled'].includes(state.status))throw Error(`Checkout ${state.status}. No balance was added.`);
  if(stdout.isTTY)stdout.write(`\r\x1b[2K  ${lime(glyphs[attempt%glyphs.length])} Waiting for verified payment…`);
  await sleep(1500);
 }
 if(stdout.isTTY)stdout.write('\r\x1b[2K');
 stdout.write(`  ${gold('STILL PENDING')} ${dim('Run loot wallet later; the webhook remains authoritative.')}\n\n`);
}
function renderInventory(awards,{withBrand=true}={}){
 if(withBrand)brand();
 if(!awards.length){stdout.write(`  ${gold('Your vault is empty.')}\n  Start with ${bold('loot roll')}.\n\n`);return;}
 const rows=[['','MODEL','RARITY','AVAILABLE','ID']];
 awards.forEach((award,index)=>{
  const meta=tier(award.choice.tier);
  rows.push([award.id===cfg.model?'●':' ',`${index+1}. ${award.choice.name}`,meta.label,compact(award.available),short(award.id)]);
 });
 table(rows);
 stdout.write(`\n  ${dim('● active  ·  select with')} ${bold('loot use <number>')}\n  ${dim('Full award IDs remain available with --json.')}\n\n`);
}
function renderOdds(pool,{withBrand=true}={}){
 if(withBrand)brand();
 stdout.write(`  ${bold('THE CURRENT POOL')}  ${dim('published odds')}\n\n`);
 for(const entry of pool.entries){
  const meta=tier(entry.tier),percent=entry.probability*100,filled=Math.round(percent/5);
  stdout.write(`  ${String(percent.toFixed(percent%1?1:0)+'%').padStart(5)}  ${meta.paint('━'.repeat(filled))}${dim('─'.repeat(20-filled))}  ${meta.paint(meta.glyph)} ${entry.name} ${dim('· '+meta.label)}\n`);
 }
 stdout.write(`\n  ${dim('RARITY LADDER')}\n  ${rarities.common.paint('◆ COMMON')}  ${rarities.uncommon.paint('⬟ UNCOMMON')}  ${rarities.rare.paint('✦ RARE')}\n  ${rarities.epic.paint('✧ EPIC')}    ${rarities.legendary.paint('✹ LEGENDARY')}\n`);
 stdout.write(`\n  ${lime('EVERY ROLL')} ${allocationCopy(pool)}\n  ${dim('Independent server-side draw · animation is cosmetic · odds are snapshotted')}\n  ${dim('pool '+short(pool.version))}\n\n`);
}
function renderUsage(data){
 const rows=[['REQUEST','STATE','INPUT','OUTPUT','PROVIDER COST']];
 for(const request of data.data){
  const status=request.status==='complete'?'✓ complete':request.status==='pending'?'◌ pending':request.status==='failed'?'× failed':request.status;
  rows.push([short(request.id),status,request.input_tokens??'—',request.output_tokens??'—',request.cost===null?'—':`$${request.cost.toFixed(6)}`]);
 }
 table(rows);
 if(data.data.length)stdout.write(`\n  ${dim('Provider cost is operational data, not your LootLM roll price.')}\n`);
 stdout.write('\n');
}
async function resolveAward(value,awards){
 if(!value)throw Error('Choose a model number or award ID. Run loot inventory.');
 const index=Number(value);
 const award=Number.isSafeInteger(index)&&index>0?awards[index-1]:awards.find(item=>item.id===value||short(item.id)===value);
 if(!award)throw Error('Model not found. Run loot inventory.');
 return award;
}
async function streamChat({model,messages,maxTokens,showHeader=true}){
 const response=await api('/v1/chat/completions',{
  body:{model,messages,max_tokens:maxTokens,stream:true},
  headers:{'Idempotency-Key':randomUUID()}
 });
 let buffer='',usage=null,answer='';const decoder=new TextDecoder();
 if(showHeader)stdout.write(`\n  ${violet('◆ MODEL')}\n\n`);
 const consume=line=>{
  if(!line.startsWith('data:'))return;
  const value=line.slice(5).trim();if(!value||value==='[DONE]')return;
  const data=JSON.parse(value);
  if(data.error){const error=Error(data.error.message);error.code=data.error.code;throw error;}
  if(data.usage)usage=data.usage;
  const delta=data.choices?.[0]?.delta;
  if(delta?.content){const text=safeText(delta.content);answer+=text;stdout.write(text);}
  if(delta?.tool_calls){const text=JSON.stringify(delta.tool_calls);answer+=text;stdout.write(text);}
 };
 for await(const chunk of response.body){
  buffer+=decoder.decode(chunk,{stream:true});let newline;
  while((newline=buffer.indexOf('\n'))>=0){consume(buffer.slice(0,newline));buffer=buffer.slice(newline+1);}
 }
 buffer+=decoder.decode();if(buffer.trim())consume(buffer);stdout.write('\n');
 if(showHeader)stdout.write(`\n  ${dim(usage?`${fmt(usage.prompt_tokens)} in · ${fmt(usage.completion_tokens)} out`:'usage pending reconciliation')}\n\n`);
 return {answer,usage};
}
async function play(){
 if(flags.json)throw Error('Interactive mode does not support --json.');
 let [info,pool,allowances]=await Promise.all([json('/internal/me'),json('/internal/pool'),json('/v1/allowances')]);
 let awards=allowances.data;
 renderStatus(info,pool,awards);
 stdout.write(`  ${dim('Session context follows you across rolls while this shell is open.')}\n  ${dim('/help for commands · /exit to leave')}\n\n`);
 const reader=createInterface({input:stdin,output:stdout,terminal:true});let messages=[];
 try{
  while(true){
   let input;try{input=(await reader.question(`  ${lime('loot')} ${dim('›')} `)).trim();}catch{break;}
   if(!input)continue;
   if(input.startsWith('/')){
    const [action,...rest]=input.slice(1).trim().split(/\s+/);const value=rest.join(' ');
    if(['exit','quit','q'].includes(action))break;
    if(action==='help'){
     stdout.write(`\n  ${bold('/roll')}      roll and keep this session context\n  ${bold('/models')}    inspect your vault\n  ${bold('/use N')}     switch to model N\n  ${bold('/odds')}      inspect the published pool\n  ${bold('/wallet')}    inspect funds and roll debit\n  ${bold('/topup')}     add the fixed wallet reload\n  ${bold('/status')}    show the current loadout\n  ${bold('/new')}       clear in-memory conversation context\n  ${bold('/clear')}     clear the terminal\n  ${bold('/exit')}      leave LootLM\n\n`);continue;
    }
    if(action==='roll'){
     try{
      const award=await performRoll({compactOutput:true,ask:prompt=>reader.question(prompt)});
      if(award){allowances=await json('/v1/allowances');awards=allowances.data;}
     }catch(error){showError(error);}continue;
    }
    if(action==='models'||action==='vault'){allowances=await json('/v1/allowances');awards=allowances.data;renderInventory(awards,{withBrand:false});continue;}
    if(action==='odds'){pool=await json('/internal/pool');renderOdds(pool,{withBrand:false});continue;}
    if(action==='wallet'){info=await json('/internal/me');renderWallet(info,{withBrand:false});continue;}
    if(action==='topup'){try{await topup();info=await json('/internal/me');}catch(error){showError(error);}continue;}
    if(action==='status'){
     [info,pool,allowances]=await Promise.all([json('/internal/me'),json('/internal/pool'),json('/v1/allowances')]);awards=allowances.data;
     renderStatus(info,pool,awards,{withBrand:false});continue;
    }
    if(action==='use'){
     const award=await resolveAward(value,awards);cfg.model=award.id;writeConfig();
     stdout.write(`  ${lime('ACTIVE')} ${bold(award.choice.name)} ${dim('· session context kept')}\n\n`);continue;
    }
    if(action==='new'){messages=[];stdout.write(`  ${lime('NEW SESSION')} ${dim('Conversation context cleared; model unchanged.')}\n\n`);continue;}
    if(action==='clear'){stdout.write('\x1bc');renderStatus(info,pool,awards);continue;}
    stdout.write(`  ${red('Unknown command')} ${dim('· try /help')}\n\n`);continue;
   }
   const award=currentAward(awards);
   if(!award){stdout.write(`  ${gold('No model equipped.')} Run ${bold('/roll')} first.\n\n`);continue;}
   messages.push({role:'user',content:input});
   try{
    const reply=await streamChat({model:award.id,messages,maxTokens:Math.min(Number(flags['max-tokens']||512),info.maxOutput),showHeader:true});
    if(reply.answer)messages.push({role:'assistant',content:reply.answer});
    allowances=await json('/v1/allowances');awards=allowances.data;
   }catch(error){messages.pop();showError(error);}
  }
 }finally{reader.close();stdout.write(`\n  ${dim('Session closed. Your model remains in the vault.')}\n\n`);}
}
function help(){
 brand();
 stdout.write(`${bold('  OPEN THE ARCADE')}\n  ${lime('loot')}                           Interactive prompt shell\n  ${lime('loot roll')}                      Roll and equip a model\n  ${lime('loot chat "prompt"')}             Send one prompt\n\n${bold('  YOUR LOADOUT')}\n  loot status                     Project, model, and allocation\n  loot inventory                  Models in your vault\n  loot use <number|award_id>       Equip a saved model\n  loot odds                       Exact published chances\n  loot usage                      Request and token ledger\n\n${bold('  WALLET')}\n  loot wallet                     Balance and roll debit\n  loot topup                      Fixed secure reload\n\n${bold('  ACCOUNT + INTEGRATION')}\n  loot login [--url URL] [--email EMAIL]\n  loot keys list|create|revoke\n  loot config                     Safe local configuration\n  loot logout\n  loot serve                      Start the private API server\n\n  ${dim('--json for automation · --no-animation · NO_COLOR=1')}\n  ${dim('The lootlm command remains a compatibility alias.')}\n  ${dim('Internal test build. No payment is collected in demo mode.')}\n\n`);
}
function showError(error){
 const hints={
  unauthorized:'Run loot login.',
  insufficient_tokens:'Roll again or lower --max-tokens.',
  award_not_found:'Run loot inventory and select another model.',
  context_limit:'Start /new or shorten the prompt.',
  daily_budget:'The shared daily provider budget is exhausted.',
  rare_paused:'Rare live inference is paused; equip another model.',
  spins_paused:'New rolls are temporarily paused.',
  inference_paused:'Inference is temporarily paused.',
  insufficient_wallet:'Run loot topup, then try again.',
  payments_unavailable:'This demo cannot accept money.'
 };
 stderr.write(`\n  ${red('×')} ${safeText(error.message)}\n`);
 const hint=hints[error.code]||(/login first/i.test(error.message)?'Run loot login to enter the arcade.':null);
 if(hint)stderr.write(`  ${dim(hint)}\n`);stderr.write('\n');
}

async function main(){
 if(cmd==='help'){help();return;}
 if(cmd==='version'){stdout.write('lootlm 0.1.0\n');return;}
 if(cmd==='serve'){
  const {spawn}=await import('node:child_process');
  const child=spawn(process.execPath,[fileURLToPath(new URL('./server.js',import.meta.url))],{stdio:'inherit',env:process.env});
  child.on('exit',code=>process.exit(code||0));return;
 }
 if(cmd==='login'){
  const url=base();const email=flags.email||await question('Email [demo@lootlm.local]: ')||'demo@lootlm.local';
  const code=process.env.LOOTLM_ACCESS_CODE||await question('Access code (hidden): ',true);
  const data=await json('/auth/login',{body:{email,code,cli:true}});
  cfg={url,key:data.key,email:data.user.email};writeConfig();
  if(flags.json)stdout.write(JSON.stringify({ok:true,email,url})+'\n');
  else{brand();stdout.write(`  ${lime('SIGNED IN')} ${bold(email)}\n  ${dim('Credentials saved with owner-only permissions.')}\n\n  ${bold('1')}  ${lime('loot roll')}  ${dim('get a model')}\n  ${bold('2')}  ${lime('loot')}       ${dim('open the prompt shell')}\n\n`);}
  return;
 }
 if(cmd==='logout'){
  if(cfg.key){try{
   const keys=(await json('/internal/api-keys')).data;const own=keys.find(key=>cfg.key.startsWith(key.prefix));
   if(own)await json(`/internal/api-keys/${own.id}`,{method:'DELETE'});
  }catch{stderr.write('Could not revoke remotely. Revoke the CLI key with the API.\n');}}
  cfg={url:cfg.url};writeConfig();stdout.write('Signed out locally.\n');return;
 }
 if(cmd==='config'){
  stdout.write(JSON.stringify({url:base(),email:cfg.email,model:cfg.model,authenticated:!!(cfg.key||process.env.LOOTLM_API_KEY),configFile},null,2)+'\n');return;
 }
 if(cmd==='play'){await play();return;}
 if(cmd==='wallet'){
  const info=await json('/internal/me');if(flags.json)stdout.write(JSON.stringify(info.wallet??null)+'\n');else renderWallet(info);return;
 }
 if(cmd==='topup'){await topup();return;}
 if(cmd==='status'){
  const [info,pool,allowances]=await Promise.all([json('/internal/me'),json('/internal/pool'),json('/v1/allowances')]);
  if(flags.json)stdout.write(JSON.stringify({info,pool,awards:allowances.data})+'\n');else renderStatus(info,pool,allowances.data);return;
 }
 if(cmd==='roll'){await performRoll();return;}
 if(cmd==='inventory'||cmd==='vault'){
  const data=await json('/v1/allowances');if(flags.json)stdout.write(JSON.stringify(data)+'\n');else renderInventory(data.data);return;
 }
 if(cmd==='use'){
  const awards=(await json('/v1/allowances')).data;const award=await resolveAward(args[0],awards);
  cfg.model=award.id;writeConfig();stdout.write(`\n  ${lime('ACTIVE')} ${bold(award.choice.name)}\n  ${dim(award.choice.model+' · '+short(award.id))}\n\n`);return;
 }
 if(cmd==='odds'){
  const data=await json('/internal/pool');if(flags.json)stdout.write(JSON.stringify(data)+'\n');else renderOdds(data);return;
 }
 if(cmd==='usage'){
  const data=await json('/v1/usage');if(flags.json)stdout.write(JSON.stringify(data)+'\n');else{brand();renderUsage(data);}return;
 }
 if(cmd==='keys'){
  const sub=args[0]||'list';
  if(sub==='list'){
   const data=await json('/internal/api-keys');
   if(flags.json)stdout.write(JSON.stringify(data)+'\n');else{brand();table([['ID','NAME','PREFIX'],...data.data.map(key=>[short(key.id),key.name,key.prefix+'…'])]);stdout.write('\n');}
  }else if(sub==='create'){
   const key=await json('/internal/api-keys',{body:{name:flags.name||'CLI-created key'}});
   stdout.write(flags.json?JSON.stringify(key)+'\n':`Copy now; shown only once:\n${key.key}\n`);
  }else if(sub==='revoke'){
   if(!flags.id)throw Error('Use --id key_ID');
   stdout.write(JSON.stringify(await json(`/internal/api-keys/${encodeURIComponent(flags.id)}`,{method:'DELETE'}))+'\n');
  }else throw Error('keys list|create|revoke');
  return;
 }
 if(cmd==='chat'){
  const prompt=args.join(' ');if(!prompt)throw Error('Use loot chat "your prompt".');
  const model=flags.model||cfg.model;if(!model)throw Error('Roll or select a model first.');
  const maxTokens=Number(flags['max-tokens']||256);
  if(flags.json){
   const response=await api('/v1/chat/completions',{body:{model,messages:[{role:'user',content:prompt}],max_tokens:maxTokens,stream:false},headers:{'Idempotency-Key':randomUUID()}});
   stdout.write(JSON.stringify(await response.json())+'\n');return;
  }
  const awards=(await json('/v1/allowances')).data,award=awards.find(item=>item.id===model);
  brand();if(award)stdout.write(label('loadout',`${tier(award.choice.tier).paint(award.choice.name)} ${dim('· '+compact(award.available)+' available')}`));
  await streamChat({model,messages:[{role:'user',content:prompt}],maxTokens,showHeader:true});return;
 }
 if(cmd==='admin'){
  const sub=args[0]||'status';let data;
  if(sub==='status')data=await json('/internal/admin');
  else if(sub==='pause'||sub==='resume')data=await json('/internal/admin',{method:'PATCH',body:{inferenceEnabled:sub==='resume',spinsEnabled:sub==='resume'}});
  else if(sub==='pool'){
   if(!flags.file)throw Error('Use --file pool.json');
   const body=JSON.parse(fs.readFileSync(flags.file,'utf8'));
   data=await json('/internal/admin/pool',{method:'PUT',body:{entries:Array.isArray(body)?body:body.entries}});
  }else if(sub==='resolve')data=await json('/internal/admin/resolve',{body:{requestId:flags.id,input:Number(flags.input),output:Number(flags.output),cost:Number(flags.cost),note:flags.note}});
  else throw Error('admin status|pause|resume|pool --file FILE|resolve --id ID --input N --output N --cost USD --note EVIDENCE');
  stdout.write(JSON.stringify(data,null,2)+'\n');return;
 }
 throw Error(`Unknown command: ${cmd}. Run loot help.`);
}

main().catch(error=>{
 if(flags.json)stderr.write(JSON.stringify({error:{code:error.code||'cli_error',message:error.message}})+'\n');else showError(error);
 process.exitCode=1;
});
