// Operating system firewall management for direct mode.
//
// Supports:
// - Windows Defender Firewall (netsh advfirewall)
// - Linux ufw
// - Linux firewalld

import { execFile } from 'node:child_process'
import os from 'node:os'

function run(cmd, args) {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout: 5000 }, (error, stdout, stderr) => {
      resolve({ error, stdout: String(stdout || ''), stderr: String(stderr || '') })
    })
  })
}

/**
 * Verify and optionally open port in host OS firewall.
 * @param {number} port Port number
 * @returns {Promise<{ managed: boolean, open: boolean, platform: string, detail?: string }>}
 */
export async function ensurePortAllowed(port) {
  const platform = os.platform()
  const ruleName = 'DeepSeek-Harness-Web-' + port

  if (platform === 'win32') {
    try {
      const check = await run('netsh', ['advfirewall', 'firewall', 'show', 'rule', `name=${ruleName}`])
      if (!check.error && check.stdout.includes(ruleName)) {
        return { managed: true, open: true, platform: 'win32', detail: 'Firewall rule already exists' }
      }
      const add = await run('netsh', [
        'advfirewall', 'firewall', 'add', 'rule',
        `name=${ruleName}`, 'dir=in', 'action=allow', 'protocol=TCP', `localport=${port}`,
      ])
      if (add.error) {
        return { managed: false, open: false, platform: 'win32', detail: 'Administrator privileges required to add firewall rule' }
      }
      return { managed: true, open: true, platform: 'win32', detail: 'Firewall rule added to Windows Defender Firewall' }
    } catch (e) {
      return { managed: false, open: false, platform: 'win32', detail: e.message }
    }
  }

  if (platform === 'linux') {
    try {
      const ufwCheck = await run('which', ['ufw'])
      if (!ufwCheck.error && ufwCheck.stdout.trim()) {
        const ufwStatus = await run('ufw', ['status'])
        if (!ufwStatus.error && ufwStatus.stdout.includes('active')) {
          const res = await run('ufw', ['allow', `${port}/tcp`])
          if (res.error) {
            return { managed: false, open: false, platform: 'linux-ufw', detail: 'Root / sudo privileges required for ufw allow' }
          }
          return { managed: true, open: true, platform: 'linux-ufw', detail: `ufw allow ${port}/tcp` }
        }
      }

      const fwdCheck = await run('which', ['firewall-cmd'])
      if (!fwdCheck.error && fwdCheck.stdout.trim()) {
        const fwdState = await run('firewall-cmd', ['--state'])
        if (!fwdState.error && fwdState.stdout.includes('running')) {
          const res = await run('firewall-cmd', ['--add-port=' + port + '/tcp'])
          if (res.error) {
            return { managed: false, open: false, platform: 'linux-firewalld', detail: 'Administrator privileges required for firewall-cmd' }
          }
          return { managed: true, open: true, platform: 'linux-firewalld', detail: `firewall-cmd --add-port=${port}/tcp` }
        }
      }

      return { managed: false, open: true, platform: 'linux', detail: 'Firewall inactive or unmanaged' }
    } catch (e) {
      return { managed: false, open: false, platform: 'linux', detail: e.message }
    }
  }

  return { managed: false, open: true, platform, detail: 'Platform does not require firewall rule configuration' }
}
