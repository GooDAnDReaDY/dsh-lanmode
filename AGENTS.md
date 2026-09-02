# DSH LAN mode: project facts

This supplements the parent DEV instructions. Keep code and examples portable.

## Product and files

Public npm package: `@goodandready/dsh-lanmode`; canonical development and issue
tracking is Gitea `goodandready/dsh-lanmode`. The package is JavaScript ESM,
ships `lib/` and `cordis.patch.yml`, and has no compilation step.

- `lib/index.js`: host plugin, settings and HTML shim injection.
- `lib/shim.js`: browser compatibility and connection flag handling.
- `lib/bridge.js`: direct HTTP/TLS bridge.
- `test/*.test.mjs`: Node test-runner regression and local integration tests.

## Constraints and decisions

- Do not change authentication, allowlists, certificates or unrelated plugins
  as a side effect of a loader fix.
- Preserve the original callback kind, full arguments, return value, errors
  and lifecycle when intercepting plugin apply. Cordis distinguishes
  constructors from async/generator/method functions.
- Never make a runtime profile depend on a development worktree.
- Published package installation and production restart require the owner's
  approval; publication is a separate decision.

## Build, test and documentation

`npm test` runs the existing Node suite. There is no lint/typecheck/build
script in package.json. See [index.md](index.md) for the test matrix and
[the incident plan](docs/plans/31-async-apply.md) for current evidence.

## Status

2026-09-02: version 0.6.10 has a confirmed async loader regression tracked in
Gitea #31. Repair is in an isolated worktree; production acceptance is pending.
