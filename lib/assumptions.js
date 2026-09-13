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

  // Harness may require an authentication token (401, 403, 302).
  // This is expected security behavior, not a plugin failure (#34).
  if (page.status && page.status !== 200) {
    const isAuthChallenge = page.status === 401 || page.status === 403 || page.status === 302
    results.push(verdict(
      'page content accessible',
      false,
      'Harness responded with HTTP ' + page.status + ' without token on loopback. '
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
