# CLI

LootLM has one user surface: the terminal. The short command is `loot`; `lootlm` is retained as a compatibility alias.

Install the downloaded package with `npm install -g ./lootlm-0.9.0.tgz`, or run `npm link` in the source directory. Node 24.2+ is required. The package is not published to a public registry.

## First run

```sh
loot login --url http://localhost:3131
loot collection
loot roll
loot
```

Running `loot` with no subcommand opens the interactive shell. A prompt uses the active model; `/roll` changes models while preserving conversation context for the lifetime of that shell.

```text
/roll       roll and keep open-session context
/models     inspect saved allocations
/collection browse all 24 models, capabilities, and exact odds
/use 2      equip model 2
/status     show project, model, and allocation
/new        clear open-session conversation context
/clear      clear and redraw the terminal
/exit       close the shell
```

Current open-session continuity is not durable project persistence. Closing the process clears the conversation. See the durable context backend seam in `terminal-product-contract.md`.

## One-shot commands

```sh
loot status
loot collection
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

`loot collection` is the single collection and probability surface. It shows all 24 model cards, tier totals, exact per-model odds, owned status, and catalog-advertised tool/context metadata. The redundant odds command and standalone rarity preview were removed; probabilities and rarity treatments now appear on the model cards and in the reel itself.

The interactive home cabinet fills the terminal, animates its marquee, and shows the equipped prize or the next action before placing the prompt on the bottom row. An animated roll uses one fixed-width vertical model wheel with five card positions visible at once. Every row follows the same ASCII geometry: stable model sigil and name on the left, rarity on the right, and one high-contrast center payline. The header states the outcome directly: one pull awards one model and 1,000,000 tokens. Color and motion add spectacle without participating in alignment. In a mouse-aware terminal, press the lever handle, drag it down at least four rows, and release it. Space and Enter remain keyboard fallbacks. The lever stays in the same cabinet, follows the pointer, then springs upward while the strip accelerates and decelerates onto the persisted award. The complete press, motion, and release sequence is consumed before mouse reporting is disabled so terminal escape bytes cannot leak into the prompt. Every pull builds a newly randomized visual reel, with epic, legendary, and mythic cards intentionally overrepresented for spectacle and a rare card placed just before the final landing. This showcase sequence does not represent draw probability; `/collection` remains the source of exact award odds. Every result then receives a full-screen animated prize reveal, including Bust results, before returning to the shell. The layout contracts for short terminal panels instead of skipping animation. `--no-animation`, `LOOTLM_REDUCED_MOTION=1`, and noninteractive output render the result directly.

Interactive `loot` and `lootlm` sessions enter the terminal alternate screen at launch and restore the original shell screen on exit. This gives the interface the entire terminal window, isolates it from shell scrollback, and lets animation redraw from a stable origin. It does not request operating-system fullscreen. One-shot commands such as `loot collection` retain ordinary terminal output.

## Login and credentials

Login prompts for the access code without echoing it. Credentials live in `~/.config/lootlm/config.json`, mode 0600, under a 0700 directory when created. Set `LOOTLM_CONFIG_DIR` to override this path. This is not an OS keychain; protect the local account.

For automation, supply `LOOTLM_URL` and `LOOTLM_API_KEY`. For noninteractive login, use `--email` and `LOOTLM_ACCESS_CODE` from a secure environment. Never pass an access code in a command-line argument.

Logout attempts to revoke the saved CLI key and then removes it locally.

## Output modes

- Interactive chrome uses burgundy framing, royal-red activity, and antique-gold actions. Rarity colors are reserved for model rarity and always paired with a glyph and label.
- `--json` is supported for roll, inventory, collection, status, usage, keys, login, and chat.
- `--no-animation` or `LOOTLM_REDUCED_MOTION=1` skips the reveal.
- Noninteractive terminals skip animation automatically; narrow interactive terminals use the compact reel layout.
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

## Provider diagnostics

`loot doctor` checks the upstream key without inference. `loot admin models` lists eligible catalog models. `loot admin pool --file config/openrouter-common.json` prepares a separate live pool. `loot request req_ID` inspects your request; `loot admin retry --id req_ID` retries usage reconciliation without regenerating output.

## No-setup demo

Run `loot demo` for an isolated local sandbox with automatic login. No upstream key, live requests or payments are used. Try `/roll`, a prompt, `/models`, `/collection`, `/status`, then `/exit`. The temporary vault and credentials are removed on exit; your normal account configuration is unchanged. Responses are simulated echoes, not real model intelligence. `loot demo status` runs a single command in a fresh sandbox.
