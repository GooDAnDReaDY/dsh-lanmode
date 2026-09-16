// Mobile navigation, sidebar swipe gestures and floating action button (FAB).
// #42: Sidebar swipe gestures
// #43: Auto-collapse sidebar on session selection
// #44: Floating action button (FAB) for sidebar
// #72: Support force desktop mode
// #100, #112: Exclude aggressive Enter key intercept; detect touch devices accurately via pointer: coarse

export function mobileNavSource() {
  return `(function () {
  if (typeof window === 'undefined') return
  try {
    if (sessionStorage.getItem('dsh_force_desktop') === '1') return
  } catch (err) { /* bestEffort */ void err }

  // #112: Precise coarse-pointer detection to prevent false positives on touch-enabled laptops/desktops
  var hasCoarsePointer = Boolean(window.matchMedia && window.matchMedia('(pointer: coarse)').matches)
  var hasTouch = ('ontouchstart' in window) || (Boolean(window.navigator) && window.navigator.maxTouchPoints > 0)
  var isNarrowScreen = typeof window.innerWidth === 'number' && window.innerWidth < 1024

  // Mobile behaviors (swipes, floating FAB) activate only on narrow touch devices
  var isTouchMobile = isNarrowScreen && (hasCoarsePointer || hasTouch)
  if (!isTouchMobile) return

  // #42: Swipe gestures for sidebar navigation
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

  // #43: Auto-collapse sidebar when clicking a conversation session
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

  // #44: Floating action button (FAB) for sidebar toggle
  function ensureFab() {
    if (document.getElementById('dsh-mobile-fab')) return
    if (window.innerWidth >= 1024) return
    var fab = document.createElement('button')
    fab.id = 'dsh-mobile-fab'
    fab.type = 'button'
    fab.setAttribute('aria-label', 'Open menu')
    fab.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 6h16M4 12h16M4 18h16"/></svg>'
    fab.style.cssText = 'position:fixed;bottom:85px;left:16px;z-index:9999;width:44px;height:44px;border-radius:22px;background:var(--dsw-alias-state-brand-primary, var(--dsw-alias-label-primary, #6366f1));color:var(--dsw-alias-label-on-brand, var(--dsw-alias-bg-layer-1, #fff));border:none;box-shadow:var(--dsw-alias-shadow-l2, 0 4px 12px rgba(0,0,0,0.25));display:flex;align-items:center;justify-content:center;cursor:pointer;opacity:0.85;transition:opacity .15s;'
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
