// Configuration schema definition for dsh-lanmode using Schemastery.
// Zero hardcoded Cyrillic characters.

import z from '@deepseek-ai/schemastery'

export const Config = z.object({
  mode: z
    .string()
    .description('How the browser reaches the harness. '
      + '"proxy": something in front of it already listens on the network (nginx and friends) — '
      + 'the plugin only repairs the page. '
      + '"direct": the plugin also opens a listener of its own on the network and forwards to the '
      + 'harness, so nothing else is needed. '
      + '"auto": look whether anything already answers on this machine\'s network address at the '
      + 'harness port, and pick proxy if something does.')
    .default('auto'),
  directHost: z
    .string()
    .description('mode=direct: which address to listen on. 0.0.0.0 means every interface.')
    .default('127.0.0.1'),
  directPort: z
    .number()
    .description('mode=direct: which port to listen on. Keep it clear of whatever else is running.')
    .default(3088),
  settings: z
    .boolean()
    .description('Return the settings service on pages that are not localhost.')
    .default(true),
  randomUuid: z
    .boolean()
    .description('Provide crypto.randomUUID where the browser withholds it (plain HTTP).')
    .default(true),
  clipboard: z
    .boolean()
    .description('Provide a fallback for navigator.clipboard.writeText on plain HTTP.')
    .default(true),
  mdns: z
    .boolean()
    .description('Announce domain name via mDNS in local network for zero-config connection.')
    .default(true),
  mdnsName: z
    .string()
    .description('mDNS domain name to announce (e.g. dsh.local, dsh-test.local). Must end in .local.')
    .default('dsh.local'),
  pwa: z
    .boolean()
    .description('Inject PWA manifest and viewport meta tags for standalone mobile app feel.')
    .default(true),
  mobileEnterSends: z
    .boolean()
    .description('Mobile touch keyboards: when true, Enter sends message; when false (default), Enter inserts newline.')
    .default(false),
  tls: z
    .string()
    .description('mode=direct: how the listener is secured. "off" — plain HTTP. '
      + '"self-signed" — the plugin issues a Root CA and server cert (needs openssl). '
      + '"files" — use tlsCert and tlsKey.')
    .default('off'),
  tlsDir: z
    .string()
    .description('tls=self-signed: where the issued certificate is kept. '
      + 'Empty uses a folder next to the harness data.')
    .default(''),
  tlsHosts: z
    .array(z.string())
    .description('tls=self-signed: extra names and addresses to put into the certificate.')
    .default([]),
  tlsCert: z.string().description('tls=files: path to the certificate in PEM.').default(''),
  tlsKey: z.string().description('tls=files: path to the private key in PEM.').default(''),
  allow: z
    .array(z.string())
    .description('mode=direct: who may connect — addresses and CIDR ranges. Default restricts to loopback only.')
    .default(['127.0.0.0/8']),
  adminAllow: z
    .array(z.string())
    .description('mode=direct: addresses and CIDR ranges granted admin access (settings, plugins, device revocation). Empty defaults to all allowed.')
    .default([]),
  guestAllow: z
    .array(z.string())
    .description('mode=direct: addresses and CIDR ranges restricted to guest access (chat only).')
    .default([]),
  unlockPrivileged: z
    .boolean()
    .description('mode=direct: let the settings, credentials, and model-discovery calls through.')
    .default(true),
  lanPin: z
    .string()
    .description('mode=direct: optional PIN code (e.g. 4-6 digits) required for privileged operations from LAN. Deprecated: use lanPinRef.')
    .default(''),
  lanPinRef: z
    .string()
    .description('mode=direct: credential reference name or environment variable containing the LAN PIN code.')
    .default(''),
  tunnel: z
    .string()
    .description('Cloudflare WAN tunnel: "off", "quick" (trycloudflare.com), or "named" (token).')
    .default('off'),
  tunnelToken: z
    .string()
    .description('Cloudflare tunnel token (when tunnel="named"). Deprecated: use tunnelTokenRef.')
    .default(''),
  tunnelTokenRef: z
    .string()
    .description('Credential reference name or environment variable containing the Cloudflare tunnel token (when tunnel="named").')
    .default(''),
  tunnelPin: z
    .boolean()
    .description('Require LAN PIN for requests arriving through Cloudflare WAN tunnel.')
    .default(true),
  privilegedExtra: z
    .array(z.string())
    .description('mode=direct: extra path patterns to treat as privileged.')
    .default([]),
  passwordAuth: z
    .boolean()
    .description('Require username and password authentication to access DSH.')
    .default(false),
  authUser: z
    .string()
    .description('Username for password authentication.')
    .default('admin'),
  authPassword: z
    .string()
    .description('Password for authentication. Alternatively use authPasswordRef.')
    .default(''),
  authPasswordRef: z
    .string()
    .description('Reference to credential name in ctx.credentials for authentication password.')
    .default(''),
  authSessionDays: z
    .number()
    .description('Duration of remembered session in days.')
    .default(30),
  streamTimeoutMs: z
    .number()
    .description('mode=direct: how long a single request may take. 0 means no limit.')
    .default(0),
  diagnostics: z
    .boolean()
    .description('Serve GET /dsh-lanmode/health and related endpoints.')
    .default(true),
})
