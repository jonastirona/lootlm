import {Fault} from './store.js';
const delay=(ms)=>new Promise(r=>setTimeout(r,ms));
export function normalizeUsage(u,choice){
 if(!u||!Number.isSafeInteger(u.prompt_tokens)||u.prompt_tokens<0||!Number.isSafeInteger(u.completion_tokens)||u.completion_tokens<0||!Number.isFinite(u.cost)||u.cost<0)throw Error('Provider did not return reliable token usage');
 if(u.total_tokens!==undefined&&u.total_tokens!==u.prompt_tokens+u.completion_tokens)throw Error('Inconsistent provider token totals');
 // Completion tokens already include reasoning. Cached input remains part of prompt_tokens.
 return {input:u.prompt_tokens,output:u.completion_tokens,cost:u.cost};
}
export class DemoProvider {
 async generate(body,choice,{onChunk,onId}){
  const rid='demo_'+crypto.randomUUID();onId(rid);
  const last=body.messages.filter(m=>m.role==='user').at(-1)?.content||'';
  const content=`[LootLM demo · ${choice.model}]\n\nYour allowance is connected. You said: ${last}\n\nThis is a simulated response, not output from ${choice.model}. Add an OpenRouter key and review the live model pool to run real inference.`;
  const input=Math.ceil(Buffer.byteLength(JSON.stringify(body.messages))/4);
  const output=Math.min(body.max_tokens,Math.ceil(Buffer.byteLength(content)/4));const text=content.slice(0,output*4);
  const tools=body.tool_choice==='required'||typeof body.tool_choice==='object';
  const tool=body.tools?.[0];
  let message={role:'assistant',content:text};
  if(tools&&tool){message={role:'assistant',content:null,tool_calls:[{id:'call_demo',type:'function',function:{name:typeof body.tool_choice==='object'?body.tool_choice.function.name:tool.function.name,arguments:'{}'}}]};}
  if(onChunk){
   if(message.tool_calls)onChunk({id:rid,object:'chat.completion.chunk',choices:[{index:0,delta:{role:'assistant',tool_calls:message.tool_calls.map((x,index)=>({...x,index}))},finish_reason:null}]});
   else for(const part of text.match(/.{1,20}|\n/g)||[]){await delay(12);onChunk({id:rid,object:'chat.completion.chunk',choices:[{index:0,delta:{content:part},finish_reason:null}]});}
   onChunk({id:rid,object:'chat.completion.chunk',choices:[{index:0,delta:{},finish_reason:tools?'tool_calls':'stop'}]});
  }
  return {response:{id:rid,object:'chat.completion',created:Math.floor(Date.now()/1000),model:choice.model,choices:[{index:0,message,finish_reason:tools?'tool_calls':'stop'}],usage:{prompt_tokens:input,completion_tokens:output,total_tokens:input+output}},usage:{input,output,cost:0}};
 }
 async reconcile(){return null;}
}

