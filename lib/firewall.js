// Управление правилами брандмауэра ОС для прямого режима (#59, #60).
//
// Поддерживает:
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
 * Проверить и при необходимости открыть порт в брандмауэре хоста (#59, #60).
 * @param {number} port Номер порта
 * @returns {Promise<{ managed: boolean, open: boolean, platform: string, detail?: string }>}
 */
export async function ensurePortAllowed(port) {
  const platform = os.platform()
  const ruleName = 'DeepSeek-Harness-Web-' + port

  if (platform === 'win32') {
    try {
      const check = await run('netsh', ['advfirewall', 'firewall', 'show', 'rule', `name=${ruleName}`])
      if (!check.error && check.stdout.includes(ruleName)) {
        return { managed: true, open: true, platform: 'win32', detail: 'Правило уже существует' }
      }
      const add = await run('netsh', [
        'advfirewall', 'firewall', 'add', 'rule',
        `name=${ruleName}`, 'dir=in', 'action=allow', 'protocol=TCP', `localport=${port}`,
      ])
      if (add.error) {
        return { managed: false, open: false, platform: 'win32', detail: add.stderr || add.error.message }
      }
      return { managed: true, open: true, platform: 'win32', detail: 'Правило добавлено в Windows Defender Firewall' }
    } catch (e) {
      return { managed: false, open: false, platform: 'win32', detail: e.message }
    }
  }

  if (platform === 'linux') {
    try {
      const ufwCheck = await run('which', ['ufw'])
      if (!ufwCheck.error) {
        const ufwStatus = await run('ufw', ['status'])
        if (ufwStatus.stdout.includes('active')) {
          await run('ufw', ['allow', `${port}/tcp`])
          return { managed: true, open: true, platform: 'linux-ufw', detail: `ufw allow ${port}/tcp` }
        }
      }

      const fwdCheck = await run('which', ['firewall-cmd'])
      if (!fwdCheck.error) {
        const fwdState = await run('firewall-cmd', ['--state'])
        if (fwdState.stdout.includes('running')) {
          await run('firewall-cmd', ['--add-port=' + port + '/tcp'])
          return { managed: true, open: true, platform: 'linux-firewalld', detail: `firewall-cmd --add-port=${port}/tcp` }
        }
      }

      return { managed: false, open: true, platform: 'linux', detail: 'Фаервол не активен или неуправляемый' }
    } catch (e) {
      return { managed: false, open: false, platform: 'linux', detail: e.message }
    }
  }

  return { managed: false, open: true, platform, detail: 'Платформа не требует управления фаерволом' }
}
