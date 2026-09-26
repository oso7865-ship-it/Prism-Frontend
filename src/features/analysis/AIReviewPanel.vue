<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { authClient, AuthError, ApiError } from '../auth/api'
import { sessionUser } from '../auth/session'
import { sourceLink } from './sourceLink'
import AppIcon from '../../shared/ui/AppIcon.vue'
import AIReviewCoverage, { type ReviewCoverage } from './AIReviewCoverage.vue'
type Issue = { file_path: string; line: number; severity: string; basis?: string; title: string; evidence: string; suggestion: string }
type Run = { id: string; status: string; head_sha: string; model: string; prompt_version: string; created_at: string; generation: number; input_tokens: number; output_tokens: number; usage_uncertain: boolean; error_code: string | null; result: { summary: string; issues: Issue[]; limitations: string; reviewed_files: number; omitted_files: number; scope: string; coverage?: ReviewCoverage; harness?: {version:string;modules:string[];system_digest:string} } | null }
const props = defineProps<{ workspaceId: string; analysisId: string; githubUrl: string; owner: boolean }>()
const router = useRouter(), runs = ref<Run[]>([]), current = ref<Run | null>(null)
const enabled = ref(false), loaded = ref(false), busy = ref(false), consent = ref(false), error = ref(''), model = ref(''), dailyLimit = ref(5)
const active = computed(() => !!current.value && ['PENDING','RUNNING'].includes(current.value.status))
const base = `/api/v1/workspaces/${props.workspaceId}`
const harnessLabels: Record<string,string> = {core:'공통 원칙',checks:'검토 절차',output:'판단·출력 기준',java:'Java',python:'Python',javascript:'JavaScript',typescript:'TypeScript'}
const labels: Record<string,string> = { PENDING:'대기 중', RUNNING:'AI 리뷰 중', COMPLETED:'완료', FAILED:'실패', CANCELED:'취소됨' }
const errors: Record<string,string> = { REVIEW_REPLAY_BLOCKED:'리뷰 지침 또는 모델 설정이 변경되어 이전 요청을 중단했습니다. 새 리뷰를 요청해 주세요.', NO_SAFE_CONTEXT:'크기·언어·제외 경로 조건을 충족하는 코드가 없어 AI를 호출하지 않았습니다. 다른 PR을 선택하세요.', AI_DISABLED:'AI 실행이 꺼져 있습니다.', AI_DAILY_LIMIT:'오늘의 팀 AI 리뷰 한도를 사용했습니다. UTC 자정 이후 다시 요청하세요.', REVIEW_IN_PROGRESS:'팀의 다른 AI 리뷰가 진행 중입니다. 완료 후 다시 요청하세요.', AI_TIMEOUT:'응답 시간이 초과되었습니다. 자동으로 재호출하지 않았습니다.', AI_PROVIDER_FAILED:'DeepSeek 요청에 실패했습니다. API 키·잔액·연결 상태를 확인하세요.', AI_CONTEXT_OR_OUTPUT_INVALID:'전송 가능한 코드가 없거나 AI 응답 검증에 실패했습니다.', SNAPSHOT_CHANGED:'PR 커밋이 변경되었습니다. 동기화 후 새 정적 분석을 실행하세요.', ACCESS_REVOKED:'권한 또는 저장소 연결이 변경되어 중단했습니다.', LEASE_EXPIRED:'서버가 재시작되어 실행이 중단되었습니다. 중복 호출은 하지 않았습니다.', USER_CANCELED:'리뷰를 취소했습니다.' }
let timer: ReturnType<typeof setTimeout> | undefined, disposed = false
async function action(fn:()=>Promise<void>) {
  if (busy.value || disposed) return
  busy.value=true; error.value=''; clearTimeout(timer)
  try { await fn() } catch(e) {
    if (e instanceof AuthError && e.status===401) { sessionUser.value=null; await router.replace('/login') }
    else error.value=e instanceof ApiError ? errors[e.code] || e.message : e instanceof Error ? e.message : 'AI 리뷰를 불러오지 못했습니다.'
  } finally { busy.value=false; if(!disposed && active.value && !error.value) timer=setTimeout(()=>void action(poll),2500) }
}
async function history() {
  const data=await authClient.request<{items:Run[];enabled:boolean;model:string;daily_limit:number}>(`${base}/analyses/${props.analysisId}/reviews`)
  if(disposed)return
  runs.value=data.items; enabled.value=data.enabled; model.value=data.model; dailyLimit.value=data.daily_limit; loaded.value=true
  current.value=data.items.find(r=>r.id===current.value?.id)||data.items[0]||null
}
async function poll() {
  if(!current.value)return
  const row=await authClient.request<Run>(`${base}/reviews/${current.value.id}`)
  if(disposed)return
  current.value=row; runs.value=runs.value.map(r=>r.id===row.id?row:r)
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
    <div class="section-heading"><div><p class="eyebrow">DEEPSEEK · AI REVIEW</p><h4 id="ai-review-title">AI 코드 리뷰</h4></div><span class="badge badge--accent">{{ model || 'DeepSeek' }}</span></div>
    <p class="helper">정적 분석과 별개로 변경 코드의 근거와 개선 방향을 살펴봅니다. 자동 수정이나 GitHub 게시를 하지 않습니다.</p>
    <p v-if="loaded && !enabled" class="notice">서버의 AI 리뷰가 꺼져 있습니다.</p>
    <p v-if="!owner" class="helper">첫 버전에서는 팀 소유자만 코드 전송에 동의하고 요청할 수 있습니다.</p>
    <details class="ai-disclosure"><summary>전송 범위와 사용 한도</summary><p class="helper">변경 파일 첫 100개 중 조건에 맞는 최대 8개 파일의 변경·주변 코드와 정적 분석 요약을 DeepSeek에 전송합니다. 파일당 패치 8KiB를 초과하면 제외합니다. 입력 24KiB, 출력 2,000토큰, 팀당 UTC 일 {{ dailyLimit }}회입니다. 비밀 의심 파일을 제외하지만 모든 비밀을 탐지할 수는 없습니다. 기밀 코드 전송 권한을 먼저 확인하세요. 자동 재호출은 없으며 실패·취소에도 과금될 수 있습니다.</p></details>
    <label v-if="owner && enabled && !active" class="ai-consent"><input v-model="consent" type="checkbox" :disabled="busy" /><span>이 저장소의 제한된 코드 문맥을 DeepSeek로 전송하는 데 동의합니다.</span></label>
    <div class="button-group"><button v-if="owner" :disabled="busy || !loaded || !enabled || active || !consent" @click="action(start)"><AppIcon name="pr" />{{ active ? 'AI 리뷰 진행 중' : current ? '새 AI 리뷰 요청' : 'AI 리뷰 요청' }}</button><button class="secondary" :disabled="busy" @click="action(history)">상태 새로고침</button><button v-if="owner && active" class="danger-button" :disabled="busy" @click="action(cancel)">AI 리뷰 취소</button></div>
    <p v-if="error" class="notice notice--error" role="alert">{{ error }}</p>
    <p v-if="!loaded && busy" role="status" class="helper">AI 리뷰 이력을 불러오는 중입니다.</p>
    <p v-if="loaded && !current && !error" class="empty-note">아직 AI 리뷰가 없습니다. 요청하면 이곳에 결과가 저장됩니다.</p>
    <label v-if="runs.length" class="analysis-history">AI 리뷰 이력<select :value="current?.id" :disabled="busy || active" @change="current=runs.find(r=>r.id===($event.target as HTMLSelectElement).value)||null; consent=false"><option v-for="r in runs" :key="r.id" :value="r.id">{{ new Date(r.created_at).toLocaleString('ko-KR') }} · {{ labels[r.status] }} · {{ r.generation+1 }}회차</option></select></label>
    <div v-if="current" class="ai-result" :aria-busy="busy"><p role="status"><strong>{{ labels[current.status] }}</strong><span class="helper"> · {{ current.head_sha.slice(0,12) }}</span></p><p v-if="active" class="helper">진행 상태가 자동으로 갱신됩니다. 화면을 떠나도 작업은 계속됩니다.</p><p v-if="current.error_code" class="notice">{{ errors[current.error_code] || '리뷰를 완료하지 못했습니다. 설정·권한을 확인한 뒤 새 리뷰를 요청하세요.' }}</p><p v-if="current.usage_uncertain" class="notice">외부 전송을 시도했습니다. 실패·취소된 요청의 과금 여부는 DeepSeek에서 확인하세요.</p>
      <template v-if="current.result"><h4>리뷰 요약</h4><p class="ai-prose">{{ current.result.summary }}</p><p class="helper">{{ current.result.reviewed_files }}개 파일 검토 · {{ current.result.omitted_files }}개 파일 제외</p><AIReviewCoverage :coverage="current.result.coverage" :github-url="githubUrl" :head-sha="current.head_sha" /><ul class="ai-issues"><li v-for="(issue,i) in current.result.issues" :key="i"><span class="badge">AI · {{ issue.severity==='ERROR'?'높음':issue.severity==='WARNING'?'주의':'참고' }}</span><span v-if="issue.basis" class="badge">{{ issue.basis === 'SUPPORTED' ? '제공 코드 근거' : '추가 확인 필요' }}</span><h4>{{ issue.title }}</h4><p class="ai-prose"><strong>근거</strong><br />{{ issue.evidence }}</p><p class="ai-prose"><strong>개선 제안</strong><br />{{ issue.suggestion }}</p><a :href="sourceLink(githubUrl,current.head_sha,issue.file_path,issue.line,issue.line)" target="_blank" rel="noopener noreferrer" class="finding-source">{{ issue.file_path }} · {{ issue.line }}줄 ↗</a></li></ul><p v-if="!current.result.issues.length" class="helper">제공된 문맥에서 구체적인 발견 사항이 없습니다. 코드의 안전성을 보장하지 않습니다.</p><h4>검토 한계</h4><p class="ai-prose">{{ current.result.limitations }}</p><p class="helper">{{ current.result.scope }}</p></template>
      <p class="helper">리뷰 지침 버전: {{ current.prompt_version }}<template v-if="current.result?.harness"> · 적용 지침: {{ current.result.harness.modules.map(name => harnessLabels[name] || name).join(', ') }}</template><template v-else> · 적용 지침 상세 미기록</template></p>
      <p class="helper">AI 근거 분류는 모델의 판단이며 실제 실행 검증을 뜻하지 않습니다.</p>
      <p class="helper">토큰 사용: 입력 {{ current.input_tokens }} · 출력 {{ current.output_tokens }}. AI의 제안은 사람이 코드와 함께 확인해야 합니다.</p>
    </div>
  </section>
</template>
