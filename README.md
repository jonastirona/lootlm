# LootLM

A private model arcade: roll a model, receive 1,000,000 tokens, and use your allowance through a familiar API. Includes a web arcade and installable terminal client with animated rolls.

**Internal testing only.** Purchases are simulated. Demo mode performs no paid inference and clearly identifies its simulated responses. This repository is not a public commercial launch or supplier resale authorization.

## Start locally

Requires Node.js **24.2 or later** and npm. No database service is needed.

```sh
npm install
npm start
```

Open **http://localhost:3131**. Sign in as `demo@lootlm.local`; the generated access code is in `.lootlm/access-code` in the directory where you started the server:

```sh
cat .lootlm/access-code
```

Local runtime data lives in `.lootlm/`, ignored by git and excluded from packages. SQLite uses WAL and atomic transactions. Keep this version to **one server process** with a persistent local disk; it is not a horizontally scaled PostgreSQL deployment.

## Install the CLI

From this downloaded project:

```sh
npm link
lootlm login
lootlm roll
lootlm inventory
lootlm chat "Give me an unusual app idea."
```

For a downloadable installer artifact:

```sh
npm pack
npm install --global ./lootlm-0.1.0.tgz
```

The package is **not published to npm**. Do not assume `npm install -g lootlm` points to this project. A local installation exposes the `lootlm` command; `lootlm serve` starts the bundled private server. The CLI defaults to localhost. Use `lootlm login --url https://your-private-host.example` for your own deployed server.

`lootlm roll --no-animation` and `LOOTLM_REDUCED_MOTION=1` skip animation. `--json` produces script-friendly output without ANSI decoration. `NO_COLOR=1` disables color. Noninteractive terminals skip animation automatically. The web app respects the operating system's reduced-motion preference; sound is opt-in.

## What works

- Invite-only tester login, sessions, API keys and revocation.
- Independent cryptographically random rolls; immutable model and odds snapshots.
- A guaranteed one-million-token allowance per test roll.
- Web and terminal reel animations, vault, usage, keys, integration examples.
- OpenAI-compatible text Chat Completions, streaming and function-tool forwarding.
- Atomic reservations, concurrency limits, separate actual token and provider-cost ledgers.
- OpenRouter adapter with explicit live enablement, model-catalog checks and price ceilings.
- Global daily budget, per-request limits, rare-tier switch and emergency pause.
- Incomplete provider requests stay reserved; reconciliation retries every 30 seconds.
- Administrative model-pool editing, audit log and evidence-based manual settlement.

## Enable OpenRouter internal testing

1. Copy `.env.example` to `.env` and set `OPENROUTER_API_KEY`, `LOOTLM_PROVIDER=openrouter`, and `LOOTLM_LIVE_ENABLED=true`.
2. Keep a small `LOOTLM_DAILY_USD` and restart the server.
3. Open **Admin**. Replace the demo pool with model IDs actually present in OpenRouter's catalog and conservative nonzero `inputPrice` / `outputPrice` values in **USD per million**. Publishing a live pool checks catalog availability and prices. Unsupported additional charges are rejected.
4. Roll **new** allowances from that pool. Demo-era allowances have zero price ceilings and cannot silently become live inference allowances.
5. Rare live inference starts disabled. Enable it explicitly in Admin only after reviewing the budget.

Every live request rechecks its exact model and price ceiling. Model fallback is disabled. A provider may still route among endpoints for the same model. Price checks are not guaranteed future pricing; if actual use exceeds a reservation, inference pauses and an audit record is created.

A request reserves a conservative UTF-8 input bound plus maximum generation, and a dollar ceiling with 10% headroom. This is **not an exact tokenizer guarantee for every provider**. Only admit models whose accounting and limit behavior you have verified. If a provider exceeds the bound, the true usage is retained (including a possible negative allowance) and inference stops. This internal MVP is fail-closed on unknown usage, not an absolute upstream spend guarantee.

## Tests

```sh
npm test
npm run check
npm run pack:check
```

Tests use isolated temporary databases and a simulated provider; no OpenRouter spend. They cover authorization, isolation, idempotency, concurrent reservations, budget caps, usage normalization, streaming, tools and incomplete-request recovery.

## Guides

- [Human quickstart](docs/human-onboarding.md)
- [CLI reference](docs/cli.md)
- [API integration](docs/api.md)
- [Coding-agent onboarding](docs/agents.md)
- [Operator guide and limitations](docs/operations.md)

No payments, referrals, public signup, cash-out, MCP server, web chat history, or commercial supplier agreements are included. The connection test is a single request, not a full chat product. Do not expose the localhost prototype directly to the public internet.
