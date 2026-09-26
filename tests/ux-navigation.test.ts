import { describe, expect, it, vi } from 'vitest'
import { sourceLink } from '../src/features/analysis/sourceLink'
import { findGitHubUser } from '../src/features/workspace/githubUser'

describe('analysis source links', () => {
  const sha = 'a'.repeat(40)
  it('pins the analyzed commit and escapes filenames and line ranges', () => {
    expect(sourceLink('https://github.com/team/repo/pull/47', sha, 'src/a #한.ts', 46, 137))
      .toBe(`https://github.com/team/repo/blob/${sha}/src/a%20%23%ED%95%9C.ts#L46-L137`)
  })
  it('does not construct unsafe or unpinned URLs', () => {
    expect(sourceLink('https://evil.test/a/b/pull/1', sha, 'file', 1, 1)).toBe('')
    expect(sourceLink('https://github.com/a/b/pull/1', 'main', 'file', 1, 1)).toBe('')
    expect(sourceLink('https://github.com/a/b/pull/1', sha, '../file', 1, 1)).toBe('')
  })
})
describe('invitation account lookup', () => {
  it('looks up a public profile without sending PRism credentials', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 1, login: 'Octocat', type: 'User' })))
    expect(await findGitHubUser('@octocat', fetcher)).toEqual({ id: 1, login: 'Octocat', html_url: 'https://github.com/Octocat' })
    expect(fetcher).toHaveBeenCalledWith('https://api.github.com/users/octocat', expect.objectContaining({ credentials: 'omit', referrerPolicy: 'no-referrer' }))
  })
  it.each([404, 403, 429, 500])('rejects failed lookups (%i)', async status => {
    await expect(findGitHubUser('octocat', vi.fn().mockResolvedValue(new Response('', {status})))).rejects.toThrow()
  })
  it.each([{ id: 1, login: 'octocat', type: 'Organization' }, { id: 2, login: 'someone-else', type: 'User' }, { id: '1', login: 'octocat', type: 'User' }])('rejects invalid identities', async data => {
    await expect(findGitHubUser('octocat', vi.fn().mockResolvedValue(new Response(JSON.stringify(data))))).rejects.toThrow()
  })
  it('rejects invalid input before making a request', async () => {
    const fetcher = vi.fn()
    await expect(findGitHubUser('../users', fetcher)).rejects.toThrow()
    expect(fetcher).not.toHaveBeenCalled()
  })
})
