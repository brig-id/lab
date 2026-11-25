# AGENTS.md — brig·id `lab`

Small experiment pages, served at [lab.brig.id](https://lab.brig.id). Each
measures something on a real device before brig·id relies on it, and is read
by the owner, not by the public: the pages are not indexed and not linked
from the product.

## Language

**All content must be in English** — code, comments, commit messages, issues,
pull requests, and the pages.

## Rules

- **Nothing runs on a server.** The Worker serves static files only
  (`wrangler.jsonc` has no `main`); there is no log, no database, no cookie.
- **Nothing is kept or sent.** A page holds what it measures in memory and
  forgets it when closed: no `localStorage`, no request to anywhere. A secret
  it handles (a PRF output, a key) is never displayed in full.
- **Not indexed.** Every page carries `<meta name="robots" content="noindex">`;
  `public/robots.txt` disallows everything and `public/_headers` sends
  `X-Robots-Tag`.
- **No analytics, nothing from another origin.** `public/_headers` sets a
  Content Security Policy with `default-src 'none'`.
- **One experiment, one folder.** `public/<name>/index.html` and
  `src/<name>/main.ts` (bundled by `scripts/build.mjs`). Helpers that parse or
  compute are separate modules, unit-tested in `test/`; the page itself is
  tested in `e2e/`.
- No framework: HTML, one stylesheet (`public/style.css`), TypeScript.

## Commands

```bash
pnpm dev          # the pages as Cloudflare serves them, http://localhost:8787
pnpm build        # bundles src/<name>/main.ts into public/<name>/main.js
pnpm typecheck
pnpm lint
pnpm test         # node --test: parsing and crypto helpers
pnpm test.e2e     # playwright, with Chrome's virtual authenticator
```

## Commit conventions

Format: `type(scope): <emoji> description`. Full type→emoji mapping:
`/workspaces/roots/commit-convention.json`.

| Scope  | Maps to                             |
| ------ | ----------------------------------- |
| `lab`  | `src/`, `public/`, `test/`, scripts |
| `e2e`  | `e2e/`, `playwright.config.ts`      |
| `ci`   | `.github/workflows/`                |
| `deps` | Dependency bumps                    |
| `ai`   | Instructions for coding agents      |
| `docs` | README                              |

**Do not use a scope outside this list.** Update this table and `scopes.json`
together if a new scope is needed.

## Roadmap

Tracked as cards in [brig-id Project 1](https://github.com/orgs/brig-id/projects/1),
not in local files.
