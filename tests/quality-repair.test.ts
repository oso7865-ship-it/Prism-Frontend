import { describe, expect, it } from 'vitest'
import { createSSRApp } from 'vue'
import { renderToString } from 'vue/server-renderer'
import ReviewSuggestionCheck from '../src/features/analysis/ReviewSuggestionCheck.vue'
import ReviewVerification from '../src/features/analysis/ReviewVerification.vue'
import IndependentSecurityEvidence from '../src/features/analysis/IndependentSecurityEvidence.vue'
import ReviewIssueCard from '../src/features/analysis/ReviewIssueCard.vue'

const base = { workspaceId:'w', runId:'r', headSha:'a'.repeat(40), githubUrl:'https://github.com/a/b/pull/1' }
describe('quality repair evidence presentation', () => {
  it('labels finite code calculations separately without exposing internal origin names', async () => {
    const html = await renderToString(createSSRApp(ReviewIssueCard, {...base,question:false,issue:{key:'k',file_path:'a.py',line:2,severity:'WARNING',basis:'SUPPORTED',origin:'STATIC_PROJECTION',title:'기대값과 계산의 차이',evidence:'실행 결과는 아니에요.',suggestion:'정상 입력도 확인하세요.'}}))
    expect(html).toContain('코드 계산에서 발견한 차이')
    expect(html).toContain('실행 결과는 아니에요.')
    expect(html).not.toContain('STATIC_PROJECTION')
  })
  it('separates sampled preservation from a verified fix and escapes inputs', async () => {
    const html = await renderToString(createSSRApp(ReviewSuggestionCheck, {check:{status:'CHANGES_SUCCESSFUL_SAMPLES',samples:4,counterexamples:[{inputs:{n:'<script>'},before:{value:[0]},after:{value:[0,1,2]}}]}}))
    expect(html).toContain('기존에 반환하던 값도 바뀌어요')
    expect(html).toContain('보장하지는 않아요')
    expect(html).not.toContain('<script>')
    expect(html).not.toContain('CHANGES_SUCCESSFUL_SAMPLES')
  })
  it('unknown or historical suggestion checks do not claim verification', async () => {
    expect(await renderToString(createSSRApp(ReviewSuggestionCheck, {}))).not.toContain('확인했어요')
    const html = await renderToString(createSSRApp(ReviewSuggestionCheck, {check:{status:'FUTURE_INTERNAL_CODE',samples:0}}))
    expect(html).toContain('아직 확인하지 않았어요')
    expect(html).not.toContain('FUTURE_INTERNAL_CODE')
  })
  it('shows new discovery separately from draft decisions and exposes file scope', async () => {
    const html = await renderToString(createSSRApp(ReviewVerification,{...base,empty:false,verification:{status:'CHECKED',kept:0,revised:0,dropped:1,added:1,file_checks:[{file_id:'f1',file_path:'a.py',line:2,outcome:'FINDING',observation:'경계 검토'}]}}))
    expect(html).toContain('제외 1건 · 새로 발견 1건')
    expect(html).toContain('2줄 코드 보기')
  })
  it('recovered malformed drafts are not described as a clean first pass', async () => {
    const html = await renderToString(createSSRApp(ReviewVerification,{...base,empty:true,verification:{status:'OUTPUT_RECOVERED',file_checks:[{file_id:'f1',file_path:'a.py',line:1,outcome:'LIMITED',observation:'범위 부족'}]}}))
    expect(html).toContain('처음 답변을 읽지 못해')
    expect(html).toContain('문맥 부족')
    expect(html).not.toContain('OUTPUT_RECOVERED')
  })
  it('independent findings survive an empty AI result without claiming exploitation', async () => {
    const html = await renderToString(createSSRApp(IndependentSecurityEvidence,{...base,items:[{rule_id:'PY-INPUT-SHELL-1',file_id:'f1',file_path:'src/a.py',line:5,source_line:4,title:'요청 입력 전달',detail:'제공 범위의 경로'}]}))
    expect(html).toContain('AI 답변과 별도로')
    expect(html).toContain('실제 공격 가능성은')
    expect(html).toContain('입력 전달 경로 보기')
    expect(html).not.toContain('PY-INPUT-SHELL-1')
  })
})
