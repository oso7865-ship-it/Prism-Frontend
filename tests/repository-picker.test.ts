import { describe, expect, it, vi } from 'vitest'
import { createSSRApp, h } from 'vue'
import { renderToString } from 'vue/server-renderer'
import RepositoryPickerView from '../src/features/workspace/RepositoryPickerView.vue'
import { connectSelected, githubAuthorizationUrl, groupByOwner, loadCandidates, matches, parseCandidates, parseResults, startConnect, type Candidate, type CandidateList } from '../src/features/workspace/repositoryPicker'
import { authClient } from '../src/features/auth/api'

const item = (id: number, owner: string, name: string, state: Candidate['state'] = 'AVAILABLE', is_private = true): Candidate => ({ github_repository_id: id, owner_login: owner, repository_name: name, is_private, state })
const list = (items: Candidate[], extra: Partial<CandidateList> = {}): CandidateList => ({ items, truncated: false, skipped_installations: 0, expires_at: '2026-10-06T00:00:00Z', installation_url: null, ...extra })
async function render(props: Record<string, unknown>) {
  const base = { list: null, loading: false, busy: false, expired: false, error: '', results: [], installationUrl: 'https://github.com/apps/prism/installations/new', search: '', chosen: [] }
  const html = await renderToString(createSSRApp({ render: () => h(RepositoryPickerView, { ...base, ...props }) }))
  return { html, text: html.replace(/<!--.*?-->/g, '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ') }
}

describe('repository candidate responses', () => {
  const body = { items: [{ github_repository_id: 1, owner_login: 'octo', repository_name: 'a', is_private: true, state: 'AVAILABLE' }], truncated: false, skipped_installations: 2, expires_at: 'x', installation_url: 'https://github.com/apps/p/installations/new' }
  it('accepts a well-formed list and rejects malformed or unknown states', () => {
    expect(parseCandidates(body).items[0].repository_name).toBe('a')
    expect(() => parseCandidates({ ...body, items: [{ ...body.items[0], state: 'ROOT' }] })).toThrow()
    expect(() => parseCandidates({ ...body, items: 'no' })).toThrow()
    expect(() => parseCandidates(null)).toThrow()
    expect(() => parseCandidates({ ...body, items: [{ ...body.items[0], github_repository_id: '1' }] })).toThrow()
  })
  it('accepts per-repository results and rejects unknown statuses', () => {
    const ok = { results: [{ github_repository_id: 1, owner_login: 'o', repository_name: 'n', status: 'CONNECTED', repository_id: 'r' }, { github_repository_id: 2, owner_login: null, repository_name: null, status: 'NOT_IN_LIST' }] }
    expect(parseResults(ok).map(r => r.status)).toEqual(['CONNECTED', 'NOT_IN_LIST'])
    expect(() => parseResults({ results: [{ github_repository_id: 1, status: 'DONE' }] })).toThrow()
  })
  it('only follows the GitHub OAuth page', () => {
    expect(githubAuthorizationUrl('https://github.com/login/oauth/authorize?x=1')).toContain('github.com/login/oauth/authorize')
    for (const bad of ['https://evil.example/login/oauth/authorize', 'https://github.com/other', 'http://github.com/login/oauth/authorize', 'https://github.com.evil.example/login/oauth/authorize', 5, undefined]) {
      expect(() => githubAuthorizationUrl(bad)).toThrow()
    }
  })
})

describe('repository picker requests', () => {
  it('sends no repository name to start and only ids to connect', async () => {
    const request = vi.spyOn(authClient, 'request')
      .mockResolvedValueOnce({ authorization_url: 'https://github.com/login/oauth/authorize?state=s' })
      .mockResolvedValueOnce({ results: [] })
      .mockResolvedValueOnce({ items: [], truncated: false, skipped_installations: 0, expires_at: 'x', installation_url: null })
    expect(await startConnect('w 1')).toContain('github.com')
    await connectSelected('w1', [3, 4])
    await loadCandidates('w1')
    expect(request.mock.calls[0]).toEqual(['/api/v1/workspaces/w%201/repositories/connect', { method: 'POST' }])
    expect(request.mock.calls[1][0]).toBe('/api/v1/workspaces/w1/repositories/connect-selected')
    expect(JSON.parse(String((request.mock.calls[1][1] as RequestInit).body))).toEqual({ github_repository_ids: [3, 4] })
    expect(request.mock.calls[2][0]).toBe('/api/v1/workspaces/w1/repositories/candidates')
    request.mockRestore()
  })
})

