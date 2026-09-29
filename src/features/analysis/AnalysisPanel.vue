<script setup lang="ts">
import { displayLabel, displayTime, userMessage } from '../../shared/presentation'
import { analysisStatus, severityLabels, fileLabels, reasonLabels, scopeLabels, confidenceLabels, ruleStatusLabels } from './presentation'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { AuthError, authClient } from '../auth/api'
import { sessionUser } from '../auth/session'
import { loginLocation } from '../auth/returnLocation'
import StatusBadge from '../../shared/ui/StatusBadge.vue'
import AppIcon from '../../shared/ui/AppIcon.vue'
import SectionHeading from '../../shared/ui/SectionHeading.vue'
import DisclosureSummary from '../../shared/ui/DisclosureSummary.vue'
import AIReviewPanel from './AIReviewPanel.vue'
import SecuritySignals from './SecuritySignals.vue'
import { sourceLink } from './sourceLink'
import { analysisErrors, coverageLabels, severityRank, type AnalysisRun, type Finding, type FileResult } from './types'

const props = defineProps<{ workspaceId: string; prId: string; headSha: string | null; userId: string; canManage: boolean; owner: boolean; githubUrl: string; repositoryId?: string; mode?: 'overview' | 'static' | 'ai' | 'security' | 'standards' }>()
const aiMode = computed(() => ['ai', 'security', 'standards'].includes(props.mode || ''))
const purpose = computed(() => props.mode === 'security' ? 'SECURITY' : props.mode === 'standards' ? 'STANDARDS' : 'CODE')
const emit = defineEmits<{ navigate: [tab: 'static' | 'ai']; standards: [] }>()
const router = useRouter(), route = useRoute()
const runs = ref<AnalysisRun[]>([]), current = ref<AnalysisRun | null>(null)
const findings = ref<Finding[]>([]), files = ref<FileResult[]>([]), cursor = ref<string | null>(null)
const busy = ref(false), error = ref(''), loaded = ref(false), enabled = ref(false), severity = ref('ALL'), rules = ref<string[]>([])
const polling = ref(false)
let disposed = false, timer: ReturnType<typeof setTimeout> | undefined
const base = `/api/v1/workspaces/${props.workspaceId}`
const active = computed(() => current.value && ['PENDING', 'RUNNING'].includes(current.value.status))
const canCancel = computed(() => props.canManage || current.value?.requested_by === props.userId)
const visible = computed(() => findings.value.filter(f => severity.value === 'ALL' || f.severity === severity.value).sort((a,b) => (severityRank[a.severity] ?? 4)-(severityRank[b.severity] ?? 4) || a.file_path.localeCompare(b.file_path) || (a.start_line ?? 0)-(b.start_line ?? 0)))
const fileName = (path: string) => path.split('/').pop() || path
const directory = (path: string) => path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : ''
async function handleError(e: unknown) {
  if (disposed) return
  if (e instanceof AuthError && e.status===401) { sessionUser.value=null; await router.replace(loginLocation(router.currentRoute.value.fullPath)); return }
  error.value=userMessage(e, '점검 정보를 불러오지 못했어요. 연결 상태를 확인하고 다시 시도해 주세요.')
}
async function action(fn:()=>Promise<void>) {
  if (busy.value || polling.value) return
  busy.value=true; error.value=''
  try { await fn() } catch(e) { await handleError(e) } finally { busy.value=false; schedule() }
}
function schedule() {
  clearTimeout(timer)
  if (!disposed && active.value && !error.value) timer=setTimeout(()=>void poll(),2500)
}
async function results() {
  if (!current.value || current.value.status!=='COMPLETED') return
  const id=current.value.id
  const [f,p]=await Promise.all([
    authClient.request<{items:Finding[];next_cursor:string|null}>(`${base}/analyses/${id}/findings`),
    authClient.request<{items:FileResult[]}>(`${base}/analyses/${id}/files`),
  ])
  if (disposed || current.value?.id!==id) return
  findings.value=f.items; cursor.value=f.next_cursor; files.value=p.items
}
async function select(run:AnalysisRun, navigate = false) {
  clearTimeout(timer);current.value=run;findings.value=[];files.value=[];cursor.value=null
  await results()
  if (navigate && !disposed) await router.push({ path: route.path, query: { ...route.query, analysis: run.id } })
}
async function history() {
  const data=await authClient.request<{items:AnalysisRun[];active_rules:string[];runner_enabled:boolean}>(`${base}/pull-requests/${props.prId}/analyses`)
  if(disposed)return
  runs.value=data.items; rules.value=data.active_rules;enabled.value=data.runner_enabled;loaded.value=true
  const selected=data.items.find(r=>r.id===route.query.analysis) || data.items.find(r=>r.id===current.value?.id) || data.items[0]
  if(selected) await select(selected)
}
async function poll() {
  if(disposed || !current.value || busy.value || polling.value) { schedule();return }
  const id=current.value.id;polling.value=true
  try {
    const run=await authClient.request<AnalysisRun>(`${base}/analyses/${id}`)
    if(disposed || current.value?.id!==id)return
    current.value=run;runs.value=runs.value.map(r=>r.id===id?run:r)
    if(run.status==='COMPLETED')await results()
  } catch(e) {await handleError(e)} finally {polling.value=false;schedule()}
}
async function start(rerun=false) {
  const run=await authClient.request<AnalysisRun>(`${base}/analyses`,{method:'POST',body:JSON.stringify({pr_id:props.prId,...(rerun&&current.value?{rerun_of:current.value.id}:{})})})
  if(disposed)return
  await select(run, true);await history()
}
async function cancel() {
  if(!current.value || !confirm('진행 중인 코드 점검을 취소할까요?'))return
  current.value=await authClient.request<AnalysisRun>(`${base}/analyses/${current.value.id}/cancel`,{method:'POST'})
  await history()
}
async function more() {
  if(!current.value || !cursor.value)return
  const data=await authClient.request<{items:Finding[];next_cursor:string|null}>(`${base}/analyses/${current.value.id}/findings?cursor=${encodeURIComponent(cursor.value)}`)
  if(disposed)return
  findings.value.push(...data.items);cursor.value=data.next_cursor
}
watch(() => [route.query.analysis, busy.value, polling.value] as const, ([id]) => { if (busy.value || polling.value) return; const run = runs.value.find(r => r.id === id) || runs.value[0]; if (run && run.id !== current.value?.id) void action(() => select(run)) })
onMounted(()=>void action(history))
onUnmounted(()=>{disposed=true;clearTimeout(timer)})
</script>

