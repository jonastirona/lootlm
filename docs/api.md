# API integration

Base URL: `http://localhost:3131/v1` locally. Use a server-issued LootLM key, not an OpenRouter key. Remote hosting requires HTTPS.

```sh
export LOOTLM_API_KEY='your-issued-key'
export LOOTLM_BASE_URL='http://localhost:3131/v1'
curl "$LOOTLM_BASE_URL/models" -H "Authorization: Bearer $LOOTLM_API_KEY"
```

Select an `award_...` ID from `/models`. IDs identify your exact model allowance and are not interchangeable between accounts.

## Python

```python
import os
from openai import OpenAI
client = OpenAI(api_key=os.environ['LOOTLM_API_KEY'],
                base_url=os.environ['LOOTLM_BASE_URL'], max_retries=0)
reply = client.chat.completions.create(
    model='award_REPLACE_ME',
    messages=[{'role': 'user', 'content': 'Write a binary search.'}],
    max_tokens=256,
)
print(reply.choices[0].message.content)
```

## TypeScript

```ts
import OpenAI from 'openai';
const client = new OpenAI({
  apiKey: process.env.LOOTLM_API_KEY,
  baseURL: process.env.LOOTLM_BASE_URL,
  maxRetries: 0,
});
const stream = await client.chat.completions.create({
  model: 'award_REPLACE_ME',
  messages: [{ role: 'user', content: 'Write a binary search.' }],
  max_tokens: 256,
  stream: true,
});
for await (const event of stream) {
  process.stdout.write(event.choices[0]?.delta?.content ?? '');
}
```

## LiteLLM configuration

```yaml
model_list:
  - model_name: my-loot
    litellm_params:
      model: openai/award_REPLACE_ME
      api_base: http://localhost:3131/v1
      api_key: os.environ/LOOTLM_API_KEY
```

This is an integration recipe for LiteLLM's OpenAI-compatible provider path, not a claim of support for all LiteLLM features. Disable automatic retries or use a stable idempotency key and inspect request status before resubmission.

## Surface

- `GET /v1/models`: unexhausted allowances, with underlying model and balance metadata.
- `GET /v1/allowances`: all allowances, remaining and reserved tokens, model snapshot and pool version.
- `GET /v1/usage`: latest 100 request records, including pending and failed requests.
- `POST /v1/chat/completions`: text Chat Completions with optional SSE streaming.
- `POST /internal/spins`: private test roll; requires `Idempotency-Key`.
- `GET|POST /internal/api-keys`: list keys or create with `{ "name": "my app" }`.
- `DELETE /internal/api-keys/:id`: revoke a key belonging to the current user.

Supported chat fields: `model`, `messages`, `stream`, `stream_options`, `max_tokens` or `max_completion_tokens`, `temperature`, `top_p`, `tools`, `tool_choice`, `parallel_tool_calls`, `stop`. Text content only. Tool calls are forwarded; the gateway never executes tools. Images, audio, files, Responses API, embeddings, structured-output parameters and other unlisted fields are rejected.

Default maximum generated tokens: 1,024; request input cap: 24,000 UTF-8 bytes; two active/pending requests per user. Operator settings can change these. Conservative input reservations mean the usable per-request maximum can be below the remaining balance.

## Idempotency and accounting

Send a unique `Idempotency-Key` header for each logical request and reuse it for transport retries. Roll retries return the same award. Inference retries never generate a second response with that key: they return HTTP 409, because response content is not retained for replay. If you omit the header, each submission is independent. Disable SDK automatic retries unless you implement stable keys.

`X-LootLM-Request-Id` identifies the ledger entry. Successful responses preserve the award ID in `model` and expose the actual model as `lootlm_model`. Normalized usage counts `prompt_tokens + completion_tokens`; reasoning and cached-token subtotals are not added again.

Interrupted or uncertain provider responses retain reservations. The worker checks upstream generation records. Unknown usage requires operator investigation, not automatic refund or blind retry. A completed request may still consume tokens if the client disconnected before receiving it.

Streaming errors after headers are sent arrive as SSE `error` objects. Inspect them even if the initial HTTP status was 200.

Errors use `{ "error": { "code": "...", "message": "..." } }`:

- 400: invalid or unsupported input, model or pricing configuration.
- 401/403: invalid key, ownership/administration failure, rare tier disabled.
- 402: insufficient unreserved tokens.
- 409: idempotency conflict or existing request.
- 429: concurrency, login, roll or daily budget limit.
- 502: upstream failure or pending reconciliation.
- 503: inference/spins paused or live provider disabled.
