# Changelog

Notable changes to `@goodandready/dsh-lanmode`.

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
