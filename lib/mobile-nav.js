// Mobile navigation, sidebar swipe gestures and floating action button (FAB).
// #42: Sidebar swipe gestures
// #43: Auto-collapse sidebar on session selection
// #44 / #169: Floating action button (FAB) with remembered position
// #72: Support force desktop mode
// #173: Suppress keyboard on programmatic focus after session switch
// #100, #112: Exclude aggressive Enter key intercept; detect touch devices accurately via pointer: coarse
// #214: MutationObserver late-frame guards for async chat mounts

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

  // #173: Session switches must not raise the soft keyboard by themselves.
  // Record real user activation, then blur a focus that arrives without one.
  // Do not patch the focus prototype (#40).
  var lastUserGestureAt = 0
  function markUserGesture() { lastUserGestureAt = Date.now() }
  window.addEventListener('touchstart', markUserGesture, { passive: true, capture: true })
  window.addEventListener('pointerdown', markUserGesture, { passive: true, capture: true })
  window.addEventListener('mousedown', markUserGesture, { passive: true, capture: true })
  document.addEventListener('focusin', function (e) {
    var el = e.target
    if (!el) return
    var tag = String(el.tagName || '').toUpperCase()
    var editable = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable
    if (!editable) return
    if (Date.now() - lastUserGestureAt <= 700) return
    try { el.blur() } catch (err) { /* bestEffort */ void err }
  }, true)

  // #42: Swipe gestures for sidebar navigation
  var startX = 0, startY = 0
  window.addEventListener('touchstart', function (e) {
    if (e.touches && e.touches.length === 1) {
      startX = e.touches[0].clientX
      startY = e.touches[0].clientY
    }
  }, { passive: true })

  function toggleSidebar() {
    var btn = document.querySelector('button[aria-label*="sidebar" i], button[title*="sidebar" i], [class$="_toggleSidebar"], [class*="_toggleSidebar"]')
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
    var sessionItem = target && target.closest && target.closest('[class$="_sessionItem"], [class*="_sessionItem"], [class$="_conversationItem"], [class*="_conversationItem"], [role="treeitem"]')
    if (sessionItem) {
      setTimeout(function () {
        var sidebar = document.querySelector('[class*="_sidebar"]:not([class*="_collapsed"]):not([class$="_collapsed"])')
        if (sidebar) toggleSidebar()
      }, 150)
    }
  }, true)

  // #171: a long press on a session row opens the same menu as the ellipsis.
  var pressTimer = 0
  var pressX = 0
  var pressY = 0
  var pressRow = null
  var pressFired = false
  function sessionRowFrom(target) {
    if (!target || !target.closest) return null
    return target.closest('[class$="_sessionRow"], [class*="_sessionRow"]')
  }
  function clearPress() {
    if (pressTimer) clearTimeout(pressTimer)
    pressTimer = 0
    pressRow = null
  }
  document.addEventListener('touchstart', function (e) {
    pressFired = false
    if (!e.touches || e.touches.length !== 1) return
    var row = sessionRowFrom(e.target)
    if (!row) return
    pressX = e.touches[0].clientX
    pressY = e.touches[0].clientY
    pressRow = row
    pressTimer = setTimeout(function () {
      pressTimer = 0
      var button = pressRow && pressRow.querySelector('[class*="_rowActions"] button')
      if (!button) return
      pressFired = true
      button.click()
    }, 500)
  }, { passive: true })
  document.addEventListener('touchmove', function (e) {
    if (!pressTimer || !e.touches || !e.touches.length) return
    var dx = e.touches[0].clientX - pressX
    var dy = e.touches[0].clientY - pressY
    if ((dx * dx) + (dy * dy) > 100) clearPress()
  }, { passive: true })
  document.addEventListener('touchend', function (e) {
    if (pressFired && e.cancelable) e.preventDefault()
    clearPress()
  })
  document.addEventListener('touchcancel', function () { clearPress() })

  // #44 / #169: Draggable FAB; position remembered; hidden while sidebar open
  var FAB_POS_KEY = 'dsh_lanmode_fab_pos'
  var fabDragMoved = false

  function readFabPos() {
    try {
      var raw = localStorage.getItem(FAB_POS_KEY)
      if (!raw) return null
      var parsed = JSON.parse(raw)
      if (typeof parsed.left !== 'number' || typeof parsed.top !== 'number') return null
      return parsed
    } catch (err) { return null }
  }

  function writeFabPos(left, top) {
    try {
      localStorage.setItem(FAB_POS_KEY, JSON.stringify({ left: left, top: top }))
    } catch (err) { /* bestEffort */ void err }
  }

  function isPortraitMobile() {
    return window.innerWidth < 1024 && window.innerHeight >= window.innerWidth
  }

  function sidebarLooksOpen() {
    if (!document || typeof document.querySelector !== 'function') return false
    var sidebar = document.querySelector('[class*="_sidebar"]:not([class*="_collapsed"]):not([class$="_collapsed"])')
    return Boolean(sidebar)
  }

  function clampFab(left, top, size) {
    var maxLeft = Math.max(8, window.innerWidth - size - 8)
    var maxTop = Math.max(8, window.innerHeight - size - 8)
    return {
      left: Math.min(maxLeft, Math.max(8, left)),
      top: Math.min(maxTop, Math.max(8, top)),
    }
  }

  function applyFabVisibility(fab) {
    fab.style.display = (isPortraitMobile() && !sidebarLooksOpen()) ? 'flex' : 'none'
  }

  function ensureFab() {
    var fab = document.getElementById('dsh-mobile-fab')
    if (!fab) {
      fab = document.createElement('button')
      fab.id = 'dsh-mobile-fab'
      fab.type = 'button'
      fab.setAttribute('aria-label', 'Open menu')
      fab.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 6h16M4 12h16M4 18h16"/></svg>'
      fab.style.cssText = 'position:fixed;z-index:9999;width:44px;height:44px;border-radius:22px;background:var(--dsw-alias-state-brand-primary, var(--dsw-alias-label-primary, #6366f1));color:var(--dsw-alias-label-on-brand, var(--dsw-alias-bg-layer-1, #fff));border:none;box-shadow:var(--dsw-alias-shadow-l2, 0 4px 12px rgba(0,0,0,0.25));align-items:center;justify-content:center;cursor:pointer;opacity:0.85;touch-action:none;'
      var saved = readFabPos()
      var placed = clampFab(saved ? saved.left : 16, saved ? saved.top : (window.innerHeight - 129), 44)
      fab.style.left = placed.left + 'px'
      fab.style.top = placed.top + 'px'
      fab.style.right = 'auto'
      fab.style.bottom = 'auto'

      var drag = null
      if (typeof fab.addEventListener !== 'function') {
        fab.onclick = function () { toggleSidebar() }
        document.body.appendChild(fab)
        applyFabVisibility(fab)
        return
      }
      fab.addEventListener('pointerdown', function (e) {
        if (e.button != null && e.button !== 0) return
        fabDragMoved = false
        drag = { id: e.pointerId, startX: e.clientX, startY: e.clientY, origLeft: parseFloat(fab.style.left) || 0, origTop: parseFloat(fab.style.top) || 0 }
        try { fab.setPointerCapture(e.pointerId) } catch (err) { /* bestEffort */ void err }
      })
      fab.addEventListener('pointermove', function (e) {
        if (!drag || e.pointerId !== drag.id) return
        var dx = e.clientX - drag.startX
        var dy = e.clientY - drag.startY
        if (Math.abs(dx) + Math.abs(dy) > 6) fabDragMoved = true
        var next = clampFab(drag.origLeft + dx, drag.origTop + dy, 44)
        fab.style.left = next.left + 'px'
        fab.style.top = next.top + 'px'
      })
      function endDrag(e) {
        if (!drag || e.pointerId !== drag.id) return
        var next = clampFab(parseFloat(fab.style.left) || 0, parseFloat(fab.style.top) || 0, 44)
        fab.style.left = next.left + 'px'
        fab.style.top = next.top + 'px'
        writeFabPos(next.left, next.top)
        drag = null
      }
      fab.addEventListener('pointerup', endDrag)
      fab.addEventListener('pointercancel', endDrag)
      fab.addEventListener('click', function (e) {
        if (fabDragMoved) {
          e.preventDefault()
          fabDragMoved = false
          return
        }
        toggleSidebar()
      })
      document.body.appendChild(fab)
    }
    applyFabVisibility(fab)
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ensureFab)
  } else {
    ensureFab()
  }
  window.addEventListener('resize', ensureFab)
  window.addEventListener('orientationchange', ensureFab)
  setInterval(function () {
    var fab = document.getElementById('dsh-mobile-fab')
    if (fab) applyFabVisibility(fab)
  }, 800)

  // #175: close the details pane when a heavy desktop plugin mounts
  function hideHeavyDesktop(node) {
    if (!node || !node.querySelectorAll) return
    var heavy = node.querySelectorAll('[data-dsh-plugin*="terminal"], [data-dsh-plugin*="ssh"], [data-dsh-plugin*="git-graph"], [data-dsh-plugin*="skill-tree"]')
    if (!heavy.length && node.matches && node.matches('[data-dsh-plugin*="terminal"], [data-dsh-plugin*="ssh"], [data-dsh-plugin*="git-graph"], [data-dsh-plugin*="skill-tree"]')) {
      heavy = [node]
    }
    if (!heavy || !heavy.length) return
    try {
      var layout = window.__DSH_LANMODE_LAYOUT
      if (layout && typeof layout.closeDetails === 'function') layout.closeDetails()
    } catch (err) { /* bestEffort */ void err }
  }

  // #214: Late frame injection — re-apply mobile adapters when DSH mounts frames later
  var APP_FRAME_SELECTOR = '[class*="_app"], [class*="_App"], [class*="_frame"], [class*="_Frame"], main, #root, #app'
  function markNewFrames(rootNode) {
    if (!rootNode) return
    var nodes = []
    if (rootNode.matches && rootNode.matches(APP_FRAME_SELECTOR)) nodes.push(rootNode)
    if (rootNode.querySelectorAll) {
      var found = rootNode.querySelectorAll(APP_FRAME_SELECTOR)
      for (var i = 0; i < found.length; i++) nodes.push(found[i])
    }
    for (var j = 0; j < nodes.length; j++) {
      var node = nodes[j]
      if (!node || !node.getAttribute) continue
      if (node.getAttribute('data-dsh-mobile-ready') === '1') continue
      try { node.setAttribute('data-dsh-mobile-ready', '1') } catch (err) { /* bestEffort */ void err }
    }
    ensureFab()
  }
  if (typeof MutationObserver === 'function' && document.documentElement) {
    var lateFrameObserver = new MutationObserver(function (mutations) {
      for (var i = 0; i < mutations.length; i++) {
        var m = mutations[i]
        if (!m.addedNodes) continue
        for (var j = 0; j < m.addedNodes.length; j++) {
          var n = m.addedNodes[j]
          if (n && n.nodeType === 1) { markNewFrames(n); hideHeavyDesktop(n) }
        }
      }
    })
    lateFrameObserver.observe(document.documentElement, { childList: true, subtree: true })
    markNewFrames(document)
  }
})()`
}
