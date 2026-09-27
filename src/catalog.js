import {modelPolicyViolation} from './model-policy.js';
import {Fault} from './store.js';
const fail=(code,message)=>{throw new Fault(400,code,message);};
const million=value=>{if(value===undefined||value===null||value===''||!Number.isFinite(Number(value))||Number(value)<0)fail('invalid_pricing','Missing or invalid catalog price.');return Number(value)*1e6;};
export function modelInfo(model){
 if(typeof model.id!=='string'||model.id.includes(':')||model.id.startsWith('openrouter/')||model.id.startsWith('~')||model.id.endsWith('-latest'))fail('dynamic_model','Choose a stable model ID without router or latest aliases.');
 if(!model.supported_parameters?.includes('max_tokens'))fail('unsupported_model','Model must support max_tokens.');
 const policy=modelPolicyViolation({model:model.id,name:model.name});if(policy)fail('model_policy',policy);
 const p=model.pricing||{};
 const inputPrice=million(p.prompt),outputPrice=million(p.completion);
 const variants=Array.isArray(p.overrides)?p.overrides:[];
 // Reserve for all advertised context and cache-write tiers, not only the cheapest endpoint.
 const inputCeiling=Math.max(inputPrice,...Object.entries(p).filter(([k])=>k.startsWith('input_cache_')).map(([,v])=>million(v)),...variants.flatMap(v=>Object.entries(v).filter(([k])=>k==='prompt'||k.startsWith('input_cache_')).map(([,x])=>million(x))));
 const outputCeiling=Math.max(outputPrice,...variants.filter(v=>v.completion!==undefined).map(v=>million(v.completion)));
 const knownOptional=['image','image_output','image_token','audio','audio_output','audio_input','internal_reasoning','web_search','input_audio_cache','request'];
 for(const [k,v] of Object.entries(p)){
  if(k==='overrides'||k==='prompt'||k==='completion'||k.startsWith('input_cache_')||knownOptional.includes(k))continue;
  if(Number(v)!==0)fail('unsupported_pricing',`Unrecognized price component: ${k}`);
 }
 if(p.request!==undefined&&Number(p.request)!==0)fail('unsupported_pricing','Per-request charges are unsupported.');
 if(p.internal_reasoning!==undefined&&Number(p.internal_reasoning)!==0)fail('unsupported_pricing','Separately priced reasoning is unsupported.');
 if(!model.architecture?.input_modalities?.includes('text')||model.architecture?.output_modalities?.length!==1||model.architecture.output_modalities[0]!=='text')fail('unsupported_model','Text input and output are required.');
 return {id:model.id,name:model.name||model.id,inputPrice,outputPrice,inputCeiling,outputCeiling,
  contextLength:model.context_length||model.top_provider?.context_length||0,
  maxOutput:model.top_provider?.max_completion_tokens||0,tokenizer:model.architecture.tokenizer||'unknown',
  parameters:model.supported_parameters||[],catalogCheckedAt:new Date().toISOString()};
}
export async function reviewEntries(provider,entries){
 if(!Array.isArray(entries)||entries.length<1||entries.length>12)fail('invalid_pool','Select 1–12 models.');
 const catalog=await provider.catalog();
 return entries.map(e=>{
  if(!e||typeof e.model!=='string')fail('invalid_model','Every entry needs a model ID.');
  if(e.model.includes(':')||e.model.startsWith('openrouter/'))fail('dynamic_model','Choose an exact model ID without router or variant aliases.');
  const raw=catalog.find(m=>m.id===e.model);if(!raw)fail('unknown_model',`Model unavailable: ${e.model}`);
  const info=modelInfo(raw);
  if(!Number.isFinite(e.inputPrice)||!Number.isFinite(e.outputPrice)||e.inputPrice<info.inputCeiling-1e-9||e.outputPrice<info.outputCeiling-1e-9)fail('price_ceiling',`Price ceiling too low for ${e.model}. Required input ≥ ${info.inputCeiling}, output ≥ ${info.outputCeiling} USD/million.`);
  if(!info.parameters.includes('max_tokens'))fail('unsupported_model',`${e.model} does not advertise max_tokens support.`);
  return {...e,capabilities:info};
 });
}
export function reservePlan(body,award,cfg,capabilities){
 const inputBytes=Buffer.byteLength(JSON.stringify({messages:body.messages,tools:body.tools,tool_choice:body.tool_choice}));
 if(inputBytes>cfg.maxInputBytes)fail('context_limit',`Input is limited to ${cfg.maxInputBytes} UTF-8 bytes.`);
 const inputBound=inputBytes+512+body.messages.length*64+(body.tools?.length||0)*256;
 const requested=body.max_completion_tokens??body.max_tokens;
 if(requested!==undefined&&(!Number.isSafeInteger(requested)||requested<1||requested>cfg.maxOutput))fail('output_limit',`Output limit must be 1–${cfg.maxOutput}.`);
 const modelOutput=capabilities?.maxOutput||cfg.maxOutput;
 const context=capabilities?.contextLength||Number.MAX_SAFE_INTEGER;
 const availableOutput=Math.max(0,Math.min(cfg.maxOutput,modelOutput,context-inputBound,award.available-inputBound));
 if(availableOutput<1||requested>availableOutput)throw new Fault(402,'insufficient_tokens',`Request cannot fit its token reservation. Maximum output for this prompt is ${availableOutput}; shorten input or use another allowance.`);
 const max=requested??availableOutput;
 if(capabilities){for(const key of ['tools','tool_choice','parallel_tool_calls','temperature','top_p','stop'])if(body[key]!==undefined&&!capabilities.parameters.includes(key))fail('unsupported_model_parameter',`${award.choice.model} does not advertise ${key} support.`);}
 const dollars=award.supplier==='demo'?0:(inputBound*award.choice.inputPrice+max*award.choice.outputPrice)/1e6*1.10;
 return {max,inputBound,tokens:inputBound+max,dollars,priceSnapshot:{supplier:award.supplier,model:award.choice.model,inputCeiling:award.choice.inputPrice,outputCeiling:award.choice.outputPrice,inputBound,maxOutput:max,reservationMethod:'utf8-upper-estimate-v1',catalog:capabilities||null}};
}
