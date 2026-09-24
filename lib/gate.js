// Idempotent handler wrap for hot reload.
// A second wrap unwraps to the original function first.

export const GATED = Symbol('dsh-lanmode.gated')
const originals = new WeakMap()

export function gateWrap(current, wrap) {
  const original = current && current[GATED] ? originals.get(current) : current
  const wrapped = wrap(original)
  if (typeof wrapped === 'function') {
    wrapped[GATED] = true
    originals.set(wrapped, original)
  }
  return wrapped
}
