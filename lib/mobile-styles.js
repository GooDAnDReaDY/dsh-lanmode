// Мобильные адаптивные стили для DeepSeek Harness Web UI.
//
// Решают проблемы мобильного использования:
// 1. #36: Anti-Zoom на iOS (font-size >= 16px на полях ввода)
// 2. #37: Safe-Area insets (Dynamic Island / Home Indicator на iPhone)
// 3. #38: Минимальные цели нажатия 44x44px на touch-устройствах
// 4. #45: Подавление залипающих hover-тултипов на сенсорных экранах

export function mobileStyles() {
  return `<style id="dsh-lanmode-mobile-styles">
@media screen and (max-width: 1024px) {
  /* #36: Anti-zoom на iOS: шрифт не менее 16px предотвращает автозум в Safari */
  input, textarea, select, [contenteditable="true"] {
    font-size: 16px !important;
  }
}

/* #37: Safe-Area insets для современных смартфонов с жестовой полоской */
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

/* #38: Минимальные цели нажатия 44x44px на touch-устройствах */
@media (pointer: coarse) {
  button, [role="button"], a.nav-item, [class*="sidebar"] button {
    min-height: 44px;
    min-width: 44px;
  }
}

/* #45: Подавление залипающих ховер-тултипов на сенсорных экранах */
@media (hover: none) and (pointer: coarse) {
  [class*="tooltip"], [role="tooltip"], [data-tooltip] {
    display: none !important;
    pointer-events: none !important;
  }
}
</style>`
}
