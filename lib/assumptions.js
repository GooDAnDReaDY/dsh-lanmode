import { tokenFrom } from './handoff.js'

/**
 * Register background verification of attachment points in Cordis context.
 */
export function registerAttachmentPointsVerifier(ctx, state, log = () => {}) {
  return ctx.effect(() => {
    let alive = true
    const webServer = ctx.webServer
    const port = webServer && webServer.port
    const fetchIndex = () => {
      let currentToken = ''
      try {
        const conn = ctx.get?.('connection') || ctx.connection
        if (conn && typeof conn.authenticatedUrl === 'function') {
          currentToken = tokenFrom(conn.authenticatedUrl('http://127.0.0.1:' + port))
        }
      } catch (err) {
        if (ctx?.logger && typeof ctx.logger.debug === 'function') {
          ctx.logger.debug(`[dsh-lanmode] connection token extraction deferred: ${err?.message || err}`)
        }
      }
      return fetch('http://127.0.0.1:' + port + '/' + (currentToken ? '?token=' + currentToken : ''))
        .then((answer) => answer.text().then((html) => ({ status: answer.status, html })))
    }

    const timer = setTimeout(() => {
      checkAssumptions({ webServer, fetchIndex })
        .then((results) => {
          if (!alive) return
          state.assumptions = results
          const line = summarize(results)
          if (results.every((item) => item.ok || item.unverifiable)) log(line)
          else (ctx?.logger || console).warn('[dsh-lanmode] ' + line)
        })
        .catch((failed) => log('attachment points check failed: ' + String(failed.message || failed)))
    }, 3000)

    return () => { alive = false; clearTimeout(timer) }
  }, 'dsh-lanmode: verify attachment points')
}

// Verification of mounting points and core integration assumptions.
//
// The plugin relies on specific DeepSeek Harness web server hooks:
// - webServer.tapIndex hook availability
// - webServer.port configuration
// - Index HTML script patch injection
// - Package exclusion for local deliverables

export const EXCLUDED_BUNDLE = '@deepseek-ai/dsh-client-ui-deliverables'

/** Single check result. */
function verdict(name, ok, detail, unverifiable = false) {
  return { name, ok, detail, unverifiable }
}

/**
 * Check host-side mounting points and assumptions.
 *
 * @param options {{webServer: object, fetchIndex: () => Promise<string>}}
 */
export async function checkAssumptions(options) {
  const results = []
  const webServer = options.webServer

  results.push(verdict(
    'index.html tap hook',
    Boolean(webServer && typeof webServer.tapIndex === 'function'),
    'webServer.tapIndex — hook used to inject client shims and assets',
  ))

  results.push(verdict(
    'harness port known',
    Boolean(webServer && webServer.port),
    'webServer.port — required to bind direct listener and probe upstream',
  ))

  let page = { status: 0, html: '' }
  try {
    page = await options.fetchIndex()
  } catch (unreachable) {
    results.push(verdict('page reachable', false, String(unreachable.message || unreachable)))
    return results
  }

  // Harness may require an authentication token (401, 403, 302, 303).
  // This is expected security behavior, not a plugin failure (#34, #164).
  if (page.status && page.status !== 200) {
    const isAuthChallenge = page.status === 401 || page.status === 403 || (page.status >= 300 && page.status < 400)
    results.push(verdict(
      'page content accessible',
      false,
      'Harness responded with HTTP ' + page.status + ' on loopback. '
        + 'Security challenge active; content check deferred until authenticated.',
      isAuthChallenge,
    ))
    return results
  }

  const html = page.html

  results.push(verdict(
    'patch injected into page',
    html.includes('data-dsh-lanmode'),
    'Plugin script patch presence in rendered index.html',
  ))

  results.push(verdict(
    'deliverables bundle excluded',
    html.includes(EXCLUDED_BUNDLE),
    'Bundle ' + EXCLUDED_BUNDLE + ' is excluded to preserve native local file handling',
  ))

  return results
}

/** Summarize assumption checks into a single log line. */
export function summarize(results) {
  const bad = results.filter((item) => !item.ok && !item.unverifiable)
  if (bad.length === 0) {
    const unverifiable = results.filter((item) => item.unverifiable)
    if (unverifiable.length > 0) {
      return 'mounting points ready: ' + (results.length - unverifiable.length) + ' of ' + results.length
        + ' (page inspection deferred: authentication token required)'
    }
    return 'mounting points ready: ' + results.length + ' of ' + results.length
  }
  return 'MOUNTING POINTS DRIFTED (' + bad.length + ' of ' + results.length + '): '
    + bad.map((item) => item.name).join('; ')
    + '. Plugin features may be degraded.'
}
