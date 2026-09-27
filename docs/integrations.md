# Integration surfaces

LootLM is the token and model entitlement layer. The client supplies the agent loop, tools, project context, approvals, and user interface. One award can therefore power three kinds of product, provided the client speaks a protocol LootLM supports and the awarded model supports the parameters that client needs.

| Use | Client owns | LootLM owns | Current status |
| --- | --- | --- | --- |
| Coding agent | File access, shell, patches, approval flow, context compaction | Award selection, model routing, token ledger, budget controls | Generic OpenAI-compatible agents work through Chat Completions; named coding clients need adapters below |
| Other agent | Tool definitions, tool execution, memory, workflow | Same gateway and accounting | Available through `/v1/chat/completions` when the award advertises tool support |
| Chatbot | Conversation UI and history | Same gateway and accounting | Available through `/v1/chat/completions`, including streaming |

## Generic agents and chatbots

Use an OpenAI-compatible client with the LootLM server URL plus `/v1`, a LootLM API key, and an `award_...` model ID returned by `GET /v1/models`. The client remains responsible for executing tool calls. Text-only Starter awards are valid for chat but are not coding-agent-compatible.

## Claude Code

Claude Code supports gateways that expose an Anthropic-compatible API. LootLM therefore needs an adapter for Anthropic Messages requests, streaming events, token counting, beta headers, and error shapes. It is not enough to point Claude Code at the current Chat Completions endpoint. Anthropic documents third-party gateways, but does not support routing Claude Code to non-Claude models. The first supported LootLM path should consequently be Claude Code plus an awarded Claude model, followed by an explicit compatibility suite for every forwarded field.

Planned user configuration after that adapter exists:

```sh
export ANTHROPIC_BASE_URL=https://api.lootlm.example
export ANTHROPIC_AUTH_TOKEN=loot_REPLACE_ME
claude
```

## Codex

Codex custom providers use the OpenAI Responses protocol. The official configuration reference lists `responses` as the only supported `wire_api`. LootLM currently exposes Chat Completions, so Codex integration requires `/v1/responses` with response-item streaming, function calls, reasoning-item handling, and usage reconciliation before it can be advertised.

Planned user configuration after that adapter exists:

```toml
model = "award_REPLACE_ME"
model_provider = "lootlm"

[model_providers.lootlm]
base_url = "https://api.lootlm.example/v1"
env_key = "LOOTLM_API_KEY"
wire_api = "responses"
```

## Cursor

Cursor's documented bring-your-own-key path is tied to its listed providers and chat models. Its documentation says custom keys do not power Tab completion. LootLM should not promise a native Cursor integration until a supported custom-gateway route is documented and tested. Users can still use LootLM from a terminal agent beside Cursor, or from an extension/agent that accepts an OpenAI-compatible Chat Completions endpoint.

## Compatibility contract

Each collection entry records catalog-advertised parameters and context length. Those are discovery metadata, not proof that a full agent works. A model earns a `coding-agent verified` label only after text, streaming, parallel tools, malformed-tool recovery, cancellation, long-context accounting, and client-specific behavior pass live tests.

Sources: [Claude Code gateway overview](https://code.claude.com/docs/en/llm-gateway), [Claude Code gateway compatibility](https://code.claude.com/docs/en/llm-gateway-protocol), [Codex configuration reference](https://developers.openai.com/codex/config-reference/), and [Cursor BYOK documentation](https://cursor.com/docs/settings/api-keys).
