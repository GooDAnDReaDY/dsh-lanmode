# Changelog

## 0.8.32

### Device Token Security, Revocation Persistence & TLS Fail-Closed Protection (#266, #354, #361, #369)
- **Device Token Leakage Prevention (#266)**: AuthManager sessions now register devices using SHA-256 token digests (key), preventing raw session cookies from ever entering the device registry, appearing in /dsh-lanmode/devices API responses, or persisting in plaintext on disk.
- **Fail-Closed TLS Files Mode (#354)**: When custom certificate files (tls: 'files') are unreadable or missing, the direct bridge now fails closed with state.listener = null, refusing to open an unencrypted HTTP listener on network interfaces.
- **Context-Isolated Credential Cache & Safe Resolution (#361)**: Isolated the credential cache per context/provider via WeakMap with instant rotation via clearSecretCache() on config updates. Unresolvable credentials safely return fallback or empty values rather than leaking ref identifiers.
- **Revocation Persistence Across LRU Eviction & Restarts (#369)**: Device LRU eviction (at 200 devices) now skips revoked devices, and save() writes permanent tombstones to disk, ensuring active revocations survive server restarts and traffic bursts.

## 0.8.31

### Hardened Fail-Safe Storage, PIN Rate Limiting & WebSocket Revocation Desync (#415, #366, #367, #54)
- **Fail-Safe Storage Recovery (#415)**: Added atomic `.bak` snapshot persistence and automatic fallback in `lib/bans.js` and `lib/devices.js`. Corrupted or malformed storage files are safely recovered without resetting active bans or registered device roster, and write operations prevent duplicate SHA-256 hashing.
- **Unified LAN PIN Policy & Rate Limiting (#366)**: Enforced LAN PIN validation and progressive rate limiting (HTTP 429 when locked) on configuration mutations (`PATCH /dsh-lanmode/api/config`), Cloudflare tunnel toggles (`/dsh-lanmode/tunnel/toggle`), and plugin updater (`/api/dsh-lanmode/update`).
- **Cloudflare WAN WebSocket Upgrade Protection (#367)**: `handleUpgrade` in `lib/bridge-ws.js` now verifies `tunnelPin` policy and trusted Cloudflare proxy headers on all WebSocket connection upgrades, rejecting unauthenticated WAN upgrades with HTTP 403.
- **Immediate WebSocket Revocation Desync Fix (#54)**: Active duplex WebSockets are now registered with both raw tokens and SHA-256 digests. Sockets are immediately destroyed upon individual session revocation, user password change (`revokeSessionsForUser`), or complete device reset (`revokeAll`).

## 0.8.30

### Dynamic Bootstrap Flags & Session Duration Synchronization (#412)
- **Dynamic HTML Bootstrap Flags (#412)**: In `lib/index.js`, the `pieces` object (`settings`, `randomUuid`, `clipboard`, `mobileEnterSends`) now uses dynamic getters on `config`, and `ctx.webServer.tapIndex` serializes `window.__DSH_LANMODE__` dynamically per HTML request. Saving configuration updates immediately affects newly loaded pages without requiring host restart.
- **Dynamic Session Duration (#412)**: Added `setSessionDurationDays` to `AuthManager` (`lib/auth.js`). `updateLiveState` in `lib/config-validator.js` and `onConfigUpdated` in `lib/index.js` now dynamically update active `sessionDurationMs` whenever `authSessionDays` changes, ensuring subsequent remember-me sessions instantly adhere to the new duration.
- **Independent Audit Verification (#412)**: Verified against independent audit runner `bootstrap.mjs`, ensuring zero divergence between runtime state, injected HTML, and authentication session lifetimes.

## 0.8.29

### Dynamic Secret Resolution & Credential Reference Preservation (#365)
- **Resolved lanPinRef Preservation (#365)**: `updateLiveState` in `lib/config-validator.js` now preserves the active resolved PIN secret when configuration updates occur without altering `lanPinRef`, preventing unrelated saves (such as UI preference changes) from dropping PIN protection or reverting to raw fallback values.
- **Dynamic Credential Rotation (#365)**: `onConfigUpdated` in `lib/index.js` now dynamically resolves newly updated `lanPinRef` secrets via `resolveSecret`, immediately propagating rotated credentials to the active HTTP and WebSocket bridge without listener restart.
- **Fail-Closed Patch Validation (#365)**: In `lib/routes/config.js`, incoming configuration patches with `lanPinRef` are verified against the credentials provider prior to durable persistence. If a reference cannot be resolved and no valid fallback is provided, the request is rejected with HTTP 400, preventing silent security degradation and deceptive save success.
- **Regression Test Suite (#365)**: Added tests covering resolved `lanPinRef` preservation across unrelated configuration updates, dynamic credentials rotation, and rejection of unresolvable credential references.

## 0.8.28

### Security Policy Rotation, Profile Rollback & Card Ready Contract
- **Entry Options Rollback on Failed Durable Write (#364)**: `persistConfigDurable` now restores `fiber.entry.options.config` to its previous state if `fiber.entry.parent.tree.write()` throws an error, ensuring in-memory loader options never diverge from durable disk state upon write failures.
- **Dynamic Bridge Security Policy Rotation (#365)**: The direct HTTP bridge dynamically evaluates `lanPin`, `unlockPrivileged` (and `allowPrivileged`), `privilegedExtra`, and `tunnelPin` on every incoming request, enabling instantaneous rotation of LAN PINs and access policies without bridge listener restarts.
- **Strict Response Validation in Client Card (#401)**: Enhanced `saveSettings` validation to verify that HTTP 200 responses contain a valid contract payload (`status: 'ready'`, `status: 'ok'`, or `ok: true`) and reject empty objects `{}` or `{ status: 'error' }` payloads, preventing deceptive success indications on client errors.
- **Verification Suite (#364, #365, #401)**: Added unit and integration tests covering entry rollback on disk write failure, dynamic LAN PIN rotation on live bridges, and client card response rejection contracts.

## 0.8.27

### Configuration Save Lifecycle, Dynamic Bridge State & Card Error Handling
- **Nested Schemastery Validation (#363)**: Enforced rigorous type validation across all `tlsSites` items (`host`, `cert`, `key` strings) and per-key `Config.dict[key]` validation on incoming configuration patches, rejecting malformed structures before processing.
- **Persistence Atomicity & Durable Provider Check (#364)**: `effective` configuration and `onConfigUpdated` are now mutated only after durable persistence succeeds via Cordis registry tree, fiber, loader, or settings service. If persistence fails (HTTP 500), `effective` remains untouched.
- **Getter Safety & Live Dynamic Policy Enforcement (#365)**: Refactored `updateLiveState` with property descriptor checks to safely update runtime state without triggering `TypeError` on getter properties (`passwordAuth`, `authUser`, `publicHost`). Bridge dynamically queries live state on each incoming request to immediately enforce password authentication without process restarts.
- **Dynamic Partial Configuration Merging (#394)**: Merged incoming partial patches on top of `effective` before evaluating Schemastery schemas in `setupDynamicConfig`, preventing unmentioned settings from reverting to defaults.
- **Card Save Error Reporting (#401)**: Enhanced `saveSettings` in the client settings card to inspect HTTP status codes and API error messages, preventing false-positive "Saved" status when server returns 400, 403, or 500.
- **Automated Verification Suite (#363, #364, #365, #394, #401)**: Added `test/audit-block1-reopen-fixes.test.mjs` covering nested schema validation, durable persistence atomicity, dynamic auth toggle, partial merge integrity, and client card error parsing.

## 0.8.26

### Dynamic Configuration, Live TLS Reload & Backlog Triage
- **Dynamic Configuration & TLS Material Reload (#394)**: Fixed frozen configuration bug where volatile TLS certificate and private key paths set via the card or DSH loader never took effect until a full process restart. Implemented `setupDynamicConfig` in `lib/config-validator.js` subscribing to Cordis `loader/volatile-update`, `settings/document-updated`, and `config` events, as well as querying the Cordis `settings` service for deferred initialization.
- **In-Place Certificate Renewal Detection (#394)**: Added certificate file stat fingerprint (`stat.mtimeMs:stat.size`) into the bridge listener synchronization key (`directKey`), allowing automatic TLS context reload and listener re-arming when certificates are renewed in place on disk (e.g. certbot/acme) without changing path names.
- **Attachment Points Verification Refactoring (#394)**: Extracted background attachment point verifier to `lib/assumptions.js` (`registerAttachmentPointsVerifier`), preserving `lib/index.js` line count at 572 lines (strictly <= 600 lines architectural limit).
- **Automated Verification Suite (#394)**: Added `test/audit-issue-394-dynamic-config.test.mjs` verifying payload extraction, settings service querying, volatile update handling, in-place rotation detection, and clean listener teardown.
- **Backlog Triage & Repository Scope Cleanup (#331)**: Performed exhaustive audit and triage of all 44 open out-of-scope issues (messengers/bots, files/.docx parsing, enterprise IAM/RBAC/TOTP duplication, E2EE relay, Android APK), posted detailed rationale comments on Gitea, and closed them, focusing repository backlog exclusively on LAN bridge functionality.

## 0.8.25

### Documentation, Design Contract & Broken Link Fixes
- **Broken Markdown Link Elimination (#378)**: Removed obsolete 0.6.11 alpha.5 hotfix notice and dead links to docs/testing/alpha5-compatibility.md from README.md and README.ru.md. Updated docs/releases/0.6.11.md. Verified that public README files contain zero relative links to the npm-excluded docs/ folder.
- **Version Alignment (#378)**: Synchronized active version across package.json, docs/design/DESIGN.md (v0.8.25), and index.md. Added detailed Block 1–8 architectural design notes to DESIGN.md.
- **Authentication & Security Contract Documentation (#378)**: Accurately documented plaintext compatibility + scrypt digests, constant-time verification with dummy scrypt cost equalization, PBKDF2 PIN stretching with 15-minute brute-force lockout, and SHA-256 session/device token digest storage at rest across English, Russian, and Chinese READMEs.
- **Cloudflare WAN Tunnels & Quick QR Workflow (#378)**: Documented zero-config Quick Tunnels, persistent Named Tunnels with connection readiness detection, mandatory tunnelPin: true gate, and the interactive Quick QR popover in the sidebar footer (sidebar.footer / sidebar.rail).
- **Automated Documentation Verification Gate (#378)**: Added test/audit-block8-docs-design.test.mjs verifying link integrity, public README boundaries, version alignment, auth/tunnel documentation accuracy, and package manifest integrity.

## 0.8.24

### Test Isolation & Static Verification Gates
- **Clean-Pack Isolation & Race Condition Fix (#376)**: Added isolated fixture directory support (process.env.CLEAN_PACK_DIR / cleanPack(root)) in scripts/clean-pack.mjs and refactored test/clean-pack-194.test.mjs to work within a dedicated temporary directory (fs.mkdtempSync), eliminating repository root file collisions. Handled concurrent unlinking gracefully (ENOENT). Replaced offset-based port allocations in performance tests with dynamic ephemeral binds (listen(0)).
- **CI Quality Gate & Static Verification Enforcement (#377)**: Configured ESLint with strict no-undef: error rule across all runtime, bridge, and client files. Added npm run check:static (scripts/lint.mjs) combining Node.js syntax checks and ESLint verification across 181 files. Added automated Gitea Actions workflow (.gitea/workflows/ci.yml) executing static analysis, license verification, unit testing, and package file integrity on pull requests and pushes. Fixed libuv process group signal trap in lib/tunnel.js by guarding proc.pid > 0.

## 0.8.23

### Client Localization & Quick QR WAN Switch
- **Full Client Localization Dictionary Registration (#1)**: Registered complete 153-key dictionaries (`en`, `zh`) via `ctx.locale.register(NS, { en: I18N.en, zh: I18N.zh })` inside `ctx.effect(...)` with proper disposer return. Corrected `getLocale()` to prioritize user-selected DSH interface locale (`window.__DSH_LOCALE__`, `ctx.locale.getSnapshot()`, `document.documentElement.lang`) over browser `navigator.language`. Wired external translation fallback (`env.boundT = ctx.locale.bind(NS)`) enabling `@goodandready/dsh-russian-lang` to provide Russian UI without modifying plugin source code. Injected `t` into all registered slots.
- **Quick QR LAN / WAN Mode Selector Switch (#49)**: Added interactive segmented toggle between `LAN` and `WAN` modes in the Quick QR popover (`lib/client-parts/08-qr.js`). Exposed `tunnel` status and public URL in `hostReport(state)` (`/dsh-lanmode/health?format=json`). Disables the WAN option with a descriptive hint when the tunnel is inactive. When active, switching to WAN updates the target URL, QR code, and copy/share actions to the Cloudflare public URL.

## 0.8.22

### Client PIN Challenge, Headers, QR & Live Re-auth
- **Request & Header Preservation on PIN Retry (#374)**: Preserved all request headers (`Headers` instance, plain object, tuples, or `Request.headers`) upon PIN challenge retry in `lib/shim.js`. Cloned `Request` before initial dispatch preventing body consumption errors on retries.
- **Canonical Listener QR Descriptor & Interface Categorization (#375)**: Integrated canonical listener scheme and port from health and interfaces endpoints into Quick QR in `lib/client-parts/08-qr.js`, formatting IPv6 addresses in brackets. Supported custom `mdnsName` and returned dual keys (`category`/`type` and `name`/`label`) in `lib/network-interfaces.js` and `lib/bridge-local.js`.
- **Queued Unlock Manager & Safe Cancel (#201)**: Centralized pending 403 authorization challenges in `_pendingOps` queue in `lib/shim.js`. Submitting PIN replays all queued requests; cancelling resolves all pending promises with the original 403 response without leaving requests hanging indefinitely.
- **Lossless Session Expiry Handling (#240)**: Eliminated premature hard redirect `window.location.href = '/'` on HTTP 401 in `lib/shim.js`. Dispatched `dsh:auth-required` to trigger the Live Re-auth overlay, preserving user draft prompts and session context.
## 0.8.21

### Updater, Lifecycle & Persistence
- **Plugin Updater Action Split (#371)**: Differentiated `action: 'check'` and `action: 'update'` in `lib/plugin-updater.js`. Read request body with `readLimitedBody`. Action `check` performs read-only status query without triggering installation. Action `update` validates profile lock before running `installExact`. Status returns `name: options.packageName` and `checkedAt` timestamp. Successful updates return `success: true`.
- **Hardened Device Registry Persistence (#370)**: Preserved in-memory dirty state upon file write errors in `lib/devices.js`. Rolled back in-memory nickname changes if disk flush fails. Ensured `revoke`, `revokeAll`, and `revokeAllExcept` accurately return boolean write status. Endpoints in `lib/routes/devices.js` and `lib/bridge-local.js` return HTTP 500 when disk persistence fails instead of false 200 OK.
- **Fixed `isPasswordAuth()` Evaluation in Ban Route (#256)**: Evaluated boolean function call `typeof isPasswordAuth === 'function' ? isPasswordAuth() : Boolean(isPasswordAuth)` in `lib/bridge-local.js` `handleBanRoute`, preventing spurious 401 Unauthorized for passwordless local admins.
- **Named Tunnels Readiness Detection & Hostname Support (#47)**: Added `NAMED_READY_REGEX` to detect Cloudflare named tunnel connection readiness from logs (`Registered tunnel connection`, `Connection ... registered`, `Updated to new configuration`) without waiting for 30s quick URL timeout. Added custom `hostname` support across constructor, routes, and state reporting.
- **WAN Tunnel Auto-start & Clean Disposal (#48)**: Added config-driven WAN tunnel startup effect in `lib/index.js` when `config.tunnel !== 'off'`, with credentials resolution and clean disposal on context unload and dynamic config updates.

## 0.8.20

### Tunnel & Process Lifecycle
- **Fail-safe CloudflareTunnel Process Error Handling (#372)**: Registered default error listener on child process `EventEmitter` preventing host crashes when `cloudflared` is missing (`ENOENT`) or fails. Added `try/catch` guard to `/dsh-lanmode/tunnel/toggle` route handler returning HTTP 500 JSON without server failure. Attached tunnel logger in main plugin index.
- **Full HTTPS Origin Contract for Cloudflare Tunnel (#373)**: Enhanced `buildArgs()` to support `scheme: 'https'`, `--origin-server-name` (defaults to `dsh.local`), and `--origin-ca-pool` pointing to the locally generated Root CA certificate (`state.caCertPath`), eliminating `--no-tls-verify` while ensuring trusted loopback origin validation.
- **Process Lifecycle Isolation & Timeout Management (#343)**: Isolated event handlers (`onOutput`, `exit`, `error`) to current child process instance (`if (this.proc !== currentProc) return`), preventing stale dying processes from corrupting subsequent tunnel instances. Guaranteed `stop()` cancels `_startTimeout`, sends `SIGTERM`, and escalates to `SIGKILL` after 3 seconds.

## 0.8.19

### Configuration & Live Lifecycle
- **Schema & Semantic Validation on PATCH Config (#363)**: Validates enums (`mode`, `tls`, `tunnel`), port ranges (`directPort: 1..65535`), session days (`authSessionDays >= 1`), stream timeouts (`streamTimeoutMs >= 0`), strict booleans, and CIDR strings via `parseRule()`. Rejects invalid payloads atomically with HTTP 400 Bad Request without mutating in-memory state.
- **Durable Profile Persistence via Cordis Loader (#364)**: Integrates `persistConfigDurable()` with Cordis Loader entry tree (`fiber.entry.parent.tree.write()`) and fiber updates. Configuration changes are committed durably to the profile patch; failures return HTTP 500 without reporting false success.
- **Live Role Propagation without Listener Restart (#365)**: Replaced static rule closures with dynamic state getters (`getRules`, `getAdminRules`, `getGuestRules`, `getTrustedProxyCidrs`). Runtime updates to `adminAllow` and `guestAllow` take effect immediately on active HTTP and WebSocket surfaces without dropping connections or restarting the TCP listener. Returns `restart: false` when only permissions change, and `restart: true` only when socket binding parameters (port, host, TLS) change.
- **Async Credentials Resolution & Boundary Enforcement (#329)**: Removed direct regex reading of `~/.dsh/.credentials.yaml`. Made `resolveBrowserAuthSecret(ctx)` async, safely awaiting `creds.readRecord('client-connection', 'browser-session')`. Declared `credentials` as optional dependency in plugin `inject`, logging `failed.stack` and using backoff retry upon startup errors.
## 0.8.18

### Security & Hardening
- **TLS ReferenceError in raiseListener (#354)**: Fixed crash in HTTPS listener initialization when loading certificate and key from unwrapped configuration.
- **Fail-closed guard on wildcard bind (#360)**: Halts listener raise and rejects binding `0.0.0.0` when neither allow list nor password authentication is configured.
- **Unresolved credential ref handling (#361)**: Supports string and object credential resolver APIs, safely falling back to empty value instead of exposing unresolved reference keys.
- **Settings card password mask protection (#362)**: Ignores masked `***` values for `authPassword`, `lanPin`, and `tunnelToken` during `PATCH /dsh-lanmode/api/config` to prevent overwriting secrets.
- **LAN PIN protection on configuration endpoints (#366)**: Enforces LAN PIN validation and attempt rate-limiting on state-mutating config requests.
- **WebSocket upgrade security gate (#367)**: Enforces ban list, guest role restrictions, LAN PIN, and origin validation during HTTP Upgrade before duplex stream proxying.
- **Core auth token protection in QR endpoint (#368)**: Restricts inclusion of core harness authentication tokens in `/dsh-lanmode/qr` to authenticated admin sessions and strict loopback callers.
- **Enforce loopback-only on bridge bootstrap (#238)**: Blocks external callers from reaching `/auth/bootstrap` through the bridge with 403 Forbidden.
- **Hashed token storage in DeviceRegistry (#266)**: Stores SHA-256 digests of authentication tokens with strict `0o600` file permissions instead of raw tokens.
- **Active WebSocket termination on session revocation (#54)**: Immediately terminates active duplex client and upstream sockets when a session or device is revoked.
- **Permanent revocation records against LRU eviction (#369)**: Retains revoked device tokens in a dedicated non-evicting set to prevent revoking token revival under device limit pressure.

## 0.8.17

### Fixed
- **Repository metadata**: Updated repository URL format in package metadata.

## 0.8.16

### Fixed
- **Stability and configuration unwrapping (#354, #355, #357)**: Safely unwraps volatile Cordis configuration boxes, cleans dead exports, and enforces repository hygiene.

## 0.8.15

### Fixed
- **Settings contract alignment**: Synchronized configuration schema with DSH core.

## 0.8.14

### Fixed
- **Settings form serving (#352)**: Serves settings form under entry ID for DSH 0.1.7-rc.2 and 0.2.0 compatibility.

## 0.8.13

### Fixed
- **Peer gate on DSH 0.2.0-rc.1** (#58): DSH skips a profile bundle whose `peerDependencies` exclude the running version, so this plugin was absent from the profile with no error in the UI. Every `@deepseek-ai/dsh-*` peer now names both the 0.1.7-rc.2 and 0.2.0-rc.1 lines, because semver does not admit a prerelease of the next minor into a range that does not name it.

Notable changes to `@goodandready/dsh-lanmode`.

## 0.8.10

### Fixed
- **Isolate test storage from live production data (#330)**: respects `process.env.DSH_HOME` across device registry, ban storage, and certificate helpers; runs all test suites against isolated temporary storage, completely eliminating live `~/.dsh` file pollution during tests.
- **Block administrative RPC and plugin configuration endpoints for guest role (#327)**: blocks dot-notated RPC methods (`/api/settings.*`, `/api/credentials.*`, `/api/plugins.*`, `/api/agentPreset.*`, `/api/host.*`) and neighboring plugin configuration endpoints (`/dsh-*/config`, `save-key`, `accounts`, `export`, `import`, `vault`, `update`) for guest role; enforces that `unlockPrivileged: true` never unlocks privileged APIs for guests.
- **Block cross-site mutating requests before bridge proxying (#328)**: rejects `Sec-Fetch-Site: cross-site` and untrusted `Origin` headers on state-mutating requests (`POST`, `PUT`, `PATCH`, `DELETE`) with 403 before proxying upstream; forwards real remote client IP via `X-Forwarded-For` and `X-Forwarded-Proto`.
- **Declare optional credentials service inject and prevent listener startup crash (#329)**: declares `{ webServer: { required: true }, credentials: { required: false } }` in plugin `inject`, safely wraps credentials resolution to eliminate the Cordis injection trap, logs full error stacks, and implements exponential backoff retry on listener startup failure.
- **Condense startup warnings and gate ASCII QR in journal logs (#333)**: gates multi-line console ASCII QR rendering behind `DEBUG` / `DSH_LANMODE_DEBUG_QR` flags, condenses privileged exposure warnings into a single clear line, and cleans dangling JSDoc.
- **Remove minimumReleaseAge=0 and validate package lock PID in self-updater (#334)**: eliminates `--config.minimumReleaseAge=0` in child `dsh plugin add` arguments, checks `package.json.lock` PID before launching updates (returning 409 Conflict if active), and cleans up stale lock files on timeout/exit.
- **Clean up stale release worktrees and prunable directories (#332)**: removed orphaned detached worktrees and verified all changes merged to `main`.

## 0.8.9

### Fixed
- **Prevent DSH process crash on /dsh-lanmode/qr endpoint (#322, #GH-2)**: resolves undefined `cached.svg` property causing uncaught `TypeError` in `Buffer.byteLength`, adds defensive `try/catch` guard for oversized QR text, computes RFC-compliant ETag, and enforces `GET, HEAD` methods with 405 response.
- **Restrict /dsh-lanmode/api/interfaces and /api/telemetry to administrators (#323)**: enforces `denyUnlessAdmin` access control to prevent internal network topology and socket pool disclosure to unauthenticated guests, and restricts methods to `GET, HEAD`.
- **Enforce 405 Method Not Allowed and RFC 9110 Allow headers across bridge endpoints (#324)**: standardizes method rejection and adds missing `Allow` response headers across bridge routes (`/pair-accept`, `/bans`, `/loopback-token`, `/sw.js`, `/ca.mobileconfig`, `/api/devices*`).
- **Replace empty catch block in 09-apply.js settings subscription (#325)**: replaces empty `catch (_) {}` in locale subscription callback with diagnosable handler to satisfy preflight quality gate.
- **Validate request payload shape in /dsh-lanmode/devices/revoke (#326)**: validates device ID requirement on revoke requests and returns 400 Bad Request on empty or malformed payloads.

## 0.8.8

### Fixed
- **Protect GET /dsh-lanmode/tunnel endpoint against unauthenticated disclosure (#316)**: enforces `resolveClientRole` and `verifyAdminAccess` so WAN tunnel state and public URLs are never disclosed to unauthenticated guests.
- **Prevent logout CSRF on /dsh-lanmode/auth/logout (#317)**: enforces `POST` method requirement and `isTrustedSameOrigin` anti-CSRF check before destroying user sessions.
- **Pass state and config options to isTrustedSameOrigin in device routes (#318)**: ensures `config.allowedHosts` and dynamic state are respected during origin validation in `/dsh-lanmode/devices`.
- **Enforce 405 Method Not Allowed and RFC 9110 Allow headers across all routes (#319)**: validates request methods and sets standard `Allow` response headers on manifest, devices, config, and session endpoints.
- **Replace empty catch blocks in resolveBrowserAuthSecret (#320)**: provides diagnosable debug logging for credential stores and satisfies preflight static quality gates.
- **Wrap client locale and slot registrations in ctx.effect (#321)**: manages Cordis plugin lifecycle cleanly to prevent registration leaks on client context reload.

## 0.8.7

### Fixed
- **Sanitize initialError and defaultUser against XSS injection (#308)**: escapes user-provided values in `renderLoginPage` HTML generation to prevent reflected XSS.
- **Support options object and resolve DEP0187 in DeviceRegistry (#309)**: safely handles `{ filePath, saveDelayMs }` options argument and avoids `DEP0187` DeprecationWarning in Node.js 22/24.
- **Prevent Cloudflare header spoofing from untrusted remote IPs (#310)**: checks peer IP against `trustedProxyCidrs` before accepting `cf-ray` / `cf-connecting-ip` headers.
- **Enforce 405 Method Not Allowed on diagnostics endpoints (#311)**: rejects non-GET/HEAD HTTP methods on `/dsh-lanmode/health`, `/ca.crt`, `/ca.der`, `/qr`, and `/probe`.
- **Eliminate hardcoded ports in integration tests (#312)**: allocates dynamic ephemeral ports in test suites to prevent parallel test port collisions and race conditions.
- **Use ctx.logger instead of direct console in index.js (#313)**: standardizes runtime logging with Cordis plugin lifecycle logger.

### Added
- **Server-side renderLoginPage notice support (#314)**: integrates `resolveLoginNotice` into SSR `renderLoginPage` for immediate status alert rendering.

## 0.8.6

### Added
- **Browser directory picker patch (#241)**: disables host OS native directory chooser on remote/headless server and mounts `@deepseek-ai/dsh-host-directory-picker-browse` with `@deepseek-ai/dsh-client-ui-directory-picker-browse` for seamless in-app workspace selection.
- **DeepSeek App mobile header styling (#203)**: adds glassmorphism backdrop blur, rounded brand badge, and smooth micro-interactions matching the native DeepSeek mobile experience.

### Fixed
- **DNS rebinding protection in isTrustedSameOrigin (#307)**: validates authority against local and LAN hostnames so foreign Host headers cannot bypass origin checks.
- **Auto-mint core browserAuth cookies (#232)**: resolves core `browserAuth` secret and automatically signs loopback and client authority cookies to eliminate 401 Unauthorized errors on `/api` through tunnels and reverse proxies.

## 0.8.5

### Fixed
- **Direct listener no longer binds sslip.io or nip.io names (#305)**: those names stay on the certificate SAN. The bridge listens only on real host addresses, so startup no longer logs ENOTFOUND or address-in-use for DNS aliases.

## 0.8.4

### Added
- Named TLS certificates (`tlsSites`) are selected by the requested server name. Unknown names and IP addresses keep the default certificate.
- A phone can be paired with `/dsh-lanmode/pair-accept?token=` without setting a cookie. The link redirects to the app path and then to `/?token=`.
- When an API answer is 401 and carries `x-dsh-auth-required: 1`, the page asks for the password again and keeps the current draft.
- Links and file opens for zip, exe, dmg, pkg, msi, 7z, rar, gz, bz2, iso, bin, and apk download instead of opening in the page.
- An administrator can ban an address with `POST /dsh-lanmode/bans`. A banned address receives plain `403 Forbidden` before the login page. Loopback and the caller's own address cannot be banned.
- The first password, password reference, or switch to password authentication is accepted only from loopback.
- Password authentication cannot be left on with both the password and the password reference empty.
- Credential lookups are reused for 30 seconds after a hit and 5 seconds after a miss.
- Usernames listed in `disabledUsers` lose their sessions on a 5 second sweep.
- The login card shows the host being signed into. A new certificate includes sslip.io and nip.io names. The saved certificate is kept across restarts.
- The public web app manifest is served for install, and a saved launch token can reopen a home-screen bookmark.

### Changed
- Passwords are stored as scrypt digests. Session tokens are stored as SHA-256 digests. Other sessions for that user are revoked when the password changes.
- Login timing does not reveal whether the username exists. The LAN PIN uses PBKDF2 and a 15 minute lockout.
- `X-Forwarded-For` and `CF-Connecting-IP` are honored only when the peer is in `trustedProxyCidrs`.
- Local clients skip response compression. Remote clients can still receive compressed responses.
- On a phone, the QR action shares the footer row with settings, a long press opens the session menu, and the model menu stays at the bottom of the screen. Heavy desktop panels close; other plugins stay visible.

### Fixed
- The bridge probes loopback ports 3080, 3081, and 3082 when the harness port is not configured. An explicit port is never probed.
- Gated plugin routes that share a prefix with a public path stay gated.
- The harness token for a local desktop is returned only to loopback.
- Launch-token redirects stay on a relative Location.

## 0.8.3

### Fixed
- **Idempotent request retry on socket reset (#164)**: automatically retry GET and HEAD requests once on upstream connection reset (`ECONNRESET`, `socket hang up`, `EPIPE`) or when a reused keep-alive socket drops before headers are sent.
- **Upstream agent pool purging on connection drop (#164)**: stale idle sockets in `upstreamAgent.freeSockets` are purged upon reset so retries and subsequent requests obtain fresh TCP connections.
- **Eliminate MaxListenersExceededWarning on socket reuse (#164)**: removed `socket.setTimeout(..., cb)` from `upstreamAgent.on('free')` and replaced with listener-free socket timer references (`_lanmodeIdleTimer`), eliminating `EventEmitter` listener leaks.
- **Unified downstream client lifecycle (#164)**: consolidated single `close` / `error` handlers on downstream client requests and responses to avoid listener duplication.

## 0.8.2

### Fixed
- **Suppress client teardown error logs (#164)**: when client disconnects (tab closed, page navigation, SSE cancel), subsequent upstream socket destroy errors (`ECONNRESET`, `socket hang up`) are recognized as normal teardown and no longer logged as backend errors or replied to closed sockets.

## 0.8.1

### Fixed
- **Root CA expiration check (#165)**: fixed `inspect()` return value handling in `ensureRootCA` where `info.expires` was `undefined` instead of timestamp milliseconds, causing the Root CA to be needlessly regenerated upon every DSH restart.
- **Bridge 502 / TCP RST prevention on keep-alive idle connections (#164)**: tuned `upstreamAgent` idle socket timeout and pruning to 3500ms (below harness core's 5000ms `keepAliveTimeout`) to eliminate socket race conditions and `ECONNRESET` packet bursts when browsers resume activity.
- **Detailed 502 error reporting (#164)**: upstream bridge errors now log exact error codes and URLs, returning descriptive bodies (`dsh-lanmode: Harness backend is not responding (ECONNRESET: ...)`) instead of opaque 502s.
- **DSH 0.1.7 HTTP 303 support in assumption checks (#164)**: added HTTP 303 (See Other) to expected authentication challenge responses in `checkAssumptions` and made token extraction dynamic to prevent false-positive `MOUNTING POINTS DRIFTED` logs with one-time tokens.
- **WebSocket upgrade header deduplication (#164)**: prevented duplicate `connection: close` headers in `lib/bridge-ws.js`.

## 0.8.0

### ⚠ Breaking — requires DSH 0.1.7+
- **`settings.register` removed**: the host-side `settings` service dependency was dropped. Configuration is now loaded exclusively from the profile row (`cordis.patch.yml` `config:` section) via `apply(ctx, config)`. This aligns with DSH 0.1.7 which removed the global settings.yaml store (#161).
- **`settingsScope` removed (client-side)**: the settings card no longer depends on the removed `settingsScope` service. Config is read from `GET /dsh-lanmode/api/config` and saved via `PATCH /dsh-lanmode/api/config`.
- **`@deepseek-ai/dsh-client-ui-settings` client inject removed**: no longer needed after `settingsScope` migration.

### Security
- **Fail-closed defaults**: `directHost` defaults to `127.0.0.1` (was `0.0.0.0`) and `allow` defaults to `['127.0.0.0/8']` (was `[]`). A fresh install no longer opens a network listener without explicit configuration.
- **Security guard**: the plugin refuses to start a listener on `0.0.0.0` when both `allow` and `passwordAuth` are unset, logging a clear SECURITY warning.

### Added
- **Config HTTP API**: `GET /dsh-lanmode/api/config` and `PATCH /dsh-lanmode/api/config` endpoints for reading and updating plugin configuration from the settings card. Secrets are masked in responses.
- **`cordis.patch.yml` ships safe defaults**: new installs get `mode: auto`, `directHost: 127.0.0.1`, `directPort: 3088`, `allow: ['127.0.0.0/8']`.

## 0.7.25

### Fixed
- **LAN PIN challenge and rate-limiting defense**: PIN verification in the local bridge and privileged route dispatcher now validates incoming PIN tokens (`verifyLanPin`) and enforces brute-force protection with HTTP 429 status after 5 consecutive failed attempts per IP (#154).
- **Protected WAN and diagnostic endpoints**: Internal diagnostic routes `/dsh-lanmode/api/interfaces` and `/dsh-lanmode/api/telemetry` are now strictly authenticated via `passwordAuth` to prevent unauthorized network and interface enumeration from untrusted origins (#156).
- **Dead code and unused export elimination**: Removed obsolete `manifestPath` variable in bridge diagnostics and cleaned up unused export symbols (`isConnectionBundle`, `recordPinAttempt`, etc.) to keep package footprint minimal (#157).

### Added
- **AI Agent Tool `/mobileqr` (`lanmode.mobileqr`)**: Registered interactive agent command in `lib/index.js` enabling AI assistants to render clean SVG QR codes and instant connection links directly into chat responses upon user request (#155).

## 0.7.24

### Fixed
- **Settings reachable again on the plugin's own page**: the current DSH core
  (0.1.6-alpha.2) renders a plugin's configuration page only for entries registered
  in the plugin-list seat `plugins.item`. The view-aware `LanModeCard` is now
  registered there (`id: 'dsh-lanmode'`, order 40, static label); the row seat and the
  legacy card stay as fallbacks. The deferred-registration test (#89) now expects the
  three settings seats in order, in the inject and the direct-registration paths alike.

## 0.7.23

### Fixed
- **Settings reachable again**: the card registered into `settings.plugin.item`, a
  slot the current DSH core (0.1.6-alpha.2) no longer renders, so the plugin's
  settings were unreachable. The surface now registers into the Plugins page row
  seat `plugins.row.config` first, keyed `@goodandready/dsh-lanmode#dsh-lanmode`
  (`rowConfigKey(package, rowId)`): the plugin's row gains a configure control whose
  page is the settings form (`view: 'page'`, open and without our card chrome — the
  host page draws the title, icon, crumb and padding) plus a one-line state for
  `view: 'summary'`. The legacy seat stays registered as a fallback for older cores.
- The deferred-registration tests (#89) now expect both seats in order, in the
  `slots.inject` and the direct-registration fallback paths alike.

### Added
- This changelog.
