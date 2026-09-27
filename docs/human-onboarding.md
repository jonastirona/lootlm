# Your first LootLM model

1. Start the private server with `npm start` and open the printed localhost URL.
2. Use the invited email and access code. The default email is `demo@lootlm.local`; the local code is in `.lootlm/access-code`.
3. Review the pool and odds, then choose **Let it roll**. A roll is saved before the reveal; animation does not influence the result. There is no payment.
4. Visit **Your vault**. Each award has a fixed model and one million input-plus-generated tokens. Unused tokens do not expire.
5. Choose **Use this model**. Create a key, copy it once, and store it in an environment variable. Copy the Python or curl example.
6. Use **Give it a thought** to make a small test request. In demo mode the reply is simulated and says so.

Input includes repeated conversation history and cached input. Generated usage includes reasoning when reported within the provider's completion count; it is not counted twice. Provider cost is separate from allowance usage.

Tokens marked **reserved** belong to active or unresolved requests. They are not available for new requests until settled. If a stream breaks, check usage before retrying. A disabled model or budget cap pauses access without deleting the balance.

For terminal use, install the local package and run `lootlm login`, `lootlm roll`, and `lootlm chat "Hello"`. See the CLI guide.

This is a private test build. Awards cannot be transferred, sold, or redeemed for cash. Public sale and proprietary-model distribution require separate clearance.
