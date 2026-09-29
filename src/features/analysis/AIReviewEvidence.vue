<script setup lang="ts">
import { sourceLink } from './sourceLink'
export type Evidence = { file_path: string; evidence_lines?: number[]; trigger?: string; consequence?: string; assumptions?: string[] }
defineProps<{ issue: Evidence; githubUrl: string; headSha: string; inlineCode?: boolean }>()
defineEmits<{ source: [line: number] }>()
</script>

<template>
  <div v-if="issue.trigger || issue.consequence || issue.evidence_lines?.length" class="review-evidence">
    <p v-if="issue.trigger" class="ai-prose"><strong>문제가 생길 수 있는 상황</strong><br />{{ issue.trigger }}</p>
    <p v-if="issue.consequence" class="ai-prose"><strong>생길 수 있는 영향</strong><br />{{ issue.consequence }}</p>
    <div v-if="issue.assumptions?.length"><strong>아직 확인하지 못한 점</strong><ul><li v-for="(assumption, index) in issue.assumptions" :key="index" class="ai-prose">{{ assumption }}</li></ul></div>
    <p v-if="issue.evidence_lines?.length" class="helper evidence-links"><strong>근거 줄</strong><template v-for="line in issue.evidence_lines" :key="line"><button v-if="inlineCode" class="secondary" @click="$emit('source', line)">{{ line }}줄 코드 보기</button><a v-else :href="sourceLink(githubUrl, headSha, issue.file_path, line, line)" target="_blank" rel="noopener noreferrer">{{ line }}줄 ↗</a></template></p>
    <p class="helper">AI가 제시한 근거입니다. 실제 동작을 검증한 결과는 아닙니다.</p>
  </div>
</template>

<style scoped>
.evidence-links { display: flex; flex-wrap: wrap; gap: 8px 12px; }
.review-evidence { overflow-wrap: anywhere; }
</style>
