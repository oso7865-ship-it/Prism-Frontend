import { afterEach, describe, expect, it, vi } from 'vitest'
import { createSSRApp } from 'vue'
import { renderToString } from 'vue/server-renderer'
import ReviewIssueCard from '../src/features/analysis/ReviewIssueCard.vue'
import { classifyReview, compareReview, compareReviewResults, type ReviewIssue } from '../src/features/analysis/reviewModel'
import { clearReturn, pendingReturn, rememberReturn, safeReturn } from '../src/features/auth/returnLocation'

const issue: ReviewIssue = { key:'key', file_path:'src/a.ts', line:2, title:'null 경계', severity:'WARNING', basis:'SUPPORTED', evidence:'분기 역참조', suggestion:'null 반환', consequence:'예외 발생' }
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })
describe('review workflow', () => {
  it('does not count uncertain or legacy claims as supported defects', () => {
    const result = classifyReview({ issues:[issue,{...issue,basis:'NEEDS_CONTEXT'},{...issue,basis:undefined}],questions:[{...issue,basis:'NEEDS_CONTEXT'}] })
    expect(result.findings).toHaveLength(1); expect(result.questions).toHaveLength(3)
  })
  it('compares identities without calling a missing finding resolved', () => {
    expect(compareReview([issue,{...issue,key:'new'}],[issue,{...issue,key:'old'}])).toEqual({added:1,repeated:1,notSeen:1})
  })
  it('includes new, repeated and no-longer-seen questions in round comparison', () => {
    const question = {...issue, basis:'NEEDS_CONTEXT'}
    expect(compareReviewResults(
      {issues:[],questions:[{...question,key:'new'},question]},
      {issues:[],questions:[question,{...question,key:'old'}]},
    )).toEqual({added:1,repeated:1,notSeen:1})
    expect(compareReviewResults({issues:[],questions:[question]},{issues:[]}))
      .toEqual({added:1,repeated:0,notSeen:0})
    expect(compareReviewResults({issues:[],questions:[question]},{issues:[question]}))
      .toEqual({added:0,repeated:1,notSeen:0})
  })
  it('renders escaped text, expandable evidence and persistent decision controls', async () => {
    const html = await renderToString(createSSRApp(ReviewIssueCard,{issue:{...issue,title:'<script>bad()</script>'},question:false,workspaceId:'w',runId:'r',githubUrl:'https://github.com/a/b/pull/1',headSha:'a'.repeat(40),feedback:{key:'key',state:'INTENDED',note:'문서 단위 락'}}))
    expect(html).toContain('&lt;script&gt;'); expect(html).not.toContain('<script>')
    expect(html).toContain('의도한 동작'); expect(html).toContain('이유와 개선 방법 보기'); expect(html).toContain('사이트에서 코드 보기')
  })
})
describe('login destination', () => {
  it.each(['//evil.test','https://evil.test','/app/../login','/app\\evil','/application','/app/%2e%2e/login','/app\n'])('rejects %s', value => expect(safeReturn(value)).toBeNull())
  it('keeps query and invitation fragments through one OAuth round trip and expires them', () => {
    const values = new Map<string,string>()
    vi.stubGlobal('sessionStorage',{getItem:(k:string)=>values.get(k),setItem:(k:string,v:string)=>values.set(k,v),removeItem:(k:string)=>values.delete(k)})
    vi.useFakeTimers(); const path='/app/team?team=team#invite=synthetic'
    rememberReturn(path); expect(pendingReturn()).toBe(path)
    clearReturn(); expect(pendingReturn()).toBeNull()
    rememberReturn('/app/repositories?repo=r&pr=p&tab=ai'); vi.advanceTimersByTime(15*60*1000+1)
    expect(pendingReturn()).toBeNull(); expect(values.size).toBe(0)
  })
})
