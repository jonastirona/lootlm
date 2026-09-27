# LootLM

LootLM is stochastic inference in the terminal: fund an account, roll into one model, and keep working with that model for a bounded token session. The repository, project, and conversation should survive the next roll; only the model changes.

**Terminal only.** LootLM has no product web app. The checked-in `public/` prototype is retained as unserved design history, is excluded from the package, and is not part of the user journey.

**Internal testing only.** The current server simulates purchases and inference by default. It is not a public commercial launch, supplier resale authorization, or proof of durable cross-roll context.

## Current maturity

This branch contains a working terminal UX over Jonas's original API:

- `loot` opens an interactive prompt shell; `lootlm` remains a compatibility alias.
- The interface deliberately uses an obnoxious model-casino identity: animated bulbs, neon marquees, heavy gold cabinet borders, flashing paylines, and oversized payout language.
- Every one of the 24 models has a stable terminal card with its own two-character sigil, provider label, model title, rarity frame, and color treatment.
- Rolls use a full-screen three-reel slot cabinet. The reels move independently, stop one at a time, and align three copies of the persisted award on the center payline.
- The real model is always the headline; internal pool nicknames such as `Code Wizard` never appear in the human CLI.
- Epic, Legendary, and Mythic models receive an animated light sweep during reveals and a static glint when motion is reduced.
- The selected model, project, token allocation, published odds, vault, usage, and errors are legible in-terminal.
- Conversation context follows the user across rolls while that shell remains open.
- Starter, Common, Specialist, Epic, Legendary, and Mythic each have a distinct ANSI color, glyph, and text label.
- Animations are cosmetic. The cryptographically random server result is persisted first and survives an interrupted reveal.
- `--json`, `NO_COLOR=1`, reduced motion, and narrow/noninteractive terminals remain supported.

The backend grants one million shared **test** tokens from the 24-model Discovery 01 demo pool. It has no wallet, real checkout, $0.50 debit, 100k-fresh-input/20k-output split, or durable project checkpoint API yet. Those are explicit integration seams in [the terminal product contract](docs/terminal-product-contract.md), not shipped claims.

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

  ● ✦ ● ✦ ● ✦ ●
  ╔══════════════════════════════════════╗
  ║            ✦ L O O T L M ✦         ║
  ║        MODEL CASINO // DEMO          ║
  ╚══════════════════════════════════════╝

  ⚡ ACTIVE PAYLINE ⚡
   ╔══════[O5] ANTHROPIC══════╗
   ║      CLAUDE OPUS 5.5     ║
   ╚════✹ LEGENDARY ✹═════════╝

  loot › /collection
  loot › /roll
  loot › Review the auth changes in this repository.
```

Inside the shell:

- `/roll` rolls another model without clearing the open conversation.
- `/models` lists saved model allocations; `/use N` equips one.
- `/collection` combines the 24-card catalog, owned state, capabilities, tier totals, and exact per-model probabilities.
- `/status` shows the model headline, project, and remaining allocation.
- `/new` clears in-memory conversation context without changing models.
- `/help` lists commands; `/exit` leaves the shell.

One-shot commands are also available:

```sh
loot status
loot collection
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

Discovery 01 contains 24 distinct model IDs across Starter, Common, Specialist, Epic, Legendary, and Mythic. Tier probabilities are provisionally 30%, 35%, 20%, 10%, 4%, and 1%. Run `loot collection` for exact per-model odds and capability metadata, or see [the collection contract](docs/collection.md).

Provider availability and distribution policy must be verified before any paid pool is published. The checked-in live draft proves only that the IDs and advertised metadata appeared in the current catalog. It does not prove supplier permission, tested reliability, quality ordering, or viable economics.

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
- [Live OpenRouter setup](docs/openrouter.md)
- [Operator guide and limitations](docs/operations.md)

## OpenRouter backend setup

See [OpenRouter setup](docs/openrouter.md) for separate demo/live pools, price ceilings, `loot doctor`, request inspection and the capped live smoke test. Pending usage is reconciled with durable backoff; uncertain requests retain reservations.

## Collection and integrations

The demo now uses the 24-model **Discovery 01** collection with six visual tiers and provisional 30% / 35% / 20% / 10% / 4% / 1% tier odds. See [the collection contract](docs/collection.md). The terminal reveal is cosmetic; the server commits the result before the full-screen model reel starts.

LootLM is intended to be a token and model gateway, not a replacement coding harness. Generic agents and chatbots can use the existing OpenAI-compatible Chat Completions endpoint. Claude Code requires an Anthropic Messages adapter, Codex requires a Responses adapter, and Cursor's documented BYOK route does not cover custom Tab completion. See [the integration matrix](docs/integrations.md).
