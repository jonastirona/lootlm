# Operations and boundaries

## Deployment

The default binds to 127.0.0.1. For a private remote deployment, use one Node 24.2+ process, persistent disk, TLS reverse proxy, `LOOTLM_ORIGIN` set to the exact HTTPS origin, and `LOOTLM_SECURE_COOKIE=true`. Set the appropriate bind host behind that proxy. A shared access code plus an allowlist is adequate only for trusted internal testers. Use real per-user identity/SSO before broadening access.

CLI requests authenticate with bearer keys; browser sessions use HttpOnly, SameSite=Strict cookies. Mutating cross-origin browser requests are rejected. Public CORS is not enabled. Request bodies are bounded and secrets are hashed in the database. No prompt/completion content is retained by the app; the upstream provider has its own retention policy.

## Ledger

The SQLite database contains users, hashed credentials, immutable pool versions, model awards, idempotent spins, request reservations, token ledger entries and admin audit records. Every balance mutation runs in an immediate transaction. The provider network call happens outside the transaction. Use one server process: startup recovery treats interrupted reservations as pending, so a second process must not open the same database during operation.

Shutdown waits up to ten seconds for requests. Incomplete calls become pending at next startup. Background reconciliation runs every thirty seconds. Requests without a known upstream generation ID require manual investigation. The admin UI and `lootlm admin status` expose these.

Manual resolution requires a verified input count, generated count, dollar cost and evidence note. If the provider confirms no generation, zero usage can settle and release the reservation. Never free unknown reservations based only on elapsed time. Settlement is idempotent.

## Limits

- One million tokens per test award; 50 test rolls per user in a rolling 24-hour period.
- Two active or pending requests per user.
- Default maximum output 1,024 tokens and input body content 24,000 UTF-8 bytes.
- Daily cost cap defaults to $5, evaluated by UTC settlement date. All outstanding dollar reservations are included across dates.
- Rare live inference disabled by default; demo rare awards remain testable at zero cost.
- No silent model fallback; unavailable or repriced models fail explicitly.

Actual accounting always uses provider usage. Input reservation uses a conservative byte bound with chat/tool overhead. Arbitrary models may violate assumptions; verify each admitted model. Unexpected token/cost overages pause inference and create an audit record, while preserving actual usage. The cap limits new authorized requests; it cannot reverse charges or perfectly constrain a provider that ignores limits or returns unexpected billing.

If a stream disconnects, the server continues consuming the upstream stream to settle usage. This can still incur generation cost up to request limits. It does not retry generation. Uncertain 5xx or transport failures retain reservations; explicit upstream 4xx rejection releases them.

## Backups

Stop the server cleanly before copying the full `.lootlm` directory, or use SQLite's supported online backup tooling. Do not copy only the main database while WAL writes are active. Protect backups as sensitive account data. Rotate the access code and revoke API keys after a leak.

## Deferred before public paid launch

Supplier/distribution authorization; jurisdiction and payment-provider clearance; real checkout and webhook ledger; individual identity, account recovery and abuse controls; refunds and model-retirement policy; load testing; model-specific token-count verification; migration to PostgreSQL for multi-instance operation; durable external observability and a privacy/retention policy. Referrals and paid promotional campaigns are not implemented.

No live provider spend is necessary to run the automated suite. Live smoke tests require an operator-configured key, reviewed pool and spending cap. No provider call has been verified merely because the adapter exists.

## Provider reference

The adapter follows OpenRouter's [usage accounting](https://openrouter.ai/docs/cookbook/administration/usage-accounting) and [generation metadata](https://openrouter.ai/docs/api/api-reference/generations/get-request-%26-usage-metadata-for-a-generation) documentation. Usage is included automatically; no deprecated opt-in usage flags are required. Missing token counts or actual cost leave the request pending rather than treating a price estimate as a verified charge.
