// Responsive mobile styles for DeepSeek Harness Web UI.
//
// Resolves mobile usability challenges:
// 1. #36: Anti-Zoom on iOS (font-size >= 16px on form inputs)
// 2. #37: Safe-Area insets (Dynamic Island / Home Indicator on iPhone)
// 3. #38: Minimum touch targets 44x44px on touch devices
// 4. #45: Sticky hover tooltip suppression on touchscreens
// 5. #168: CSS Module selectors use stable semantic suffixes
// 6. #204: Keep fullscreen right-panel close control below the mobile header

export function mobileStyles() {
  return `<style id="dsh-lanmode-mobile-styles" data-dsh-plugin="dsh-lanmode">
:root {
  --dsh-mobile-header-h: calc(56px + env(safe-area-inset-top, 0px));
}
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
  [class$="_composerSeat"], [class*="_composer_"], [class*="_inputBar_"], form[class*="_composer"] {
    padding-bottom: max(12px, env(safe-area-inset-bottom, 12px)) !important;
  }
}

/* #38: Minimum touch target size 44x44px on touch devices */
@media (pointer: coarse) {
  button, [role="button"], a.nav-item, [class*="_sidebar"] button, [class$="_sidebar"] button {
    min-height: 44px;
    min-width: 44px;
  }
}

/* #41: Hide secondary desktop columns on screens < 768px */
@media screen and (max-width: 768px) {
  [class$="_detailsColumn"], [class$="_rightPanel"], [class*="_detailsColumn"], [class*="_rightPanel"] {
    display: none;
  }
}

/* #45: Suppress sticky hover tooltips on touch devices */
@media (hover: none) and (pointer: coarse) {
  [class$="_tooltip"], [class*="_tooltip"], [role="tooltip"], [data-tooltip] {
    display: none !important;
    pointer-events: none !important;
  }
}

/* #203: DeepSeek App style compact mobile header with glassmorphism blur and smooth touch feedback */
@media screen and (max-width: 1024px) {
  :root {
    --dsh-mobile-header-h: calc(48px + env(safe-area-inset-top, 0px));
  }
  [class$="_headerBar"], [class*="_headerBar_"], [class$="_topBar"], [class*="_topBar_"], [class$="_navigationHeader"], header[class*="_header"], [class$="_navbar"] {
    min-height: var(--dsh-mobile-header-h) !important;
    max-height: var(--dsh-mobile-header-h) !important;
    padding-top: env(safe-area-inset-top, 0px) !important;
    background: var(--dsw-alias-bg-floating, rgba(255, 255, 255, 0.85)) !important;
    backdrop-filter: blur(16px) saturate(180%) !important;
    -webkit-backdrop-filter: blur(16px) saturate(180%) !important;
    border-bottom: 1px solid var(--dsw-alias-border-subtle, rgba(0, 0, 0, 0.08)) !important;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04) !important;
    box-sizing: border-box !important;
  }
  [class$="_headerBar"] [class$="_title"], [class*="_headerTitle"], [class$="_headerTitle"] {
    font-size: 15px !important;
    font-weight: 600 !important;
    letter-spacing: -0.01em !important;
    text-align: center !important;
  }
  [class$="_headerBar"] button, [class$="_topBar"] button, header[class*="_header"] button {
    border-radius: 8px !important;
    transition: transform 0.1s ease, opacity 0.1s ease !important;
  }
  [class$="_headerBar"] button:active, [class$="_topBar"] button:active, header[class*="_header"] button:active {
    transform: scale(0.95) !important;
    opacity: 0.85 !important;
  }
}

/* #204: Fullscreen right panel must clear the mobile header */
@media screen and (max-width: 1024px) {
  [data-sidebar-right-panel="fullscreen"],
  [data-sidebar-right-panel='fullscreen'] {
    top: var(--dsh-mobile-header-h) !important;
    height: calc(100dvh - var(--dsh-mobile-header-h)) !important;
    max-height: calc(100dvh - var(--dsh-mobile-header-h)) !important;
  }
}

/* #174: model and effort menus sit on the bottom edge of a phone */
@media screen and (max-width: 1024px) {
  [class$="_root"]:has([class$="_triggerEffort"]) [class$="_trigger"] {
    min-height: 44px;
  }
  [class$="_root"]:has([class$="_triggerEffort"]) [class$="_menu"] {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    top: auto;
    width: auto;
    max-width: none;
    max-height: min(70vh, 520px);
    border-radius: 16px 16px 0 0;
    z-index: 40;
    padding-bottom: env(safe-area-inset-bottom);
  }
}
</style>`
}
