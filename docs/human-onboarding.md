# Your first LootLM roll

This is an internal terminal-only build. Demo mode charges no money and labels its simulated responses.

1. Start the API server with `npm start`.
2. Install the local command with `npm link`.
3. Run `loot login --url http://localhost:3131`. Use the invited email and the access code stored by the server at `.lootlm/access-code`.
4. Run `loot collection`. Confirm that all six tier treatments, tier totals, exact model probabilities, and 24 distinct card sigils appear on one screen.
5. Run `loot roll`. Grab the on-screen lever handle with the mouse, drag it down, and release it; Space or Enter is the fallback. Confirm that the lever follows the drag and springs back inside the same cabinet while five positions of the model-card wheel move together, slow through a complete collection cycle, and stop on the awarded model at the center payline. The server draw occurs after the lever pull and is saved before wheel animation; skipping or interrupting the reveal cannot reroll it.
6. Run `loot`. Type a prompt, then use `/roll` and send a follow-up. The second model receives the current shell's conversation context.
7. Use `/models`, `/status`, `/new`, and `/exit` to exercise the rest of the loop.

The current prototype grants one million shared test tokens per roll. That is not the target paid contract of roughly 100k fresh input plus 20k output. Conversation continuity currently lasts only while the interactive shell is open. A clean restart does not yet restore project context.

Input includes repeated conversation history. Generated usage includes reasoning when the provider reports it within completion tokens; it is not counted twice. Reserved tokens belong to active or unresolved requests and cannot be reused until settled.

If a stream breaks, inspect `loot usage` before retrying. The server never silently switches to a different model or frees uncertain provider usage.

Awards cannot be transferred, sold, or redeemed for cash. Paid loading, debits, refunds, public signup, supplier authorization, and durable checkpoints are not implemented in this build.
