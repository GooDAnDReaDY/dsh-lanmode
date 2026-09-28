# dsh-lanmode

LAN access plugin for DeepSeek Harness: direct bridge, mDNS, local TLS, PWA, device sessions, and the settings card.

- Status check: 2026-09-24, package version in `package.json` is `0.8.11`. Later commits on a working branch are not a release until the version changes.
- DEV: `/mnt/external/Project/DEV/dhsplugins/dsh-lanmode`
- OPT: none. The plugin is not a standalone service.
- Install: `dsh plugin --profile <profile> add @goodandready/dsh-lanmode`
- Design contract: `docs/design/DESIGN.md`

## Commands

| Check | Command | Note |
| --- | --- | --- |
| Unit tests | `npm test` | `node --test test/*.test.mjs` |
| Integration file | `node --test test/integration/alpha-remotes.mjs` | Not started by `npm test`, because the glob is only `test/*.test.mjs` |
| Package contents | `npm pack --dry-run` | Must stay inside `package.json` `files` |

`deploy.sh` prints this delivery fact and does not change a running server. A separate OPT deploy script is not confirmed because this repository has no OPT checkout.

## Client runtime

`lib/client.js` is the single host entry (`exports['./client']`). The factory body is `lib/client-parts/`, injected by `lib/index.js` before the module loads. Bridge local routes live in `lib/bridge-local.js`. Checked 2026-09-24.

- Cloudflare Tunnel: @docs/deployment/cloudflare-tunnel.md

- Nginx proxy: @docs/deployment/nginx.md
- Bind address: @docs/deployment/bind-address.md