export class OpenRouterProvider {
 constructor(key,{ttl=60000,fetcher=(...args)=>fetch(...args),now=()=>Date.now()}={}){this.key=key;this.ttl=ttl;this.fetch=fetcher;this.now=now;this.cached=null;this.inflight=null;}
 async catalog(){
  if(this.cached&&this.now()-this.cached.at<this.ttl)return this.cached.data;
  if(this.inflight)return this.inflight;
  this.inflight=(async()=>{
   try{
    const response=await this.fetch('https://openrouter.ai/api/v1/models',{signal:AbortSignal.timeout(15000)});
    if(!response.ok)throw new Fault(503,'catalog_unavailable','OpenRouter model catalog unavailable. Try again shortly.');
    const {data}=await response.json();if(!Array.isArray(data))throw Error('Invalid catalog');
    this.cached={at:this.now(),data};return data;
   }catch(e){if(e instanceof Fault)throw e;throw new Fault(503,'catalog_unavailable','Cannot reach a valid OpenRouter model catalog.');}
  })();
  try{return await this.inflight;}finally{this.inflight=null;}
 }
 async connection(){
  const at=new Date().toISOString();
  if(!this.key)return {status:'key_missing',ready:false,checkedAt:at,message:'Set OPENROUTER_API_KEY in the local .env file and restart.'};
  try{
   const response=await this.fetch('https://openrouter.ai/api/v1/key',{headers:{Authorization:`Bearer ${this.key}`},signal:AbortSignal.timeout(15000)});
   if(!response.ok)return {status:response.status===401||response.status===403?'key_rejected':'upstream_unavailable',ready:false,checkedAt:at,message:`OpenRouter key check returned HTTP ${response.status}.`};
   const {data}=await response.json();if(!data||typeof data!=='object')throw Error('Invalid key metadata');
   const remaining=typeof data.limit_remaining==='number'?data.limit_remaining:null;
   const exhausted=data.limit!==null&&data.limit!==undefined&&remaining!==null&&remaining<=0;
   const expired=data.expires_at&&Date.parse(data.expires_at)<=Date.now();
   return {status:expired?'key_expired':exhausted?'key_limit_exhausted':'connected',ready:!expired&&!exhausted,checkedAt:at,
    limit:typeof data.limit==='number'?data.limit:null,remaining,usage:typeof data.usage==='number'?data.usage:null,
    message:expired?'Replace the expired key.':exhausted?'The key spending limit is exhausted.':'Key accepted. Actual requests still depend on account credit and model availability.'};
  }catch{return {status:'upstream_unavailable',ready:false,checkedAt:at,message:'Could not verify OpenRouter connectivity. Check network access and retry.'};}
 }
 checkModel(data,choice){if(data.model&&data.model!==choice.model){const e=new Fault(502,'model_mismatch','Upstream returned a different model. Inference has been paused.');throw e;}}
 async generate(body,choice,{onChunk,onId}){
  const payload={...body,model:choice.model,provider:{allow_fallbacks:false,require_parameters:true,sort:'price',max_price:{prompt:choice.inputPrice,completion:choice.outputPrice,request:0}}};
  delete payload.stream_options;
  const response=await this.fetch('https://openrouter.ai/api/v1/chat/completions',{method:'POST',headers:{Authorization:`Bearer ${this.key}`,'Content-Type':'application/json','X-OpenRouter-Title':'LootLM Internal Testing'},body:JSON.stringify(payload),signal:AbortSignal.timeout(180000)});
  if(!response.ok){
   const messages={401:'OpenRouter rejected the server API key.',402:'OpenRouter account credit is exhausted.',403:'OpenRouter denied access to this model.',404:'No matching OpenRouter model endpoint is available.',429:'OpenRouter is rate limiting this request.'};
   const error=new Fault(response.status>=500?502:response.status,'upstream_rejected',messages[response.status]||`OpenRouter rejected the request (HTTP ${response.status}).`);
   error.safeToRelease=[400,401,402,403,404,405,413,415,422,429].includes(response.status);throw error;
  }
  if(!onChunk){const data=await response.json();if(data.id)onId(data.id);if(data.error)throw Error('Provider returned an error');this.checkModel(data,choice);return {response:data,usage:normalizeUsage(data.usage,choice)};}
  let buffer='',usage=null,pid=null,done=false;const decoder=new TextDecoder();
  const consume=line=>{
   if(!line.startsWith('data:'))return;const data=line.slice(5).trim();if(!data)return;if(data==='[DONE]'){done=true;return;}
   const event=JSON.parse(data);
   if(event.id&&event.id!==pid){pid=event.id;onId(pid);}
   if(event.error)throw Error('Provider stream returned an error');this.checkModel(event,choice);
   if(event.usage&&event.usage.prompt_tokens!==undefined)usage=normalizeUsage(event.usage,choice);
   onChunk(event);
  };
  for await(const bytes of response.body){buffer+=decoder.decode(bytes,{stream:true});let n;while((n=buffer.indexOf('\n'))>=0){consume(buffer.slice(0,n).trimEnd());buffer=buffer.slice(n+1);}}
  buffer+=decoder.decode();if(buffer.trim())consume(buffer.trim());
  if(!usage||!done)throw Error('Stream ended without reliable usage and completion marker');return {response:null,usage};
 }
 async reconcile(pid,choice){
  if(!pid)return null;
  const response=await this.fetch(`https://openrouter.ai/api/v1/generation?id=${encodeURIComponent(pid)}`,{headers:{Authorization:`Bearer ${this.key}`},signal:AbortSignal.timeout(15000)});
  if(!response.ok)return null;const {data}=await response.json();
  if(!data||(!data.finish_reason&&!data.native_finish_reason&&data.cancelled!==true))return null;
  this.checkModel(data,choice);
  if(!Number.isSafeInteger(data.native_tokens_prompt)||!Number.isSafeInteger(data.native_tokens_completion)||!Number.isFinite(data.total_cost))return null;
  return {input:data.native_tokens_prompt,output:data.native_tokens_completion,cost:data.total_cost};
 }
}
