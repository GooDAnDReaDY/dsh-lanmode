# DSH 0.1.2-alpha.5 compatibility

## Fixed behavior

The browser must wait for asynchronous plugin startup before validating
dependent services. The LAN shim previously replaced every apply callback with
a normal function. Cordis treats functions with a prototype as constructors;
that accidentally converted asynchronous startup into a construction call and
lost the awaited startup boundary. The visible symptom was `Failed to load
plugins` with pending session/workspace/remote services.

The fix uses native Proxy apply/construct forwarding. Async functions and
methods stay nonconstructible; constructors retain their prototype and
new.target; generators retain their iterator lifecycle. All arguments,
configuration, this, return/disposal values and failures are preserved.
Deliverables still receive the actual connection flag. No core patches,
delays, extra dependencies, authentication changes or plugin disabling are
required.

Native forwarding follows the documented [Proxy apply contract](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Proxy/Proxy/apply)
and [Proxy construct contract](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Proxy/Proxy/construct).

## Verification

Run the complete local test suite with `npm test`. The new `test/shim.test.mjs`
regressions cover startup, call/construct identity, config/rest arguments,
generators, deliverables, errors and disposer forwarding. Five tests fail
against the previous wrapper and all six pass with the fix.

For actual-core integration, use an existing built official DSH checkout:

```sh
node test/integration/alpha-remotes.mjs /path/to/built-dsh
```

The test loads the real browser registry/gateway/remotes and real Cordis,
checks readiness immediately after the awaited Fiber, and disposes the
context. It uses a synthetic connection: no real sessions, model requests or
credentials. An optional second argument selects the installed shim file.

Runtime acceptance: open the normal LAN URL, verify the boot error is gone,
session list and composer render, and the model picker opens. Repeat after
an approved restart. Do not send a model prompt merely to test rendering.

## Upgrade notes

This is a client startup compatibility fix, not a data/config migration.
After installing the approved package version and restarting DSH, reload the
browser page. Existing settings, certificates, sessions and other plugins
must remain unchanged.
