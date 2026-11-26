# leaf.

Share code by link. Syntax highlighting, burn after reading, and no account needed.

**Live:** [leaf.shiftbloom.studio](https://leaf.shiftbloom.studio) · **License:** AGPL-3.0-or-later

leaf is a pastebin on one Cloudflare Worker. Paste code or a log, pick how long it should live, and you get a link with 12 random characters. The page shows the text with syntax highlighting and line numbers; the raw text and a download are one click away.

## Features

- Anyone can paste without an account. Anonymous pastes are deleted after 10 minutes, 1 hour or 12 hours, never later, and can be up to 256 KB.
- Pastes are only reachable by their link. There's no public list, no search, and the pages send `noindex`.
- Highlighting happens on the server with highlight.js for 30 bundled languages, once, when the paste is created; views serve the stored HTML, so a paste looks right without any script running. Leave the language on "Detect automatically" and leaf guesses from the first 4 KB; the picker shows its guess while you type (the browser loads the same detector as `/assets/detect.js` on the first keystroke), and picking a language yourself turns the guessing off. The editor highlights what you type with the same code; above 32 KB it shows plain text. Lines over 1,000 characters and pastes over 256 KB are shown without colours, because highlight.js gets slow on them.
- Click a line number to link to that line, shift-click to link to a range (`#L12-L20`).
- "Delete after the first read" makes a link that works once. Opening it asks first, so chat link previews can't use up the read.
- Every paste comes with a delete link, shown once. The browser that made it also keeps it on the start page, in local storage, and nowhere else.
- People with a token can keep pastes for up to a year, paste up to 2 MB, use the API, and see their own pastes. A token sees only its own pastes.
- Fonts are proxied through the Worker, so visitors never talk to a third-party CDN. The only outside script is Turnstile on the start page, for visitors without a token.

## Abuse protection

- Cloudflare Turnstile on the form for anonymous pastes. The check is verified on the server, including the hostname.
- Per-IP rate limits: 6 anonymous pastes, 10 failed token attempts and 30 lookups of missing pastes per minute (Workers rate limiting bindings).
- A global ceiling of 5,000 anonymous pastes per UTC day (`MAX_ANON_PER_DAY`, counted in D1).
- Size caps: 256 KB anonymous, 2 MB with a token (`MAX_ANON_KB`, `MAX_TOKEN_KB`). Binary content is refused.
- Raw text is served as `text/plain` with `nosniff` and a sandboxing CSP, so nothing pasted can run as a page on leaf's origin. All pages have a strict CSP without inline scripts.
- Every paste page has "Report this paste", which opens an email to `ABUSE_EMAIL`. The master token can delete any paste.

## Architecture

```
browser / curl
      │
      ▼
Worker "leaf"  ── routing, Turnstile check, highlight.js, pages
   │      │
   R2     D1
 p/<id> text      pastes (metadata, hashed delete key, owner)
 h/<id> HTML      api_tokens (hashed named tokens)
                  anon_usage (anonymous pastes per day)
Cron (hourly) → delete expired pastes from R2 and D1
```

| Binding | Type | Default name | Purpose |
| --- | --- | --- | --- |
| `PASTES` | R2 bucket | `leaf-pastes` | paste text under `p/<id>`, highlighted HTML under `h/<id>` |
| `DB` | D1 | `leaf-db` | `pastes`, `api_tokens` and `anon_usage` tables |
| `CREATE_RL`, `AUTH_RL`, `MISS_RL` | rate limiting | – | per-IP limits, see above |
| `API_TOKEN` | secret | – | master token |
| `TURNSTILE_SITE_KEY` / `TURNSTILE_SECRET` | var / secret | – | bot check for anonymous pastes |
| `MAX_ANON_KB` / `MAX_TOKEN_KB` | vars | `256` / `2048` | size caps |
| `MAX_ANON_PER_DAY` | var | `5000` | anonymous pastes per UTC day, all visitors together (`0` = no ceiling) |
| `ABUSE_EMAIL` | var | – | "Report this paste" address |
| `LEGAL` | var (JSON) | – | operator details for the imprint and privacy pages |
| `BRAND`, `OPERATOR_*`, `SOURCE_URL` | vars | – | who runs the instance, link to your fork |

## Tech stack

- TypeScript, bundled with esbuild. The language detector for the editor is built as a separate browser script.
- Cloudflare Workers with R2, D1, rate limiting and a Cron Trigger, plus Turnstile for anonymous pastes
- highlight.js on the server, so pages need no script to look right
- Node.js 26 for builds and tests, Vitest for tests. `npm run check` runs the typecheck, the tests and the build.

## Self-hosting

You need a Cloudflare account with Workers Paid (for rate limiting and CPU time) and Node.js 26.

```sh
npm install
npx wrangler r2 bucket create leaf-pastes
npx wrangler d1 create leaf-db          # put the printed id into wrangler.jsonc
npx wrangler d1 migrations apply leaf-db --remote
npx wrangler secret put API_TOKEN        # your master token
npx wrangler secret put TURNSTILE_SECRET # optional, with TURNSTILE_SITE_KEY in vars
npm run deploy
```

Set a custom domain in `routes` in `wrangler.jsonc`. `workers_dev` and `preview_urls` are off on purpose: those URLs would skip your zone's WAF rules.

Without `TURNSTILE_SECRET`, anonymous pastes only go through the rate limits. Put Turnstile in front of any public instance.

### Deploy with Workers Builds

To deploy on every push to `main` instead, connect the repository to the Worker in the Cloudflare dashboard (Settings > Build). No API token is stored on GitHub. leaf.shiftbloom.studio uses the build command `npm run check` and a deploy command that writes the D1 id from a build variable into a copy of `wrangler.jsonc` and runs `npx wrangler deploy --keep-vars`, so the dashboard keeps the imprint and Turnstile vars.

### Imprint and privacy policy

The pages `/imprint`, `/impressum`, `/privacy` and `/datenschutz` appear when the `LEGAL` var holds your details as JSON:

```json
{"name":"Jane Doe","street":"Example St 1","city":"12345 Town","country":{"en":"Germany","de":"Deutschland"},"email":"jane@example.com","authority":"Your data protection authority, address"}
```

Optional fields: `business`, `phone`, `vatId`. Keep this in your deploy config, not in the repository. The privacy policy describes this code as it is; check it against your own setup before you publish it.

### Usage statistics (optional)

leaf can report to [PostHog](https://posthog.com) without cookies. Set the project token (`phc_...`) as a secret and, for the EU cloud or a self-hosted instance, `POSTHOG_HOST` as a var:

```sh
npx wrangler secret put POSTHOG_KEY
```

- Only the start page, the legal pages and "not found" load `/_sb/init.js`. posthog-js is served through the Worker under `/_sb/`, so the CSP stays `'self'`. Paste pages, raw text, delete links and the API never load it.
- Cookieless mode, no session recording, no person profiles. Clicks are captured on buttons and links only, with text, labels and link targets removed; paste addresses are reported as `/[private]`.
- The Worker sends `paste_created`, `paste_refused`, `paste_deleted`, `cleanup_ran` and `$exception` without IP address, content, title, id or token.
- With the secret set, the privacy policy gets a "Usage statistics" section. In the PostHog project, turn on cookieless server hash mode and IP discarding.

## Development

```sh
cp .dev.vars.example .dev.vars
npx wrangler d1 migrations apply leaf-db --local
npm run dev
npm run check
```

## API tokens

The `API_TOKEN` secret is the master token. It can keep pastes forever (`never`), list its own pastes and delete any paste.

Named tokens start with `leaf_` and live in the `api_tokens` table, stored only as a SHA-256 hash, with a label and an optional expiry. leaf doesn't issue them itself; an admin tool writes the row and shows the token once. To make one by hand:

```sh
TOKEN="leaf_$(node -e "console.log(require('crypto').randomBytes(24).toString('base64url').replace(/[^A-Za-z0-9]/g,''))")"
HASH=$(printf %s "$TOKEN" | sha256sum | cut -d' ' -f1)
npx wrangler d1 execute leaf-db --remote --command \
  "INSERT INTO api_tokens (id, label, prefix, hash, created_at, expires_at) VALUES ('$(uuidgen)', 'laptop', '${TOKEN:0:9}', '$HASH', $(date +%s), NULL)"
echo "$TOKEN"
```

Paste the token into "I have a token" on the start page, or use it with the API.

## API

All API routes need `Authorization: Bearer <token>` (or `X-API-Key`). Anonymous pastes go through the start page.

```sh
# raw body; optional headers x-title, x-lang, x-expires (10m 1h 12h 1d 7d 30d 1y, never for the master token), x-burn: 1
curl -H "Authorization: Bearer $TOKEN" -H "x-lang: ts" --data-binary @src/index.ts https://leaf.example.com/api/pastes

# or JSON
curl -H "Authorization: Bearer $TOKEN" -H "content-type: application/json" \
  -d '{"content":"hello","title":"note","expires":"1d","burn":false}' https://leaf.example.com/api/pastes
```

| Route | What it does |
| --- | --- |
| `POST /api/pastes` | create a paste; returns `url`, `raw`, `delete`, `lang`, `expires_at` |
| `GET /api/pastes?limit=30&before=<unix>` | this token's pastes, newest first |
| `GET /api/pastes/<id>` | metadata of one of this token's pastes |
| `DELETE /api/pastes/<id>` | delete one of this token's pastes (any paste for the master token) |
| `GET /api/languages` | the language ids leaf accepts |

Public routes: `/<id>` (page), `/<id>/raw`, `/<id>/dl`, `/d/<id>/<key>` (delete link: GET asks, POST or DELETE deletes).

Expiry defaults to 12 hours without a token and 7 days with one. Language ids also accept common aliases such as `ts`, `py`, `sh` and `yml`.

## Design

The UI follows the shiftbloom studio brand book v2: white paper, ink text, Bloom Red only for actions and small accents, and code always on ink with token colours taken from the pinks of the palette. Fonts are Clash Display, General Sans and JetBrains Mono. There's no dark mode.

## Contributing

Issues and pull requests are welcome. Start with [CONTRIBUTING.md](CONTRIBUTING.md) and the [Code of Conduct](CODE_OF_CONDUCT.md).

## Security

Please don't report vulnerabilities in public issues. Use GitHub's private vulnerability reporting on this repository or email [safety@shiftbloom.studio](mailto:safety@shiftbloom.studio). [SECURITY.md](SECURITY.md) has the details.

## License

leaf is free software under the GNU Affero General Public License, version 3 or later. If you run a changed version for other people, offer them its source; set `SOURCE_URL` and the footer links to it.

---

leaf is part of [shiftbloom studio](https://shiftbloom.studio), an open studio from Hamburg. All of our apps are open source at [github.com/shiftbloom-studio](https://github.com/shiftbloom-studio).
