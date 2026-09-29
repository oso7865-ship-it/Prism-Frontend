import {pathToFileURL} from 'node:url'

const origin = 'https://prismquest.p-e.kr'
const checks = [
  {path: '/login', type: 'text/html', content: 'id="app"'},
  {path: '/health/ready', type: 'application/json', status: 'ready'},
]
export async function checkProduction({request = fetch, sleep = ms => new Promise(resolve => setTimeout(resolve, ms)), attempts = 12} = {}) {
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      for (const check of checks) {
        const response = await request(`${origin}${check.path}`, {
          redirect: 'error', signal: AbortSignal.timeout(5000), cache: 'no-store',
        })
        if (!response.ok || !response.headers.get('content-type')?.includes(check.type)) throw new Error('NOT_READY')
        if (check.status) {
          if ((await response.json()).status !== check.status) throw new Error('NOT_READY')
        } else if (!(await response.text()).includes(check.content)) throw new Error('NOT_READY')
      }
      return true
    } catch {
      if (attempt + 1 < attempts) await sleep(5000)
    }
  }
  return false
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const ready = await checkProduction()
  console.log(JSON.stringify({status: ready ? 'PASS' : 'FAIL', scope: 'public_page_and_api_readiness'}))
  process.exitCode = ready ? 0 : 1
}
