import { describe, expect, it } from 'vitest'
import { createSSRApp } from 'vue'
import { renderToString } from 'vue/server-renderer'
import AIReviewCoverage from '../src/features/analysis/AIReviewCoverage.vue'

const base = { githubUrl: 'https://github.com/owner/repo/pull/1', headSha: 'a'.repeat(40) }
describe('AI review coverage', () => {
  it('explains absent historical metadata without inventing file mappings', async () => {
    const html = await renderToString(createSSRApp(AIReviewCoverage, base))
    expect(html).toContain('당시의 파일 목록과 제외 사유는 확인할 수 없습니다.')
    expect(html).not.toContain('<details')
  })
  it('renders file identifiers, pinned links, exclusions and unfetched counts safely', async () => {
    const html = await renderToString(createSSRApp(AIReviewCoverage, { ...base, coverage: {
      files: [{file_id:'f1',file_path:'src/a.py',provided_lines:12}],
      excluded: [{file_path:'<script>alert(1)</script>.py',reason:'PATCH_TOO_LARGE'}, {file_path:null,reason:'SENSITIVE_PATH'}],
      unfetched_files:5,
    }}))
    expect(html).toContain('f1')
    expect(html).toContain(`/blob/${base.headSha}/src/a.py`)
    expect(html).toContain('제공 12줄')
    expect(html).toContain('파일 변경 코드가 8KiB 초과')
    expect(html).toContain('파일 이름 비공개')
    expect(html).toContain('5개 파일은 가져오지 않아')
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
  })
  it('distinguishes unknown total from a complete fetched list', async () => {
    const html = await renderToString(createSSRApp(AIReviewCoverage, {...base, coverage:{files:[],excluded:[],unfetched_files:null}}))
    expect(html).toContain('전체 변경 파일 수를 확인하지 못했습니다.')
    expect(html).toContain('가져온 변경 파일 중 제외한 파일이 없습니다.')
  })
})
