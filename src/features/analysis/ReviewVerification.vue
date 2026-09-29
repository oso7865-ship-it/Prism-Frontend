<script setup lang="ts">
import { ref, watch } from 'vue'
import ReviewCodeViewer from './ReviewCodeViewer.vue'
export interface FileCheck { file_id: string; file_path: string; line: number; outcome: string; observation: string }
export interface Verification { status: string; kept?: number; revised?: number; dropped?: number; added?: number; file_checks?: FileCheck[] }
const props = defineProps<{ verification?: Verification; empty: boolean; workspaceId: string; runId: string; headSha: string; githubUrl: string }>()
const selected = ref<FileCheck | null>(null)
watch(() => [props.workspaceId, props.runId], () => { selected.value = null })
</script>

<template>
  <section v-if="verification?.file_checks?.length" class="review-recheck">
    <h4>{{ verification.status === 'OUTPUT_RECOVERED' ? '처음 답변을 읽지 못해 코드를 다시 검토했어요' : verification.status === 'CHECKED' ? '기존 제안과 놓친 부분을 함께 검토했어요' : '빈 답변을 한 번 더 검토했어요' }}</h4>
    <p v-if="verification.status === 'CHECKED'" class="helper">유지 {{ verification.kept ?? 0 }}건 · 수정 {{ verification.revised ?? 0 }}건 · 제외 {{ verification.dropped ?? 0 }}건 · 새로 발견 {{ verification.added ?? 0 }}건</p>
    <p class="helper">AI가 변경 파일별로 다시 살펴본 결과예요. 전체 코드의 안전성을 보장하거나 실행으로 확인한 결과는 아니에요.</p>
    <ul class="recheck-list"><li v-for="check in verification.file_checks" :key="check.file_id"><div><strong>{{ check.file_path.split('/').pop() }}</strong><span class="badge">{{ check.outcome === 'FINDING' ? '검토 항목 발견' : check.outcome === 'LIMITED' ? '문맥 부족' : '제공 범위에서 제안 없음' }}</span></div><p>{{ check.observation }}</p><button class="secondary" @click="selected=check">{{ check.line }}줄 코드 보기</button></li></ul>
    <ReviewCodeViewer v-if="selected" :key="runId+selected.file_id" :endpoint="`/api/v1/workspaces/${workspaceId}/reviews/${runId}/source-files/${encodeURIComponent(selected.file_id)}`" :file-path="selected.file_path" :head-sha="headSha" :github-url="githubUrl" :line="selected.line" @close="selected=null" />
  </section>
  <p v-else-if="verification?.status === 'CHECKED'" class="helper">AI가 제안의 근거를 한 차례 더 검토했어요 · 유지 {{ verification.kept }}건 · 수정 {{ verification.revised }}건 · 제외 {{ verification.dropped }}건. 실제 실행으로 확인한 결과는 아니에요.</p>
  <p v-else-if="empty" class="notice">이전 검토 방식으로 만든 빈 답변이에요. 제안·질문이 없다는 답변 뒤에 파일별 재검토를 진행하지 않았어요. 새 리뷰를 요청하면 변경 파일을 한 번 더 살펴봐요.</p>
</template>

<style scoped>
.review-recheck { margin: 20px 0; padding: 20px; border: 1px solid var(--line, #dce4f0); border-radius: 12px; }
.review-recheck h4 { margin: 0 0 8px; }
.recheck-list { list-style: none; padding: 0; margin: 0; }
.recheck-list li { padding: 16px 0; border-top: 1px solid var(--line, #dce4f0); }
.recheck-list li > div { display: flex; align-items: center; flex-wrap: wrap; gap: 8px 16px; }
.recheck-list strong, .recheck-list p { overflow-wrap: anywhere; }
</style>
