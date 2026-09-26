import { readFile, writeFile } from 'node:fs/promises'
import { isIP } from 'node:net'
import { pathToFileURL } from 'node:url'

export function configuration(origin, template) {
  const url = new URL(origin)
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash
      || url.pathname !== '/' || url.port || isIP(url.hostname) || !url.hostname.includes('.')
      || /\.(invalid|local|localhost)$/.test(url.hostname) || origin !== url.origin) {
    throw new Error('Use a bare public HTTPS API origin without credentials or a trailing slash')
  }
  const result = structuredClone(template)
  for (const rewrite of result.rewrites) {
    rewrite.destination = rewrite.destination.replace('https://replace-api.invalid', origin)
  }
  return result
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const template = JSON.parse(await readFile(new URL('../deployment/vercel.template.json', import.meta.url), 'utf8'))
    const result = configuration(process.env.PRISM_API_ORIGIN || '', template)
    // Refuse overwriting a configured deployment; edit that file explicitly for later changes.
    await writeFile(new URL('../vercel.json', import.meta.url), JSON.stringify(result, null, 2) + '\n', {flag:'wx'})
    console.log('Created vercel.json. No deployment was performed.')
  } catch {
    console.error('Configuration failed: check PRISM_API_ORIGIN and whether vercel.json already exists.')
    process.exitCode = 1
  }
}
