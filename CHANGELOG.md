# Changelog

Notable changes to `@goodandready/dsh-lanmode`.

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
