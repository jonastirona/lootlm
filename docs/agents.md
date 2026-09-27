# Coding-agent integration instructions

Integrate the existing LootLM API into the user's application. No custom MCP server is needed.

1. Ask for or locate the user's intended LootLM base URL and chosen award ID. Discover allowances with authenticated `GET /v1/models` when authorized.
2. Read `LOOTLM_API_KEY` from the environment or the existing secret manager. Never commit it, log it, embed it in frontend bundles, or send the upstream OpenRouter key to LootLM clients.
3. Use the application's existing OpenAI-compatible Chat Completions client. Set its base URL to the LootLM `/v1` endpoint and model to the selected `award_...` ID.
4. Keep the user's prompts and function-tool definitions intact. The application still executes its own tools. Check supported parameters in `api.md`; unsupported fields fail explicitly.
5. Begin with a small, explicitly bounded request, e.g. 128 output tokens. In demo mode describe the response as simulated; do not report it as real model performance.
6. Disable automatic retries initially. For transport retry support, assign a stable Idempotency-Key per logical request and handle HTTP 409 by inspecting usage, not by inventing a new key.
7. Preserve SSE error handling, including errors after HTTP 200. On pending reconciliation or exhausted balance, show an actionable error. Do not silently switch models or spend from another allowance.
8. Test ordinary text, streaming, tools if used, and insufficient-balance handling. Report what was actually tested.

Changing integration code is authorized by an integration request. Creating purchases, changing odds, enabling expensive models, or modifying spending controls is separate work requiring the user's instruction. This MVP has no real purchases.
