import {test} from 'node:test';
import assert from 'node:assert/strict';
import {OpenRouterProvider} from '../src/providers.js';
const choice={model:'test/model',inputPrice:1,outputPrice:2};
test('OpenRouter adapter parses split SSE lines, tools, usage and forbids model fallback',async t=>{
 const original=globalThis.fetch;t.after(()=>globalThis.fetch=original);let sent;
 const events=[{id:'gen-one',choices:[{index:0,delta:{content:'Hi'},finish_reason:null}]},{id:'gen-one',choices:[{index:0,delta:{tool_calls:[{index:0,id:'call_1',type:'function',function:{name:'lookup',arguments:'{}'}}]},finish_reason:'tool_calls'}]},{id:'gen-one',choices:[],usage:{prompt_tokens:10,completion_tokens:20,cost:.00005}}];
 const text=': heartbeat\n\n'+events.map(e=>'data: '+JSON.stringify(e)+'\r\n\r\n').join('')+'data: [DONE]\n\n';
 globalThis.fetch=async(_url,options)=>{sent=JSON.parse(options.body);return new Response(new ReadableStream({start(c){for(let i=0;i<text.length;i+=7)c.enqueue(new TextEncoder().encode(text.slice(i,i+7)));c.close();}}));};
 const chunks=[],ids=[];const result=await new OpenRouterProvider('test').generate({messages:[{role:'user',content:'hi'}],stream:true,max_tokens:40},choice,{onChunk:c=>chunks.push(c),onId:id=>ids.push(id)});
 assert.equal(sent.model,'test/model');assert.equal(sent.provider.allow_fallbacks,false);assert.equal(sent.provider.require_parameters,true);assert.equal(result.usage.input+result.usage.output,30);assert.equal(result.usage.cost,.00005);assert.deepEqual(ids,['gen-one']);assert.equal(chunks[1].choices[0].delta.tool_calls[0].function.name,'lookup');
});
test('OpenRouter adapter treats missing usage as uncertain',async t=>{const original=globalThis.fetch;t.after(()=>globalThis.fetch=original);globalThis.fetch=async()=>new Response('data: {"id":"gen-lost","choices":[]}\n\ndata: [DONE]\n\n');await assert.rejects(new OpenRouterProvider('test').generate({stream:true},choice,{onChunk(){},onId(){}}),/without reliable usage/);});
test('OpenRouter adapter releases explicit rejection, but not ambiguous server failure',async t=>{const original=globalThis.fetch;t.after(()=>globalThis.fetch=original);for(const status of [400,429,500,502]){globalThis.fetch=async()=>new Response('{}',{status});await assert.rejects(new OpenRouterProvider('test').generate({},choice,{onId(){}}),e=>e.safeToRelease===(status<500));}});
test('OpenRouter reconciliation uses native counts and total cost',async t=>{const original=globalThis.fetch;t.after(()=>globalThis.fetch=original);globalThis.fetch=async()=>Response.json({data:{native_tokens_prompt:7,native_tokens_completion:12,native_tokens_reasoning:5,total_cost:.03}});assert.deepEqual(await new OpenRouterProvider('test').reconcile('gen-one',choice),{input:7,output:12,cost:.03});});
