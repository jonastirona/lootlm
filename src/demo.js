import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {config} from './config.js';
import {createApp} from './server.js';

export async function runDemo(args=[]){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lootlm-demo-'));
 const cfg=config({LOOTLM_DATA_DIR:dir,LOOTLM_PROVIDER:'demo',LOOTLM_ACCESS_CODE:randomUUID()});
 const {app,store}=createApp(cfg);
 const server=app.listen(0,'127.0.0.1');
 try{
  await new Promise((resolve,reject)=>{server.once('listening',resolve);server.once('error',reject);});
  const url=`http://127.0.0.1:${server.address().port}`;
  const user=store.user('demo@lootlm.local');
  const key=store.credential(user,'key','Temporary demo').key;
  process.stdout.write('\n  Demo · simulated responses · no charges · vault resets on exit.\n\n');
  const child=spawn(process.execPath,[fileURLToPath(new URL('./cli.js',import.meta.url)),...(args.length?args:['play'])],{
   stdio:'inherit',env:{...process.env,LOOTLM_URL:url,LOOTLM_API_KEY:key,LOOTLM_CONFIG_DIR:path.join(dir,'client'),OPENROUTER_API_KEY:'',LOOTLM_PROVIDER:'demo',LOOTLM_LIVE_ENABLED:'false'}
  });
  const stop=()=>child.kill('SIGTERM');
  process.on('SIGINT',stop);process.on('SIGTERM',stop);
  try{process.exitCode=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',(code)=>resolve(code??0));});}
  finally{process.off('SIGINT',stop);process.off('SIGTERM',stop);}
 }finally{
  server.closeAllConnections();await new Promise(resolve=>server.close(resolve));store.close();fs.rmSync(dir,{recursive:true,force:true});
 }
}
