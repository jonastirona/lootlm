import collection from '../config/collection-demo.json' with {type:'json'};
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
export function config(env=process.env) {
  const dataDir=path.resolve(env.LOOTLM_DATA_DIR||'.lootlm');
  fs.mkdirSync(dataDir,{recursive:true,mode:0o700});
  const secretPath=path.join(dataDir,'access-code');
  let accessCode=env.LOOTLM_ACCESS_CODE;
  if(!accessCode) {
    if(!fs.existsSync(secretPath)) fs.writeFileSync(secretPath,crypto.randomBytes(18).toString('base64url'),{mode:0o600});
    accessCode=fs.readFileSync(secretPath,'utf8').trim();
  }
  const number=(key,fallback)=>{const n=Number(env[key]??fallback);if(!Number.isFinite(n)||n<=0)throw Error(`${key} must be positive`);return n;};
  const port=number('PORT',3131);
  return {dataDir,accessCode,host:env.HOST||'127.0.0.1',port,
    origin:env.LOOTLM_ORIGIN||`http://localhost:${port}`,secureCookie:env.LOOTLM_SECURE_COOKIE==='true',
    testers:(env.LOOTLM_TESTERS||'demo@lootlm.local').split(',').map(s=>s.trim().toLowerCase()),
    admins:(env.LOOTLM_ADMINS||'demo@lootlm.local').split(',').map(s=>s.trim().toLowerCase()),
    provider:env.LOOTLM_PROVIDER||'demo',apiKey:env.OPENROUTER_API_KEY,
    liveEnabled:env.LOOTLM_LIVE_ENABLED==='true',dailyUsd:number('LOOTLM_DAILY_USD',5),
    maxOutput:Math.floor(number('LOOTLM_MAX_OUTPUT',1024)),maxInputBytes:Math.floor(number('LOOTLM_MAX_INPUT_BYTES',24000))};
}
export const initialPool=collection.entries;
