# Changelog

Notable changes to `@goodandready/dsh-lanmode`.

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
