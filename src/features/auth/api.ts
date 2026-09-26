export interface UserProfile {
  id: string
  github_user_id: number
  login: string
  display_name: string | null
  avatar_url: string | null
}

export class AuthError extends Error {
  constructor(public status: number) {
    super(status === 401 ? '로그인이 필요합니다.' : '요청에 실패했습니다. 잠시 후 다시 시도해 주세요.')
  }
}

export class ApiError extends Error {
  constructor(public code: string, message: string) { super(message) }
}

export function createAuthClient(fetcher: typeof fetch = fetch) {
  // Access token is scoped to this page lifetime; never use local/session storage.
  let accessToken: string | null = null
  let refreshing: Promise<boolean> | null = null
  let signingOut: Promise<void> | null = null
  const csrf = { 'X-PRism-CSRF': '1' }

  function refresh(): Promise<boolean> {
    if (signingOut) return signingOut.then(() => false)
    if (refreshing) return refreshing
    refreshing = (async () => {
      const response = await fetcher('/api/v1/auth/refresh', {
        method: 'POST', credentials: 'same-origin', headers: csrf, cache: 'no-store',
      })
      if (response.status === 401) { accessToken = null; return false }
      if (!response.ok) throw new AuthError(response.status)
      const payload: unknown = await response.json()
      if (!payload || typeof payload !== 'object' || !('access_token' in payload)
        || typeof payload.access_token !== 'string' || !payload.access_token) {
        throw new Error('로그인 응답을 확인할 수 없습니다.')
      }
      accessToken = payload.access_token
      return true
    })().finally(() => { refreshing = null })
    return refreshing
  }

  async function currentUser(): Promise<UserProfile | null> {
    if (!accessToken && !await refresh()) return null
    const request = () => fetcher('/api/v1/users/me', {
      credentials: 'same-origin', headers: { Authorization: `Bearer ${accessToken}` }, cache: 'no-store',
    })
    let response = await request()
    if (response.status === 401) {
      if (!await refresh()) return null
      response = await request()
    }
    if (response.status === 401) { accessToken = null; return null }
    if (!response.ok) throw new AuthError(response.status)
    const data: unknown = await response.json()
    if (!data || typeof data !== 'object' || !('id' in data) || typeof data.id !== 'string'
      || !('login' in data) || typeof data.login !== 'string'
      || !('github_user_id' in data) || typeof data.github_user_id !== 'number'
      || !('display_name' in data) || !(data.display_name === null || typeof data.display_name === 'string')
      || !('avatar_url' in data) || !(data.avatar_url === null || typeof data.avatar_url === 'string')) {
      throw new Error('사용자 정보를 확인할 수 없습니다.')
    }
    return data as UserProfile
  }

  function logout(): Promise<void> {
    if (signingOut) return signingOut
    const pending = refreshing
    signingOut = (async () => {
      // Let a pending rotation install its cookie before revoking that session.
      if (pending) await pending.catch(() => undefined)
      const response = await fetcher('/api/v1/auth/logout', {
        method: 'POST', credentials: 'same-origin', headers: csrf, cache: 'no-store',
      })
      if (!response.ok) throw new AuthError(response.status)
      accessToken = null
    })().finally(() => { signingOut = null })
    return signingOut
  }

  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    if (!path.startsWith('/api/v1/') || path.includes('://')) throw new Error('잘못된 API 경로입니다.')
    if (!accessToken && !await refresh()) throw new AuthError(401)
    const send = () => fetcher(path, { ...init, credentials: 'same-origin', cache: 'no-store',
      headers: { ...init.headers, Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' } })
    let response = await send()
    if (response.status === 401 && await refresh()) response = await send()
    if (response.status === 401) { accessToken = null; throw new AuthError(401) }
    if (!response.ok) {
      const messages: Record<number, string> = { 403: '이 작업을 수행할 권한이 없습니다.', 404: '접근할 수 없는 팀 또는 리소스입니다.', 409: '이미 처리되었거나 현재 상태와 충돌합니다. 새로고침 후 확인하세요.', 422: '입력값을 확인해 주세요.', 503: 'GitHub App 설정 또는 서버 연결을 확인해 주세요.' }
      const body: unknown = await response.json().catch(() => null)
      const code = body && typeof body === 'object' && 'error' in body && body.error && typeof body.error === 'object' && 'code' in body.error && typeof body.error.code === 'string' ? body.error.code : ''
      throw new ApiError(code, messages[response.status] || '요청에 실패했습니다. 다시 시도해 주세요.')
    }
    return response.status === 204 ? undefined as T : await response.json() as T
  }
  return { currentUser, refresh, logout, request }
}

export const authClient = createAuthClient()
