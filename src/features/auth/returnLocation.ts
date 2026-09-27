const KEY = 'prism.login-return.v1'
const TTL = 15 * 60 * 1000

export function safeReturn(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 4096 || /[\\\u0000-\u001f]/.test(value)) return null
  if (!/^\/app(?:\/(?:repositories|team))?(?:[?#]|$)/.test(value)) return null
  try {
    const url = new URL(value, 'https://prism.invalid')
    if (url.origin !== 'https://prism.invalid' || !['/app', '/app/team', '/app/repositories'].includes(url.pathname)) return null
    return url.pathname + url.search + url.hash
  } catch { return null }
}
export function rememberReturn(value: unknown) {
  const path = safeReturn(value)
  try { if (path) sessionStorage.setItem(KEY, JSON.stringify({ path, expires: Date.now() + TTL })) } catch { /* Storage can be disabled. The URL still restores direct navigation. */ }
}
export function pendingReturn(): string | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(KEY) || 'null')
    if (value && typeof value.expires === 'number' && value.expires > Date.now() && value.expires <= Date.now() + TTL) return safeReturn(value.path)
    clearReturn()
  } catch { clearReturn() }
  return null
}
export function clearReturn() { try { sessionStorage.removeItem(KEY) } catch { /* Unavailable storage. */ } }

export function loginLocation(path: string) {
  rememberReturn(path)
  const split = path.indexOf('#')
  return { path: '/login', query: { next: split < 0 ? path : path.slice(0, split) }, hash: split < 0 ? '' : path.slice(split) }
}
