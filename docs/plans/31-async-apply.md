# Preserve plugin callback lifecycle (Gitea #31)

## Goal / scope

Restore alpha.5 browser boot without changing core, plugin inventory, auth,
network allowlists or session data. Change only the LAN shim's apply forwarding.

## Evidence and reuse

Official Cordis `isConstructor` uses `callback.prototype`; Fiber runs such
callbacks through `new`. A normal-function wrapper around async `apply`
therefore makes Fiber finish before remote namespace mounts complete.
Actual alpha.5 artifact reproduction confirms that remote.session and
remote.workspace are ready at await without the shim and late with it.
Current npm 0.6.10 and Gitea main have the faulty wrapper. Use native
Proxy/Reflect forwarding, without dependencies or package-specific exceptions.

## Plan and acceptance

1. Add failing regression for async boot and argument forwarding.
2. Preserve original constructibility, this, config/rest arguments and result;
   keep deliverables' real connection context.
3. Run all tests plus actual Cordis/remote-bundle integration and review.
4. Package and test through the approved isolated test route.
5. Obtain required publication approval; install the checked release and
   verify browser boot, session list, composer and model selection.

## Boundaries

No disabling/removing plugins, no core patch, no secrets in artifacts, no
version bump or public release before the corresponding gate. Existing clean
historical worktrees are preserved. Source main is read-only.

## Progress

- Diagnosis reproduced; Gitea issue #31 created; fresh worktree from main.
- Regression first: five of six new tests fail with the old wrapper.
- Native Proxy fix: all six new tests and the full 86-test suite pass.
- Actual alpha.5 Cordis/registry/gateway/remotes: session, workspace and
  subagents are present immediately at await, without a timeout workaround.
- Owner explicitly authorized a new hotfix release and production restore;
  requested patch notes explicitly mention alpha.5 compatibility.
- Independent review, test-host/package and runtime acceptance: pending.
