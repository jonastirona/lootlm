# CLI

Install the downloaded package with `npm install -g ./lootlm-0.1.0.tgz`, or run `npm link` in the source directory. Node 24.2+ is required. The package has not been published to a public registry.

```sh
lootlm login --url http://localhost:3131
lootlm odds
lootlm roll
lootlm inventory
lootlm use award_REPLACE_ME
lootlm chat "Write a binary search" --max-tokens 256
lootlm usage
lootlm keys create --name "my app"
lootlm keys list
lootlm keys revoke --id key_REPLACE_ME
lootlm logout
```

Login prompts for the access code without echoing it. Credentials live in `~/.config/lootlm/config.json`, mode 0600, with a 0700 parent directory when created. Set `LOOTLM_CONFIG_DIR` to override the location. This file is not an OS keychain; protect the computer account. Logout attempts to revoke the saved CLI key and removes local credentials.

For automation, supply `LOOTLM_URL` and `LOOTLM_API_KEY`. For noninteractive login, use `--email` and `LOOTLM_ACCESS_CODE` from a secure environment. Do not pass access codes in command-line arguments.

`--json` is supported for rolls, inventory, odds, usage, keys, login and chat. Chat returns the full nonstreaming completion object in JSON mode. Other chat requests stream text. Animations require a TTY; `--no-animation` or `LOOTLM_REDUCED_MOTION=1` suppress them. `NO_COLOR=1` suppresses color.

The latest roll becomes the selected allowance. An interrupted roll preserves its idempotency key in configuration so the next roll can recover it without granting twice. Each chat command is a new single-turn request; no chat history is stored or implicitly resent.

Admin commands:

```sh
lootlm admin status
lootlm admin pause
lootlm admin resume
lootlm admin pool --file reviewed-pool.json
lootlm admin resolve --id req_ID --input 20 --output 40 --cost 0.001 --note "Verified against upstream generation record ID ..."
```

`resume` enables spins and inference, but does not enable rare live inference. The web admin panel controls that separately. Never manually resolve a request without verified usage evidence.
