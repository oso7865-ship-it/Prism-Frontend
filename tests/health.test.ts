import { describe, expect, it } from 'vitest'
import { checkReadiness } from '../src/shared/api/health'

const response = (status: number, body: object): typeof fetch =>
  async () => new Response(JSON.stringify(body), { status })

describe('readiness contract', () => {
  it('accepts a ready dependency', async () => {
    expect(await checkReadiness(response(200, { status: 'ready' }))).toBe(true)
  })
  it('does not report an unavailable database as ready', async () => {
    expect(await checkReadiness(response(503, { status: 'not_ready' }))).toBe(false)
  })
  it('rejects malformed or failed responses', async () => {
    await expect(checkReadiness(response(200, { status: 'ok' }))).rejects.toThrow()
    await expect(checkReadiness(response(500, {}))).rejects.toThrow()
  })
})
