import dgram from 'node:dgram'
import http from 'node:http'
import os from 'node:os'
import fs from 'node:fs'
const SSDP_ADDR = '239.255.255.250', SSDP_PORT = 1900, NAT_PMP_PORT = 5351
const ST_LIST = ['WANIPConnection:1', 'WANPPPConnection:1'].map((x) => `urn:schemas-upnp-org:service:${x}`)
const tag = (k, v) => `<New${k}>${v}</New${k}>`
export function parseSsdpResponse(raw) {
const m = String(raw || '').match(/location:\s*(\S+)/i)
return { location: m ? m[1].trim() : null }
}
export function extractControlUrl(xml, baseUrl) {
const s = String(xml || '')
for (const st of ST_LIST) {
const i = s.indexOf(st)
if (i !== -1) {
const m = s.slice(i, i + 800).match(/<controlURL>(.*?)<\/controlURL>/i)
if (m && m[1]) {
try { return { controlUrl: new URL(m[1].trim(), baseUrl).href, serviceType: st } } catch (_) { /* invalid URL */ }
}
}
}
return null
}
export function soapPost(url, st, act, body, ms = 2500) {
return new Promise((res, rej) => {
try {
const u = new URL(url)
const xml = `<?xml version="1.0"?><s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><u:${act} xmlns:u="${st}">${body}</u:${act}></s:Body></s:Envelope>`
const req = http.request(u, {
method: 'POST', timeout: ms,
headers: { 'Content-Type': 'text/xml; charset="utf-8"', SOAPAction: `"${st}#${act}"`, 'Content-Length': Buffer.byteLength(xml) },
}, (r) => {
let d = ''; r.setEncoding('utf8')
r.on('data', (c) => { d += c })
r.on('end', () => r.statusCode < 300 ? res(d) : rej(new Error(`SOAP ${r.statusCode}`)))
})
req.on('error', rej)
req.on('timeout', () => { req.destroy(); rej(new Error('SOAP timeout')) })
req.write(xml); req.end()
} catch (e) { rej(e) }
})
}
export function getDefaultGatewayIp(fb = '127.0.0.1') {
try {
if (fs.existsSync('/proc/net/route')) {
for (const l of fs.readFileSync('/proc/net/route', 'utf8').split('\n')) {
const p = l.trim().split(/\s+/)
if (p[1] === '00000000' && p[2]?.length === 8) {
const h = p[2]
return [6, 4, 2, 0].map((i) => parseInt(h.slice(i, i + 2), 16)).join('.')
}
}
}
} catch (_) { /* ignore XML parse or socket error */ }
const m = String(fb || '').match(/^(\d+\.\d+\.\d+)\.\d+$/)
return m ? `${m[1]}.1` : '192.168.1.1'
}
export function getLocalLanIp() {
for (const list of Object.values(os.networkInterfaces())) {
for (const it of list || []) {
if (!it.internal && it.family === 'IPv4' && (it.address.startsWith('192.168.') || it.address.startsWith('10.') || /^172\.(1[6-9]|2\d|3[01])\./.test(it.address))) {
return it.address
}
}
}
return '127.0.0.1'
}
export function sendSsdpDiscovery(ms = 1500) {
return new Promise((resolve) => {
let s = null, t = null
const done = (loc) => { if (t) clearTimeout(t); if (s) { try { s.close() } catch (_) { /* best-effort socket cleanup */ } s = null }; resolve(loc) }
try {
s = dgram.createSocket({ type: 'udp4', reuseAddr: true })
s.on('error', () => done(null))
s.on('message', (msg) => { const p = parseSsdpResponse(msg); if (p.location) done(p.location) })
const m = Buffer.from(`M-SEARCH * HTTP/1.1\r\nHOST: ${SSDP_ADDR}:${SSDP_PORT}\r\nMAN: "ssdp:discover"\r\nMX: 2\r\nST: urn:schemas-upnp-org:device:InternetGatewayDevice:1\r\n\r\n`)
s.bind(0, () => s.send(m, 0, m.length, SSDP_PORT, SSDP_ADDR, (e) => { if (e) done(null) }))
t = setTimeout(() => done(null), ms)
} catch (_) { done(null) }
})
}
export class UpnpGatewayManager {
constructor({ port = 3080, externalPort = null, internalIp = null, enabled = false, leaseDuration = 3600, log = () => {} } = {}) {
this.port = port
this.externalPort = externalPort || port
this.internalIp = internalIp || getLocalLanIp()
this.enabled = Boolean(enabled)
this.leaseDuration = leaseDuration
this.log = log
this.status = { enabled: this.enabled, active: false, protocol: null, externalPort: null, externalIp: null, error: null }
this._controlUrl = null
this._serviceType = null
this._gwIp = null
this._timer = null
}
getStatus() { return { ...this.status } }
_set(proto, ext, ip, err) {
this.status = { enabled: true, active: !err, protocol: proto, externalPort: ext, externalIp: ip, error: err }
}
async start() {
if (!this.enabled) { this.status.active = false; return this.getStatus() }
try {
const loc = await sendSsdpDiscovery(1500)
if (loc) {
const xml = await new Promise((res, rej) => {
http.get(new URL(loc), { timeout: 2000 }, (r) => {
let d = ''; r.on('data', (c) => { d += c }); r.on('end', () => res(d))
}).on('error', rej)
})
const info = extractControlUrl(xml, loc)
if (info) {
this._controlUrl = info.controlUrl
this._serviceType = info.serviceType
const b = tag('RemoteHost', '') + tag('ExternalPort', this.externalPort) + tag('Protocol', 'TCP') + tag('InternalPort', this.port) + tag('InternalClient', this.internalIp) + tag('Enabled', 1) + tag('PortMappingDescription', 'dsh-lanmode') + tag('LeaseDuration', this.leaseDuration)
await soapPost(info.controlUrl, info.serviceType, 'AddPortMapping', b)
let extIp = null
try {
const ipXml = await soapPost(info.controlUrl, info.serviceType, 'GetExternalIPAddress', '')
const m = ipXml.match(/<NewExternalIPAddress>(.*?)<\/NewExternalIPAddress>/i)
if (m?.[1]) extIp = m[1].trim()
} catch (_) { /* ignore XML parse or socket error */ }
this._set('upnp', this.externalPort, extIp, null)
this._schedule()
this.log(`[dsh-lanmode] UPnP port ${this.externalPort} mapped to ${this.internalIp}:${this.port}`)
return this.getStatus()
}
}
} catch (err) { this.log(`[dsh-lanmode] UPnP failed: ${err.message}`) }
try {
this._gwIp = getDefaultGatewayIp(this.internalIp)
const res = await this._natPmp(this._gwIp, this.port, this.externalPort, this.leaseDuration)
if (res?.resultCode === 0) {
this._set('nat-pmp', res.externalPort, null, null)
this._schedule()
this.log(`[dsh-lanmode] NAT-PMP port ${res.externalPort} mapped`)
return this.getStatus()
}
} catch (err) { this.log(`[dsh-lanmode] NAT-PMP failed: ${err.message}`) }
this._set(null, null, null, 'No UPnP or NAT-PMP gateway answered')
return this.getStatus()
}
_schedule() {
if (this._timer) clearTimeout(this._timer)
this._timer = setTimeout(() => this.start().catch((e) => this.log(`[dsh-lanmode] renewal error: ${e.message}`)), Math.max(60, this.leaseDuration * 0.75) * 1000)
if (this._timer.unref) this._timer.unref()
}
async stop() {
if (this._timer) { clearTimeout(this._timer); this._timer = null }
if (!this.status.active) return
try {
if (this.status.protocol === 'upnp' && this._controlUrl) {
const b = tag('RemoteHost', '') + tag('ExternalPort', this.externalPort) + tag('Protocol', 'TCP')
await soapPost(this._controlUrl, this._serviceType, 'DeletePortMapping', b, 1500)
this.log(`[dsh-lanmode] UPnP port ${this.externalPort} released`)
} else if (this.status.protocol === 'nat-pmp' && this._gwIp) {
await this._natPmp(this._gwIp, this.port, this.externalPort, 0)
this.log(`[dsh-lanmode] NAT-PMP port ${this.externalPort} released`)
}
} catch (err) { this.log(`[dsh-lanmode] release failed: ${err.message}`) }
this.status.active = false
}
_natPmp(gw, intP, extP, ttl) {
return new Promise((resolve, reject) => {
const s = dgram.createSocket('udp4')
let t = null
const done = (err, val) => { if (t) clearTimeout(t); try { s.close() } catch (_) { /* best-effort socket cleanup */ }; err ? reject(err) : resolve(val) }
s.on('error', (e) => done(e))
s.on('message', (msg) => {
if (msg.length >= 16 && msg[0] === 0 && msg[1] === 130) {
done(null, { resultCode: msg.readUInt16BE(2), externalPort: msg.readUInt16BE(10) })
} else done(new Error('Invalid NAT-PMP response'))
})
const b = Buffer.alloc(12)
b[0] = 0; b[1] = 2; b.writeUInt16BE(intP, 4); b.writeUInt16BE(extP, 6); b.writeUInt32BE(ttl, 8)
s.send(b, 0, 12, NAT_PMP_PORT, gw, (e) => { if (e) done(e) })
t = setTimeout(() => done(new Error('NAT-PMP timeout')), 1500)
})
}
}