#!/usr/bin/env node
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {OpenRouterProvider} from '../src/providers.js';
import {reviewEntries} from '../src/catalog.js';

try{process.loadEnvFile();}catch{}
const file=fileURLToPath(new URL('../config/collection-openrouter-draft.json',import.meta.url));
const draft=JSON.parse(fs.readFileSync(file,'utf8'));
const provider=new OpenRouterProvider(process.env.OPENROUTER_API_KEY);

try{
 const [connection,entries]=await Promise.all([provider.connection(),reviewEntries(provider,draft.entries)]);
 const tiers=Object.fromEntries(entries.reduce((map,entry)=>map.set(entry.tier,(map.get(entry.tier)||0)+entry.weight),new Map()));
 console.log(JSON.stringify({catalogReady:true,keyReady:connection.ready,keyStatus:connection.status,models:entries.length,totalWeight:entries.reduce((sum,entry)=>sum+entry.weight,0),tierWeights:tiers,checkedAt:new Date().toISOString(),message:connection.message},null,2));
 if(!connection.ready)process.exitCode=2;
}catch(error){
 console.error(JSON.stringify({catalogReady:false,keyReady:false,error:error.code||'openrouter_check_failed',message:error.message},null,2));
 process.exitCode=1;
}
