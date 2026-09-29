import { afterEach, describe, expect, it, vi } from 'vitest'
import { createSSRApp } from 'vue'
import { renderToString } from 'vue/server-renderer'
import StatusBadge from '../src/shared/ui/StatusBadge.vue'
import AIReviewCoverage from '../src/features/analysis/AIReviewCoverage.vue'
import ReviewIssueCard from '../src/features/analysis/ReviewIssueCard.vue'
import AnalysisPanel from '../src/features/analysis/AnalysisPanel.vue'
import AIReviewPanel from '../src/features/analysis/AIReviewPanel.vue'
import PullRequestDetail from '../src/features/workspace/PullRequestDetail.vue'
import WorkspacePanel from '../src/features/workspace/WorkspacePanel.vue'
import LoginView from '../src/app/LoginView.vue'
import { authClient, ApiError } from '../src/features/auth/api'
import { displayLabel, displayTime, userMessage, UserFacingError } from '../src/shared/presentation'
import { activityLabel, mergeLabel, ownershipTransferMessage, syncErrorLabel } from '../src/features/workspace/presentation'
import { renderFixture } from './helpers/componentHarness'

// Load API fixtures through the component's real setup and render function.
// SSR has no mounted hook, so await that read-only loading in its prefetch phase.
vi.mock('vue', async original => {
  const vue = await original<typeof import('vue')>()
  return {...vue, onMounted(fn: () => unknown) {
    vue.onServerPrefetch(async () => { await fn(); await new Promise(resolve => setImmediate(resolve)) })
  }}
})
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })
const base = { githubUrl:'https://github.com/a/b/pull/1', headSha:'a'.repeat(40), workspaceId:'w', prId:'p', userId:'u', canManage:true, owner:true }
const unknown = 'INTERNAL_COLUMN_FUTURE'
const run = { id:'analysis-id', pr_id:'p', requested_by:'u', status:'COMPLETED', head_sha:base.headSha, base_sha:'b'.repeat(40), generation:0, rule_set_version:'static-version', coverage_status:'PARTIAL', coverage_reason:'FILE_SIZE_LIMIT', total_files:2, included_files:1, excluded_files:1, failed_files:0, not_evaluated_rules:1, finding_count:1, created_at:'2026-09-27T01:00:00Z', error_code:null }
const issue = { key:'issue-key', file_path:'src/reason_code.ts', line:2, title:'호출 경로 확인', severity:'WARNING', basis:'SUPPORTED', evidence:'reason_code 변수를 확인', suggestion:'조건 추가', consequence:'예외 발생' }
const render = (component: any, props: any) => renderToString(createSSRApp(component, props))