<template>
  <section class="analysis-panel" :aria-label="mode === 'overview' ? '점검·리뷰 요약' : mode === 'ai' ? 'AI 리뷰 기록' : '코드 점검'">
    <div v-show="mode === 'static' || (!current && aiMode)"><SectionHeading title="코드 점검" title-id="analysis-heading" icon="search" description="정해진 규칙으로 자동 확인"><span class="analysis-version">점검 기준 {{ rules.length }}개</span></SectionHeading>
    <p class="helper analysis-intro">코드를 실행하지 않고 정해진 규칙으로 살펴봐요. 확인이 필요한 부분과 코드 위치를 알려드려요.</p>
    <div class="analysis-actions">
      <button :disabled="busy || polling || !!active || !loaded || !enabled || !headSha" @click="action(()=>start(!!current && current.head_sha === headSha))"><AppIcon :name="active ? 'refresh' : 'pr'" :class="{ 'is-spinning': active }" />{{ busy ? '처리 중…' : active ? '코드 점검 중' : current && current.head_sha === headSha ? '같은 코드 다시 점검' : '코드 점검 시작' }}</button>
      <button class="secondary" :disabled="busy || polling" @click="action(history)"><AppIcon name="refresh" />결과 새로고침</button>
      <button v-if="active && canCancel" class="danger-button" :disabled="busy || polling" @click="action(cancel)">점검 취소</button>
    </div>
    <p v-if="loaded && !enabled" class="notice">지금은 코드 점검을 사용할 수 없어요. 서비스 관리자에게 문의해 주세요.</p>
    <p v-if="error" class="notice notice--error" role="alert">{{ error }}</p>
    <div v-if="!current && loaded && !error" class="analysis-empty"><span class="empty-icon"><AppIcon name="search" /></span><strong>이 변경 요청의 코드를 점검해 보세요.</strong><p class="helper">확인할 항목과 살펴본 파일을 여기에 보여드려요.</p></div>
    <label v-if="runs.length" class="analysis-history">점검 기록 <span class="helper">최근 50개</span><select :value="current?.id" :disabled="busy || polling" @change="action(()=>select(runs.find(r=>r.id===($event.target as HTMLSelectElement).value)!, true))"><option v-for="run in runs" :key="run.id" :value="run.id">{{ displayTime(run.created_at) }} · {{ analysisStatus(run.status) }} · {{ run.head_sha.slice(0,7) }}</option></select></label>
    <div v-if="current" class="analysis-result" :aria-busy="busy">
      <div class="analysis-status" :data-status="current.status" role="status"><div class="inline-group"><AppIcon :name="current.status === 'COMPLETED' ? 'check' : active ? 'refresh' : 'pr'" :class="{ 'is-spinning': active }" /><strong>{{ analysisStatus(current.status) }}</strong><StatusBadge v-if="current.coverage_status" :value="current.coverage_status" :label="displayLabel(coverageLabels, current.coverage_status, '점검 범위 확인 필요')" /></div><p v-if="active" class="helper">진행 상황이 자동으로 바뀌어요. 다른 화면으로 이동해도 점검은 계속돼요.</p><p class="helper">커밋 <code>{{ current.head_sha.slice(0,12) }}</code> · 다시 점검 {{ current.generation }}회</p></div>
      <details class="analysis-rules"><DisclosureSummary>점검에 사용한 설정</DisclosureSummary><p class="helper">점검 기준 버전: {{ current.rule_set_version }}</p></details>
      <p v-if="current.head_sha!==headSha" class="notice">현재 변경 요청과 다른 코드 버전의 결과예요.</p>
      <p v-if="current.error_code" class="notice">{{ displayLabel(analysisErrors, current.error_code, '코드 점검을 완료하지 못했어요. 연결 상태와 권한을 확인한 뒤 다시 시도해 주세요.') }}</p>
      <p v-if="current.coverage_reason" class="notice">{{ displayLabel(reasonLabels, current.coverage_reason, '일부를 점검하지 못했어요. 파일별 점검 내용에서 이유를 확인해 주세요.') }}</p>
      <template v-if="current.status==='COMPLETED'">
        <dl class="analysis-counts"><div><dt>점검한 파일</dt><dd>{{ current.included_files }}<small> / {{ current.total_files }}</small></dd></div><div><dt>건너뜀 / 가져오기·점검 실패</dt><dd>{{ current.excluded_files }}<small> / {{ current.failed_files }}</small></dd></div><div><dt>확인할 항목</dt><dd>{{ current.finding_count }}<small>건</small></dd></div></dl>
        <div class="findings-heading"><div><h4>확인할 항목 <span class="count">{{ current.finding_count }}</span></h4><p class="helper">무엇을 확인해야 하는지, 바뀐 코드와 어떤 관계인지 살펴보세요.</p></div><label class="analysis-filter"><span class="sr-only">확인할 항목 중요도</span><select v-model="severity"><option value="ALL">모든 중요도</option><option value="CRITICAL">심각</option><option value="ERROR">높음</option><option value="WARNING">주의</option><option value="INFO">참고</option></select></label></div>
        <ul class="finding-list">
          <li v-for="finding in visible" :key="finding.id" :data-severity="finding.severity">
            <div class="finding-card-heading"><span class="finding-severity" :data-severity="finding.severity">{{ displayLabel(severityLabels, finding.severity, '중요도 미확인') }}</span><code>{{ finding.rule_id }}</code><span v-if="finding.start_line" class="finding-lines">{{ finding.start_line }}{{ finding.end_line!==finding.start_line?`–${finding.end_line}`:'' }}줄</span></div>
            <p class="finding-message">{{ finding.sanitized_message }}</p>
            <div class="finding-file"><AppIcon name="repo" /><div><strong>{{ fileName(finding.file_path) }}</strong><p v-if="directory(finding.file_path)" class="finding-directory">{{ directory(finding.file_path) }}/</p></div></div>
            <a v-if="sourceLink(githubUrl, current.head_sha, finding.file_path, finding.start_line, finding.end_line)" class="finding-source" :href="sourceLink(githubUrl, current.head_sha, finding.file_path, finding.start_line, finding.end_line)" target="_blank" rel="noopener noreferrer">해당 코드 보기 <span v-if="finding.start_line">· {{ finding.start_line }}줄</span><AppIcon name="arrow" /></a><div class="finding-context"><span>{{ displayLabel(scopeLabels, finding.scope_location, '발견 위치 범위 미확인') }}</span><span>판단의 확실성 {{ displayLabel(confidenceLabels, finding.confidence, '미확인') }}</span></div>
            <p v-if="finding.scope_location==='CONTEXT'" class="helper">이번 변경으로 새로 생긴 문제라고 단정할 수 없습니다.</p>
          </li>
        </ul>
        <p v-if="!visible.length" class="empty-note">{{ current.finding_count ? '선택한 중요도에는 확인할 항목이 없어요.' : '이번 점검에서 확인할 항목을 찾지 못했어요.' }}</p>
        <div class="finding-footer"><p class="helper">{{ findings.length }} / {{ current.finding_count }}건 불러옴 · 검색 조건은 불러온 항목에만 적용돼요</p><button v-if="cursor" class="secondary" :disabled="busy || polling" @click="action(more)">확인할 항목 더 보기</button></div>
        <details class="analysis-files"><DisclosureSummary>파일별 점검 내용 <span class="count">{{ files.length }}</span></DisclosureSummary><ul><li v-for="file in files" :key="file.id"><strong>{{ file.file_path }}</strong><p>{{ displayLabel(fileLabels, file.status, '파일 점검 상태 확인 필요') }}<span v-if="file.reason_code"> · {{ displayLabel(reasonLabels, file.reason_code, '점검하지 못한 이유 확인 필요') }}</span></p><span v-if="file.finding_limit_reached" class="notice">한 파일에서 최대 100개까지 보여드려요.</span><details><DisclosureSummary>어떤 기준으로 점검했나요?</DisclosureSummary><p v-for="rule in file.rule_outcomes" :key="rule.rule_id" class="helper">{{ rule.rule_id }} · {{ displayLabel(ruleStatusLabels, rule.status, '점검 여부 확인 필요') }}</p></details></li></ul></details>
        <p class="analysis-caveat">건너뛴 점검 기준 {{ current.not_evaluated_rules }}건 · 항목이 없어도 모든 문제가 없다고 보장하지는 않아요.</p>
      </template>

    </div>
    </div>
    <div v-if="mode === 'overview'" class="pr-overview"><h4>점검·리뷰 요약</h4><p v-if="!loaded" class="helper">이전 점검 기록을 불러오고 있어요.</p><template v-else-if="current"><dl class="overview-metrics"><div><dt>코드 점검</dt><dd>{{ analysisStatus(current.status) }}</dd></div><div><dt>확인할 항목</dt><dd>{{ current.finding_count }}건</dd></div><div><dt>점검 범위</dt><dd>{{ current.included_files }} / {{ current.total_files }}파일</dd></div></dl><p v-if="current.head_sha !== headSha" class="notice">현재 변경 요청과 다른 코드 버전의 점검 결과예요.</p><p class="helper">코드 점검은 정해진 규칙에 따라 확인해요. AI 리뷰에서는 개선 제안과 추가로 확인할 질문을 볼 수 있어요.</p></template><p v-else class="empty-note">아직 점검하지 않은 변경 요청이에요. 코드 점검부터 시작해 보세요.</p><p v-if="error" role="alert" class="notice notice--error">{{ error }}</p><div class="button-group"><button class="secondary" @click="emit('navigate','static')">코드 점검 보기</button><button :disabled="current?.status !== 'COMPLETED'" @click="emit('navigate','ai')">AI 리뷰 보기</button></div></div>
    <label v-if="aiMode && runs.length" class="analysis-history">AI가 참고할 점검 기록<select :value="current?.id" :disabled="busy || polling" @change="action(()=>select(runs.find(r=>r.id===($event.target as HTMLSelectElement).value)!,true))"><option v-for="run in runs" :key="run.id" :value="run.id">{{ displayTime(run.created_at) }} · {{ analysisStatus(run.status) }} · {{ run.head_sha.slice(0,7) }}</option></select></label>
    <p v-if="aiMode && current && current.status !== 'COMPLETED'" class="notice">완료된 점검 기록을 선택해 주세요. 기록이 없으면 코드 점검을 먼저 진행하세요.</p>
    <div v-if="mode === 'standards'" class="standard-management-entry"><p class="helper">우리 팀의 문서에서 적용할 규칙을 찾아 검토해요. 팀 문서 관리에서 검토할 문서와 적용 범위를 확인하세요.</p><button class="secondary" @click="emit('standards')">팀 문서 관리</button></div>
    <SecuritySignals v-if="current?.status === 'COMPLETED' && mode === 'security'" :key="'security-' + current.id" :workspace-id="workspaceId" :analysis-id="current.id" :head-sha="current.head_sha" :github-url="githubUrl" />
    <AIReviewPanel v-if="current?.status === 'COMPLETED' && aiMode" :key="current.id + purpose" :workspace-id="workspaceId" :repository-id="repositoryId" :analysis-id="current.id" :purpose="purpose" :github-url="githubUrl" :owner="owner" />
    <details v-if="mode === 'static'" class="analysis-rules"><DisclosureSummary>점검 가능한 언어와 기준 {{ rules.length }}개</DisclosureSummary><p class="helper">Java · Python · JavaScript · TypeScript 코드를 점검해요. .vue 파일 등 지원하지 않는 코드에서는 비밀정보가 의심되는 글자 패턴만 확인해요. 한 번에 최대 100개 파일, 파일당 200KiB, 전체 2MiB, 120초까지 점검해요. 모든 보안 문제나 자료형 오류를 확인하는 검사는 아니에요.</p><p class="helper">{{ rules.join(' · ') }}</p></details>
  </section>
</template>
