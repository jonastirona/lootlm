#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createInterface} from 'node:readline/promises';
import {stdin,stdout,stderr} from 'node:process';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {centerAnsi,extractSgrMouseEvents,visibleLength} from './terminal-layout.js';
import {buildShowcaseReel,shuffleModels} from './reel.js';

const raw=process.argv.slice(2);
const flags={};
const args=[];
for(let i=0;i<raw.length;i++){
 const x=raw[i];
 if(x.startsWith('--')){
  const [key,inline]=x.slice(2).split('=',2);
  if(['url','email','model','max-tokens','name','id','file','input','output','cost','note','supplier'].includes(key)){
   flags[key]=inline??raw[++i];
   if(!flags[key]||flags[key].startsWith('--'))throw Error(`--${key} needs a value`);
  }else flags[key]=inline??true;
 }else args.push(x);
}

const requested=args.shift();
const cmd=flags.help?'help':flags.version?'version':requested||(stdin.isTTY?'play':'help');
const configDir=process.env.LOOTLM_CONFIG_DIR||path.join(os.homedir(),'.config','lootlm');
const configFile=path.join(configDir,'config.json');
let cfg={};
let immersiveScreen=false;
let temporaryMachineScreen=false;
try{cfg=JSON.parse(fs.readFileSync(configFile,'utf8'));}
catch(error){if(error.code!=='ENOENT')throw Error(`Cannot read ${configFile}: ${error.message}`);}

