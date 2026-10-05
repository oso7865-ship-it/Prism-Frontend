import { UserFacingError } from '../../shared/presentation'

export type ReviewMode = 'JUNIOR' | 'SENIOR'
export const reviewModes: ReviewMode[] = ['JUNIOR', 'SENIOR']

export interface UserProfile {
  id: string
  github_user_id: number
  login: string
  display_name: string | null
  avatar_url: string | null
  review_mode: ReviewMode
}

export class AuthError extends UserFacingError {
  constructor(public status: number) {
    super(status === 401 ? '로그인이 필요합니다.' : '요청에 실패했습니다. 잠시 후 다시 시도해 주세요.')
  }
}

export class ApiError extends UserFacingError {
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
        throw new UserFacingError('로그인 응답을 확인할 수 없습니다.')
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
      throw new UserFacingError('사용자 정보를 확인할 수 없습니다.')
    }
    return withReviewMode(data as Omit<UserProfile, 'review_mode'> & { review_mode?: unknown })
  }

  // An older server may omit the field: it behaves as the default senior mode.
  function withReviewMode(data: Omit<UserProfile, 'review_mode'> & { review_mode?: unknown }): UserProfile {
    const mode = data.review_mode
    if (mode !== undefined && mode !== 'JUNIOR' && mode !== 'SENIOR') throw new UserFacingError('사용자 정보를 확인할 수 없습니다.')
    return { ...data, review_mode: mode ?? 'SENIOR' }
  }

  async function updateReviewMode(mode: ReviewMode): Promise<UserProfile> {
    const data = await request<Omit<UserProfile, 'review_mode'> & { review_mode?: unknown }>('/api/v1/users/me/preferences', {
      method: 'PATCH', body: JSON.stringify({ review_mode: mode }),
    })
    const profile = withReviewMode(data)
    if (profile.review_mode !== mode) throw new UserFacingError('설정을 확인할 수 없습니다.')
    return profile
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
      const messages: Record<number, string> = { 403: '이 작업을 수행할 권한이 없습니다.', 404: '이 팀이나 저장소 정보를 볼 수 없어요.', 409: '이미 처리됐거나 다른 작업으로 상태가 바뀌었어요. 새로고침한 뒤 확인해 주세요.', 422: '입력값을 확인해 주세요.', 503: 'GitHub 연결 설정이나 서버에 문제가 있어요. 잠시 후 다시 시도하거나 서비스 관리자에게 문의해 주세요.' }
      const body: unknown = await response.json().catch(() => null)
      const code = body && typeof body === 'object' && 'error' in body && body.error && typeof body.error === 'object' && 'code' in body.error && typeof body.error.code === 'string' ? body.error.code : ''
      throw new ApiError(code, messages[response.status] || '요청에 실패했습니다. 다시 시도해 주세요.')
    }
    return response.status === 204 ? undefined as T : await response.json() as T
  }
  return { currentUser, refresh, logout, request, updateReviewMode }
}

export const authClient = createAuthClient()
