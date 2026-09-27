const compact=value=>String(value||'').toLowerCase().replace(/[^a-z0-9]+/g,'');

export function modelPolicyViolation(entry){
 const identities=[compact(entry?.name),compact(entry?.model)];
 for(const identity of identities){
  const isClaude=identity.includes('anthropic')||identity.includes('claude');
  const allowedClaude=identity.includes('opus55')||identity.includes('fable');
  if(isClaude&&!allowedClaude)return 'Anthropic entries are limited to Claude Opus 5.5 and Claude Fable.';

  const isOpenAI=identity.includes('openai')||identity.includes('codex')||identity.includes('gpt');
  const allowedOpenAI=identity.includes('astra');
  if(isOpenAI&&!allowedOpenAI)return 'OpenAI and Codex entries are limited to GPT Astra.';
 }

 return null;
}