describe('user language at protocol boundaries', () => {
  it.each([
    ['ACTIVE','연결됨'],['SUSPENDED','권한 확인 필요'],['DISCONNECTED','연결 해제됨'],
    ['OPEN','열림'],['CLOSED','닫힘'],['MERGED','코드 반영됨'],['DRAFT','초안'],
    ['PENDING','대기 중'],['RUNNING','진행 중'],['COMPLETED','완료'],['FAILED','실패'],['CANCELED','취소됨'],
    ['OWNER','소유자'],['ADMIN','관리자'],['MEMBER','멤버'],
  ])('renders %s as %s in the actual badge', async (value, expected) => {
    const html = await render(StatusBadge, {value})
    expect(html).toContain(expected); expect(html).not.toContain(value)
  })
  it.each([unknown,'toString','constructor','__proto__',''])('does not echo or misclassify an unknown value: %s', async value => {
    expect(await render(StatusBadge,{value})).toContain('상태 확인 필요')
    expect(displayLabel({OPEN:'열림'},value,'미확인')).toBe('미확인')
    expect(mergeLabel(value)).toBe('코드 반영 여부 미확인')
  })
  it.each([['APPROVED','승인됨'],['CHANGES_REQUESTED','수정 요청됨'],['COMMENTED','의견 남김'],['PENDING','작성 중'],['DISMISSED','승인·의견 효력 해제됨'],[unknown,'리뷰 상태 확인 필요']])('translates GitHub review %s', (value, expected) => {
    expect(activityLabel('reviews',value,'db-id')).toBe(expected)
  })
  it('keeps commit hashes and never uses an internal activity id as display text', () => {
    expect(activityLabel('commits','COMMIT',base.headSha)).toBe('커밋 aaaaaaaaaaaa')
    expect(activityLabel('commits','COMMIT','database-uuid')).toBe('커밋 기록')
    expect(activityLabel('comments','COMMENT','database-uuid')).toBe('대화에 남긴 의견')
    expect(ownershipTransferMessage).toContain('관리자'); expect(ownershipTransferMessage).not.toContain('ADMIN')
    expect(syncErrorLabel('GITHUB_RATE_LIMIT')).toContain('요청 한도')
    expect(syncErrorLabel(unknown)).not.toContain(unknown)
  })
  it('only displays authored error messages; hides network, JSON and server details', () => {
    for (const error of [new TypeError('Failed to fetch'),new SyntaxError('Unexpected token <'),new Error('SQL column user_id'),{message:'backend stack'}]) expect(userMessage(error,'연결 확인')).toBe('연결 확인')
    expect(userMessage(new UserFacingError('사용자명 확인'),'기본')).toBe('사용자명 확인')
    expect(userMessage(new ApiError('DENIED','권한을 확인하세요.'),'기본')).toBe('권한을 확인하세요.')
    expect(displayTime('bad-date')).toBe('시간 정보 확인 필요')
    expect(displayTime(null)).toBe('시간 정보 없음')
  })
  it('translates new context reasons and hides unknown codes while preserving user code paths', async () => {
    const html = await render(AIReviewCoverage,{...base,coverage:{files:[{file_id:'f1',file_path:issue.file_path,provided_lines:12},{file_id:'c1',file_path:'related.ts',provided_lines:5,role:'related'},{file_id:'private-id',file_path:'future.ts',provided_lines:2,role:unknown}],excluded:[{file_path:'large.py',reason:'NO_HEAD_LINES'},{file_path:null,reason:unknown}],unfetched_files:0,context_notes:[{file_id:'f1',reason:'SYNTAX_PARTIAL'},{file_id:'f1',reason:'CONTEXT_UNAVAILABLE'},{file_id:'private-id',reason:unknown},{file_id:'f1',reason:'constructor'}]}})
    for (const forbidden of ['SYNTAX_PARTIAL','CONTEXT_UNAVAILABLE','NO_HEAD_LINES',unknown,'private-id','function Object']) expect(html).not.toContain(forbidden)
    expect(html).toContain('일부 코드 구조를 읽지 못해'); expect(html).toContain('주변 코드를 수집하지 못해')
    expect(html).toContain('이유 확인 필요'); expect(html).toContain(issue.file_path)
    expect(html).toContain('관련 파일'); expect(html).toContain('파일 유형 미확인'); expect(html).toContain('참조 번호 미확인')
  })
  it.each([unknown, ''])('unknown personal feedback %s is not rendered as open or blank', async state => {
    const html = await render(ReviewIssueCard,{...base,runId:'r',issue,question:false,feedback:{key:'k',state,note:''}})
    expect(html).toContain('검토 상태 확인 필요'); expect(html).toMatch(/button[^>]*disabled[^>]*>메모 저장/)
    expect(html).toContain(issue.evidence)
  })
})