describe('list helpers', () => {
  it('groups by owner with a stable case-insensitive order and filters by owner or name', () => {
    const groups = groupByOwner([item(3, 'zeta', 'b'), item(1, 'Alpha', 'z'), item(2, 'Alpha', 'a')])
    expect(groups.map(g => g.owner)).toEqual(['Alpha', 'zeta'])
    expect(groups[0].items.map(i => i.repository_name)).toEqual(['a', 'z'])
    expect(matches(item(1, 'Octo', 'Hello'), ' octo/he ')).toBe(true)
    expect(matches(item(1, 'Octo', 'Hello'), 'nope')).toBe(false)
    expect(matches(item(1, 'Octo', 'Hello'), '   ')).toBe(true)
  })
})

describe('repository picker screen', () => {
  const items = [item(1, 'octo', 'sample'), item(2, 'octo', 'readonly', 'ADMIN_REQUIRED'), item(3, 'team', 'taken', 'OTHER_TEAM'), item(4, 'team', 'here', 'CONNECTED', false)]

  it('shows loading, expiry with a restart button and request errors', async () => {
    expect((await render({ loading: true })).text).toContain('불러오는 중')
    const expired = await render({ expired: true })
    expect(expired.text).toContain('목록이 만료됐어요')
    expect(expired.text).toContain('GitHub에서 다시 가져오기')
    const failed = await render({ error: '불러오지 못했어요' })
    expect(failed.html).toContain('role="alert"')
  })

  it('explains an empty grant and links to the GitHub app settings', async () => {
    const { text, html } = await render({ list: list([]) })
    expect(text).toContain('GitHub에서 허용된 저장소가 없어요')
    expect(html).toContain('href="https://github.com/apps/prism/installations/new"')
    expect(html).toContain('rel="noopener noreferrer"')
  })

  it('lists every repository grouped by owner with the reason it cannot be chosen', async () => {
    const { text, html } = await render({ list: list(items), chosen: [1] })
    for (const word of ['octo', 'team', 'sample', 'readonly', 'taken', 'here']) expect(text).toContain(word)
    expect(text).toContain('저장소 관리자 권한이 필요해요')
    expect(text).toContain('다른 팀에 연결돼 있어요')
    expect(text).toContain('이미 이 팀에 연결돼 있어요')
    expect(text).toContain('전체 4개 · 검색 결과 4개 · 선택 1개')
    expect(text).toContain('선택한 1개 연결')
    expect(html).toContain('<fieldset')
    expect(html).toContain('<legend>')
    expect(html.match(/type="checkbox"/g)).toHaveLength(4)
    expect(html.match(/<input[^>]*type="checkbox"[^>]*disabled/g)).toHaveLength(3)
  })

  it('escapes names and marks private repositories', async () => {
    const { html, text } = await render({ list: list([item(9, 'o', '<img src=x onerror=alert(1)>')]) })
    expect(html).not.toContain('<img')
    expect(text).toContain('비공개')
  })

  it('filters by search and says when nothing matches', async () => {
    const found = await render({ list: list(items), search: 'read' })
    expect(found.text).toContain('검색 결과 1개')
    expect(found.text).not.toContain('sample')
    expect((await render({ list: list(items), search: 'zzz' })).text).toContain('검색 결과가 없어요')
  })

  it('disables connecting with nothing chosen, while saving, and above the server limit', async () => {
    expect((await render({ list: list(items) })).html).toMatch(/<button[^>]*disabled[^>]*>.*선택한 0개 연결/s)
    expect((await render({ list: list(items), chosen: [1], busy: true })).text).toContain('연결하는 중')
    const many = Array.from({ length: 21 }, (_, n) => item(n + 1, 'o', `r${n}`))
    const over = await render({ list: list(many), chosen: many.map(i => i.github_repository_id) })
    expect(over.text).toContain('최대 20개까지')
    expect(over.html).toMatch(/<button[^>]*disabled[^>]*>.*선택한 21개 연결/s)
  })

  it('reports truncation, skipped installations and per-repository results', async () => {
    const { text, html } = await render({
      list: list(items, { truncated: true, skipped_installations: 2 }),
      results: [
        { github_repository_id: 1, owner_login: 'octo', repository_name: 'sample', status: 'CONNECTED', repository_id: 'r' },
        { github_repository_id: 3, owner_login: 'team', repository_name: 'taken', status: 'CONFLICT', repository_id: null },
      ],
    })
    expect(text).toContain('일부만 보여 줘요')
    expect(text).toContain('건너뛰었어요')
    expect(text).toContain('octo/sample — 연결했어요')
    expect(text).toContain('team/taken — 다른 팀에 이미 연결돼 있어요')
    expect(text).toContain('일부 저장소는 연결하지 못했어요')
    expect(html).toContain('role="status"')
  })
})
