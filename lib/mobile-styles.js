// Responsive mobile styles for DeepSeek Harness Web UI.
//
// Resolves mobile usability challenges:
// 1. #36: Anti-Zoom on iOS (font-size >= 16px on form inputs)
// 2. #37: Safe-Area insets (Dynamic Island / Home Indicator on iPhone)
// 3. #38: Minimum touch targets 44x44px on touch devices
// 4. #45: Sticky hover tooltip suppression on touchscreens

export function mobileStyles() {
  return `<style id="dsh-lanmode-mobile-styles">
@media screen and (max-width: 1024px) {
  /* #36: Anti-zoom on iOS: font-size >= 16px prevents auto-zooming in Safari */
  input, textarea, select, [contenteditable="true"] {
    font-size: 16px !important;
  }
}

/* #37: Safe-Area insets for modern smartphones with home indicator bar */
@supports (padding: max(0px)) {
  body {
    padding-top: env(safe-area-inset-top, 0px);
    padding-left: env(safe-area-inset-left, 0px);
    padding-right: env(safe-area-inset-right, 0px);
  }
  [class*="composerSeat"], [class*="composer_"], [class*="inputBar_"], form[class*="composer"] {
    padding-bottom: max(12px, env(safe-area-inset-bottom, 12px)) !important;
  }
}

/* #38: Minimum touch target size 44x44px on touch devices */
@media (pointer: coarse) {
  button, [role="button"], a.nav-item, [class*="sidebar"] button {
    min-height: 44px;
    min-width: 44px;
  }
}

/* #41: Hide secondary desktop columns on screens < 768px */
@media screen and (max-width: 768px) {
  [class*="detailsColumn"], [class*="rightPanel"] {
    display: none;
  }
}

/* #45: Suppress sticky hover tooltips on touch devices */
@media (hover: none) and (pointer: coarse) {
  [class*="tooltip"], [role="tooltip"], [data-tooltip] {
    display: none !important;
    pointer-events: none !important;
  }
}
</style>`
}
