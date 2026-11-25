# brig·id — lab

Small experiment pages for [brig·id](https://brig.id), online at
[lab.brig.id](https://lab.brig.id). Each measures something on a real device
before brig·id relies on it.

The pages are not indexed, have no server, keep nothing and count no one: the
Worker serves static files, and a page forgets what it measured when it is
closed.

## Experiments

| Page                                | What it measures                                                                                                                                    |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`/prf/`](https://lab.brig.id/prf/) | Whether a passkey supports the WebAuthn PRF extension, at creation and at sign-in, for [brig-id/spec#22](https://github.com/brig-id/spec/issues/22) |

### PRF measurement

The page creates a test passkey named **brig·id lab test** and asks it for a PRF
output with a random salt, then signs in with it and asks again with the same
salt. It shows whether PRF is enabled, whether an output came back each time,
and whether the two are the same, and gives one line to copy into the
measurements of spec#22, for example:

```text
2026-11-25 · iOS 18.1 Safari 18.1 · client prf yes · iCloud Keychain (aaguid fbfc3007), platform, synced · create: prf enabled yes, output no · get: output yes, stable yes
```

Its second part is the prototype of `security-model.md` §7, in memory: a random
data key encrypts a field, and is wrapped with a key derived from the PRF output
(HKDF-SHA-256, then AES-256-GCM); a second sign-in unwraps it and reads the field
back. The formats are in [`src/prf/keys.ts`](src/prf/keys.ts).

Delete the test passkey from your password manager afterwards.

| File                                         | What it holds                                                |
| -------------------------------------------- | ------------------------------------------------------------ |
| [`src/prf/main.ts`](src/prf/main.ts)         | The page: the two ceremonies, the result line, the prototype |
| [`src/prf/authdata.ts`](src/prf/authdata.ts) | Flags and AAGUID of the authenticator data                   |
| [`src/prf/cbor.ts`](src/prf/cbor.ts)         | Just enough CBOR to read an attestation object               |
| [`src/prf/keys.ts`](src/prf/keys.ts)         | Data key, key wrapping key, wrapped key and encrypted field  |
| [`src/prf/device.ts`](src/prf/device.ts)     | System and browser, from the user agent and client hints     |

## Run it

```shell
pnpm install
pnpm dev                # http://localhost:8787
```

## Checks

```shell
pnpm typecheck
pnpm lint
pnpm test               # parsing and crypto helpers
pnpm test.e2e           # the page, with Chrome's virtual authenticator
```

## Online

The pages are a Cloudflare Worker with static assets only (`wrangler.jsonc`),
deployed by `.github/workflows/deploy.yml` when `main` changes. The headers of
every page (Content Security Policy, `X-Robots-Tag`) are in
[`public/_headers`](public/_headers).

## Licence

[AGPL-3.0-or-later](LICENSE). The fonts in `public/fonts/` are Geist and Geist
Mono, under the SIL Open Font License 1.1
([`public/fonts/OFL-Geist.txt`](public/fonts/OFL-Geist.txt)).
