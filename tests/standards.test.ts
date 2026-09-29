import { afterEach, describe, expect, it, vi } from 'vitest'
import { createSSRApp } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { authClient } from '../src/features/auth/api'
import StandardsPanel from '../src/features/standards/StandardsPanel.vue'
import StandardsEvidence from '../src/features/standards/StandardsEvidence.vue'
import AIReviewPanel from '../src/features/analysis/AIReviewPanel.vue'
import SecuritySignals from '../src/features/analysis/SecuritySignals.vue'
import { renderFixture } from './helpers/componentHarness'

vi.mock('vue', async original => {
  const vue = await original<typeof import('vue')>()
  return { ...vue, onMounted(fn: () => unknown) {
    vue.onServerPrefetch(async () => { await fn(); await new Promise(resolve => setImmediate(resolve)) })
  } }
})
afterEach(() => vi.restoreAllMocks())
const base = { workspaceId: 'w', repositoryId: 'r', analysisId: 'a', owner: true, githubUrl: 'https://github.com/a/b/pull/1', headSha: 'a'.repeat(40) }
const citation = { document_id: 'document-id', version: 2, title: '<script>우리 규칙</script>', section: 's1', heading: '서비스 위치' }

describe('separate review purposes and explicit document consent', () => {
  it.each(['SECURITY', 'STANDARDS'] as const)('loads only %s history without starting a paid request', async purpose => {
    const request = vi.spyOn(authClient, 'request').mockResolvedValue({ items: [], enabled: true, daily_limit: 30 })
    const view = await renderFixture(AIReviewPanel, { ...base, purpose })
    expect(request).toHaveBeenCalledExactlyOnceWith(`/api/v1/workspaces/w/analyses/a/reviews?purpose=${purpose}`)
    expect(view.text()).toContain('합쳐 팀당 하루 30회')
    if (purpose === 'STANDARDS') {
      expect(view.text()).toContain('적용할 팀 문서 섹션과 파일 경로')
      expect(view.text()).toContain('최대 12KiB')
    } else expect(view.text()).toContain('권한 경계와 위험한 입력 처리')
  })
  it('does not reinterpret legacy CODE history as a standards run', async () => {
    const request = vi.spyOn(authClient, 'request').mockResolvedValue({ items: [], enabled: true, daily_limit: 30 })
    await renderFixture(AIReviewPanel, base)
    expect(request).toHaveBeenCalledWith('/api/v1/workspaces/w/analyses/a/reviews')
  })
})
describe('documents and deterministic results', () => {
  it('tells members how documents are stored but offers no edit action', async () => {
    vi.spyOn(authClient, 'request').mockResolvedValue({ items: [] })
    const view = await renderFixture(StandardsPanel, { ...base, owner: false })
    expect(view.text()).toContain('문서 원문과 버전을 팀 비공개 공간에 보관')
    expect(view.text()).toContain('팀 소유자만')
    expect(view.html).not.toContain('>문서 등록</button>')
  })
  it('renders uploaded titles as text and translates document categories', async () => {
    vi.spyOn(authClient, 'request').mockResolvedValue({ items: [{ id: 'd', version: 1, title: '<img src=x onerror=alert(1)>', kind: 'STRUCTURE', active: true }] })
    const view = await renderFixture(StandardsPanel, base)
    expect(view.text()).toContain('패키지 구조')
    expect(view.html).toContain('&lt;img'); expect(view.html).not.toContain('<img src=x')
  })
  it('distinguishes concrete path violations from incomplete import checks and shows source versions', async () => {
    const html = await renderToString(createSSRApp(StandardsEvidence, { ...base, result: {
      standard_checks: [{ rule: 'r1', kind: 'PATH_PREFIX', value: 'src/domain', file_id: 'f1', file_path: 'src/api/a.ts', line: null, status: 'VIOLATION', citation }, { rule: 'r2', kind: 'FORBIDDEN_IMPORT', value: 'infra', file_id: 'f1', file_path: 'src/api/a.ts', line: null, status: 'LIMITED', citation }],
      standards: { candidate_count: 10, omitted_sections: 3 }, standard_sources: [citation],
    } }))
    expect(html).toContain('확인한 결과 · 1건'); expect(html).toContain('제공된 변경 import만 확인')
    expect(html).toContain('버전 2'); expect(html).toContain('3개는 이번 AI 입력에 포함되지')
    expect(html).not.toContain('PATH_PREFIX'); expect(html).toContain('&lt;script&gt;')
  })
  it('requests security findings with a server-side category filter', async () => {
    const request = vi.spyOn(authClient, 'request').mockResolvedValue({ items: [], next_cursor: null })
    const view = await renderFixture(SecuritySignals, base)
    expect(request).toHaveBeenCalledWith('/api/v1/workspaces/w/analyses/a/findings?category=SECURITY')
    expect(view.text()).toContain('취약점이 없다는 판정은 아니에요')
  })
})
