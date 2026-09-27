import {Fault} from './store.js';
const delay=(ms)=>new Promise(r=>setTimeout(r,ms));
export function normalizeUsage(u,choice){
 if(!u||!Number.isSafeInteger(u.prompt_tokens)||u.prompt_tokens<0||!Number.isSafeInteger(u.completion_tokens)||u.completion_tokens<0||!Number.isFinite(u.cost)||u.cost<0)throw Error('Provider did not return reliable token usage');
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
 constructor(key){this.key=key;}
 async catalog(){
  const response=await fetch('https://openrouter.ai/api/v1/models',{signal:AbortSignal.timeout(20000)});
  if(!response.ok)throw Error('Cannot fetch OpenRouter model catalog');return (await response.json()).data;
 }
 async generate(body,choice,{onChunk,onId}){
  const payload={...body,model:choice.model,provider:{allow_fallbacks:false,require_parameters:true}};
  delete payload.stream_options; // OpenRouter always includes final usage.
  const response=await fetch('https://openrouter.ai/api/v1/chat/completions',{method:'POST',headers:{Authorization:`Bearer ${this.key}`,'Content-Type':'application/json','X-Title':'LootLM Internal Testing'},body:JSON.stringify(payload),signal:AbortSignal.timeout(180000)});
  if(!response.ok){const error=new Fault(response.status>=500?502:response.status,'upstream_rejected',`OpenRouter rejected the request (HTTP ${response.status}).`);error.safeToRelease=response.status>=400&&response.status<500;throw error;}
  if(!onChunk){const data=await response.json();if(data.id)onId(data.id);if(data.error)throw Error('Provider returned an error');return {response:data,usage:normalizeUsage(data.usage,choice)};}
  let buffer='',usage=null,pid=null;const decoder=new TextDecoder();
  const consume=line=>{
   if(!line.startsWith('data:'))return;const data=line.slice(5).trim();if(!data||data==='[DONE]')return;
   const event=JSON.parse(data);if(event.error)throw Error('Provider stream returned an error');
   if(event.id&&event.id!==pid){pid=event.id;onId(pid);}
   if(event.usage)usage=normalizeUsage(event.usage,choice);
   onChunk(event);
  };
  for await(const bytes of response.body){buffer+=decoder.decode(bytes,{stream:true});let n;while((n=buffer.indexOf('\n'))>=0){consume(buffer.slice(0,n).trimEnd());buffer=buffer.slice(n+1);}}
  buffer+=decoder.decode();if(buffer.trim())consume(buffer.trim());
  if(!usage)throw Error('Stream ended without reliable usage');return {response:null,usage};
 }
 async reconcile(pid,choice){
  if(!pid)return null;
  const response=await fetch(`https://openrouter.ai/api/v1/generation?id=${encodeURIComponent(pid)}`,{headers:{Authorization:`Bearer ${this.key}`},signal:AbortSignal.timeout(15000)});
  if(!response.ok)return null;const {data}=await response.json();
  if(!data||!Number.isSafeInteger(data.native_tokens_prompt)||!Number.isSafeInteger(data.native_tokens_completion)||typeof data.total_cost!=='number')return null;
  return {input:data.native_tokens_prompt,output:data.native_tokens_completion,cost:data.total_cost};
 }
}
