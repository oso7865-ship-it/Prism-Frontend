import { describe, expect, it, vi } from 'vitest'
import { createAuthClient } from '../src/features/auth/api'

const profile = { id: 'user-id', github_user_id: 42, login: 'test-user', display_name: null, avatar_url: null }
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status })

describe('auth session', () => {
  it('single-flights simultaneous startup refresh and sends CSRF header', async () => {
    const fetcher = vi.fn<typeof fetch>(async (input, init) => {
      if (input === '/api/v1/auth/refresh') {
        expect(init?.headers).toEqual({ 'X-PRism-CSRF': '1' })
        return json({ access_token: 'memory-token' })
      }
      expect(init?.headers).toEqual({ Authorization: 'Bearer memory-token' })
      return json(profile)
    })
    const client = createAuthClient(fetcher)
    expect(await Promise.all([client.currentUser(), client.currentUser()])).toEqual([profile, profile])
    expect(fetcher.mock.calls.filter(call => call[0] === '/api/v1/auth/refresh')).toHaveLength(1)
  })

  it('returns signed out for expired refresh but surfaces server errors', async () => {
    expect(await createAuthClient(async () => json({}, 401)).currentUser()).toBeNull()
    await expect(createAuthClient(async () => json({}, 503)).currentUser()).rejects.toThrow()
  })

  it('retries profile once after refreshing expired access', async () => {
    let profiles = 0
    const fetcher = vi.fn<typeof fetch>(async input => input === '/api/v1/auth/refresh'
      ? json({ access_token: 'refreshed' }) : json(profile, ++profiles === 1 ? 401 : 200))
    expect(await createAuthClient(fetcher).currentUser()).toEqual(profile)
    expect(profiles).toBe(2)
  })

  it('does not pretend logout succeeded on a network/server failure', async () => {
    const client = createAuthClient(async () => json({}, 503))
    await expect(client.logout()).rejects.toThrow()
  })

  it('waits for in-flight rotation before logout then clears access memory', async () => {
    let finish!: (value: Response) => void
    const pending = new Promise<Response>(resolve => { finish = resolve })
    const fetcher = vi.fn<typeof fetch>(async input => input === '/api/v1/auth/refresh'
      ? pending : new Response(null, { status: 204 }))
    const client = createAuthClient(fetcher)
    const refreshing = client.refresh()
    const logout = client.logout()
    expect(fetcher).toHaveBeenCalledTimes(1)
    finish(json({ access_token: 'before-logout' }))
    await Promise.all([refreshing, logout])
    expect(fetcher.mock.calls[1]?.[0]).toBe('/api/v1/auth/logout')
  })
})
