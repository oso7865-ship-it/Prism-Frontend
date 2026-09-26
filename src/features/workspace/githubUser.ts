export interface GitHubPerson { id: number; login: string; html_url: string }

// Public profile lookup: never send PRism credentials to GitHub.
export async function findGitHubUser(input: string, fetcher: typeof fetch = fetch): Promise<GitHubPerson> {
  const login = input.trim().replace(/^@/, '')
  if (!/^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i.test(login)) throw new Error('GitHub 사용자명을 입력하세요. 예: octocat')
  const response = await fetcher(`https://api.github.com/users/${encodeURIComponent(login)}`, {
    credentials: 'omit', referrerPolicy: 'no-referrer', signal: AbortSignal.timeout(10000),
    headers: { Accept: 'application/vnd.github+json' },
  }).catch(() => { throw new Error('GitHub에 연결하지 못했습니다. 네트워크를 확인하고 다시 시도하세요.') })
  if (response.status === 404) throw new Error('해당 GitHub 계정을 찾지 못했습니다. 사용자명을 확인하세요.')
  if (response.status === 403 || response.status === 429) throw new Error('GitHub 조회 한도에 도달했습니다. 잠시 후 다시 시도하세요.')
  if (!response.ok) throw new Error('GitHub 계정을 확인하지 못했습니다. 다시 시도하세요.')
  const user = await response.json()
  if (user.type !== 'User') throw new Error('조직이 아닌 개인 GitHub 계정을 선택하세요.')
  if (!Number.isSafeInteger(user.id) || user.id < 1 || typeof user.login !== 'string' || user.login.toLowerCase() !== login.toLowerCase()) throw new Error('계정 확인 응답이 올바르지 않습니다.')
  return { id: user.id, login: user.login, html_url: `https://github.com/${encodeURIComponent(user.login)}` }
}
