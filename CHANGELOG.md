# Changelog

## 0.8.53

- **Security (#479)**: Protect plugin mutating endpoints and sensitive reads under LAN PIN and prevent core auth cookie leakage to unauthenticated LAN clients:
  - Non-GET mutating requests (POST, PUT, DELETE, PATCH) targeting plugin routes (/dsh-* and /api/dsh-*) and sensitive read paths (config, save-key, ccounts, xport, import, ault, ackup, credentials) are now classified as privileged in lib/privileged.js.
  - Mutating plugin actions from LAN clients require valid LAN PIN challenge or active passwordAuth session when protection is active.
  - The direct bridge (lib/bridge.js:prepareClientHeaders) strictly forbids minting and delivering loopback core authentication cookies (dsh-auth-*) to unauthenticated LAN clients when PIN or password protection is active.

## 0.8.52

- **Bugfix (TLS #353)**: Reconnect `stillGood(info, hosts, now)` in `lib/tls.js:ensureCertificate`. The server certificate is now reissued automatically when new network addresses or hostnames appear in `hosts`, ensuring proper Subject Alternative Names (SAN) coverage while preserving Root CA trust.
- **Tech Debt / Hygiene (#480)**:
  - Fixed flaky VAPID key generation in `lib/push.js` by ensuring P-256 scalar private key is strictly padded to 32 bytes.
  - Eliminated server-side `console.error` calls in `lib/devices.js` and `lib/bans.js`.
  - Removed unused exports `canonicalDeviceId` (`lib/devices.js`), `mintCoreAuthCookie` (`lib/dsh-auth-cookie.js`), and `isPidAlive` (`lib/plugin-updater.js`).
  - Documented and annotated all intentional empty `catch` blocks across `lib/` to satisfy preflight rules.

## 0.8.51

- **Security (#477)**: Pass Cloudflare named tunnel token via `TUNNEL_TOKEN` environment variable instead of `--token` command-line argument (`argv`). Prevents sensitive token exposure in `ps aux`, `/proc/<pid>/cmdline`, and crash dumps. Added token redaction to error messages.

## 0.8.50

- **Feature (PWA / Notifications #468)**: Live Activity and Lock Screen progress widget for running agent turns with throttled silent updates (`tag: 'dsh-active-progress'`), Unicode progress bars, and auto-dismiss on completion.
- **Feature (Performance #469)**: Data-Saver mode with adaptive SSE token delta throttling (50-80ms buffer window) and fast streaming compression on cellular networks, including mobile navbar toggle.

## 0.8.49

- **Security (#474)**: Generic LAN clients matching defaultRules default to guest role instead of inheriting admin unconditionally. Administrative actions require explicit adminAllow, valid passwordAuth session, or valid LAN PIN.
- **Network Feature (#467)**: 1-Click Tailscale Funnel integration with trusted Let's Encrypt HTTPS certificates and settings card management.

## 0.8.48

- feat(network): Smart Network Auto-Switch between local LAN and WAN tunnel (#466)
  - Adaptive connection probe in `lib/shim.js` detecting Wi-Fi drop / cellular transitions.
  - Transparent failover between fast local LAN (`https://dsh.local:3080`) and WAN tunnel (Cloudflare/Tailscale) without losing chat session context.
  - Visual active transport indicator pill (`LAN` vs `WAN`) in mobile navigation bar (`lib/mobile-nav.js`).
  - Configurable `networkAutoSwitch` boolean toggle in settings schema and UI card.
  - Dynamic probe endpoint CORS support and Service Worker WAN URL routing cache.

## 0.8.47

- **Actionable Web Push Notifications with Lock Screen Approvals (#465)**:
  - Added opt-in `actionablePush: z.boolean().default(false)` configuration in `lib/config-schema.js`.
  - In `lib/push.js`, extended `WebPushManager` with interactive notification actions (`actions: [{ action: 'approve', title: 'Approve' }, { action: 'reject', title: 'Reject' }]`) on `approval/asked` core events, managed `pendingApprovals` registry, and `resolveApproval(id, action)` handler.
  - In `lib/bridge-local.js`, updated Service Worker (`REOPEN_SW`) to display notification action buttons and dispatch background `fetch('/dsh-lanmode/api/push/approval/respond')` on `notificationclick` without opening the browser.
  - Added authenticated REST endpoint `POST /dsh-lanmode/api/push/approval/respond` in `lib/routes/devices.js` with registration in `GATED_PLUGIN_ROUTES` (`lib/route-guard.js`).
  - Added settings toggle in settings card and mobile controls (`lib/client-parts/`).
  - Added comprehensive test suite in `test/issue-465-actionable-push.test.mjs` (6 tests, 491 total passing tests).

## 0.8.46

- **Core Auth Cookie Injection on WebSocket Upgrade (#470)**:
  - In `lib/bridge-ws.js`, inject upstream core authentication cookie (`dsh-auth-*`) into WebSocket `upgradeHeaders.cookie` on HTTP upgrade (`handleUpgrade`), resolving infinite reconnection loops in `remote.mux` on DSH 0.2.1-rc.2.
  - Listen for upstream `Set-Cookie` in upgrade and response listeners in `handleUpgrade` and update cached auth cookie via `updateCachedAuthCookie`.
  - In `lib/dsh-auth-cookie.js`, updated `mergeDshAuthCookie` to check matching cookie name (`targetName = cached.split('=')[0].trim()`) rather than generic prefix `/^dsh-auth-/`, allowing loopback authority cookie injection when client authority cookie exists.
  - In `lib/bridge.js`, centralized `resolveCoreAuthCookie` and `updateCachedAuthCookie` and exposed them to `handleUpgrade`.
  - Added unit test suite in `test/issue-470-ws-core-auth.test.mjs` (5 tests, 485 total passing tests).

## 0.8.45

- **Web Push Notifications for Background Tasks & Approvals (#459)**:
  - Added zero-dependency Web Push module `lib/push.js` implementing RFC 8291 payload encryption (`aes128gcm`) with ECDH P-256 and HKDF derivation, and RFC 8292 VAPID ES256 JWT authorization using native Node.js `crypto`.
  - Added Service Worker push handlers (`push`, `notificationclick`) in `REOPEN_SW` in `lib/bridge-local.js` to receive background push and focus/open the application on click.
  - Added `pushSubscription` field and persistence in `lib/devices.js` (`DeviceRegistry`: `savePushSubscription`, `removePushSubscription`, `getPushSubscriptions`), persisting push subscriptions across device records in `devices.json`.
  - Integrated `WebPushManager` into Cordis lifecycle in `lib/index.js` to broadcast notifications on DSH core events (`turn/end` and `approval/asked`) to registered mobile devices.
  - Added authenticated REST endpoints in `lib/routes/devices.js` with registration in `GATED_PLUGIN_ROUTES` (`lib/route-guard.js`): `/dsh-lanmode/api/push/vapid-public-key`, `/dsh-lanmode/api/push/subscribe`, `/dsh-lanmode/api/push/unsubscribe`, `/dsh-lanmode/api/push/test`.
  - Added Web Push toggle, status indicator, and test push button in settings card and mobile controls (`lib/client-parts/04-card.js`, `lib/client-parts/06-card-body-1.js`, `lib/client-parts/02-i18n.js`).
  - Added comprehensive unit test suite in `test/web-push-459.test.mjs` (9 tests, 480 total passing tests).

## 0.8.44

- **Optional UPnP IGD & NAT-PMP Port Forwarding Gateway (#458)**:
  - Added zero-dependency `lib/upnp.js` implementing SSDP discovery multicast (`239.255.255.250:1900`), UPnP IGD SOAP port mapping (`AddPortMapping`, `DeletePortMapping`, `GetExternalIPAddress` on `WANIPConnection:1` and `WANPPPConnection:1`), and fallback to NAT-PMP opcode 2 (`5351/udp`).
  - Added `upnp: z.boolean().default(false)` configuration option in `lib/config-schema.js`.
  - Wired lifecycle management in `lib/index.js` to automatically forward ports on router when running in `mode=direct` with `upnp: true`, and cleanly release mappings on shutdown.
  - Exposed UPnP status (`enabled`, `active`, `protocol`, `externalPort`, `externalIp`, `error`) in `hostReport` (`/dsh-lanmode/health?format=json`).
  - Added comprehensive test suite in `test/upnp-gateway-458.test.mjs` (8 tests).

## 0.8.43

- **Prevent Parasitic Fiber Restart on Cosmetic Settings PATCH (#460)**: In `lib/config-validator.js`, replaced unconditional `fiber.update()` with `loader.update(fiber.entry.id, { config })`. Dropped direct `fiber.update()`, preventing uncoordinated restarts and connection drops across live settings saves.
- **Fail-Closed Same-Origin Validation (#460)**: In `lib/access.js`, `isTrustedSameOrigin` now fails closed when `req` or `req.headers` is missing or when neither `origin` nor `host` is present, eliminating the previous fail-open vulnerability.
- **Strict Prefix Route Boundary Matching (#460)**: In `lib/route-guard.js`, `isPublicPluginPath` requires exact path match or slash-separated subpath boundary (`prefix + '/'`), preventing prefix substring bypass exploits.
- **Volatile Schema Fields Alignment (#460)**: Marked secret and live-editable configuration fields (`lanPin`, `lanPinRef`, `tunnelToken`, `tunnelTokenRef`, `authPassword`, `authPasswordRef`) as `.volatile()` in `lib/config-schema.js` and aligned `setupDynamicConfig` with real Cordis loader `(paths)` arrays.

## 0.8.42

- **Architecture Decoupling & Automated Pack Headroom (#455)**: Extracted WebSocket tracking, live session metadata, and kill switch eviction from `lib/bridge.js` into dedicated `lib/bridge-sockets.js`, reducing `lib/bridge.js` from 592 to 557 lines. Extracted TLS certificate resolution and self-signed CA logic from `lib/index.js` into `lib/listener-tls.js`, reducing `lib/index.js` from 596 to 565 lines, ensuring all modules remain strictly <= 600 lines. Compressed 4-space client parts indentation, maintaining unpacked package size within 524,288 bytes.
- **Active Device Sessions Live View & Instant Revoke (#456)**: Enhanced WebSocket connection tracking to capture client user agent, remote IP, connection timestamp, and real-time activity timestamps. Exposed authenticated `/dsh-lanmode/api/sessions` endpoint registered under gated plugin routes in `lib/route-guard.js`.
- **Tailscale MagicDNS & Headscale Hostname Auto-Detection (#457)**: Created `lib/tailscale.js` querying `tailscale status --json` with 60-second TTL caching and graceful fallback. Integrated MagicDNS detection into `lib/network-interfaces.js`, providing zero-config `.ts.net` addresses for remote devices.

## 0.8.41

- **Privileged LAN Access Code Gate & Opt-In (#453)**: Enforced fail-closed code gate in `lib/bridge.js` and `lib/bridge-ws.js` rejecting privileged calls from remote LAN clients without a configured PIN (HTTP 403 `x-dsh-lan-pin-required: 1`). Added explicit `allowUnprivilegedLan` config option (default `false`) with security warning logging and `/health` visibility for operators intentionally permitting unauthenticated LAN access. Added full test matrix in `test/privileged-lan-gate-453.test.mjs`.

## 0.8.40

- **Strict Canonical Theme Whitelist & Token Cleanup (#445)**: Replaced non-canonical `--dsw-alias-fill-l1` with `--dsw-alias-bg-layer-3` in `lib/shim.js`, and `--dsw-alias-bg-layer-4` with `--dsw-alias-interactive-bg-hover` in `lib/client-parts/03-styles.js`. Aligned `CANONICAL_CORE_TOKENS` in `test/theme-tokens.test.mjs` with the exact 107 canonical CSS declarations from `@deepseek-ai/dsh-client-ui-theme@0.2.0-rc.2`, removing 10 unreleased phantom entries.
- **Health Diagnostics JSON Contract Documentation Alignment (#450)**: Aligned `docs/design/DESIGN.md` with actual JSON schema for `/dsh-lanmode/health?format=json`, clarifying that the field is boolean `persistenceDegraded: boolean` (`false` / `true`) rather than `persistenceState: DEGRADED`. Distinguished machine-readable boolean property from human-readable HTML status label.

## 0.8.39

- **Theme Tokens Alignment (#445)**: Replaced non-existent  theme tokens across UI components with canonical DSH core 0.2.0-rc.2 design tokens; replaced shadow tokens with border/ring; added regression test .
- **Durable Backup Error Logging & Degradation State (#446)**: Replaced silent empty catches when writing  snapshots for  and  with warning logs () and added  flag exposed in  status and diagnostic JSON without breaking main storage files.
- **Human-Readable Quarantine & Registry Indexing Errors (#447)**: Mapped  and  errors in  to HTTP 409 Conflict with clear explanation, preserving strict supply-chain quarantine enforcement.
- **Production Configuration Alignment (#444)**: Confirmed PIN preservation in system while honoring operator preference for personal instance; cleaned extraneous docker bridge IPs from allowlist.

## 0.8.38

### Direct HTTP/WS Bridge Dynamic PINref Rotation & Full API Coverage (#361, #378)
- **Direct HTTP/WS Bridge Dynamic PINref Rotation (#361)**: In `lib/bridge.js` and `lib/bridge-ws.js`, HTTP requests and WebSocket upgrades targeting privileged core endpoints or Cloudflare tunnel resolve `lanPinRef` dynamically fresh per operation. Rotated secrets are accepted immediately (HTTP 200 / WS 101) while old credentials are synchronously rejected (HTTP 403) without requiring service restart or manual settings save. Unresolved refs safely fail closed to HTTP/WS 403.
- **Documentation and Full Rotation Guarantee Alignment (#378)**: Confirmed dynamic secret rotation across all communication surfaces (HTTP config API, core bridge endpoints, WebSocket streams, and Cloudflare tunnel) and synchronized `README.md`, `README.ru.md`, `README.zh.md`, `CHANGELOG.md`, and `docs/design/DESIGN.md`.

## 0.8.37

### Dynamic PIN Consumer Rotation, Durable Storage Fail-Closed, Independent Diagnostics Routes & Login Script Fix (#361, #415, #440, #439, #378)
- **Dynamic PIN Consumer Rotation (#361)**: In `lib/routes/config.js`, `lib/routes/tunnel.js`, and `lib/plugin-updater.js`, when `lanPinRef` is configured, the PIN secret is resolved dynamically on each incoming protected request, rejecting old credentials (HTTP 403) and accepting rotated secrets immediately without requiring service restarts or settings resave.
- **Durable Fail-Closed Storage & .bak Recovery (#415)**: `readBanFile` and `DeviceRegistry.load()` recover cleanly from valid `.bak` when main storage is missing, enter fail-closed `corrupted: true` mode when backups are damaged or during disappearing main race seams, and refuse disk writes while in corrupted state (`return false`), preserving fail-closed protection across routine writes and reloads.
- **Independent Auth & Device Routes from Diagnostics (#440)**: Moved `registerAuthRoutes`, `registerDeviceRoutes`, and `registerTunnelRoutes` outside `if (config.diagnostics !== false)` in `lib/index.js`, ensuring login endpoints (`/dsh-lanmode/auth/login`, `/logout`, `/session`) remain fully functional when diagnostics endpoints are disabled.
- **Fix Syntax Error in Generated Login Page Script (#439)**: Removed stray `});` and duplicated input handler blocks in `lib/login-page.js`, ensuring generated inline script compiles and executes without `SyntaxError` across all locales.
- **Documentation and Unit Specification Alignment (#378)**: Aligned `README.md`, `README.ru.md`, `README.zh.md`, and `docs/design/DESIGN.md` with actual audit findings, corrected the pack size unit specification in DESIGN.md, and documented durability guarantees.

## 0.8.36

- Stability and security hardening: certificate revocation, bridge stream timeouts, and device registry sync.

## 0.8.35

- Dynamic configuration revalidation and bridge socket lifecycle optimizations.

## 0.8.30 - 0.8.34

- PWA install enhancements, QR code rendering updates, and session token rotation.

## 0.8.20 - 0.8.29

- Mobile navigation adapters, touch handling improvements, and cloud tunnel reconnect resilience.

## 0.8.10 - 0.8.19

- Core upstream port discovery, TLS SAN expansion, and memory-safe buffer handling.

## 0.8.0 - 0.8.9

- Foundation release: direct bridge, mDNS discovery, local Root CA generation, and device registry.
