import { afterEach, describe, expect, it, vi } from 'vitest'
import { createSSRApp, effectScope } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { authClient } from '../src/features/auth/api'
import { useReviewSource } from '../src/features/analysis/useReviewSource'
import ReviewVerification from '../src/features/analysis/ReviewVerification.vue'
import AIReviewCoverage from '../src/features/analysis/AIReviewCoverage.vue'

afterEach(() => vi.restoreAllMocks())
const base = { workspaceId:'w', runId:'r', headSha:'a'.repeat(40), githubUrl:'https://github.com/a/b/pull/1' }
const sample = { file_path:'a.py', head_sha:base.headSha, start_line:1, total_lines:1, lines:['value = 1'], truncated:false }

describe('source viewer request lifetime', () => {
  it('discards source after close even if the request ignores abort', async () => {
    let resolve!: (v: unknown) => void
    vi.spyOn(authClient, 'request').mockImplementation(() => new Promise(r => { resolve = r }))
    const scope = effectScope(), view = scope.run(useReviewSource)!
    const request = view.load('/api/v1/reviews/a', 1)
    view.clear(); resolve(sample); await request
    expect(view.code.value).toBeNull(); expect(view.busy.value).toBe(false)
    scope.stop()
  })
  it('a stale file cannot replace the newly selected file', async () => {
    let old!: (v: unknown) => void
    const mock = vi.spyOn(authClient, 'request').mockImplementationOnce(() => new Promise(r => { old = r })).mockResolvedValueOnce({...sample,file_path:'new.py'})
    const scope = effectScope(), view = scope.run(useReviewSource)!
    const request = view.load('/api/v1/old', 1)
    await view.load('/api/v1/new', 81); old(sample); await request
    expect(view.code.value?.file_path).toBe('new.py')
    expect(mock.mock.calls[1][0]).toBe('/api/v1/new?line=81')
    scope.stop(); expect(view.code.value).toBeNull()
  })
  it('clears old source on failure and allows a retry', async () => {
    vi.spyOn(authClient, 'request').mockResolvedValueOnce(sample).mockRejectedValueOnce(new Error('private server details')).mockResolvedValueOnce(sample)
    const scope = effectScope(), view = scope.run(useReviewSource)!
    await view.load('/api/v1/source',1); await view.load('/api/v1/source',81)
    expect(view.code.value).toBeNull(); expect(view.error.value).not.toContain('private')
    await view.load('/api/v1/source',1); expect(view.error.value).toBe(''); expect(view.code.value).toEqual(sample)
    scope.stop()
  })
})
describe('empty review transparency', () => {
  it('does not retroactively claim that historical empty results were rechecked', async () => {
    const html = await renderToString(createSSRApp(ReviewVerification,{...base,empty:true,verification:{status:'NO_CANDIDATES'}}))
    expect(html).toContain('파일별 재검토를 진행하지 않았어요')
    expect(html).not.toContain('빈 답변을 한 번 더 검토했어요')
  })
  it('shows escaped per-file outcomes without calling a second-pass finding verified', async () => {
    const html = await renderToString(createSSRApp(ReviewVerification,{...base,empty:true,verification:{status:'EMPTY_RECHECKED',file_checks:[{file_id:'f1',file_path:'a.py',line:2,outcome:'LIMITED',observation:'<script>limited</script>'}]}}))
    expect(html).toContain('문맥 부족'); expect(html).toContain('2줄 코드 보기')
    expect(html).toContain('&lt;script&gt;'); expect(html).not.toContain('<script>')
    expect(html).not.toContain('유지 0건')
  })
  it('offers in-site code access without requiring any issue', async () => {
    const html = await renderToString(createSSRApp(AIReviewCoverage,{...base,expanded:true,coverage:{files:[{file_id:'f1',file_path:'a.py',provided_lines:2}],excluded:[],unfetched_files:0}}))
    expect(html).toContain('코드 보기'); expect(html).toContain(' open')
    expect(html).not.toContain('target="_blank"')
  })
})
