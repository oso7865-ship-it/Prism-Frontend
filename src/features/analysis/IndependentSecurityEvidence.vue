<script setup lang="ts">
import { nextTick, ref, useId } from 'vue'
import ReviewCodeViewer from './ReviewCodeViewer.vue'
export interface SecurityEvidence { rule_id: string; file_id: string; file_path: string; line: number; source_line: number; title: string; detail: string }
defineProps<{ items?: SecurityEvidence[]; workspaceId: string; runId: string; headSha: string; githubUrl: string }>()
const selected = ref<SecurityEvidence | null>(null), viewer = ref<HTMLElement | null>(null), viewerId = useId()
let opener: HTMLButtonElement | null = null
async function open(item: SecurityEvidence, event: MouseEvent) {
  opener = event.currentTarget as HTMLButtonElement; selected.value = item
  await nextTick(); viewer.value?.focus({ preventScroll: true })
}
async function close() { selected.value = null; await nextTick(); opener?.focus() }
</script>

<template>
  <section v-if="items?.length" class="independent-evidence">
    <h4>코드 규칙으로 따로 발견한 보안 신호 · {{ items.length }}건</h4>
    <p class="helper">AI 답변과 별도로 확인한 입력 전달 경로예요. 실제 공격 가능성은 접근 권한과 전체 흐름을 함께 확인해야 해요.</p>
    <ul><li v-for="item in items" :key="item.file_id + ':' + item.line + ':' + item.rule_id">
      <strong>{{ item.title }}</strong><p>{{ item.detail }}</p>
      <p class="helper">{{ item.file_path }} · 입력 {{ item.source_line }}줄 → 사용 {{ item.line }}줄</p>
      <button class="secondary" :aria-controls="viewerId" @click="open(item, $event)">입력 전달 경로 보기</button>
    </li></ul>
    <div v-if="selected" :id="viewerId" ref="viewer" tabindex="-1"><ReviewCodeViewer :key="runId + selected.file_id" :endpoint="`/api/v1/workspaces/${workspaceId}/reviews/${runId}/source-files/${encodeURIComponent(selected.file_id)}`" :file-path="selected.file_path" :head-sha="headSha" :github-url="githubUrl" :line="selected.source_line" @close="close" /></div>
  </section>
</template>

<style scoped>
.independent-evidence { margin: 20px 0; padding: 20px; border: 1px solid var(--line, #dce4f0); border-radius: 12px; }
.independent-evidence ul { list-style: none; padding: 0; }
.independent-evidence li { padding: 16px 0; border-top: 1px solid var(--line, #dce4f0); overflow-wrap: anywhere; }
</style>
