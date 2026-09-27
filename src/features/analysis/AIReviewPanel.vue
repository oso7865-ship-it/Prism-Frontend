<script setup lang="ts">
import { displayLabel, displayTime, userMessage } from '../../shared/presentation'
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { authClient, AuthError, ApiError } from '../auth/api'
import { sessionUser } from '../auth/session'
import { loginLocation } from '../auth/returnLocation'
import ReviewIssueCard from './ReviewIssueCard.vue'
import { classifyReview, compareReview, type ReviewFeedback, type ReviewIssue } from './reviewModel'

import AppIcon from '../../shared/ui/AppIcon.vue'
import SectionHeading from '../../shared/ui/SectionHeading.vue'
import DisclosureSummary from '../../shared/ui/DisclosureSummary.vue'
import AIReviewCoverage, { type ReviewCoverage } from './AIReviewCoverage.vue'
type Issue = ReviewIssue
type Run = { id: string; status: string; head_sha: string; model: string; prompt_version: string; created_at: string; generation: number; input_tokens: number; output_tokens: number; usage_uncertain: boolean; error_code: string | null; result: { summary: string; issues: Issue[]; questions?: Issue[]; limitations: string; reviewed_files: number; omitted_files: number; scope: string; verification?: {status:string;kept:number;revised:number;dropped:number}; coverage?: ReviewCoverage; harness?: {version:string;modules:string[];system_digest:string} } | null }
const props = defineProps<{ workspaceId: string; analysisId: string; githubUrl: string; owner: boolean }>()
const router = useRouter(), runs = ref<Run[]>([]), current = ref<Run | null>(null)
const feedback = ref<Record<string,ReviewFeedback>>({})
const grouped = computed(() => current.value?.result ? classifyReview(current.value.result) : {findings:[],questions:[]})
const previous = computed(() => { const index = runs.value.findIndex(r=>r.id===current.value?.id); return runs.value.slice(index+1).find(r=>r.status==='COMPLETED' && r.result) })
const legacy = computed(() => current.value?.result?.issues.some(i=>!i.basis) || false)
const comparison = computed(() => !legacy.value && current.value?.result && previous.value?.result && !previous.value.result.issues.some(i=>!i.basis) ? compareReview(grouped.value.findings, classifyReview(previous.value.result).findings) : null)
async function loadFeedback() { if (!current.value?.result) { feedback.value = {}; return }; const id=current.value.id; const data=await authClient.request<{items:ReviewFeedback[]}>(`${base}/reviews/${id}/feedback`); if (!disposed && current.value?.id===id) feedback.value=Object.fromEntries(data.items.map(f=>[f.key,f])) }
function savedFeedback(value:ReviewFeedback) { feedback.value={...feedback.value,[value.key]:value} }
const enabled = ref(false), loaded = ref(false), busy = ref(false), consent = ref(false), error = ref(''), dailyLimit = ref(30)
const active = computed(() => !!current.value && ['PENDING','RUNNING'].includes(current.value.status))
const base = `/api/v1/workspaces/${props.workspaceId}`
const harnessLabels: Record<string,string> = {core:'공통 원칙',checks:'검토 절차',output:'판단·출력 기준',java:'Java',python:'Python',javascript:'JavaScript',typescript:'TypeScript'}
const labels: Record<string,string> = { PENDING:'대기 중', RUNNING:'AI 리뷰 중', COMPLETED:'완료', FAILED:'실패', CANCELED:'취소됨' }
const errors: Record<string,string> = { REVIEW_REPLAY_BLOCKED:'리뷰 지침 또는 모델 설정이 변경되어 이전 요청을 중단했습니다. 새 리뷰를 요청해 주세요.', NO_SAFE_CONTEXT:'검토할 수 있는 코드가 없어 AI에 요청하지 않았어요. 파일 크기와 지원 언어를 확인하거나 다른 변경 요청을 선택해 주세요.', AI_DISABLED:'지금은 AI 리뷰를 사용할 수 없어요. 서비스 관리자에게 문의해 주세요.', AI_DAILY_LIMIT:'오늘 사용할 수 있는 팀 AI 리뷰 횟수를 모두 사용했어요. 다음 오전 9시(한국시간) 이후 다시 요청해 주세요.', REVIEW_IN_PROGRESS:'팀의 다른 AI 리뷰가 진행 중입니다. 완료 후 다시 요청하세요.', AI_TIMEOUT:'AI 답변을 기다리는 시간이 너무 길어 중단했어요. 자동으로 다시 요청하지는 않았어요.', AI_PROVIDER_FAILED:'AI 서비스에 연결하지 못했어요. 서비스 관리자에게 연결 설정과 사용 가능한 잔액 확인을 요청해 주세요.', AI_CONTEXT_OR_OUTPUT_INVALID:'보낼 수 있는 코드가 없거나 AI 답변이 결과 표시 기준을 충족하지 못했어요.', SNAPSHOT_CHANGED:'변경 요청의 코드가 바뀌었어요. 최신 요청을 가져온 뒤 코드 점검을 다시 진행해 주세요.', ACCESS_REVOKED:'권한 또는 저장소 연결이 변경되어 중단했습니다.', LEASE_EXPIRED:'서버가 다시 시작되면서 리뷰가 중단됐어요. AI에 중복으로 요청하지는 않았어요.', USER_CANCELED:'리뷰를 취소했습니다.' }
let timer: ReturnType<typeof setTimeout> | undefined, disposed = false
async function action(fn:()=>Promise<void>) {
  if (busy.value || disposed) return
  busy.value=true; error.value=''; clearTimeout(timer)
  try { await fn() } catch(e) {
    if (e instanceof AuthError && e.status===401) { sessionUser.value=null; await router.replace(loginLocation(router.currentRoute.value.fullPath)) }
    else error.value=e instanceof ApiError ? displayLabel(errors, e.code, e.message) : userMessage(e, 'AI 리뷰를 불러오지 못했습니다. 연결 상태를 확인하고 다시 시도해 주세요.')
  } finally { busy.value=false; if(!disposed && active.value && !error.value) timer=setTimeout(()=>void action(poll),2500) }
}
async function history() {
  const data=await authClient.request<{items:Run[];enabled:boolean;model:string;daily_limit:number}>(`${base}/analyses/${props.analysisId}/reviews`)
  if(disposed)return
  runs.value=data.items; enabled.value=data.enabled; dailyLimit.value=data.daily_limit; loaded.value=true
  current.value=data.items.find(r=>r.id===current.value?.id)||data.items[0]||null; await loadFeedback()
}
async function poll() {
  if(!current.value)return
  const row=await authClient.request<Run>(`${base}/reviews/${current.value.id}`)
  if(disposed)return
  current.value=row; runs.value=runs.value.map(r=>r.id===row.id?row:r); if(row.status==='COMPLETED') await loadFeedback()
}
async function start() {
  const row=await authClient.request<Run>(`${base}/analyses/${props.analysisId}/reviews`,{method:'POST',body:JSON.stringify({consent:consent.value,...(current.value?{rerun_of:current.value.id}:{})})})
  if(disposed)return
  current.value=row;consent.value=false;await history()
}
async function cancel() {
  if(!current.value)return
  const row=await authClient.request<Run>(`${base}/reviews/${current.value.id}/cancel`,{method:'POST'})
  if(!disposed)current.value=row
}
onMounted(()=>void action(history))
onUnmounted(()=>{disposed=true;clearTimeout(timer)})
</script>
<template>
  <section class="ai-review-panel" aria-labelledby="ai-review-title">
    <SectionHeading title="AI 코드 리뷰" title-id="ai-review-title" icon="pr" eyebrow="AI · 코드 리뷰"><span class="badge badge--accent">AI 지원</span></SectionHeading>
    <p class="helper">AI가 변경 코드와 제공된 주변 코드를 읽고 개선할 부분을 제안해요. 코드를 직접 고치거나 GitHub에 글을 올리지는 않아요.</p>
    <p v-if="loaded && !enabled" class="notice">지금은 AI 리뷰를 사용할 수 없어요. 서비스 관리자에게 문의해 주세요.</p>
    <p v-if="!owner" class="helper">팀 소유자가 코드 전송에 동의하면 AI 리뷰를 시작할 수 있어요.</p>
    <details class="ai-disclosure"><DisclosureSummary>AI에 보내는 내용과 사용 한도</DisclosureSummary><p class="helper">처음 가져온 변경 파일 100개 중 최대 8개 파일과 관련 파일 최대 4개의 일부 코드, 내 이전 검토 메모, 코드 점검 요약을 AI 모델에 보내요. 변경 내용이 파일당 16KiB(16,384바이트)를 넘으면 제외해요. 코드 입력은 전체 48KiB 이내예요. 개선 제안이 있으면 같은 코드와 초안을 AI에 한 번 더 보내 근거를 검토해요. 요청당 최대 2회 호출하며 각 답변은 최대 2,000토큰이에요. 팀당 하루 {{ dailyLimit }}회 사용할 수 있어요. 한도는 매일 오전 9시(한국시간)에 초기화돼요. 비밀정보가 의심되는 파일을 제외하지만 놓치는 내용이 있을 수 있으니 전송 권한을 확인해 주세요. 자동으로 다시 요청하지 않으며 실패·취소한 요청에도 비용이 생길 수 있어요.</p></details>
    <label v-if="owner && enabled && !active" class="ai-consent"><input v-model="consent" type="checkbox" :disabled="busy" /><span>변경 코드와 관련 코드 일부, 내 이전 검토 메모와 점검 요약을 AI 모델에 보내 리뷰와 근거 재검토를 받는 데 동의합니다.</span></label>
    <div class="button-group"><button v-if="owner" :disabled="busy || !loaded || !enabled || active || !consent" @click="action(start)"><AppIcon name="pr" />{{ active ? 'AI 리뷰 진행 중' : current ? 'AI 리뷰 다시 받기' : 'AI 리뷰 시작' }}</button><button class="secondary" :disabled="busy" @click="action(history)">진행 상황 다시 확인</button><button v-if="owner && active" class="danger-button" :disabled="busy" @click="action(cancel)">AI 리뷰 취소</button></div>
    <p v-if="error" class="notice notice--error" role="alert">{{ error }}</p>
    <p v-if="!loaded && busy" role="status" class="helper">AI 리뷰 기록을 불러오는 중입니다.</p>
    <p v-if="loaded && !current && !error" class="empty-note">이 점검 기록에는 AI 리뷰가 없어요. 다른 점검 기록을 선택하거나 AI 리뷰를 시작해 주세요.</p>
    <label v-if="runs.length" class="analysis-history">AI 리뷰 기록<select :value="current?.id" :disabled="busy || active" @change="current=runs.find(r=>r.id===($event.target as HTMLSelectElement).value)||null; consent=false; feedback={}; action(loadFeedback)"><option v-for="r in runs" :key="r.id" :value="r.id">{{ displayTime(r.created_at) }} · {{ displayLabel(labels, r.status, '리뷰 상태 확인 필요') }} · {{ r.generation+1 }}회차</option></select></label>
    <div v-if="current" class="ai-result" :aria-busy="busy"><p role="status"><strong>{{ displayLabel(labels, current.status, '리뷰 상태 확인 필요') }}</strong><span class="helper"> · {{ current.head_sha.slice(0,12) }}</span></p><p v-if="active" class="helper">진행 상황이 자동으로 바뀌어요. 다른 화면으로 이동해도 리뷰는 계속돼요.</p><p v-if="current.error_code" class="notice">{{ displayLabel(errors, current.error_code, '리뷰를 완료하지 못했습니다. 설정·권한을 확인한 뒤 새 리뷰를 요청하세요.') }}</p><p v-if="current.usage_uncertain" class="notice">AI 모델에 요청을 보내려고 시도했어요. 실패·취소한 요청의 비용은 AI 서비스 사용 내역에서 확인해 주세요.</p>
      <template v-if="current.result">
        <p v-if="legacy" class="notice">이전에 만든 리뷰는 제안과 질문을 구분하지 않았어요. 원래 내용을 아래 질문 영역에서 확인할 수 있어요.</p><section class="review-summary"><p class="eyebrow">리뷰 요약</p><h4>이번 변경의 리뷰</h4><p class="ai-prose">{{ current.result.summary }}</p><dl class="overview-metrics"><div><dt>개선 제안</dt><dd>{{ grouped.findings.length }}건</dd></div><div><dt>추가 확인 질문</dt><dd>{{ grouped.questions.length }}건</dd></div><div><dt>검토 파일</dt><dd>{{ current.result.reviewed_files }}개</dd></div></dl></section>
        <p v-if="current.result.verification?.status === 'CHECKED'" class="helper">AI가 제안의 근거를 한 차례 더 검토했어요 · 유지 {{ current.result.verification.kept }}건 · 수정 {{ current.result.verification.revised }}건 · 제외 {{ current.result.verification.dropped }}건. 실제 실행으로 확인한 결과는 아니에요.</p>
        <p v-if="comparison" class="review-comparison">이전 리뷰와 비교 · 새로 나온 항목 {{ comparison.added }} · 다시 나온 항목 {{ comparison.repeated }} · 이번에는 나오지 않은 항목 {{ comparison.notSeen }}<span class="helper">파일 경로와 제목을 기준으로 비교해요. 이번에 나오지 않았어도 해결됐다고 판단할 수는 없어요.</span></p>
        <h4 class="review-section-title"><span>코드를 바탕으로 한 개선 제안</span><span class="count">{{ grouped.findings.length }}</span></h4><p class="helper">AI가 받은 코드를 바탕으로 제안했어요. 실제로 문제가 되는지 해당 코드와 판단 이유를 함께 확인해 주세요.</p>
        <ul class="review-cards"><ReviewIssueCard v-for="issue in grouped.findings" :key="current.id+issue.key" :issue="issue" :question="false" :workspace-id="workspaceId" :run-id="current.id" :github-url="githubUrl" :head-sha="current.head_sha" :feedback="feedback[issue.key]" @saved="savedFeedback" /></ul>
        <p v-if="!grouped.findings.length" class="empty-note">받은 코드에서 근거가 충분한 개선점을 찾지 못했어요. 추가 질문과 살펴본 파일도 확인해 주세요.</p>
        <details v-if="grouped.questions.length" class="review-questions"><DisclosureSummary>추가 확인이 필요한 질문 <span class="count">{{ grouped.questions.length }}</span></DisclosureSummary><p class="helper">정보가 더 필요해 개선 제안 수에는 포함하지 않았어요. 이전 리뷰에서 분류하지 않았던 항목도 이곳에 모았어요.</p><ul class="review-cards"><ReviewIssueCard v-for="issue in grouped.questions" :key="current.id+issue.key" :issue="issue" :question="true" :workspace-id="workspaceId" :run-id="current.id" :github-url="githubUrl" :head-sha="current.head_sha" :feedback="feedback[issue.key]" @saved="savedFeedback" /></ul></details>
        <details class="review-scope"><DisclosureSummary>AI가 살펴본 범위 · 제외 {{ current.result.omitted_files }}개</DisclosureSummary><AIReviewCoverage :coverage="current.result.coverage" :github-url="githubUrl" :head-sha="current.head_sha" /><p class="ai-prose">{{ current.result.limitations }}</p><p class="helper">{{ current.result.scope }}</p></details>
      </template>
      <details class="ai-disclosure"><DisclosureSummary>리뷰에 사용한 설정</DisclosureSummary><p class="helper">AI 검토 기준 버전: {{ current.prompt_version }}<template v-if="current.result?.harness"> · 사용한 검토 기준: {{ current.result.harness.modules.map(name => displayLabel(harnessLabels, name, '상세 이름 미확인')).join(', ') }}</template><template v-else> · 검토 기준 상세 기록 없음</template></p></details>
      <p class="helper">AI의 제안은 코드 실행으로 확인한 결과가 아니에요. 실제 코드와 함께 검토해 주세요.</p>
      <p class="helper">AI 사용량: 보낸 내용 {{ current.input_tokens }}토큰 · 받은 답변 {{ current.output_tokens }}토큰. 토큰은 AI가 처리한 글의 양을 세는 단위예요.</p>
    </div>
  </section>
</template>
