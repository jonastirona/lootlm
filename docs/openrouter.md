# Live OpenRouter setup

## Connect

The adapter is implemented, but real generation requires your own upstream key. Keep it in the git-ignored `.env` file:

```dotenv
OPENROUTER_API_KEY=your-key-here
LOOTLM_PROVIDER=openrouter
LOOTLM_LIVE_ENABLED=true
LOOTLM_DAILY_USD=5
```

Never paste the key into browser application code, source control or a CLI argument. Restart the server after editing .env. The application does not buy credits or modify your upstream account's limits.

## Prepare the pool

You can prepare a live pool while the server remains in demo mode. Run the read-only catalog check, then publish the checked-in draft. This grants nothing and spends nothing. It creates a separate OpenRouter pool.

```sh
npm run openrouter:check
loot admin openrouter-setup
```

The checked-in Discovery 01 draft contains 24 distinct catalog IDs across six tiers. It was validated against the public catalog when this package was built; none is claimed to have passed live inference testing without a key. Llama 3.2 1B and 3B do not advertise function tools, so they are text-only Bust outcomes. The API rejects unsupported tool requests before spending.

To publish a custom or common-only pool instead:

```sh
loot admin pool --file config/openrouter-common.json
```

After switching to OpenRouter and restarting, run `loot doctor`. An accepted key does not guarantee account credit or model capacity. The diagnostic reports the key's remaining limit when supplied by OpenRouter without exposing the key, its label, or account identity.

## Verify with real calls

Roll a new live allowance, then, from the source directory:

```sh
npm run smoke:live
# Or select an existing live allowance explicitly:
npm run smoke:live -- --award award_REPLACE_ME
```

The script makes three billed requests: short text, streaming text, and a harmless function-call response (the tool is not executed). It refuses an aggregate reservation estimate above $0.05. It compares each settled ledger record with the upstream generation metadata. The configured $5/day application cap also applies. Provider reservation violations cannot be perfectly prevented; they trigger a pause and preserve the actual bill.

A failure or incomplete check is not permission to retry blindly. Inspect `loot request req_ID`. The smoke check uses unique idempotency keys, does not automatically repeat generation, and revokes its temporary login session on exit. Tests use an existing allowance and do not change your pool or purchases.

Once the cheap-model check passes, review `config/collection-openrouter-draft.json` against current prices and publish it only for internal testing. Enable premium live inference explicitly. Test every model's token reporting, tools where supported, reasoning usage and streaming behavior before treating the collection as verified. The 30% / 35% / 20% / 10% / 4% / 1% tier weights are provisional product hypotheses.

## Recovery

Demo balances stay demo; live balances stay live. The default output limit shrinks near allowance exhaustion. Explicit requests too large to reserve are rejected. A model outage, price change, mismatch, missing usage or uncertain network failure never causes an unannounced model substitution.

Pending usage retries persist across restarts. After eight attempts, or immediately when no upstream ID is available, the request becomes an admin alert and retains its reservation. Use verified upstream evidence for manual resolution. No user is charged more tokens than its own request reserved; unexpected excess is recorded for the operator and pauses new inference.

Source references: [key diagnostics](https://openrouter.ai/docs/api/api-reference/api-keys/get-current-api-key), [provider price ceilings](https://openrouter.ai/docs/guides/routing/provider-selection), [usage accounting](https://openrouter.ai/docs/cookbook/administration/usage-accounting).
