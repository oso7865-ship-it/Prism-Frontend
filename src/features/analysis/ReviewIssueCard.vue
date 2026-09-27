<script setup lang="ts">
import DisclosureSummary from '../../shared/ui/DisclosureSummary.vue'
import AppIcon from '../../shared/ui/AppIcon.vue'
import { displayLabel } from '../../shared/presentation'
import { ref, watch } from 'vue'
import { authClient } from '../auth/api'
import { sourceLink } from './sourceLink'
import AIReviewEvidence from './AIReviewEvidence.vue'
import { feedbackLabels, type ReviewFeedback, type ReviewIssue } from './reviewModel'
const props = defineProps<{ issue: ReviewIssue; question: boolean; workspaceId: string; runId: string; githubUrl: string; headSha: string; feedback?: ReviewFeedback }>()
const emit = defineEmits<{ saved: [value: ReviewFeedback] }>()
const state = ref(props.feedback?.state ?? 'OPEN'), note = ref(props.feedback?.note || '')
const busy = ref(false), error = ref(''), saved = ref(false)
const code = ref<{ lines: string[]; start_line: number; truncated: boolean } | null>(null), loadingCode = ref(false), codeError = ref('')
watch(() => props.feedback, value => { state.value = value?.state ?? 'OPEN'; note.value = value?.note || '' })
const base = `/api/v1/workspaces/${props.workspaceId}/reviews/${props.runId}`
async function loadCode() {
  loadingCode.value = true; codeError.value = ''
  try { code.value = await authClient.request(`${base}/source/${props.issue.key}`) }
  catch { codeError.value = '코드를 가져오지 못했습니다. 연결 권한·파일 형식을 확인하거나 GitHub에서 확인해 주세요.' }
  finally { loadingCode.value = false }
}
async function save() {
  busy.value = true; error.value = ''; saved.value = false
  try {
    const value = await authClient.request<ReviewFeedback>(`${base}/feedback/${props.issue.key}`, { method: 'PUT', body: JSON.stringify({ state: state.value, note: note.value }) })
    emit('saved', value); saved.value = true
  } catch { error.value = '검토 메모를 저장하지 못했어요. 로그인 상태와 권한을 확인하고, 메모에 비밀정보가 없는지 확인해 주세요.' }
  finally { busy.value = false }
}
</script>
<template>
  <li class="review-card" :class="{ 'review-card--question': question }">
    <div class="review-card-labels"><span class="badge" :class="{ 'badge--accent': !question }">{{ question ? '확인이 필요한 질문' : issue.severity === 'ERROR' ? '우선 확인' : '코드를 바탕으로 한 제안' }}</span><span class="review-disposition">{{ displayLabel(feedbackLabels, feedback?.state ?? 'OPEN', '검토 상태 확인 필요') }}</span></div>
    <h5>{{ issue.title }}</h5>
    <p class="review-card-summary">{{ question ? issue.assumptions?.[0] || '판단하려면 정보가 더 필요해요.' : issue.consequence || issue.evidence }}</p>
    <a :href="sourceLink(githubUrl,headSha,issue.file_path,issue.line,issue.line)" target="_blank" rel="noopener noreferrer" class="review-file-link" :title="issue.file_path"><span class="review-file-name">{{ issue.file_path.split('/').pop() }}<wbr /><span class="review-line-number">:{{ issue.line }}</span></span><span class="review-file-destination">GitHub <AppIcon name="arrow" /></span></a>
    <details class="review-card-details"><DisclosureSummary>{{ question ? '무엇을 확인해야 하나요?' : '이유와 개선 방법 보기' }}</DisclosureSummary>
      <div class="review-evidence-layout"><div><AIReviewEvidence :issue="issue" :github-url="githubUrl" :head-sha="headSha" /><h6>이렇게 판단한 이유</h6><p>{{ issue.evidence }}</p><h6>{{ question ? '확인 방법' : '개선 제안' }}</h6><p>{{ issue.suggestion }}</p></div>
        <div class="review-code"><div class="section-heading"><strong>리뷰 당시 코드</strong><code>{{ headSha.slice(0,7) }}</code></div><p class="helper">{{ issue.file_path }}</p><button class="secondary" :disabled="loadingCode" @click="loadCode">{{ loadingCode ? '불러오는 중…' : code ? '코드 다시 불러오기' : '주변 코드 보기' }}</button><p v-if="codeError" class="notice notice--error" role="alert">{{ codeError }}</p><pre v-if="code" tabindex="0" aria-label="판단에 참고한 주변 코드"><code><span v-for="(line,i) in code.lines" :key="i" class="source-line" :class="{ 'source-line--focus': code.start_line+i === issue.line }"><span class="line-number">{{ code.start_line+i }}</span>{{ line }}</span></code></pre><p v-if="code?.truncated" class="helper">긴 줄은 300자까지 표시합니다. 전체 코드는 GitHub에서 확인하세요.</p></div></div>
    </details>
    <details class="review-feedback"><DisclosureSummary>내 검토 메모<template #meta>{{ displayLabel(feedbackLabels, feedback?.state ?? 'OPEN', '검토 상태 확인 필요') }}</template></DisclosureSummary><form @submit.prevent="save"><label>검토 상태<select v-model="state" :disabled="busy" @change="saved=false"><option v-if="!Object.hasOwn(feedbackLabels, state)" :value="state" disabled>검토 상태 확인 필요</option><option v-for="(label,value) in feedbackLabels" :key="value" :value="value">{{ label }}</option></select></label><label>메모 <span class="helper">선택 · 나만 볼 수 있어요 · 비밀정보는 적지 마세요</span><textarea v-model="note" rows="2" maxlength="500" :disabled="busy" placeholder="예: 다른 곳에서도 같은 방식으로 처리하므로 지금 동작을 유지합니다." @input="saved=false" /></label><div class="button-group"><button class="secondary" :disabled="busy || !Object.hasOwn(feedbackLabels, state)">{{ busy ? '저장 중…' : '메모 저장' }}</button><span v-if="saved" role="status">저장했습니다.</span></div><p v-if="error" class="notice notice--error" role="alert">{{ error }}</p></form></details>
  </li>
</template>
