# Terminal product contract

This document is the UI/backend seam for LootLM. PJ owns the terminal experience. Jonas owns the server, wallet, billing, provider, and durable-context behavior behind it.

## One surface

LootLM lives in Terminal. There is no dashboard, browser chat, browser vault, browser odds page, or custom checkout application.

The only browser exception is a payment processor's hosted checkout. `loot topup` starts that payment ceremony, opens the short-lived URL, and returns status to Terminal. A minimal completion page may say "Payment received; return to Terminal," but must not grow into a second account surface.

The old `public/` prototype is preserved only as unserved design history. It is excluded from the npm package and the API root returns a JSON 404.

## Visual system

The interface should feel like a restrained royal arcade, not a neon casino. Use the brand palette structurally:

| Role | Color | Hex | Use |
| --- | --- | --- | --- |
| Frame | Burgundy | `#8C2F4A` | Outlines, dividers, inactive meter tracks |
| Energy | Royal red | `#C8324D` | Wordmark, active meters, prompt identity, reel motion |
| Action | Antique gold | `#D4AF37` | Primary actions, section headings, success states |
| Error | Signal red | `#E84C5B` | Errors only |

Gold is an interaction and brand accent; it does not imply a Legendary result. Legendary uses its own warmer gold and always appears with its `✹` glyph and uppercase label. Outside a rarity result, do not use the Common, Uncommon, Rare, Epic, or Legendary colors decoratively. `NO_COLOR=1` must preserve the same hierarchy through glyphs, labels, weight, spacing, and borders.

The actual model is the headline. User-facing terminal views derive that headline from the provider model identifier and keep the exact identifier immediately underneath when space allows. Pool aliases may remain in snapshots for API compatibility, but names such as `Code Wizard`, `Daily Driver`, or `Mythic Mind` must not appear in the human CLI.

Epic and Legendary receive a short light sweep when revealed. Epic sweeps from deep purple to pale lavender; Legendary sweeps from warm gold to champagne. Do not blink, loop indefinitely, or animate the whole terminal. Reduced-motion mode and noninteractive output use a single static glint, and the rarity label and glyph continue carrying the meaning without color.

## Core loop

```text
loot login
    ↓
loot topup            planned: fixed $10 hosted checkout
    ↓
loot                  project + wallet + current loadout
    ↓
/roll                 confirm debit → server draw → animated reveal
    ↓
prompt loop           project and conversation remain attached
    ↓
allocation exhausted  checkpoint → roll again → continue
```

The animation never computes or alters the result. The server commits the roll and account debit atomically, then returns the immutable model/pool snapshot for reveal.

## Rarity system

Rarity is redundant by design: color, glyph, and uppercase label always appear together.

| Rarity | Terminal color | Glyph | Target entries |
| --- | --- | :---: | --- |
| Common | ANSI 250 gray | ◆ | 25%, 20% |
| Uncommon | ANSI 114 green | ⬟ | 15%, 10% |
| Rare | ANSI 75 blue | ✦ | 9%, 7% |
| Epic | ANSI 141 purple | ✧ | 6%, 4% |
| Legendary | Warm gold `#E6A431` | ✹ | 2%, 2% |

Mythic is sidelined for the MVP. The CLI temporarily maps the old prototype tiers `bust` to Common and `strong` to Epic; Jonas should remove those legacy values when the ten-model pool lands.

Rarity must describe probability, not guaranteed quality or monetary value. The exact percentage remains visible in `loot odds`.

## Money UX

The arcade presentation can avoid dollar signs during the reveal. The transaction cannot be obscure.

Before a paid roll, Terminal must show:

```text
ROLL CONFIRMATION
debit       $0.50
balance     $8.50 → $8.00
allocation  100k fresh input + 20k output

Roll? [y/N]
```

Afterward it shows the rarity/model reveal and new balance. `--yes` may support deliberate automation; a paid noninteractive roll without explicit confirmation must fail closed.

Keep the ledger denominated in USD. If the UI ever says "credits," it must state the fixed USD conversion beside the balance. Do not add gems, coins, exchange rates, transfers, cash-out, user-to-user value, variable top-up bonuses, or expiring balances without separate product and legal review.

The intended MVP is closed-loop service value: usable only for LootLM inference, non-transferable, and non-redeemable. That framing does not itself settle prepaid-access, consumer, gambling/loot-box, tax, escheatment, or provider-resale questions. Counsel and processor approval remain paid-launch gates. FinCEN's current prepaid-access materials describe a federal exclusion for some closed-loop value at or below $2,000, but the exact program and applicable state rules still need review: <https://www.fincen.gov/resources/statutes-regulations/guidance/final-rule-definitions-and-other-regulations-relating>.

