import { describe, expect, it } from 'vitest'
import { createSSRApp } from 'vue'
import { renderToString } from 'vue/server-renderer'
import AIReviewEvidence from '../src/features/analysis/AIReviewEvidence.vue'

const base = { githubUrl: 'https://github.com/owner/repo/pull/1', headSha: 'a'.repeat(40) }
describe('review evidence', () => {
  it('keeps legacy output without fabricating new evidence', async () => {
    const html = await renderToString(createSSRApp(AIReviewEvidence, {...base, issue:{file_path:'a.ts'}}))
    expect(html).not.toContain('발생 조건')
    expect(html).not.toContain('근거 줄')
  })
  it('escapes untrusted explanations and links each line to the exact head', async () => {
    const html = await renderToString(createSSRApp(AIReviewEvidence, {...base, issue:{file_path:'src/a.ts', trigger:'<script>bad()</script>', consequence:'null 역참조', assumptions:['입력 경계 미확인'], evidence_lines:[2,5]}}))
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
    expect(html).toContain('미확인 전제')
    expect(html).toContain(`/blob/${base.headSha}/src/a.ts#L2`)
    expect(html).toContain(`/blob/${base.headSha}/src/a.ts#L5`)
    expect(html).toContain('실제 동작을 검증한 결과는 아닙니다.')
  })
})
