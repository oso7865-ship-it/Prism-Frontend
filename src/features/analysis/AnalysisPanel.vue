<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { AuthError, authClient } from '../auth/api'
import { sessionUser } from '../auth/session'
import StatusBadge from '../../shared/ui/StatusBadge.vue'
import AppIcon from '../../shared/ui/AppIcon.vue'
import AIReviewPanel from './AIReviewPanel.vue'
import { sourceLink } from './sourceLink'
import { analysisErrors, coverageLabels, severityRank, type AnalysisRun, type Finding, type FileResult } from './types'

const props = defineProps<{ workspaceId: string; prId: string; headSha: string | null; userId: string; canManage: boolean; owner: boolean; githubUrl: string }>()
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
const severityLabels: Record<string, string> = { CRITICAL: '심각', ERROR: '높음', WARNING: '주의', INFO: '참고' }
const statusLabels: Record<string,string> = {PENDING:'대기 중',RUNNING:'분석 중',COMPLETED:'완료',FAILED:'실패',CANCELED:'취소됨'}
const fileLabels: Record<string,string> = {INCLUDED:'검사',EXCLUDED:'제외',SOURCE_UNAVAILABLE:'소스 취득 실패',PARSE_ERROR:'구문 분석 실패',LIMIT_EXCEEDED:'제한 초과'}
const reasonLabels: Record<string,string> = {SECRET_SCAN_ONLY:'지원 구문 없음 · 비밀 형식만 검사',IGNORED_SOURCE_RULES:'제외 설정 · 비밀 형식만 검사',GENERATED_SECRET_SCAN_ONLY:'생성 파일 · 비밀 형식만 검사',REMOVED:'삭제된 파일',NON_REGULAR_FILE:'심볼릭 링크 또는 일반 파일 아님',BINARY_OR_LFS:'바이너리 또는 LFS',ENCODING_UNSUPPORTED:'지원하지 않는 인코딩',SOURCE_SIZE_LIMIT:'파일 또는 전체 용량 제한',SYNTAX_ERROR:'구문 오류',PARSER_TIMEOUT:'구문 분석 시간 제한',PARSER_FAILED:'파서 실패',SOURCE_UNAVAILABLE:'고정 커밋 소스 취득 실패',FILE_LIMIT:'최대 100개 파일만 검사',INCOMPLETE_SCOPE:'제외·실패·미지원 범위 있음',NO_EVALUATED_FILES:'검사할 파일 없음',NO_SUPPORTED_FILES:'지원 언어 파일 없음 · 비밀 형식 검사 결과만 제공'}
async function handleError(e: unknown) {
  if (disposed) return
  if (e instanceof AuthError && e.status===401) { sessionUser.value=null; await router.replace('/login'); return }
  error.value=e instanceof Error ? e.message : '분석 정보를 불러오지 못했습니다.'
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
  if(!current.value || !confirm('이 분석을 취소할까요?'))return
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
  <section class="analysis-panel" aria-labelledby="analysis-heading">
    <div class="section-heading analysis-heading"><div class="inline-group"><span class="analysis-symbol"><AppIcon name="search" /></span><div><h4 id="analysis-heading">정적 분석</h4><p class="helper">고정 커밋의 코드 관찰</p></div></div><span class="analysis-version">{{ rules.length }} RULES</span></div>
    <p class="helper analysis-intro">변경 파일의 구문과 규칙을 검사합니다. 분석 대상 코드를 실행하지 않습니다.</p>
    <div class="analysis-actions">
      <button :disabled="busy || polling || !!active || !loaded || !enabled || !headSha" @click="action(()=>start(!!current && current.head_sha === headSha))"><AppIcon :name="active ? 'refresh' : 'pr'" :class="{ 'is-spinning': active }" />{{ busy ? '처리 중…' : active ? '분석 진행 중' : current && current.head_sha === headSha ? '이 커밋 다시 분석' : '현재 PR 분석' }}</button>
      <button class="secondary" :disabled="busy || polling" @click="action(history)"><AppIcon name="refresh" />결과 새로고침</button>
      <button v-if="active && canCancel" class="danger-button" :disabled="busy || polling" @click="action(cancel)">분석 취소</button>
    </div>
    <p v-if="loaded && !enabled" class="notice">서버의 분석 실행기가 꺼져 있습니다.</p>
    <p v-if="error" class="notice notice--error" role="alert">{{ error }}</p>
    <div v-if="!current && loaded && !error" class="analysis-empty"><span class="empty-icon"><AppIcon name="search" /></span><strong>이 PR의 첫 분석을 시작하세요.</strong><p class="helper">발견 항목과 검사 범위가 여기에 표시됩니다.</p></div>
    <label v-if="runs.length" class="analysis-history">분석 이력 <span class="helper">최근 50개</span><select :value="current?.id" :disabled="busy || polling" @change="action(()=>select(runs.find(r=>r.id===($event.target as HTMLSelectElement).value)!, true))"><option v-for="run in runs" :key="run.id" :value="run.id">{{ new Date(run.created_at).toLocaleString('ko-KR') }} · {{ statusLabels[run.status] }} · {{ run.head_sha.slice(0,7) }}</option></select></label>
    <div v-if="current" class="analysis-result" :aria-busy="busy">
      <div class="analysis-status" :data-status="current.status" role="status"><div class="inline-group"><AppIcon :name="current.status === 'COMPLETED' ? 'check' : active ? 'refresh' : 'pr'" :class="{ 'is-spinning': active }" /><strong>{{ statusLabels[current.status] }}</strong><StatusBadge v-if="current.coverage_status" :value="coverageLabels[current.coverage_status] || current.coverage_status" /></div><p v-if="active" class="helper">상태가 자동으로 갱신됩니다. 이 화면을 벗어나도 분석은 계속됩니다.</p><p class="helper">커밋 <code>{{ current.head_sha.slice(0,12) }}</code> · {{ current.rule_set_version }} · 재분석 {{ current.generation }}회</p></div>
      <p v-if="current.head_sha!==headSha" class="notice">현재 표시된 PR과 다른 커밋의 결과입니다.</p>
      <p v-if="current.error_code" class="notice">{{ analysisErrors[current.error_code] || `분석을 완료하지 못했습니다 (${current.error_code}).` }}</p>
      <p v-if="current.coverage_reason" class="notice">{{ reasonLabels[current.coverage_reason] || current.coverage_reason }}</p>
      <template v-if="current.status==='COMPLETED'">
        <dl class="analysis-counts"><div><dt>검사한 파일</dt><dd>{{ current.included_files }}<small> / {{ current.total_files }}</small></dd></div><div><dt>제외 / 실패</dt><dd>{{ current.excluded_files }}<small> / {{ current.failed_files }}</small></dd></div><div><dt>발견 항목</dt><dd>{{ current.finding_count }}<small>건</small></dd></div></dl>
        <div class="findings-heading"><div><h4>발견 항목 <span class="count">{{ current.finding_count }}</span></h4><p class="helper">관찰된 내용과 변경 줄의 관계를 확인하세요.</p></div><label class="analysis-filter"><span class="sr-only">발견 항목 중요도</span><select v-model="severity"><option value="ALL">모든 중요도</option><option value="CRITICAL">심각</option><option value="ERROR">높음</option><option value="WARNING">주의</option><option value="INFO">참고</option></select></label></div>
        <ul class="finding-list">
          <li v-for="finding in visible" :key="finding.id" :data-severity="finding.severity">
            <div class="finding-card-heading"><span class="finding-severity" :data-severity="finding.severity">{{ severityLabels[finding.severity] || finding.severity }}</span><code>{{ finding.rule_id }}</code><span v-if="finding.start_line" class="finding-lines">{{ finding.start_line }}{{ finding.end_line!==finding.start_line?`–${finding.end_line}`:'' }}줄</span></div>
            <p class="finding-message">{{ finding.sanitized_message }}</p>
            <div class="finding-file"><AppIcon name="repo" /><div><strong>{{ fileName(finding.file_path) }}</strong><p v-if="directory(finding.file_path)" class="finding-directory">{{ directory(finding.file_path) }}/</p></div></div>
            <a v-if="sourceLink(githubUrl, current.head_sha, finding.file_path, finding.start_line, finding.end_line)" class="finding-source" :href="sourceLink(githubUrl, current.head_sha, finding.file_path, finding.start_line, finding.end_line)" target="_blank" rel="noopener noreferrer">분석한 코드 보기 <span v-if="finding.start_line">· {{ finding.start_line }}줄</span><AppIcon name="arrow" /></a><div class="finding-context"><span>{{ finding.scope_location==='CHANGED'?'변경 줄과 겹침':finding.scope_location==='CONTEXT'?'주변 코드에서 발견':'파일 전체 관찰' }}</span><span>확신 {{ finding.confidence==='HIGH'?'높음':finding.confidence==='MEDIUM'?'중간':'낮음' }}</span></div>
            <p v-if="finding.scope_location==='CONTEXT'" class="helper">이번 변경으로 새로 생긴 문제라고 단정할 수 없습니다.</p>
          </li>
        </ul>
        <p v-if="!visible.length" class="empty-note">{{ current.finding_count ? '선택한 중요도에 해당하는 항목이 없습니다.' : '이 검사 범위에서 발견된 항목이 없습니다.' }}</p>
        <div class="finding-footer"><p class="helper">{{ findings.length }} / {{ current.finding_count }}건 로드 · 필터는 불러온 항목에 적용</p><button v-if="cursor" class="secondary" :disabled="busy || polling" @click="action(more)">발견 항목 더 보기</button></div>
        <details class="analysis-files"><summary>파일별 검사 범위 <span class="count">{{ files.length }}</span></summary><ul><li v-for="file in files" :key="file.id"><strong>{{ file.file_path }}</strong><p>{{ fileLabels[file.status] }}<span v-if="file.reason_code"> · {{ reasonLabels[file.reason_code] || file.reason_code }}</span></p><span v-if="file.finding_limit_reached" class="notice">파일별 100건 제한에 도달했습니다.</span><details><summary>규칙 평가 내역</summary><p v-for="rule in file.rule_outcomes" :key="rule.rule_id" class="helper">{{ rule.rule_id }} · {{ rule.status==='EVALUATED' ? '평가됨' : '미평가' }}</p></details></li></ul></details>
        <p class="analysis-caveat">미평가 규칙 {{ current.not_evaluated_rules }}건 · 발견 0건은 코드에 문제가 없다는 뜻이 아닙니다.</p>
      </template>

    </div>
    <AIReviewPanel v-if="current?.status === 'COMPLETED'" :key="current.id" :workspace-id="workspaceId" :analysis-id="current.id" :github-url="githubUrl" :owner="owner" />
    <details class="analysis-rules"><summary>지원 범위와 활성 규칙 {{ rules.length }}개</summary><p class="helper">Java · Python · JavaScript · TypeScript. Vue SFC는 미지원이며 미지원 텍스트는 비밀 형식 검사만 가능합니다. 최대 100파일·파일당 200KiB·전체 2MiB·120초. 전체 보안·타입 검증을 의미하지 않습니다.</p><p class="helper">{{ rules.join(' · ') }}</p></details>
  </section>
</template>
