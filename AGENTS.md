# AGENTS.md — dsh-lanmode

Plugin-specific rules. The shared workflow stays in the DEV root `AGENTS.md`.

## Identity

- Package `@goodandready/dsh-lanmode`. The same name is in `package.json`, `cordis.patch.yml`, `lib/client.js` `load({ id })`, and `lib/index.js` `export const name`.
- Public npm package and public GitHub `GooDAnDReaDY/dsh-lanmode`.
- English is the canonical UI language. Chinese strings live in `lib/client.js` and `README.zh.md`. Runtime code does not contain Russian.

## Checks

- `npm test` runs `node --test test/*.test.mjs`.
- `test/integration/alpha-remotes.mjs` is outside that glob and is not part of `npm test`.
- Before a package leaves the repo, `npm pack --dry-run` must match `package.json` `files`.

## Delivery

- This plugin is installed with `dsh plugin --profile <profile> add @goodandready/dsh-lanmode`.
- There is no OPT checkout and no service unit for this repository.
- `AGENTS.md`, `index.md`, `deploy.sh`, and `docs/` stay in Gitea. They are not part of the npm package.

## Constraints

- Do not delete or reconfigure the permanent `@goodandready/dsh-lanmode` install on the MiniPC test profile unless the owner asked for that change in the current task.
- Do not publish `AGENTS.md` or `index.md`.
