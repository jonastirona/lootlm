# Terminal product contract

This document is the UI/backend seam for LootLM. PJ owns the terminal experience. Jonas owns the server, wallet, billing, provider, and durable-context behavior behind it.

## One surface

LootLM began as a terminal-first product. The current build also serves a browser arcade, vault, exact odds view, and API onboarding from the same backend.

Future payment entry remains hosted by the payment processor. `loot topup` starts that payment ceremony, opens the short-lived URL, and returns status to Terminal; the browser arcade must use the same hosted checkout and webhook-verified credit flow.

The old `public/` prototype is preserved only as unserved design history. It is excluded from the npm package and the API root returns a JSON 404.

## Visual system

The interface is intentionally excessive: a neon model casino rendered in Terminal. Use animated bulbs, heavy cabinet borders, hot-pink and cyan marquees, gold paylines, flashing payout language, and rarity-colored cards. The spectacle must remain legible and restore the terminal cleanly after every animation.

| Role | Color | Hex | Use |
| --- | --- | --- | --- |
| Frame | Burgundy | `#8C2F4A` | Outlines, dividers, inactive meter tracks |
| Energy | Royal red | `#C8324D` | Wordmark, active meters, prompt identity, reel motion |
| Action | Antique gold | `#D4AF37` | Primary actions, section headings, success states |
| Flash | Hot pink | `#FF42AD` | Bulbs, payline arrows, payout banners |
| Voltage | Cyan | `#47DCFF` | Marquee lights, live-machine status |
| Error | Signal red | `#E84C5B` | Errors only |

Gold is an interaction and cabinet accent; it does not imply a Legendary result. Legendary uses its own warmer gold and always appears with its `✹` glyph and uppercase label. `NO_COLOR=1` must preserve the same hierarchy through glyphs, labels, weight, spacing, and borders.

The actual model is the headline. Every collection model has a stable two-character card sigil, provider label, model title, rarity frame, glyph, and color. User-facing views derive the title from the provider model identifier. Pool aliases may remain in snapshots for API compatibility, but names such as `Code Wizard`, `Daily Driver`, or `Mythic Mind` must not appear in the human CLI.

An interactive session owns the terminal alternate screen from launch through exit. Its animated home cabinet fills the terminal with a moving marquee, the active card or roll invitation, navigation, and a prompt anchored to the bottom row. It restores the user's shell screen afterward and never requests operating-system fullscreen. A roll begins with a lever inside the model-wheel cabinet. In a mouse-aware terminal, the user presses its handle, drags downward, and releases; Space and Enter remain fallbacks. LootLM consumes the complete SGR press, motion, and release sequence before disabling mouse reporting. The lever follows the drag and springs upward while the same cabinet starts its fixed-width vertical wheel with five visible card positions because each draw awards one model. Structural alignment uses ASCII characters only; ambiguous-width rarity glyphs and nested card borders do not participate in the wheel geometry. The center row uses a high-contrast background and explicit inward markers. The header says that one pull awards one model and 1,000,000 tokens. Each animation uses a newly randomized showcase sequence. High-rarity cards receive increased visual weight and one rare card appears immediately before the landing, while the already persisted server award remains authoritative. The UI labels the sequence as a showcase and points to `/collection` for exact odds. Every persisted result, including Bust, receives a separate full-screen animated prize reveal before control returns to the shell. The layout contracts for short terminal panels. Reduced-motion and noninteractive output skip the cabinet and render the result directly.

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

| Rarity | Terminal color | Glyph | Tier probability |
| --- | --- | :---: | ---: |
| Bust | Silver | ◇ | 30% |
| Common | Emerald | ◆ | 35% |
| Rare | Electric blue | ⬟ | 20% |
| Epic | Purple | ✦ | 10% |
| Legendary | Warm gold | ✹ | 4% |
| Mythic | Prismatic | ✺ | 1% |

The CLI retains mappings for old prototype tier values only so historical award snapshots remain readable.

Rarity must describe probability, not guaranteed quality or monetary value. Tier and per-model percentages remain visible together in `loot collection`.

## Vendor allowlist

Anthropic and OpenAI entries use exact approved model IDs from Discovery 01. This prevents a display-name lookalike or dynamic alias from replacing the advertised checkpoint. It is not a quality claim. Every entry still requires provider-catalog, price, resale-policy, and capability review. Existing award snapshots stay immutable; an obsolete active demo pool is replaced for new rolls when the collection version changes.

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
