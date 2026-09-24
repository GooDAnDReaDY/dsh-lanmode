# Mobile Design Contract

Checked 2026-09-24 against `lib/mobile-styles.js`, `lib/mobile-nav.js`, and `docs/design/DESIGN.md`.

## Purpose

Keep the DeepSeek Harness Web UI usable on a phone when `@goodandready/dsh-lanmode` is installed. The plugin adapts the host UI; it does not replace the host design system.

## Touch Targets

- Minimum hit area: **44x44 CSS pixels** on `(pointer: coarse)`.
- Preferred hit area: **48x48** for primary actions (FAB, copy, save).
- Do not shrink icon-only controls below 44px to fit a dense desktop layout.

## Contrast

- Body text and labels must keep at least **4.5:1** contrast against their background.
- Prefer host tokens `--dsw-alias-label-primary`, `--dsw-alias-label-secondary`, and `--dsw-alias-bg-layer-*`.
- Decorative borders may be softer; interactive text and buttons may not.

## Layout

- Safe-area insets are required on notched devices (`env(safe-area-inset-*)`).
- Composer seating uses bottom safe-area padding.
- Secondary desktop columns (`detailsColumn` / `rightPanel`) stay hidden below 768px.
- Sticky hover tooltips stay suppressed on `(hover: none) and (pointer: coarse)`.

## Motion

- Functional motion only: FAB opacity, card open/close.
- No decorative gradient animation loops and no non-interactive parallax.

## Selectors

- Prefer semantic CSS Module suffixes such as `[class$="_composerSeat"]`.
- Do not bind styles to a full hashed class name that changes on core rebuilds.

## Do

- Keep one-handed reach in mind for the sidebar FAB.
- Preserve keyboard use: never block Enter globally.
- Keep Russian out of runtime strings; user-facing copy is English with Chinese in `lib/client-parts/02-i18n.js`.

## Don't

- Do not patch `HTMLElement.prototype.focus`.
- Do not hide third-party plugin surfaces with blanket `!important` rules unless the user asked for that surface.
- Do not invent a second visual brand on top of the host theme tokens.
