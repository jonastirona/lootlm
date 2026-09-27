# LootLM

LootLM is stochastic inference in the terminal: fund an account, roll into one model, and keep working with that model for a bounded token session. The repository, project, and conversation should survive the next roll; only the model changes.

**Terminal only.** LootLM has no product web app. The checked-in `public/` prototype is retained as unserved design history, is excluded from the package, and is not part of the user journey.

**Internal testing only.** The current server simulates purchases and inference by default. It is not a public commercial launch, supplier resale authorization, or proof of durable cross-roll context.

## Current maturity

This branch contains a working terminal UX over Jonas's original API:

- `loot` opens an interactive prompt shell; `lootlm` remains a compatibility alias.
- The selected model, project, token allocation, published odds, vault, usage, and errors are legible in-terminal.
- Conversation context follows the user across rolls while that shell remains open.
- Common, Uncommon, Rare, Epic, and Legendary each have a distinct ANSI color, glyph, and text label. Legendary is reserved for each 2% pool entry. Mythic is not in the MVP.
- Animations are cosmetic. The cryptographically random server result is persisted first and survives an interrupted reveal.
- `--json`, `NO_COLOR=1`, reduced motion, and narrow/noninteractive terminals remain supported.

The backend still grants one million shared **test** tokens from a four-model placeholder pool. It has no wallet, real checkout, $0.50 debit, 100k-fresh-input/20k-output split, or durable project checkpoint API yet. Those are explicit integration seams in [the terminal product contract](docs/terminal-product-contract.md), not shipped claims.

## Run the internal build

Requires Node.js 24.2 or later and npm.

```sh
npm install
npm start
```

In another terminal:

```sh
npm link
loot login --url http://localhost:3131
loot roll
loot
```

The local access code is generated at `.lootlm/access-code`. Runtime data lives under `.lootlm/`, which is ignored by git. The SQLite prototype supports one server process on persistent local disk; it is not a horizontally scaled deployment.

## Terminal flow

```text
$ loot

  ◈  lootlm  / STOCHASTIC INFERENCE
  roll a brain. keep the work.

  PROJECT    my-repo
  LOADOUT    ✧ GPT-6 Sol  EPIC
  TOKENS     ━━━━━━━━━━━━━━━───  88k available

  loot › /odds
  loot › /roll
  loot › Review the auth changes in this repository.
```

Inside the shell:

- `/roll` rolls another model without clearing the open conversation.
- `/models` lists saved model allocations; `/use N` equips one.
- `/odds` shows exact server-published probabilities.
- `/status` shows project, loadout, and remaining allocation.
- `/new` clears in-memory conversation context without changing models.
- `/help` lists commands; `/exit` leaves the shell.

One-shot commands are also available:

```sh
loot status
loot odds
loot inventory
loot use 2
loot chat "Give me an unusual app idea."
loot usage
```

## Target MVP economics

- Fixed $10 account reload.
- USD-denominated, non-transferable balance with no cash-out.
- $0.50 debit per roll.
- Roughly 100k fresh input plus 20k output per rolled session.
- Target expected inference COGS near $0.20 per roll.
- Target gross spread near 60% before payment and infrastructure costs.

Dollar amounts stay outside the animated reveal, but the wallet and exact debit must be clear before a paid roll and the post-roll balance must be clear afterward. Do not use an intermediate currency to hide the effective cash price.

The planned `loot topup` command creates a fresh server-side Stripe Checkout Session, opens Stripe's hosted payment page, and waits in the terminal for webhook-verified credit. LootLM must never collect card details in the terminal or credit from the browser redirect. This flow is not implemented yet.

## Target model pool

Provider availability and distribution policy must be verified before any paid pool is published. Display names below are product inputs, not claims that the models are currently orderable through a particular provider.

| Rarity | Model | Chance |
| --- | --- | ---: |
| Common | GLM 5.3 Flash | 25% |
| Common | DeepSeek V4.1 Flash | 20% |
| Uncommon | MiMo V2.6 Pro | 15% |
| Uncommon | Gemini 3.8 Flash | 10% |
| Rare | GLM 5.3 | 9% |
| Rare | Grok 4.7 | 7% |
| Epic | GPT-6 Sol | 6% |
| Epic | Claude Opus 5.5 | 4% |
| Legendary | Claude Fable 5.1 | 2% |
| Legendary | GPT-6 Astra | 2% |

## Existing API and safety controls

- Invite-only login, scoped API keys, and revocation.
- Immutable model and odds snapshots per roll.
- OpenAI-compatible text Chat Completions, streaming, and function-tool forwarding.
- Atomic reservations, per-user concurrency limits, and separate token/provider-cost ledgers.
- OpenRouter adapter with explicit live enablement, catalog checks, price ceilings, no fallback, and a global daily cap.
- Pending reconciliation for incomplete provider requests.
- CLI-only pool administration, audit log, and evidence-based manual settlement.

The provider adapter is not supplier permission. Paid resale, model-specific accounting, refunds, chargebacks, wallet treatment, identity recovery, and jurisdiction-specific review remain launch gates.

## Verification

```sh
npm test
npm run check
npm run pack:check
```

The automated suite is local and uses a simulated provider, so it creates no model spend. Passing it proves the tested API/CLI contracts, not paid-launch readiness or live provider availability.

## Guides

- [Human quickstart](docs/human-onboarding.md)
- [CLI reference](docs/cli.md)
- [Terminal product and Jonas backend contract](docs/terminal-product-contract.md)
- [API integration](docs/api.md)
- [Coding-agent onboarding](docs/agents.md)
- [Operator guide and limitations](docs/operations.md)