const color=stdout.isTTY&&!process.env.NO_COLOR&&!flags.json;
const safeText=value=>String(value).replace(/[\x00-\x08\x0b-\x1f\x7f-\x9f]/g,'');
const paint=(code,value)=>color?`\x1b[${code}m${safeText(value)}\x1b[0m`:safeText(value);
const burgundy=value=>paint('38;2;140;47;74',value);
const royalRed=value=>paint('38;2;200;50;77',value);
const gold=value=>paint('38;2;212;175;55',value);
const cyan=value=>paint('1;38;2;71;220;255',value);
const hotPink=value=>paint('1;38;2;255;66;173',value);
const royalBold=value=>paint('1;38;2;200;50;77',value);
const neutral=value=>paint('38;5;250',value);
const green=value=>paint('38;5;114',value);
const blue=value=>paint('38;5;75',value);
const purple=value=>paint('38;5;141',value);
const orange=value=>paint('38;2;230;164;49',value);
const red=value=>paint('38;2;232;76;91',value);
const payline=value=>paint('1;38;2;255;255;255;48;2;155;30;75',value);
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
 bust:{key:'bust',rank:1,label:'BUST',glyph:'◇',paint:neutral},
 starter:{key:'bust',rank:1,label:'BUST',glyph:'◇',paint:neutral},
 common:{key:'common',rank:2,label:'COMMON',glyph:'◆',paint:green},
 rare:{key:'rare',rank:3,label:'RARE',glyph:'⬟',paint:blue},
 specialist:{key:'rare',rank:3,label:'RARE',glyph:'⬟',paint:blue},
 epic:{key:'epic',rank:4,label:'EPIC',glyph:'✦',paint:purple},
 legendary:{key:'legendary',rank:5,label:'LEGENDARY',glyph:'✹',paint:orange},
 mythic:{key:'mythic',rank:6,label:'MYTHIC',glyph:'✺',paint:gold},
 uncommon:{key:'uncommon',rank:2,label:'UNCOMMON',glyph:'⬟',paint:green}
};
// Temporary compatibility for Jonas's four-tier prototype pool.
const legacyRarities={strong:'epic'};
const tier=value=>rarities[value]||rarities[legacyRarities[value]]||{key:'unknown',rank:0,label:String(value||'MODEL').toUpperCase(),glyph:'◆',paint:neutral};
const modelSigils={
 'meta-llama/llama-3.2-1b-instruct':'L1','meta-llama/llama-3.2-3b-instruct':'L3','mistralai/ministral-3b-2512':'M3','qwen/qwen3-8b':'Q8',
 'qwen/qwen3-coder-30b-a3b-instruct':'QC','openai/gpt-oss-20b':'O2','openai/gpt-oss-120b':'O1','deepseek/deepseek-v4.1-flash':'D4','qwen/qwen3.8-flash':'QF','mistralai/mistral-small-2603':'MS',
 'qwen/qwen3-coder':'QX','mistralai/devstral-2512':'DV','mistralai/codestral-2508':'CS','google/gemma-4-31b-it':'G4','moonshotai/kimi-k2.7-code':'K2','minimax/minimax-m3':'MM',
 'meta-llama/llama-4-maverick':'LM','mistralai/mistral-medium-3-5':'M5','deepseek/deepseek-v4-pro-0813':'DP','qwen/qwen3.5-plus-20260420':'QP',
 'z-ai/glm-5.3':'G5','moonshotai/kimi-k3':'K3','google/gemini-3.8-flash':'GF','openai/gpt-6-sol':'S6','anthropic/claude-sonnet-5':'C5','x-ai/grok-4.7':'X7','anthropic/claude-opus-5.5':'O5','openai/gpt-6-astra':'A6'
};
const modelLabel=value=>{
 const source=String(value||'MODEL'),leaf=source.split('/').pop();
 if(!source.includes('/')&&/\s/.test(source))return source.toUpperCase();
 return leaf.replace(/[-_]+/g,' ').replace(/\b(gpt|glm)\s+(?=\d)/gi,'$1-').toUpperCase();
};
const shinePalettes={
 epic:{base:'1;38;2;170;111;239',edge:'1;38;2;219;181;255',peak:'1;38;2;255;244;255'},
 legendary:{base:'1;38;2;230;164;49',edge:'1;38;2;255;216;105',peak:'1;38;2;255;250;211'},
 mythic:{base:'1;38;2;255;78;166',edge:'1;38;2;111;220;255',peak:'1;38;2;255;255;255'}
};
function shineText(value,meta,frame=Math.floor(String(value).length/2)){
 const text=safeText(value),palette=shinePalettes[meta.key];
 if(!palette||!color)return bold(text);
 return [...text].map((char,index)=>{
  if(char===' ')return char;
  const distance=Math.abs(index-frame),code=distance===0?palette.peak:distance===1?palette.edge:palette.base;
  return paint(code,char);
 }).join('');
}
function modelHeadline(choice,meta,frame){
 const text=modelLabel(choice.model);
 if(meta.rank<4)return bold(text);
 return `${meta.paint('✦')} ${shineText(text,meta,frame)} ${meta.paint('✦')}`;
}
const ratio=(value,total)=>total>0?Math.max(0,Math.min(1,value/total)):0;
const meter=(value,total,width=18)=>{
 const full=Math.round(ratio(value,total)*width);
 return royalRed('━'.repeat(full))+burgundy('─'.repeat(width-full));
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

async function writeModelHeadline(choice,meta,{animate=false,indent='  '}={}){
 const text=modelLabel(choice.model),canAnimate=animate&&meta.rank>=4&&color&&stdout.isTTY&&!flags['no-animation']&&process.env.LOOTLM_REDUCED_MOTION!=='1';
 if(!canAnimate){stdout.write(`${indent}${modelHeadline(choice,meta)}\n`);return;}
 const restore=()=>stdout.write('\x1b[?25h');
 const interrupt=()=>{restore();process.exit(130);};
 process.once('SIGINT',interrupt);stdout.write('\x1b[?25l');
 try{
  for(let frame=-2;frame<text.length+2;frame++){
   stdout.write(`\r\x1b[2K${indent}${modelHeadline(choice,meta,frame)}`);
   await sleep(32);
  }
  stdout.write(`\r\x1b[2K${indent}${modelHeadline(choice,meta)}\n`);
 }finally{process.removeListener('SIGINT',interrupt);restore();}
}

const decorativeStrip=(width,frame=0)=>Array.from({length:Math.max(0,width)},(_,index)=>{
 const phase=(index+frame)%12,char=phase===0?'*':phase===4?'+':phase===8?'o':'.',painter=phase<4?hotPink:phase<8?cyan:gold;
 return painter(char);
}).join('');
const centeredAnsi=(value,width)=>{const space=Math.max(0,width-visibleLength(value));return ' '.repeat(Math.floor(space/2))+value+' '.repeat(Math.ceil(space/2));};
function brand(mode){
 const width=Math.min(64,termWidth()-4),inner=width-2;
 const title='✦ L O O T L M ✦',subtitle=`MODEL CASINO${mode?' // '+String(mode).toUpperCase():''}`;
 const pad=text=>' '.repeat(Math.max(0,Math.floor((inner-text.length)/2)))+text+' '.repeat(Math.max(0,Math.ceil((inner-text.length)/2)));
 stdout.write(`\n${centerAnsi(decorativeStrip(width,Date.now()%12),termWidth())}\n`);
 stdout.write(`  ${gold('╔'+'═'.repeat(inner)+'╗')}\n  ${gold('║')}${royalBold(pad(title))}${gold('║')}\n  ${gold('║')}${cyan(pad(subtitle))}${gold('║')}\n  ${gold('╚'+'═'.repeat(inner)+'╝')}\n${centerAnsi(decorativeStrip(width,(Date.now()+5)%12),termWidth())}\n\n`);
}
function rule(){const width=Math.min(58,termWidth()-4);stdout.write('  '+burgundy('─'.repeat(Math.max(0,width-2)))+gold('◆')+burgundy('─')+'\n');}
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
const fitPlain=(value,width)=>{const text=safeText(value);return text.length>width?text.slice(0,Math.max(1,width-1))+'…':text.padEnd(width);};
const centeredPlain=(value,width)=>{const text=safeText(value).slice(0,width),space=Math.max(0,width-text.length);return ' '.repeat(Math.floor(space/2))+text+' '.repeat(Math.ceil(space/2));};
function slotCard(choice,width,{hot=false}={}){
 const meta=tier(choice.tier),inner=Math.max(10,width-4),model=modelLabel(choice.model),vendor=String(choice.model||'MODEL').split('/')[0].replace(/[-_]+/g,' ').toUpperCase();
 const sigil=modelSigils[choice.model]||model.slice(0,2),heavy=meta.rank>=4;
 const border=heavy?['╔','═','╗','║','╚','╝']:meta.rank>=3?['┏','━','┓','┃','┗','┛']:['╭','─','╮','│','╰','╯'];
 const badge=`[${sigil}] ${vendor}`,bottom=`${meta.glyph} ${meta.label} ${meta.glyph}`;
 const lines=[
  border[0]+centeredPlain(badge,inner)+border[2],
  border[3]+centeredPlain(model,inner)+border[3],
  border[4]+centeredPlain(bottom,inner)+border[5]
 ];
 return lines.map(line=>hot?gold('▶')+meta.paint(line)+gold('◀'):meta.paint(' '+line+' '));
}
function homeFrame(info,pool,awards,frame=0){
 const columns=Math.max(44,stdout.columns||80),rows=Math.max(12,stdout.rows||24),width=Math.min(82,columns-4),inner=width-2,active=currentAward(awards),wallet=walletFrom(info),canvas=Array(rows).fill('');
 const border='+'+'='.repeat(inner)+'+',title=frame%2?hotPink('L O O T L M  //  MODEL CASINO'):gold('L O O T L M  //  MODEL CASINO');
 const lines=[decorativeStrip(width,frame),cyan(border),cyan('|')+centeredAnsi(title,inner)+cyan('|'),cyan('|')+bold(centeredPlain('PULL ONE MODEL  +  UNLOCK 1,000,000 TOKENS',inner))+cyan('|'),cyan(border),''];
 if(active){
  const meta=tier(active.choice.tier),card=slotCard(active.choice,Math.min(48,width-8),{hot:frame%4<2});
  lines.push(meta.paint(meta.glyph+' ACTIVE PRIZE '+meta.glyph),...card,`${bold(compact(active.available??active.remaining))} TOKENS REMAINING`);
 }else lines.push(gold(frame%2?'>>> PULL THE LEVER <<<':'*** INSERT ROLL ***'),bold('MYSTERY MODEL + 1,000,000 TOKENS'),dim(rollTerms(info,pool)));
 if(wallet)lines.push(`${moneyMinor(wallet.balanceMinor)} BALANCE`);
 lines.push('',hotPink('/roll')+'  '+cyan('/models')+'  '+gold('/collection')+'  '+dim('/help  /exit'),decorativeStrip(width,frame+6));
 const top=Math.max(1,Math.floor((rows-lines.length-2)/2));
 for(let index=0;index<lines.length&&top+index<rows-1;index++)canvas[top+index]=centerAnsi(lines[index],columns);
 stdout.write('\x1b[H'+canvas.map(line=>'\x1b[2K'+line).join('\n')+`\x1b[${rows};1H`);
}
async function renderHome(info,pool,awards,{animate=true}={}){
 const moving=animate&&color&&stdout.isTTY&&!flags['no-animation']&&process.env.LOOTLM_REDUCED_MOTION!=='1';
 for(let frame=0;frame<(moving?14:1);frame++){homeFrame(info,pool,awards,frame);if(moving)await sleep(65);}
}
function renderStatus(info,pool,awards,{withBrand=true}={}){
 const active=currentAward(awards);
 if(active&&cfg.model!==active.id){cfg.model=active.id;writeConfig();}
 if(withBrand)brand(info.provider);
 if(active){
  const meta=tier(active.choice.tier);
  const width=Math.min(42,termWidth()-8),card=slotCard(active.choice,width);
  stdout.write(`  ${hotPink('⚡ ACTIVE PAYLINE ⚡')}\n`);
  for(const line of card)stdout.write(`  ${line}\n`);
  stdout.write(`  ${royalRed('▰'.repeat(Math.round(ratio(active.available??active.remaining,active.total)*18)))}${burgundy('▱'.repeat(18-Math.round(ratio(active.available??active.remaining,active.total)*18)))} ${bold(compact(active.available??active.remaining))} TOKENS\n`);
  stdout.write(`  ${dim(awards.length+' cards discovered · '+meta.label+' equipped')}\n`);
 }else stdout.write(`  ${gold('⚠ INSERT ROLL TO BEGIN ⚠')}\n  ${dim(rollTerms(info,pool))}\n`);
 const wallet=walletFrom(info);if(wallet)stdout.write(`  ${moneyMinor(wallet.balanceMinor)} balance · ${rollCostMinor(info)===null?'debit unavailable':moneyMinor(rollCostMinor(info))+' / roll'}\n`);
 stdout.write('\n');
}
function machineFrame(candidates,index,{frame=0,progress=0,phase='WHEEL READY',final=false,winner=candidates[index],lever=0}={}){
 const columns=Math.max(44,stdout.columns||80),rows=Math.max(12,stdout.rows||24),side=columns>=88,leverWidth=14,panel=Math.min(76,columns-(side?leverWidth+6:4));
 const center=text=>centerAnsi(text,columns),framePaint=[hotPink,cyan,gold][frame%3],edge='+'+Array.from({length:panel-2},(_,i)=>(i+frame)%11===0?'*':'-').join('')+'+';
 const at=offset=>candidates[(index+offset+candidates.length*4)%candidates.length];
 const row=(choice,active=false)=>{const meta=tier(choice.tier),inner=panel-2,sigil=modelSigils[choice.model]||'AI',modelWidth=Math.max(8,inner-20),text=`${active?'> ':'  '}[${sigil}] ${fitPlain(modelLabel(choice.model),modelWidth)} ${meta.label.padStart(10)}${active?' <':'  '}`,line=`|${text}|`;return active?payline(line):meta.paint(line);};
 const title=final?(tier(winner.tier).rank===6?'MYTHIC JACKPOT':'MODEL LOCKED'):'LOOTLM MODEL DRAW';
 const wheel=[framePaint(edge),framePaint('|')+royalBold(centeredPlain(title,panel-2))+framePaint('|'),framePaint('|')+bold(centeredPlain('ONE PULL = ONE MODEL + 1,000,000 TOKENS',panel-2))+framePaint('|'),framePaint(edge),row(at(-2)),row(at(-1)),row(at(0),true),row(at(1)),row(at(2)),framePaint(edge)];
 const barWidth=Math.max(12,panel-28),filled=Math.round(progress*barWidth),percent=String(Math.round(progress*100)).padStart(3);
 wheel.push(`${final?tier(winner.tier).paint('LOCKED'):royalRed(progress?'SPINNING':'READY')} [${royalRed('#'.repeat(filled))}${dim('-'.repeat(barWidth-filled))}] ${percent}%`);
 wheel.push(final?tier(winner.tier).paint(`[${modelSigils[winner.model]||'AI'}] ${modelLabel(winner.model)} - 1,000,000 TOKENS READY`):dim(phase));
 const leverTitle=final?'PRIZE':progress>0?(frame%2?'SPIN!':'* SPIN *'):(lever>0?'PULLING':'PULL V'),handlePaint=[hotPink,gold,cyan][frame%3];
 const leverLines=['+------------+','|'+bold(centeredPlain(leverTitle,12))+'|'];
 for(let rowIndex=0;rowIndex<6;rowIndex++){
  let body='            ';
  if(rowIndex===lever)body='     '+handlePaint('O')+'      ';
  else if(rowIndex>lever)body='     '+gold('|')+'      ';
  leverLines.push('|'+body+'|');
 }
 leverLines.push('|  '+gold('___|___')+'   |','+------------+');
 const totalWidth=side?panel+2+leverWidth:panel,top=Math.max(0,Math.floor((rows-(wheel.length+(side?0:leverLines.length+1)))/2)),left=Math.max(0,Math.floor((columns-totalWidth)/2));
 const lines=[];
 for(let i=0;i<wheel.length;i++){
  if(side){const leftLine=wheel[i]||'',right=leverLines[i]||' '.repeat(leverWidth);lines.push(leftLine+' '.repeat(Math.max(0,panel-visibleLength(leftLine)))+'  '+right);}
  else lines.push(wheel[i]);
 }
 if(!side)lines.push('',...leverLines);
 stdout.write('\x1b[H'+[...Array(top).fill(''),...lines].slice(0,rows).map(line=>'\x1b[2K'+center(line)).join('\n'));
 return side
  ?{leverX:left+panel+3,leverY:top+3+lever,leverWidth}
  :{leverX:left+Math.floor((panel-leverWidth)/2)+1,leverY:top+wheel.length+4+lever,leverWidth};
}
function closeTemporaryMachineScreen(){
 if(!temporaryMachineScreen)return;
 stdout.write('\x1b[?1002l\x1b[?1006l\x1b[?25h\x1b[?1049l');temporaryMachineScreen=false;
}
async function pullLever(entries){
 if(flags.json||flags['no-animation']||!stdout.isTTY||process.env.LOOTLM_REDUCED_MOTION==='1')return;
 if(!immersiveScreen){stdout.write('\x1b[?1049h');temporaryMachineScreen=true;}
 stdout.write('\x1b[2J\x1b[H\x1b[?25l');
 let position=0,geometry=machineFrame(entries,0,{lever:position,phase:'DRAG THE LEVER DOWN - OR PRESS SPACE / ENTER'}),keyboard=false,dragging=false,startY=0,maxPosition=0,buffer='';
 const wasRaw=stdin.isRaw;stdin.setRawMode(true);stdin.resume();stdout.write('\x1b[?1002h\x1b[?1006h');
 try{
  await new Promise((resolve,reject)=>{
   const redraw=()=>{geometry=machineFrame(entries,0,{lever:position,phase:dragging?'KEEP DRAGGING DOWN':'GRAB THE LEVER HANDLE - OR PRESS SPACE / ENTER'});};
   const read=chunk=>{
    buffer+=chunk.toString();if(buffer.includes('\u0003')){stdin.off('data',read);reject(Error('Canceled'));return;}
    if(/[ \r\n]/.test(buffer.replace(/\x1b\[<\d+;\d+;\d+[Mm]/g,''))){keyboard=true;stdin.off('data',read);resolve();return;}
    const parsed=extractSgrMouseEvents(buffer);
    for(const {button,x,y,kind} of parsed.events){
     if(kind==='M'&&button===0&&x>=geometry.leverX&&x<geometry.leverX+geometry.leverWidth&&Math.abs(y-geometry.leverY)<=1){dragging=true;startY=y;maxPosition=0;}
     else if(kind==='M'&&button===32&&dragging){position=Math.max(0,Math.min(5,y-startY));maxPosition=Math.max(maxPosition,position);redraw();}
     else if(kind==='m'&&dragging){dragging=false;if(maxPosition>=4){stdin.off('data',read);resolve();return;}position=0;redraw();}
    }
    buffer=parsed.remainder;if(buffer.length>64)buffer=buffer.slice(-64);
   };
   stdin.on('data',read);
  });
 }finally{stdout.write('\x1b[?1002l\x1b[?1006l');stdin.setRawMode(!!wasRaw);stdin.pause();}
 if(keyboard)for(position=0;position<=5;position++){machineFrame(entries,0,{lever:position,phase:'LEVER PULL ENGAGED'});await sleep(75);}
 machineFrame(entries,0,{lever:5,phase:'LEVER RELEASED - DRAWING MODEL'});await sleep(180);
}
async function animation(award,entries){
 if(flags.json||flags['no-animation']||!stdout.isTTY||process.env.LOOTLM_REDUCED_MOTION==='1')return;
 const winner=award.choice,winMeta=tier(winner.tier),fast=40,slow=34,total=fast+slow;
 const {reel:candidates,landing}=buildShowcaseReel(entries,winner,{length:total+4,landing:total+1});
 const positions=Array.from({length:total},(_,frame)=>frame+2);
 const draw=(frame,final=false)=>{
  const index=final?landing:positions[frame];
  const lever=final?0:Math.max(0,5-Math.floor(frame/2));
  machineFrame(candidates,index,{frame,progress:(final?positions.length:frame+1)/positions.length,phase:frame<fast?'SHOWCASE REEL - /COLLECTION HAS EXACT ODDS':'DECELERATING - CENTER ROW WINS',final,winner,lever});
 };
 const enterScreen=!immersiveScreen&&!temporaryMachineScreen;
 if(enterScreen){stdout.write('\x1b[?1049h');temporaryMachineScreen=true;}
 stdout.write('\x1b[2J\x1b[H\x1b[?25l');
 const restore=()=>immersiveScreen?stdout.write('\x1b[?25h\x1b[2J\x1b[H'):closeTemporaryMachineScreen();
 const interrupt=()=>{closeTemporaryMachineScreen();stdout.write('\x1b[?25h');process.exit(130);};process.once('SIGINT',interrupt);
 try{
  for(let frame=0;frame<positions.length;frame++){draw(frame);await sleep(frame<fast?60:100+(frame-fast)*7);}
  for(let frame=0;frame<(winMeta.rank>=4?28:18);frame++){draw(frame,true);await sleep(90);}
  await sleep(winMeta.rank>=4?850:500);
 }finally{process.removeListener('SIGINT',interrupt);restore();}
}
function prizeFrame(award,frame){
 const choice=award.choice,meta=tier(choice.tier),columns=Math.max(44,stdout.columns||80),rows=Math.max(12,stdout.rows||24),width=Math.min(78,columns-4),inner=width-2,canvas=Array(rows).fill('');
 const flash=[meta.paint,hotPink,gold,cyan][frame%4],burst=frame%2?'*** !!! *** !!! ***':'!!! *** !!! *** !!!';
 const lines=[decorativeStrip(width,frame),flash('+'+'='.repeat(inner)+'+'),flash('|')+centeredAnsi(bold(burst),inner)+flash('|'),flash('|')+centeredAnsi(bold('P R I Z E   U N L O C K E D'),inner)+flash('|'),flash('|')+centeredAnsi(meta.paint(meta.glyph+' '+meta.label+' '+meta.glyph),inner)+flash('|'),''];
 const card=slotCard(choice,Math.min(54,width-8),{hot:frame%4<2});
 lines.push(...card,'',gold('1,000,000 TOKENS'),bold(modelLabel(choice.model)),'',dim('ADDED TO YOUR MODEL VAULT'),flash('+'+'='.repeat(inner)+'+'),decorativeStrip(width,frame+6));
 const top=Math.max(0,Math.floor((rows-lines.length)/2));
 for(let index=0;index<lines.length&&top+index<rows;index++)canvas[top+index]=centerAnsi(lines[index],columns);
 stdout.write('\x1b[H'+canvas.map(line=>'\x1b[2K'+line).join('\n'));
}
async function prizeReveal(award){
 if(flags.json||flags['no-animation']||!stdout.isTTY||process.env.LOOTLM_REDUCED_MOTION==='1')return;
 if(!immersiveScreen){stdout.write('\x1b[?1049h');temporaryMachineScreen=true;}
 stdout.write('\x1b[2J\x1b[H\x1b[?25l');
 try{for(let frame=0;frame<30;frame++){prizeFrame(award,frame);await sleep(70);}await sleep(900);}
 finally{if(immersiveScreen)stdout.write('\x1b[?25h\x1b[2J\x1b[H');else closeTemporaryMachineScreen();}
}
async function renderResult(award,replayed=false,roll){
 const meta=tier(award.choice.tier),available=award.available??award.remaining;
 stdout.write(`\n  ${meta.paint(meta.glyph+' '+meta.label)}${replayed?dim(' · recovered'):''}\n`);
 await writeModelHeadline(award.choice,meta,{animate:true});
 stdout.write(`  ${dim(compact(available)+' tokens · equipped')}\n`);
 if(Number.isSafeInteger(roll?.balanceAfterMinor))stdout.write(`  ${moneyMinor(roll.balanceAfterMinor)} balance\n`);
 stdout.write('\n');
}
async function confirmPaidRoll(info,pool,ask=question){
 const wallet=walletFrom(info),cost=rollCostMinor(info);
 if(!wallet||cost===null||cost===0)return true;
 if(wallet.balanceMinor<cost){const error=Error(`This roll needs ${moneyMinor(cost)}; your balance is ${moneyMinor(wallet.balanceMinor)}.`);error.code='insufficient_wallet';throw error;}
 if(flags.yes)return true;
 if(flags.json)throw Error('Paid JSON rolls require --yes.');
 if(!stdin.isTTY)throw Error('Paid noninteractive rolls require --yes.');
 stdout.write(`\n  ${gold('ROLL CONFIRMATION')}\n`);
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
  stdout.write(`  ${hotPink('⚡ PULL THE LEVER ⚡')}\n  ${bold(rollTerms(info,pool))}\n  ${dim('The server locks the award before the reel moves. /collection shows exact odds.')}\n\n`);
 }
 if(!await confirmPaidRoll(info,pool,ask))return null;
 await pullLever(shuffleModels(pool.entries));
 let data;
 try{
  const rollId=cfg.pendingRoll||randomUUID();cfg.pendingRoll=rollId;writeConfig();
  data=await json('/internal/spins',{body:{},headers:{'Idempotency-Key':rollId}});
  cfg.pendingRoll=null;cfg.model=data.award.id;writeConfig();
  await animation(data.award,pool.entries);
  await prizeReveal(data.award);
 }catch(error){closeTemporaryMachineScreen();throw error;}
 if(flags.json)stdout.write(JSON.stringify(data)+'\n');else await renderResult(data.award,data.replayed,data.roll);
 return data.award;
}
function renderWallet(info,{withBrand=true}={}){
 if(withBrand)brand(info.provider);
 const wallet=walletFrom(info);
 if(!wallet){
  stdout.write(`  ${gold('WALLET NOT CONNECTED')}\n  ${dim('This internal build cannot accept or simulate funds.')}\n  ${dim('Jonas must land the wallet + webhook contract before paid testing.')}\n\n`);
  return;
 }
 stdout.write(`  ${gold('INFERENCE WALLET')}\n\n`);
 stdout.write(label('balance',bold(moneyMinor(wallet.balanceMinor))));
 stdout.write(label('roll debit',rollCostMinor(info)===null?'—':moneyMinor(rollCostMinor(info))));
 stdout.write(label('reload',Number.isSafeInteger(wallet.topupMinor)?moneyMinor(wallet.topupMinor):'$10.00'));
 rule();
 stdout.write(`  ${gold('›')} ${bold('loot topup')} ${dim('secure checkout, then return here')}\n\n`);
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
 stdout.write(`  ${gold('SECURE TOP-UP')}  ${moneyMinor(checkout.amountMinor??wallet.topupMinor??1000)}\n  ${dim('Card entry happens on the payment provider, never in LootLM.')}\n\n`);
 if(!flags['no-open'])await openCheckout(checkout.url);
 stdout.write(`  ${dim('Checkout:')} ${checkout.url}\n\n`);
 const glyphs=['◐','◓','◑','◒'];
 for(let attempt=0;attempt<240;attempt++){
  const state=await json(`/internal/checkouts/${encodeURIComponent(checkout.id)}`);
  if(['paid','credited','complete'].includes(state.status)){
   if(stdout.isTTY)stdout.write('\r\x1b[2K');
   stdout.write(`  ${gold('✓ FUNDED')} ${moneyMinor(state.creditedMinor??checkout.amountMinor??wallet.topupMinor??1000)} added.\n\n`);
   renderWallet(await json('/internal/me'),{withBrand:false});return;
  }
  if(['expired','failed','canceled'].includes(state.status))throw Error(`Checkout ${state.status}. No balance was added.`);
  if(stdout.isTTY)stdout.write(`\r\x1b[2K  ${royalRed(glyphs[attempt%glyphs.length])} Waiting for verified payment…`);
  await sleep(1500);
 }
 if(stdout.isTTY)stdout.write('\r\x1b[2K');
 stdout.write(`  ${gold('STILL PENDING')} ${dim('Run loot wallet later; the webhook remains authoritative.')}\n\n`);
}
function renderInventory(awards,{withBrand=true}={}){
 if(withBrand)brand();
 if(!awards.length){stdout.write(`  ${gold('Your vault is empty.')}\n  Start with ${bold('loot roll')}.\n\n`);return;}
 stdout.write(`  ${hotPink('╔═══ YOUR MODEL VAULT ═══╗')}\n  ${cyan('◆ '+awards.length+' DISCOVERED CARDS ◆')}\n\n`);
 awards.forEach((award,index)=>{
  const meta=tier(award.choice.tier);
  const active=award.id===cfg.model;
  stdout.write(`  ${active?hotPink('▶ EQUIPPED'):`  CARD ${String(index+1).padStart(2,'0')}`}  ${meta.paint(`[${modelSigils[award.choice.model]||'AI'}] ${modelLabel(award.choice.model)}`)}\n`);
  stdout.write(`             ${meta.paint(meta.glyph+' '+meta.label)} ${dim('· '+compact(award.available)+' tokens · '+short(award.id))}\n`);
 });
 stdout.write(`\n  ${gold('⚡')} ${dim('/use <number> to slam a card onto the payline')}\n\n`);
}
function renderCollection(pool,awards,{withBrand=true}={}){
 if(withBrand)brand();
 const owned=new Set(awards.map(award=>award.choice.model)),total=pool.entries.reduce((n,e)=>n+e.weight,0);
 stdout.write(`  ${hotPink('╔══════ DISCOVERY 01 CARD WALL ══════╗')}\n`);
 stdout.write(`  ${cyan('24 MODEL CARDS')} ${gold('•')} ${royalRed('1,000,000 TOKENS EACH')} ${gold('•')} ${dim('EXACT ODDS')}\n\n`);
 let previous;
 for(const entry of pool.entries){
  const meta=tier(entry.tier);
  if(previous!==entry.tier){
   if(previous)stdout.write('\n');
   const tierTotal=pool.entries.filter(item=>item.tier===entry.tier).reduce((n,item)=>n+item.weight,0)/total*100;
   stdout.write(`  ${meta.paint('━━ '+meta.glyph+' '+meta.label+' TIER '+meta.glyph+' ━━')} ${gold(tierTotal.toFixed(tierTotal%1?1:0)+'% TOTAL')}\n`);previous=entry.tier;
  }
  const probability=(entry.weight/total*100).toFixed(2).replace(/\.00$/,'');
  const tools=entry.capabilities?.parameters?.includes('tools')?'tools':'text only';
  const context=entry.capabilities?.contextLength?compact(entry.capabilities.contextLength)+' ctx':'context unverified';
  const sigil=modelSigils[entry.model]||'AI';
  stdout.write(`  ${owned.has(entry.model)?hotPink('◆ OWNED'):'◇ LOCKED'} ${meta.paint(`[${sigil}] ${fitPlain(modelLabel(entry.model),31)}`)} ${gold(String(probability+'%').padStart(7))}\n`);
  stdout.write(`           ${dim(fitPlain(entry.description||'Model card',34)+' · '+tools+' · '+context)}\n`);
 }
 stdout.write(`\n  ${hotPink('◆')} ${dim('owned')}  ◇ ${dim('locked')}  ${gold('• odds and capabilities live on this one screen')}\n\n`);
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
async function streamChat({model,choice,messages,maxTokens,showHeader=true}){
 const response=await api('/v1/chat/completions',{
  body:{model,messages,max_tokens:maxTokens,stream:true},
  headers:{'Idempotency-Key':randomUUID()}
 });
 let buffer='',usage=null,answer='';const decoder=new TextDecoder();
 if(showHeader){
  if(choice){const meta=tier(choice.tier);stdout.write(`\n  ${meta.paint(modelLabel(choice.model))}\n`);}
  else stdout.write(`\n  ${gold('◆ MODEL')}\n\n`);
 }
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
 const useScreen=stdout.isTTY;let reader,info,pool,allowances,awards,messages=[];
 if(useScreen){immersiveScreen=true;stdout.write('\x1b[?1049h\x1b[2J\x1b[H');}
 try{
  [info,pool,allowances]=await Promise.all([json('/internal/me'),json('/internal/pool'),json('/v1/allowances')]);awards=allowances.data;
  await renderHome(info,pool,awards);
  reader=createInterface({input:stdin,output:stdout,terminal:true});
  while(true){
   let input;try{input=(await reader.question(`  ${royalBold('loot')} ${gold('›')} `)).trim();}catch{break;}
   if(!input)continue;
   if(input.startsWith('/')){
    const [action,...rest]=input.slice(1).trim().split(/\s+/);const value=rest.join(' ');
    if(['exit','quit','q'].includes(action))break;
    if(action==='help'){
     stdout.write(`\n  ${hotPink('⚡ ARCADE CONTROLS ⚡')}\n\n  ${bold('/roll')}        pull the high-voltage model reel\n  ${bold('/models')}      open your model-card vault\n  ${bold('/collection')}  browse cards, capabilities, and exact odds\n  ${bold('/use N')}       slam card N onto the active payline\n  ${bold('/status')}      show the equipped card\n  ${bold('/new')}         clear in-memory conversation context\n  ${bold('/clear')}       redraw the cabinet\n  ${bold('/exit')}        cash out of this terminal session\n\n`);continue;
    }
    if(action==='roll'){
     reader.close();reader=null;
     try{
      const award=await performRoll({compactOutput:true,ask:question});
      if(award){allowances=await json('/v1/allowances');awards=allowances.data;}
     }catch(error){showError(error);}
     finally{reader=createInterface({input:stdin,output:stdout,terminal:true});}
     continue;
    }
    if(action==='models'||action==='vault'){allowances=await json('/v1/allowances');awards=allowances.data;renderInventory(awards,{withBrand:false});continue;}
    if(action==='collection'){pool=await json('/internal/pool');allowances=await json('/v1/allowances');awards=allowances.data;renderCollection(pool,awards,{withBrand:false});continue;}
    if(action==='wallet'){info=await json('/internal/me');renderWallet(info,{withBrand:false});continue;}
    if(action==='topup'){try{await topup();info=await json('/internal/me');}catch(error){showError(error);}continue;}
    if(action==='status'){
     [info,pool,allowances]=await Promise.all([json('/internal/me'),json('/internal/pool'),json('/v1/allowances')]);awards=allowances.data;
     await renderHome(info,pool,awards);continue;
    }
    if(action==='use'){
     const award=await resolveAward(value,awards);cfg.model=award.id;writeConfig();
     const meta=tier(award.choice.tier);
     stdout.write(`  ${gold('ACTIVE')} ${modelHeadline(award.choice,meta)} ${dim('· context kept')}\n\n`);continue;
    }
    if(action==='new'){messages=[];stdout.write(`  ${gold('NEW SESSION')} ${dim('Conversation context cleared; model unchanged.')}\n\n`);continue;}
    if(action==='clear'){stdout.write('\x1b[2J\x1b[H');await renderHome(info,pool,awards);continue;}
    stdout.write(`  ${red('Unknown command')} ${dim('· try /help')}\n\n`);continue;
   }
   const award=currentAward(awards);
   if(!award){stdout.write(`  ${gold('No model equipped.')} Run ${bold('/roll')} first.\n\n`);continue;}
   messages.push({role:'user',content:input});
   try{
    const reply=await streamChat({model:award.id,choice:award.choice,messages,maxTokens:Math.min(Number(flags['max-tokens']||512),info.maxOutput),showHeader:true});
    if(reply.answer)messages.push({role:'assistant',content:reply.answer});
    allowances=await json('/v1/allowances');awards=allowances.data;
   }catch(error){messages.pop();showError(error);}
  }
 }finally{
  reader?.close();immersiveScreen=false;
  if(useScreen)stdout.write('\x1b[?25h\x1b[?1000l\x1b[?1006l\x1b[?1049l');
  stdout.write(`\n  ${dim('Session closed. Your model remains in the vault.')}\n\n`);
 }
}
function help(){
 brand();
 stdout.write(`${hotPink('  ⚡ OPEN THE MODEL CASINO ⚡')}\n  ${royalBold('loot')}                           Interactive casino shell\n  loot demo                      Free isolated casino; no login needed\n  ${hotPink('loot roll')}                      Pull the high-voltage model reel\n  ${cyan('loot chat "prompt"')}             Use the equipped model\n\n${gold('  ◆ MODEL CARDS ◆')}\n  loot status                     Equipped card and token meter\n  loot inventory                  Your discovered-card vault\n  loot collection                 All cards, capabilities, and exact odds\n  loot use <number|award_id>       Equip a discovered card\n  loot usage                      Request and token ledger\n\n${gold('  ACCOUNT + INTEGRATION')}\n  loot login [--url URL] [--email EMAIL]\n  loot keys list|create|revoke\n  loot config                     Safe local configuration\n  loot logout\n  loot serve                      Start the private API server\n\n  ${dim('--json for automation · --no-animation · NO_COLOR=1')}\n  ${dim('Internal test build. No payment is collected in demo mode.')}\n\n`);
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
 if(cmd==='demo'){const {runDemo}=await import('./demo.js');await runDemo(args,{json:!!flags.json});return;}
 if(cmd==='help'){help();return;}
 if(cmd==='version'){stdout.write('lootlm 0.10.0\n');return;}
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
  else{brand();stdout.write(`  ${gold('SIGNED IN')} ${bold(email)}\n  ${dim('Credentials saved with owner-only permissions.')}\n\n  ${bold('1')}  ${gold('loot roll')}  ${dim('get a model')}\n  ${bold('2')}  ${royalBold('loot')}       ${dim('open the prompt shell')}\n\n`);}
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
 if(cmd==='collection'){
  const [pool,allowances]=await Promise.all([json('/internal/pool'),json('/v1/allowances')]);
  if(flags.json)stdout.write(JSON.stringify({pool,awards:allowances.data})+'\n');else renderCollection(pool,allowances.data);return;
 }
 if(cmd==='use'){
  const awards=(await json('/v1/allowances')).data;const award=await resolveAward(args[0],awards);
  const meta=tier(award.choice.tier);cfg.model=award.id;writeConfig();
  stdout.write(`\n  ${gold('ACTIVE')} ${modelHeadline(award.choice,meta)}\n  ${dim(award.choice.model+' · '+short(award.id))}\n\n`);return;
 }
 if(cmd==='usage'){
  const data=await json('/v1/usage');if(flags.json)stdout.write(JSON.stringify(data)+'\n');else{brand();renderUsage(data);}return;
 }
 if(cmd==='request'){if(!args[0])throw Error('Use lootlm request req_ID');stdout.write(JSON.stringify(await json('/v1/requests/'+encodeURIComponent(args[0])),null,2)+'\n');return;}
 if(cmd==='doctor'){stdout.write(JSON.stringify(await json('/internal/admin/openrouter'),null,2)+'\n');return;}
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
  brand();if(award){const meta=tier(award.choice.tier);stdout.write(`  ${meta.paint(meta.glyph+' '+meta.label)} ${dim('MODEL')}\n  ${modelHeadline(award.choice,meta)} ${dim('· '+compact(award.available)+' available')}\n  ${dim(award.choice.model)}\n`);}
  await streamChat({model,choice:award?.choice,messages:[{role:'user',content:prompt}],maxTokens,showHeader:!award});return;
 }
 if(cmd==='admin'){
  const sub=args[0]||'status';let data;
  if(sub==='models')data=await json('/internal/admin/catalog');
  else if(sub==='retry'){if(!flags.id)throw Error('Use --id req_ID');data=await json('/internal/admin/requests/'+encodeURIComponent(flags.id)+'/retry',{body:{}});}
  else if(sub==='status')data=await json('/internal/admin');
  else if(sub==='pause'||sub==='resume')data=await json('/internal/admin',{method:'PATCH',body:{inferenceEnabled:sub==='resume',spinsEnabled:sub==='resume'}});
  else if(sub==='pool'){if(!flags.file)throw Error('Use --file pool.json');const body=JSON.parse(fs.readFileSync(flags.file,'utf8'));data=await json('/internal/admin/pool',{method:'PUT',body:{entries:Array.isArray(body)?body:body.entries,supplier:flags.supplier||body.supplier}});}
  else if(sub==='openrouter-setup'){const file=fileURLToPath(new URL('../config/collection-openrouter-draft.json',import.meta.url));const body=JSON.parse(fs.readFileSync(file,'utf8'));data=await json('/internal/admin/pool',{method:'PUT',body:{entries:body.entries,supplier:'openrouter'}});}
  else if(sub==='resolve'){data=await json('/internal/admin/resolve',{body:{requestId:flags.id,input:Number(flags.input),output:Number(flags.output),cost:Number(flags.cost),note:flags.note}});}
  else throw Error('admin status|models|openrouter-setup|retry --id ID|pause|resume|pool --file FILE|resolve --id ID --input N --output N --cost USD --note EVIDENCE');
  stdout.write(JSON.stringify(data,null,2)+'\n');return;
 }
 throw Error(`Unknown command: ${cmd}. Run loot help.`);
}

main().catch(error=>{
 if(flags.json)stderr.write(JSON.stringify({error:{code:error.code||'cli_error',message:error.message}})+'\n');else showError(error);
 process.exitCode=1;
});
