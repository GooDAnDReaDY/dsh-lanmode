# Changelog

Notable changes to `@goodandready/dsh-lanmode`.

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