The FTC identifies hidden costs and intermediate currencies that conceal real cost as dark-pattern risks, so legal safety should come from a clear contract and product structure rather than price obfuscation: <https://www.ftc.gov/system/files/ftc_gov/pdf/P214800%20Dark%20Patterns%20Report%209.14.2022%20-%20FINAL.pdf>.

## Top-up ceremony

`loot topup` is fixed at $10 for the MVP.

1. CLI sends `POST /internal/checkouts` with a fresh idempotency key.
2. Server creates a new Stripe Checkout Session in one-time `payment` mode, associating only its own user/order ID through `client_reference_id` or metadata.
3. Server returns a short-lived Checkout URL and LootLM checkout ID. It never returns Stripe secrets.
4. CLI opens the system browser. If that fails, it prints the URL without embedding an account bearer token. Card details never enter LootLM or the terminal.
5. CLI polls `GET /internal/checkouts/:id` and displays waiting, paid, expired, or failed.
6. Server verifies the Stripe webhook and credits exactly once. The redirect is never fulfillment evidence.
7. CLI refreshes `GET /internal/wallet` and renders the new balance.

Stripe documents server-created hosted Checkout Sessions, `client_reference_id`, and `payment_status` here: <https://docs.stripe.com/api/checkout/sessions>. Stripe also recommends webhook-based fulfillment rather than relying on the landing-page redirect: <https://docs.stripe.com/payments/existing-customers?platform=web&ui=stripe-hosted>.

Required operational cases: repeated webhooks, checkout retries, expired checkout, asynchronous payment, refund, dispute/chargeback, user closing the browser, CLI exit during payment, payment received after CLI exit, and negative wallet after reversal.

## Backend response contract for Jonas

Exact route names can change before implementation, but the semantics should not.

### `GET /internal/me`

```json
{
  "user": {"id": "usr_...", "email": "user@example.com"},
  "provider": "demo",
  "wallet": {
    "currency": "USD",
    "balanceMinor": 1000,
    "topupMinor": 1000,
    "topupEnabled": true
  },
  "roll": {
    "costMinor": 50,
    "enabled": true
  },
  "maxOutput": 20000
}
```

Use integer minor units for money. Do not use binary floating point for the wallet.

### `GET /internal/pool`

```json
{
  "version": "pool_...",
  "allocation": {
    "freshInputTokens": 100000,
    "outputTokens": 20000
  },
  "entries": [
    {
      "id": "glm-53-flash",
      "name": "GLM 5.3 Flash",
      "tier": "common",
      "weight": 25,
      "probability": 0.25
    }
  ]
}
```

Accepted tier values are `common`, `uncommon`, `rare`, `epic`, and `legendary`. Pool weights must total 100 for this published MVP table. Provider IDs and internal prices can remain operator-only; the terminal needs the display name, rarity, probability, allocation, and version.

### `POST /internal/spins`

Request requires an `Idempotency-Key`. For a paid roll, the wallet debit, spin record, session allocation, and immutable pool/model snapshot commit in one transaction.

```json
{
  "roll": {
    "id": "roll_...",
    "replayed": false,
    "costMinor": 50,
    "balanceBeforeMinor": 1000,
    "balanceAfterMinor": 950
  },
  "session": {
    "id": "session_...",
    "projectId": "project_...",
    "freshInputRemaining": 100000,
    "outputRemaining": 20000
  },
  "award": {
    "id": "award_...",
    "poolVersion": "pool_...",
    "choice": {
      "name": "GLM 5.3 Flash",
      "tier": "common",
      "model": "provider/model-id",
      "probability": 0.25
    }
  }
}
```

Insufficient wallet balance returns a stable machine-readable error and does not create a roll. An idempotent replay returns the original result and never debits twice.

### Durable project context

The current CLI keeps messages only while the process is open. The product promise requires a server-owned project/session contract that can checkpoint and resume across process restarts and model rolls. At minimum the terminal needs:

- stable `projectId` derived by explicit attach/init, not by leaking an absolute local path;
- current `sessionId` and selected award;
- checkpoint status before the next paid roll;
- bounded context size and clear compaction behavior;
- explicit privacy/retention controls;
- a failure state that never charges for a new roll if the checkpoint cannot attach.

Do not claim durable context until a clean terminal restart resumes the same test project and conversation under a newly rolled model.

## UI states

The terminal must visibly distinguish:

- signed out;
- signed in, unfunded;
- funded, no model;
- confirmation pending;
- rolling/reveal;
- model active;
- allocation low;
- allocation exhausted;
- checkpointing;
- checkout waiting/paid/expired;
- provider paused or unavailable;
- usage reconciliation pending.

Every state needs one primary next action. Errors keep the user's project and explain whether money, allocation, or provider usage changed.

## Non-goals for the UI lane

- provider selection or fallback logic;
- wallet/ledger mutation;
- Stripe secret handling or webhook implementation;
- pool publication or supplier-policy decisions;
- token accounting rules;
- durable context storage;
- public deployment.
