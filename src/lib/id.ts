/**
 * UUID v4 generator that also works outside a secure context.
 *
 * `crypto.randomUUID()` is spec'd `[SecureContext]`, so it is undefined when the
 * app is served over plain http from a LAN address — exactly how staff reach a
 * dev build from their phones. `crypto.getRandomValues()` has no such
 * restriction, so fall back to formatting its bytes as a v4 UUID.
 */
export function newId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()

  const bytes = crypto.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6] & 0x0f) | 0x40 // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80 // variant 1
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
