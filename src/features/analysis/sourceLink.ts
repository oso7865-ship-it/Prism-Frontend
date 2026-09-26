export function sourceLink(prUrl: string, sha: string, path: string, start: number | null, end: number | null): string {
  const repo = /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/pull\/\d+$/.exec(prUrl)
  if (!repo || !/^[a-f0-9]{40}$/i.test(sha) || !path || path.split('/').some(p => p === '..' || p === '.')) return ''
  const line = start && start > 0 ? `#L${start}${end && end > start ? `-L${end}` : ''}` : ''
  return `https://github.com/${repo[1]}/${repo[2]}/blob/${sha}/${path.split('/').map(encodeURIComponent).join('/')}${line}`
}
