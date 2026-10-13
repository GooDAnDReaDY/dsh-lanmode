// Certificate preparation helper for dsh-lanmode direct listener (Issue #455)
// Zero hardcoded Cyrillic characters.

import { certificateHosts, ensureCertificate, readCertificate } from './tls.js'

export async function prepareListenerTls(unwrapped, state, dir, say) {
  if (unwrapped.tls === 'files') {
    try {
      const tls = readCertificate(unwrapped.tlsCert, unwrapped.tlsKey)
      state.tls = { enabled: true, source: 'custom certificate', fingerprint: tls.fingerprint }
      state.caCertPath = unwrapped.tlsCert || null
      return { tls, ok: true }
    } catch (unreadable) {
      say('certificate read error (' + String(unreadable.message || unreadable) + ') — refusing to open unencrypted bridge in tls:files mode')
      state.tls = { enabled: false, error: String(unreadable.message || unreadable) }
      state.listener = null
      return { tls: null, ok: false }
    }
  }

  if (unwrapped.tls === 'self-signed') {
    if (!dir) {
      say('no directory to store certificates: specify tlsDir — starting without TLS')
      return { tls: null, ok: true }
    }
    try {
      const mdnsHost = state.mdnsName || 'dsh.local'
      const certHosts = [...new Set([...(unwrapped.tlsHosts ?? []), ...certificateHosts(mdnsHost)])]
      const made = await ensureCertificate({ dir, hosts: certHosts, log: say })
      state.tls = { enabled: true, source: 'Root CA + server cert', fingerprint: made.fingerprint }
      state.caAvailable = Boolean(made.caCert)
      state.caCertPath = made.caCertPath || null
      say((made.issued ? 'issued' : 'loaded') + ' certificate for ' + certHosts.length + ' names (including ' + mdnsHost + '), fingerprint ' + made.fingerprint)
      if (made.caCert) {
        say('Root CA available for download at: /dsh-lanmode/ca.crt')
      }
      return { tls: made, ok: true }
    } catch (failed) {
      say('certificate generation failed (' + String(failed.message || failed) + '). Starting without TLS, microphone will be disabled')
      return { tls: null, ok: true }
    }
  }

  return { tls: null, ok: true }
}
