import test from 'node:test'
import assert from 'node:assert/strict'
import {checkProduction} from './check-production.mjs'

function html() { return new Response('<div id="app"></div>', {headers: {'content-type': 'text/html'}}) }
function json(status) { return Response.json({status}) }

test('public deployment requires both login page and ready API proxy', async () => {
  const visited = []
  assert.equal(await checkProduction({request: async (url, options) => {
    visited.push(url)
    assert.equal(options.redirect, 'error')
    assert.equal(options.cache, 'no-store')
    return url.endsWith('/login') ? html() : json('ready')
  }}), true)
  assert.deepEqual(visited, ['https://prismquest.p-e.kr/login', 'https://prismquest.p-e.kr/health/ready'])
})

test('SPA fallback, failed API and misleading status text cannot pass', async () => {
  for (const bad of [html, () => json('not ready'), () => new Response('ready', {status: 503}),
    () => new Response('{invalid}', {headers: {'content-type': 'application/json'}})]) {
    assert.equal(await checkProduction({attempts: 1, request: async url => url.endsWith('/login') ? html() : bad()}), false)
  }
})

test('transient network failure retries within the fixed budget', async () => {
  let calls = 0
  let waits = 0
  assert.equal(await checkProduction({attempts: 2, sleep: async () => { waits++ }, request: async url => {
    if (++calls === 1) throw new Error('timeout')
    return url.endsWith('/login') ? html() : json('ready')
  }}), true)
  assert.equal(waits, 1)
  assert.equal(await checkProduction({attempts: 2, sleep: async () => {}, request: async () => { throw new Error('redirect') }}), false)
})
