import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { DeviceRegistry, getDshHome } from '../lib/devices.js'

test('Issue #330: DeviceRegistry and getDshHome respect DSH_HOME and do not write to live ~/.dsh', () => {
  const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-leak-test-'))
  const origDshHome = process.env.DSH_HOME
  try {
    process.env.DSH_HOME = testDir
    assert.equal(getDshHome(), testDir)

    const reg = new DeviceRegistry()
    assert.equal(reg.filePath, path.join(testDir, 'dsh-lanmode-devices.json'))

    reg.touch('test-device-leak-check', {
      headers: { 'user-agent': 'Mozilla/5.0 Test' },
      socket: { remoteAddress: '10.0.0.99' },
    })
    reg.flush()

    assert.ok(fs.existsSync(path.join(testDir, 'dsh-lanmode-devices.json')), 'Saved into DSH_HOME')

    // Verify real ~/.dsh did NOT receive test-device-leak-check
    const realDevicesPath = path.join(os.homedir(), '.dsh', 'dsh-lanmode-devices.json')
    if (fs.existsSync(realDevicesPath)) {
      const realContent = fs.readFileSync(realDevicesPath, 'utf8')
      assert.ok(!realContent.includes('test-device-leak-check'), 'Real ~/.dsh must not contain test devices')
    }
  } finally {
    if (origDshHome !== undefined) {
      process.env.DSH_HOME = origDshHome
    } else {
      delete process.env.DSH_HOME
    }
    fs.rmSync(testDir, { recursive: true, force: true })
  }
})