describe('API fixtures through rendered Vue screens', () => {
  async function mounted(component: any, props: Record<string,unknown>, path?: string) {
    return renderFixture(component,props,path)
  }
  it('analysis findings, file statuses, reasons, confidence and history all translate/fallback', async () => {
    vi.spyOn(authClient,'request').mockImplementation(async path => {
      if (path.endsWith('/analyses')) return {items:[run],active_rules:['COM-001'],runner_enabled:true}
      if (path.endsWith('/findings')) return {items:[{id:'f',rule_id:'COM-001',severity:unknown,confidence:unknown,scope_location:unknown,file_path:issue.file_path,start_line:2,end_line:2,sanitized_message:'사용자 코드의 reason_code'}],next_cursor:null}
      if (path.endsWith('/files')) return {items:[{id:'file',file_path:issue.file_path,status:unknown,reason_code:unknown,rule_outcomes:[{rule_id:'COM-001',status:unknown}]}]}
      throw Error(`Unexpected path ${path}`)
    })
    const view = await mounted(AnalysisPanel,{...base,mode:'static'})
    const text = view.text()
    expect(text).toContain('파일 용량 제한 초과'); expect(text).toContain('일부만 점검됨')
    for (const label of ['중요도 미확인','판단의 확실성 미확인','발견 위치 범위 미확인','파일 점검 상태 확인 필요','점검하지 못한 이유 확인 필요','점검 여부 확인 필요']) expect(text).toContain(label)
    expect(text).not.toContain(unknown); expect(text).not.toContain('PARTIAL'); expect(text).not.toContain('COMPLETED')
    expect(text).toContain('reason_code'); expect(text).toContain('COM-001')
    const settings = [...view.html.matchAll(/<details\b([^>]*)><summary\b[^>]*>([\s\S]*?)<\/summary>/g)]
      .find(([, , content]) => content.replace(/<[^>]*>/g, '').includes('점검에 사용한 설정'))
    expect(settings).toBeDefined()
    expect(settings![1]).not.toMatch(/\bopen\b/)
  })
  it.each(['FAILED',unknown])('does not leak errors or unknown analysis state %s', async status => {
    vi.spyOn(authClient,'request').mockResolvedValue({items:[{...run,status,error_code:unknown,coverage_reason:unknown,coverage_status:unknown,created_at:'bad-date'}],active_rules:[],runner_enabled:true})
    const view = await mounted(AnalysisPanel,{...base,mode:'static'})
    expect(view.text()).not.toContain(unknown)
    expect(view.text()).toContain('코드 점검을 완료하지 못했어요.')
    expect(view.text()).toContain('시간 정보 확인 필요')
    if (status===unknown) expect(view.text()).toContain('점검 상태 확인 필요')
  })
  it.each([AnalysisPanel,AIReviewPanel])('contains native exceptions at the rendered screen boundary', async component => {
    vi.spyOn(authClient,'request').mockRejectedValue(new SyntaxError('SQL internal_column invalid JSON'))
    const view = await mounted(component,{...base,analysisId:'a',mode:'static'})
    expect(view.text()).toContain('연결 상태를 확인하고 다시 시도해 주세요.')
    expect(view.text()).not.toMatch(/SQL|internal_column|invalid JSON/)
  })
  it('AI history, unknown error, modules and coverage never echo protocol codes', async () => {
    vi.spyOn(authClient,'request').mockImplementation(async path => path.endsWith('/feedback') ? {items:[]} : {items:[{id:'r',status:unknown,head_sha:base.headSha,created_at:'2026-09-27',generation:0,error_code:unknown,input_tokens:10,output_tokens:10,prompt_version:'rh-version',result:{summary:'사용자 코드의 reason_code 확인',issues:[],reviewed_files:0,omitted_files:0,limitations:'제한된 코드 검토',scope:'제공 코드 범위',harness:{version:'v',modules:['core',unknown,'constructor'],system_digest:'hash'}}}],enabled:true,model:'DeepSeek',daily_limit:5})
    const view = await mounted(AIReviewPanel,{...base,analysisId:'a'})
    expect(view.text()).not.toContain(unknown); expect(view.text()).not.toContain('function Object')
    expect(view.text()).toContain('리뷰 상태 확인 필요'); expect(view.text()).toContain('공통 원칙, 상세 이름 미확인')
    expect(view.text()).toContain('reason_code')
  })
  it.each([undefined, 'NO_CANDIDATES', 'FUTURE_STATUS', 'CHECKED'])('only claims an additional AI check for completed verification: %s', async status => {
    vi.spyOn(authClient,'request').mockImplementation(async path => path.endsWith('/feedback') ? {items:[]} : {
      items:[{...run, id:'r', input_tokens:10, output_tokens:10, prompt_version:'rh-version', result:{
        summary:'검토 결과', issues:[], questions:[], reviewed_files:1, omitted_files:0,
        limitations:'제공 코드 범위', scope:'실행 미검증',
        ...(status ? {verification:{status,kept:1,revised:2,dropped:3}} : {}),
      }}], enabled:true, model:'DeepSeek', daily_limit:30,
    })
    const view = await mounted(AIReviewPanel,{...base,analysisId:'a'})
    const text = view.text()
    if (status === 'CHECKED') {
      expect(text).toContain('유지 1건 · 수정 2건 · 제외 3건')
      expect(text).toContain('실제 실행으로 확인한 결과는 아니에요.')
    } else {
      expect(text).not.toContain('AI가 제안의 근거를 한 차례 더 검토했어요')
    }
    expect(text).not.toContain('FUTURE_STATUS')
  })
  it('PR activity view translates review state without replacing author or title', async () => {
    vi.spyOn(authClient,'request').mockResolvedValue({items:[],active_rules:[],runner_enabled:true})
    const view = await mounted(PullRequestDetail,{...base,pr:{id:'p',pr_number:1,title:'user_id 필드 개선',state:'CLOSED',merge_status:'MERGED',author_login:'author',head_sha:base.headSha,base_sha:null},reviews:[{id:'private-id',author:'octocat',state:'CHANGES_REQUESTED',body:'',github_url:base.githubUrl}],busy:false,loadedKind:'reviews'},'/app/repositories?tab=activity')
    expect(view.text()).toContain('수정 요청됨'); expect(view.text()).toContain('user_id 필드 개선'); expect(view.text()).toContain('octocat')
    expect(view.text()).not.toContain('CHANGES_REQUESTED'); expect(view.text()).not.toContain('private-id')
  })
  it('keeps an existing static deep link while exposing plain-language tabs and actions', async () => {
    const request = vi.spyOn(authClient,'request').mockResolvedValue({items:[],active_rules:[],runner_enabled:true})
    const view = await mounted(PullRequestDetail,{...base,pr:{id:'p',pr_number:1,title:'변경 제목 원문',state:'OPEN',merge_status:'UNKNOWN',author_login:'author',head_sha:base.headSha,base_sha:null},reviews:[],busy:false,loadedKind:''},'/app/repositories?tab=static')
    for (const label of ['한눈에 보기','코드 점검','코드 리뷰','취약점','팀 규칙','변경 기록','코드 점검 시작','코드를 실행하지 않고 정해진 규칙']) expect(view.text()).toContain(label)
    expect(view.html).toMatch(/id="pr-tab-static"[^>]*aria-selected="true"/)
    expect(view.text()).not.toMatch(/정적 분석|개요|현재 PR 분석/)
    expect(view.text()).toContain('변경 제목 원문')
    expect(request).toHaveBeenCalledWith('/api/v1/workspaces/w/pull-requests/p/analyses')
  })
  it('explains AI consent and the daily reset without implying a free or automatic review', async () => {
    vi.spyOn(authClient,'request').mockResolvedValue({items:[],enabled:true,model:'deepseek-flash',daily_limit:30})
    const view = await mounted(AIReviewPanel,{...base,analysisId:'a'})
    for (const text of ['AI에 보내는 내용과 사용 한도','내 이전 검토 메모','점검 요약','팀당 하루 30회','오전 9시(한국시간)','실패·취소한 요청에도 비용','이 점검 기록에는 AI 리뷰가 없어요','AI 모델에 보내 리뷰와 근거 재검토를 받는 데 동의합니다.']) expect(view.text()).toContain(text)
    expect(view.html).toMatch(/<button disabled>.*?AI 리뷰 시작/s)
    expect(view.text()).not.toMatch(/코드 문맥|UTC 일|정적 분석|DeepSeek|deepseek-flash/i)
  })
  it('team members and pending invitations use role names and explain legacy account numbers', async () => {
    vi.stubGlobal('location',{hash:''})
    vi.spyOn(authClient,'request').mockImplementation(async path => {
      if (path==='/api/v1/github-app') return {configured:true,installation_url:'https://github.com/apps/example'}
      if (path==='/api/v1/workspaces') return {items:[{id:'w',name:'테스트 팀',role:'OWNER'}],next_cursor:null}
      if (path.endsWith('/members')) return {items:[{user_id:'u',role:'OWNER',login:'octocat'},{user_id:'hidden-id',role:unknown}],next_cursor:null}
      if (path.endsWith('/invitations')) return {items:[{id:'invitation-private-id',target_github_user_id:123,role:'ADMIN',expires_at:'2026-09-28'}],next_cursor:null}
      if (path.endsWith('/repositories')) return {items:[],next_cursor:null}
      throw Error(`Unexpected path ${path}`)
    })
    const view = await mounted(WorkspacePanel,{userId:'u'},'/app/team?team=w')
    expect(view.text()).toContain('소유자'); expect(view.text()).toContain('관리자')
    expect(view.text()).toContain('이름 미확인 멤버'); expect(view.text()).toContain('계정 번호 123')
    expect(view.text()).toContain('사용자명을 저장하지 않았어요')
    expect(view.text()).not.toMatch(/OWNER|ADMIN|INTERNAL_COLUMN_FUTURE|hidden-id|invitation-private-id|비활성 계정/)
  })
  it('workspace loading errors contain connection guidance, not parser internals', async () => {
    vi.stubGlobal('location',{hash:''})
    vi.spyOn(authClient,'request').mockRejectedValue(new TypeError('internal_user_id parse failed'))
    const view = await mounted(WorkspacePanel,{userId:'u'},'/app/team?team=w')
    expect(view.text()).toContain('연결 상태를 확인하고 다시 시도해 주세요.')
    expect(view.text()).not.toContain('internal_user_id')
  })
  it('login failures do not echo provider error query values', async () => {
    const view = await mounted(LoginView,{},'/login?auth_error=INTERNAL_COLUMN_FUTURE')
    expect(view.text()).toContain('로그인이 취소되었거나 완료되지 않았어요.')
    expect(view.text()).not.toContain(unknown)
  })
})
