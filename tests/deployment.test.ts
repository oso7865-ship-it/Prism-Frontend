import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
// Deployment tooling is plain Node.js and deliberately independent of the browser bundle.
// @ts-expect-error no declaration for deployment-only script
import { configuration } from '../scripts/prepare-deployment.mjs'

const template = JSON.parse(readFileSync(new URL('../deployment/vercel.template.json', import.meta.url), 'utf8'))

describe('deployment configuration', () => {
  it('proxies API and health before the SPA without modifying the template', () => {
    const result = configuration('https://prism-api.onrender.com', template)
    expect(result.rewrites[0].destination).toBe('https://prism-api.onrender.com/api/:path*')
    expect(result.rewrites[1].destination).toBe('https://prism-api.onrender.com/health/:path*')
    expect(template.rewrites[0].destination).toContain('replace-api.invalid')
    expect(result.headers[0].headers).toContainEqual({key: 'Cache-Control', value: 'private, no-store'})
  })
  it.each(['', 'http://api.example.com', 'https://localhost', 'https://127.0.0.1',
    'https://api.example.com/', 'https://api.example.com/path', 'https://api.example.com?secret=x',
    'https://user:password@api.example.com', 'https://replace.invalid', ' https://api.example.com'])
  ('rejects an unsafe or placeholder origin: %s', (origin) => {
    expect(() => configuration(origin, template)).toThrow()
  })
})
