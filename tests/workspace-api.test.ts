import { describe, expect, it, vi } from 'vitest'
import { createAuthClient } from '../src/features/auth/api'
const json = (body: unknown, status=200) => new Response(JSON.stringify(body), {status})
describe('workspace authenticated requests', () => {
  it('adds bearer only to local API and returns team data', async () => {
    const fetcher=vi.fn<typeof fetch>(async (path, init) => {
      if(path==='/api/v1/auth/refresh') return json({access_token:'test-access'})
      expect(init?.headers).toMatchObject({Authorization:'Bearer test-access'})
      return json({items:[{id:'team',name:'Team',role:'OWNER'}],next_cursor:null})
    })
    const client=createAuthClient(fetcher)
    await expect(client.request('https://outside.example')).rejects.toThrow()
    expect(fetcher).not.toHaveBeenCalled()
    expect(await client.request('/api/v1/workspaces')).toMatchObject({items:[{name:'Team'}]})
  })
  it('refreshes an expired bearer once and handles a 204 delete', async () => {
    let refreshes=0, calls=0
    const client=createAuthClient(vi.fn<typeof fetch>(async (path) => {
      if(path==='/api/v1/auth/refresh') return json({access_token:`test-${++refreshes}`})
      return ++calls===1 ? json({},401) : new Response(null,{status:204})
    }))
    expect(await client.request('/api/v1/workspaces/w/members/u',{method:'DELETE'})).toBeUndefined()
    expect(refreshes).toBe(2);expect(calls).toBe(2)
  })
  it.each([403,404,409,422,503])('shows an actionable error for %s without raw server detail', async(status) => {
    const client=createAuthClient(vi.fn<typeof fetch>(async path=>path==='/api/v1/auth/refresh' ? json({access_token:'test'}) : json({secret:'server-canary'},status)))
    await expect(client.request('/api/v1/workspaces')).rejects.not.toThrow('server-canary')
  })
  it('preserves AI limit codes without exposing server details or retrying', async () => {
    const fetcher = vi.fn<typeof fetch>(async path => path === '/api/v1/auth/refresh'
      ? json({access_token:'test'})
      : json({error:{code:'AI_DAILY_LIMIT',message:'private-server-detail'}},409))
    await expect(createAuthClient(fetcher).request('/api/v1/workspaces/w/analyses/a/reviews', {method:'POST'}))
      .rejects.toMatchObject({code:'AI_DAILY_LIMIT'})
    expect(fetcher).toHaveBeenCalledTimes(2)
  })
  it('reports an expired session after refresh is rejected, without repeated retries', async () => {
    let refreshes = 0
    const fetcher = vi.fn<typeof fetch>(async path => {
      if (path === '/api/v1/auth/refresh') return ++refreshes === 1 ? json({access_token:'test'}) : json({},401)
      return json({},401)
    })
    await expect(createAuthClient(fetcher).request('/api/v1/workspaces')).rejects.toMatchObject({status:401})
    expect(fetcher).toHaveBeenCalledTimes(3)
  })
})
