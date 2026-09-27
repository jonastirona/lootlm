// Paid operator check, capped at $0.05 in aggregate worst-case reservations.
// Uses an existing live allowance. Never creates a purchase or changes a pool.
import {config} from '../src/config.js';
import {OpenRouterProvider} from '../src/providers.js';
import {reservePlan} from '../src/catalog.js';
import {randomUUID} from 'node:crypto';
try{process.loadEnvFile();}catch{}
const cfg=config();
if(!cfg.apiKey||cfg.provider!=='openrouter'||!cfg.liveEnabled){console.error('Live smoke test not run: configure OPENROUTER_API_KEY, LOOTLM_PROVIDER=openrouter, and LOOTLM_LIVE_ENABLED=true, then restart the server.');process.exit(2);}
const base=cfg.origin;let cookie;
async function call(route,body){
 const response=await fetch(base+route,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{}),'Idempotency-Key':randomUUID()},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(200000),redirect:'error'});
 if(!response.ok){const data=await response.json();throw Error(data.error?.message||`HTTP ${response.status}`);}return response;
}
try{
 const login=await call('/auth/login',{email:cfg.testers[0],code:cfg.accessCode});cookie=login.headers.get('set-cookie')?.split(';')[0];if(!cookie)throw Error('No session returned');
 const me=await(await call('/internal/me')).json();if(me.provider!=='openrouter'||!me.liveEnabled)throw Error('Running server is not in live mode. Restart it after configuring .env.');
 const awards=(await(await call('/v1/allowances')).json()).data;
 const desired=process.argv.includes('--award')?process.argv[process.argv.indexOf('--award')+1]:null;
 const award=awards.filter(a=>a.supplier==='openrouter'&&a.available>0&&(!desired||a.id===desired)).sort((a,b)=>(a.choice.inputPrice+a.choice.outputPrice)-(b.choice.inputPrice+b.choice.outputPrice))[0];
 if(!award)throw Error('Roll an allowance from the reviewed live pool first.');
 const provider=new OpenRouterProvider(cfg.apiKey);const status=await provider.connection();if(!status.ready)throw Error(status.message);
 const capabilities=award.choice.capabilities;
 if(!capabilities?.parameters?.includes('tools')||!capabilities.parameters.includes('tool_choice'))throw Error('Choose a tool-capable allowance for the three-part smoke test.');
 const max=Math.min(cfg.maxOutput,256);
 const requests=[
  {model:award.id,messages:[{role:'user',content:'Reply with the word hello.'}],max_tokens:max},
  {model:award.id,messages:[{role:'user',content:'Reply with the word streaming.'}],max_tokens:max,stream:true},
  {model:award.id,messages:[{role:'user',content:'Call the ping function now.'}],max_tokens:max,tools:[{type:'function',function:{name:'ping',description:'A harmless connection test',parameters:{type:'object',properties:{},additionalProperties:false}}}],tool_choice:{type:'function',function:{name:'ping'}}}
 ];
 const worst=requests.reduce((sum,b)=>sum+reservePlan(b,award,cfg,capabilities).dollars,0);
 if(worst>0.05)throw Error(`Smoke test reservation would exceed $0.05 (estimated $${worst.toFixed(4)}). Choose a cheaper model.`);
 const results=[];
 for(let index=0;index<requests.length;index++){
  const response=await call('/v1/chat/completions',requests[index]);const rid=response.headers.get('x-lootlm-request-id');
  if(index===1){const text=await response.text();if(!text.includes('data: [DONE]'))throw Error('Incomplete stream');const events=text.split('\n').filter(s=>s.startsWith('data: ')&&s!=='data: [DONE]').map(s=>JSON.parse(s.slice(6)));if(events.some(e=>e.error))throw Error('Streaming inference failed; inspect request '+rid);if(!events.some(e=>e.choices?.[0]?.delta?.content))throw Error('Stream returned no visible content. Increase the reasoning/output budget before retesting.');}
  else{const data=await response.json();if(index===0&&!data.choices?.[0]?.message?.content)throw Error('Text completion was empty.');if(index===2&&data.choices?.[0]?.message?.tool_calls?.[0]?.function?.name!=='ping')throw Error('Model did not return the requested tool call.');}
  const record=await(await call('/v1/requests/'+rid)).json();if(record.status!=='complete')throw Error('Request not settled: '+rid);
  let upstream;for(let attempt=0;attempt<6;attempt++){upstream=await provider.reconcile(record.provider_id,award.choice);if(upstream)break;await new Promise(r=>setTimeout(r,1000));}
  if(!upstream)throw Error('Upstream record not final yet; inspect '+rid+' before retrying.');
  if(upstream.input!==record.input_tokens||upstream.output!==record.output_tokens||Math.abs(upstream.cost-record.cost)>1e-8)throw Error('Upstream usage does not match LootLM: '+rid);
  results.push({test:['text','stream','tools'][index],request:rid,input:record.input_tokens,output:record.output_tokens,cost:record.cost});
 }
 console.log(JSON.stringify({ok:true,model:award.choice.model,results,totalCost:results.reduce((s,r)=>s+r.cost,0)},null,2));
}catch(e){console.error('Live smoke check failed: '+e.message);process.exitCode=1;}
finally{if(cookie){try{await call('/auth/logout',{});}catch{}}}
