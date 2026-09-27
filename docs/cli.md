# CLI

LootLM has one user surface: the terminal. The short command is `loot`; `lootlm` is retained as a compatibility alias.

Install the downloaded package with `npm install -g ./lootlm-0.1.0.tgz`, or run `npm link` in the source directory. Node 24.2+ is required. The package is not published to a public registry.

## First run

```sh
loot login --url http://localhost:3131
loot odds
loot roll
loot
```

Running `loot` with no subcommand opens the interactive shell. A prompt uses the active model; `/roll` changes models while preserving conversation context for the lifetime of that shell.

```text
/roll       roll and keep open-session context
/models     inspect saved allocations
/use 2      equip model 2
/odds       inspect exact published probabilities
/status     show project, model, and allocation
/new        clear open-session conversation context
/clear      clear and redraw the terminal
/exit       close the shell
```

Current open-session continuity is not durable project persistence. Closing the process clears the conversation. See the durable context backend seam in `terminal-product-contract.md`.

## One-shot commands

```sh
loot status
loot inventory
loot use 2
loot chat "Write a binary search" --max-tokens 256
loot usage
loot keys create --name "my app"
loot keys list
loot keys revoke --id key_REPLACE_ME
loot config
loot logout
```

The latest roll becomes active. `loot use` accepts the displayed inventory number, full award ID, or displayed short ID.

## Login and credentials

Login prompts for the access code without echoing it. Credentials live in `~/.config/lootlm/config.json`, mode 0600, under a 0700 directory when created. Set `LOOTLM_CONFIG_DIR` to override this path. This is not an OS keychain; protect the local account.

For automation, supply `LOOTLM_URL` and `LOOTLM_API_KEY`. For noninteractive login, use `--email` and `LOOTLM_ACCESS_CODE` from a secure environment. Never pass an access code in a command-line argument.

Logout attempts to revoke the saved CLI key and then removes it locally.

## Output modes

- Interactive chrome uses burgundy framing, royal-red activity, and antique-gold actions. Rarity colors are reserved for model rarity and always paired with a glyph and label.
- `--json` is supported for roll, inventory, odds, status, usage, keys, login, and chat.
- `--no-animation` or `LOOTLM_REDUCED_MOTION=1` skips the reveal.
- Noninteractive or narrow terminals skip animation automatically.
- `NO_COLOR=1` removes ANSI color; rarity glyphs and labels remain.

JSON chat returns the full nonstreaming completion. Interactive and ordinary one-shot chat stream text.

## Planned wallet commands

The paid backend is not implemented yet. Its terminal contract is:

```sh
loot wallet    # USD balance, roll debit, recent wallet entries
loot topup     # initiate the fixed $10 processor-hosted checkout
loot roll      # show debit confirmation, then roll atomically
```

`loot topup` may open the system browser for secure card entry, but payment status and the resulting balance return to Terminal. The CLI never accepts card details. Do not expose these commands as working until Jonas's wallet, checkout, webhook, refund, and chargeback contracts pass end-to-end tests.

## Admin commands

```sh
loot admin status
loot admin pause
loot admin resume
loot admin pool --file reviewed-pool.json
loot admin resolve --id req_ID --input 20 --output 40 --cost 0.001 --note "Verified upstream generation record ..."
```

`resume` enables rolls and inference but does not enable restricted live tiers. Never manually settle an uncertain request without verified upstream usage evidence.
