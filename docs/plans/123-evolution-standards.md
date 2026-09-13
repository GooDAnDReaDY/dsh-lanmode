# Plan: Evolution & Standards Compliance (#123)

## Goals
1. **Packaging**: Exclude `docs/` from npm releases via `package.json` `files`.
2. **Internationalization**: Canonical English (`en`) for all code, comments, JSDoc, logs, schemas, and UI; bundled Chinese (`zh`) locale dictionaries; 0 Russian characters in `lib/`. Register Russian localization in `goodandready/dsh-russian-lang`.
3. **Connected Devices UI**: Device roster in settings card (`lib/devices.js`, `lib/client.js`), single revoke and revoke-all-others.
4. **One-Click CA Profile**: Apple Configuration Profile (`.mobileconfig`) generation (`/dsh-lanmode/ca.mobileconfig`) and Android CA provisioning.
5. **Subnet Role Separation**: Admin vs Guest CIDR rules with 403 Forbidden protection on administrative routes.
6. **Multi-Interface & Mesh Detection**: Categorize network interfaces (LAN, Tailscale `100.x.y.z`, WireGuard), network selector in Quick QR popover.
7. **Live Network Telemetry**: RTT, active sockets, HTTP Keep-Alive pool state, bandwidth metrics.

## Task Breakdown
- [ ] Step 1: Update `package.json` `files` field to strictly product files.
- [ ] Step 2: Implement backend APIs:
  - Device management REST endpoints (`GET /dsh-lanmode/api/devices`, `POST /dsh-lanmode/api/devices/revoke`, `POST /dsh-lanmode/api/devices/revoke-others`).
  - `.mobileconfig` Apple profile generator (`GET /dsh-lanmode/ca.mobileconfig`).
  - Network interfaces API (`GET /dsh-lanmode/api/interfaces`) with Tailscale/WireGuard detection.
  - Subnet role separation (`resolveClientRole`, `adminAllow`, `guestAllow`, 403 blocking on settings/plugins).
  - Telemetry collector and API (`GET /dsh-lanmode/api/telemetry`).
- [ ] Step 3: Complete English & Chinese i18n overhaul across `lib/*.js` (eliminate all Cyrillic from code/comments/logs/UI).
- [ ] Step 4: Implement frontend UI in `lib/client.js`:
  - Connected Devices section in `LanModeCard` with revoke actions.
  - Telemetry bar in `LanModeCard`.
  - Multi-interface selector pills in `QuickQrPopover`.
  - iOS 1-tap `.mobileconfig` and Android `.crt` download guides in Quick QR.
  - Full `en` canonical text + `zh` translations.
- [ ] Step 5: File Russian translation issue in `goodandready/dsh-russian-lang`.
- [ ] Step 6: Automated tests (unit, API, packaging, 0 Cyrillic check).
- [ ] Step 7: Update `docs/design/DESIGN.md`.
- [ ] Step 8: Test server verification on MiniPC (`192.168.1.123`).
