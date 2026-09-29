<script setup lang="ts">
import DisclosureSummary from '../../shared/ui/DisclosureSummary.vue'
import AppIcon from '../../shared/ui/AppIcon.vue'
import { displayLabel } from '../../shared/presentation'
import { nextTick, ref, useId, watch } from 'vue'
import { authClient } from '../auth/api'
import ReviewCodeViewer from './ReviewCodeViewer.vue'
import AIReviewEvidence from './AIReviewEvidence.vue'
import { feedbackLabels, type ReviewFeedback, type ReviewIssue } from './reviewModel'
const props = defineProps<{ issue: ReviewIssue; question: boolean; workspaceId: string; runId: string; githubUrl: string; headSha: string; feedback?: ReviewFeedback }>()
const emit = defineEmits<{ saved: [value: ReviewFeedback] }>()
const state = ref(props.feedback?.state ?? 'OPEN'), note = ref(props.feedback?.note || '')
const busy = ref(false), error = ref(''), saved = ref(false)
const codeLine = ref<number | null>(null), codeId = useId(), codeHost = ref<HTMLElement | null>(null), codeButton = ref<HTMLButtonElement | null>(null)
watch(() => props.feedback, value => { state.value = value?.state ?? 'OPEN'; note.value = value?.note || '' })
const base = `/api/v1/workspaces/${props.workspaceId}/reviews/${props.runId}`
async function openCode(line: number) {
  codeLine.value = line
  await nextTick(); codeHost.value?.focus({ preventScroll: true }); codeHost.value?.scrollIntoView({ block: 'start' })
}
async function closeCode() { codeLine.value = null; await nextTick(); codeButton.value?.focus() }
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
    <button ref="codeButton" class="secondary review-file-link" :title="issue.file_path" :aria-expanded="codeLine !== null" :aria-controls="codeId" @click="codeLine === null ? openCode(issue.line) : closeCode()"><span class="review-file-name">{{ issue.file_path.split('/').pop() }}<wbr /><span class="review-line-number">:{{ issue.line }}</span></span><span class="review-file-destination">사이트에서 코드 보기 <AppIcon name="repo" /></span></button>
    <details class="review-card-details"><DisclosureSummary>{{ question ? '무엇을 확인해야 하나요?' : '이유와 개선 방법 보기' }}</DisclosureSummary>
      <div class="review-evidence-layout"><div><AIReviewEvidence :issue="issue" :github-url="githubUrl" :head-sha="headSha" inline-code @source="openCode" /><h6>이렇게 판단한 이유</h6><p>{{ issue.evidence }}</p><h6>{{ question ? '확인 방법' : '개선 제안' }}</h6><p>{{ issue.suggestion }}</p></div></div>
    </details>
    <div v-if="codeLine !== null" :id="codeId" ref="codeHost" tabindex="-1"><ReviewCodeViewer :endpoint="`${base}/source/${encodeURIComponent(issue.key)}`" :file-path="issue.file_path" :head-sha="headSha" :github-url="githubUrl" :line="codeLine" :evidence-lines="issue.evidence_lines" @close="closeCode" /></div>
    <details class="review-feedback"><DisclosureSummary>내 검토 메모<template #meta>{{ displayLabel(feedbackLabels, feedback?.state ?? 'OPEN', '검토 상태 확인 필요') }}</template></DisclosureSummary><form @submit.prevent="save"><label>검토 상태<select v-model="state" :disabled="busy" @change="saved=false"><option v-if="!Object.hasOwn(feedbackLabels, state)" :value="state" disabled>검토 상태 확인 필요</option><option v-for="(label,value) in feedbackLabels" :key="value" :value="value">{{ label }}</option></select></label><label>메모 <span class="helper">선택 · 나만 볼 수 있어요 · 비밀정보는 적지 마세요</span><textarea v-model="note" rows="2" maxlength="500" :disabled="busy" placeholder="예: 다른 곳에서도 같은 방식으로 처리하므로 지금 동작을 유지합니다." @input="saved=false" /></label><div class="button-group"><button class="secondary" :disabled="busy || !Object.hasOwn(feedbackLabels, state)">{{ busy ? '저장 중…' : '메모 저장' }}</button><span v-if="saved" role="status">저장했습니다.</span></div><p v-if="error" class="notice notice--error" role="alert">{{ error }}</p></form></details>
  </li>
</template>

<style scoped>
[tabindex="-1"] { scroll-margin-top: 140px; }
.review-file-link { width: 100%; text-align: left; margin: 12px 0; padding: 12px; }
.review-evidence-layout { grid-template-columns: minmax(0, 1fr); }
</style>
