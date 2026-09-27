// Explicit approved collection IDs replace the earlier family-wide floor.
const approved=new Set(['anthropic/claude-sonnet-5','anthropic/claude-opus-5.5','anthropic/claude-fable-5.1','openai/gpt-oss-20b','openai/gpt-oss-120b','openai/gpt-6-sol','openai/gpt-6-astra']);
export function modelPolicyViolation(entry){
 const model=String(entry?.model||'');
 if((model.startsWith('anthropic/')||model.startsWith('openai/'))&&!approved.has(model))return 'This Anthropic/OpenAI model is outside the approved collection.';
 if(/claude|anthropic|openai|codex|gpt/i.test(entry?.name||'')&&!approved.has(model))return 'Provider identity must match an approved model ID.';
 return null;
}
