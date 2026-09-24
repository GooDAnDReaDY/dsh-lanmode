# Draft triage #168-#218, 2026-09-24

Checked on branch `fix/dsh-lanmode-batch-3`. Duplicate label ids were left as they are. Only the lower canonical ids were applied: priority/low 1261, status/needs-info 1263, type/feature 1250, type/docs 1254, type/tech-debt 1252, type/security 1256.

## Closed as duplicates

| Issue | Already done in | Evidence |
| --- | --- | --- |
| #170 swipe | #42 | `lib/mobile-nav.js` opens from the left edge and closes on a left swipe |
| #172 iOS 16px | #36 | `lib/mobile-styles.js` sets `font-size: 16px` on touch inputs |
| #179 firewall | #59, #60 | `lib/index.js` calls `ensurePortAllowed(port)` when the listener starts |
| #193 mDNS subtypes | #130 | `lib/mdns.js` publishes `_http`, `_https`, and `_dsh` |

## Left open

Every other issue in #168-#218 now has title prefix `L:`, exactly one `priority/low`, one type, and `status/needs-info`.

Types: #188 docs; #190 and #194 tech-debt; #191, #206, and #213 security; the rest feature.

They stay open because each one is an imported idea without acceptance criteria for this plugin. #169 is not a duplicate of the existing FAB: the current button does not remember a dragged position.

#232-#249 are outside this triage.
