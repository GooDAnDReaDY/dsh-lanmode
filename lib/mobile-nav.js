// Мобильная навигация, жесты, FAB и Enter-handling (Блок 2)
// #39: Opt-in Enter = New Line
// #41: Авто-скрытие тяжелых десктопных панелей
// #42: Свайпы для сайдбара
// #43: Авто-схлопывание сайдбара при выборе чата
// #44: Floating action button (FAB) для сайдбара
// #72: Проверка force desktop mode

export function mobileNavSource() {
  return `(function () {
  if (typeof window === 'undefined') return
  try {
    if (sessionStorage.getItem('dsh_force_desktop') === '1') return
  } catch (_) {}

  var isMobile = ('ontouchstart' in window) || (Boolean(window.navigator) && window.navigator.maxTouchPoints > 0) || window.innerWidth < 1024
  if (!isMobile) return

  var options = window.__DSH_LANMODE__ || {}
  var enterSends = options.mobileEnterSends === true

  // #39: Enter = Новая строка (если не включен mobileEnterSends)
  if (!enterSends) {
    window.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
        var target = e.target
        if (target && (target.tagName === 'TEXTAREA' || target.isContentEditable)) {
          e.stopPropagation()
        }
      }
    }, true)
  }

  // #42: Свайп жесты для сайдбара
  var startX = 0, startY = 0
  window.addEventListener('touchstart', function (e) {
    if (e.touches && e.touches.length === 1) {
      startX = e.touches[0].clientX
      startY = e.touches[0].clientY
    }
  }, { passive: true })

  function toggleSidebar() {
    var btn = document.querySelector('button[aria-label*="sidebar" i], button[title*="sidebar" i], [class*="toggleSidebar"]')
    if (btn) btn.click()
  }

  window.addEventListener('touchend', function (e) {
    if (!e.changedTouches || e.changedTouches.length !== 1) return
    var diffX = e.changedTouches[0].clientX - startX
    var diffY = e.changedTouches[0].clientY - startY
    if (Math.abs(diffX) > 60 && Math.abs(diffX) > Math.abs(diffY) * 1.5) {
      if (startX < 50 && diffX > 60) {
        toggleSidebar()
      } else if (diffX < -60) {
        toggleSidebar()
      }
    }
  }, { passive: true })

  // #43: Авто-схлопывание сайдбара при клике по сессии
  document.addEventListener('click', function (e) {
    if (window.innerWidth >= 1024) return
    var target = e.target
    var sessionItem = target && target.closest && target.closest('[class*="sessionItem"], [class*="conversationItem"], [role="treeitem"]')
    if (sessionItem) {
      setTimeout(function () {
        var sidebar = document.querySelector('[class*="sidebar"]:not([class*="collapsed"])')
        if (sidebar) toggleSidebar()
      }, 150)
    }
  }, true)

  // #44: Плавающая кнопка FAB
  function ensureFab() {
    if (document.getElementById('dsh-mobile-fab')) return
    if (window.innerWidth >= 1024) return
    var fab = document.createElement('button')
    fab.id = 'dsh-mobile-fab'
    fab.type = 'button'
    fab.setAttribute('aria-label', 'Открыть меню')
    fab.innerHTML = '<svg width=\"22\" height=\"22\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\"><path d=\"M4 6h16M4 12h16M4 18h16\"/></svg>'
    fab.style.cssText = 'position:fixed;bottom:85px;left:16px;z-index:9999;width:44px;height:44px;border-radius:22px;background:var(--dsw-alias-label-primary, #6366f1);color:var(--dsw-alias-bg-layer-1, #fff);border:none;box-shadow:0 4px 12px rgba(0,0,0,0.25);display:flex;align-items:center;justify-content:center;cursor:pointer;opacity:0.85;transition:opacity .15s;'
    fab.onclick = function () { toggleSidebar() }
    document.body.appendChild(fab)
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ensureFab)
  } else {
    ensureFab()
  }
})()`
}
