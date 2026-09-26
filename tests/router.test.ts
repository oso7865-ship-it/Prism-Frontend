import { afterEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory } from 'vue-router'
import { createAppRouter } from '../src/app/router'
import { authClient } from '../src/features/auth/api'
import { sessionUser } from '../src/features/auth/session'

vi.mock('../src/app/HomeView.vue', () => ({ default: {} }))
vi.mock('../src/app/LoginView.vue', () => ({ default: {} }))
vi.mock('../src/features/workspace/WorkspacePanel.vue', () => ({ default: {} }))

const user = { id: 'user', login: 'reviewer', github_user_id: 1, display_name: null, avatar_url: null }
afterEach(() => { vi.restoreAllMocks(); sessionUser.value = null })

describe('page navigation with restored sessions', () => {
  it.each(['/app', '/app/repositories', '/app/team'])('protects direct navigation to %s', async path => {
    vi.spyOn(authClient, 'currentUser').mockResolvedValue(null)
    const router = createAppRouter(createMemoryHistory())
    await router.push(path)
    expect(router.currentRoute.value.path).toBe('/login')
  })
  it('restores a session before entering a feature URL and preserves team selection', async () => {
    vi.spyOn(authClient, 'currentUser').mockResolvedValue(user)
    const router = createAppRouter(createMemoryHistory())
    await router.push('/app/team?team=chosen-team')
    expect(router.currentRoute.value.meta.page).toBe('team')
    expect(router.currentRoute.value.query.team).toBe('chosen-team')
    expect(sessionUser.value?.id).toBe('user')
  })
  it('takes a signed-in visitor from login to the main page', async () => {
    vi.spyOn(authClient, 'currentUser').mockResolvedValue(user)
    const router = createAppRouter(createMemoryHistory())
    await router.push('/login')
    expect(router.currentRoute.value.path).toBe('/app')
  })
  it('keeps the backend repository callback compatible with the feature route', async () => {
    vi.spyOn(authClient, 'currentUser').mockResolvedValue(user)
    const router = createAppRouter(createMemoryHistory())
    await router.push('/?repository_result=connected')
    expect(router.currentRoute.value.path).toBe('/app/repositories')
    expect(router.currentRoute.value.query.repository_result).toBe('connected')
  })
  it('does not render a protected page when session restoration fails', async () => {
    vi.spyOn(authClient, 'currentUser').mockRejectedValue(new Error('network unavailable'))
    const router = createAppRouter(createMemoryHistory())
    await router.push('/app/repositories')
    expect(router.currentRoute.value.path).toBe('/login')
    expect(sessionUser.value).toBeNull()
  })
})
