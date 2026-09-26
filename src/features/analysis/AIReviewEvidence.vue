<script setup lang="ts">
import { sourceLink } from './sourceLink'
export type Evidence = { file_path: string; evidence_lines?: number[]; trigger?: string; consequence?: string; assumptions?: string[] }
defineProps<{ issue: Evidence; githubUrl: string; headSha: string }>()
</script>

<template>
  <div v-if="issue.trigger || issue.consequence || issue.evidence_lines?.length" class="review-evidence">
    <p v-if="issue.trigger" class="ai-prose"><strong>발생 조건</strong><br />{{ issue.trigger }}</p>
    <p v-if="issue.consequence" class="ai-prose"><strong>예상 결과</strong><br />{{ issue.consequence }}</p>
    <div v-if="issue.assumptions?.length"><strong>미확인 전제</strong><ul><li v-for="(assumption, index) in issue.assumptions" :key="index" class="ai-prose">{{ assumption }}</li></ul></div>
    <p v-if="issue.evidence_lines?.length" class="helper evidence-links"><strong>근거 줄</strong><a v-for="line in issue.evidence_lines" :key="line" :href="sourceLink(githubUrl, headSha, issue.file_path, line, line)" target="_blank" rel="noopener noreferrer">{{ line }}줄 ↗</a></p>
    <p class="helper">AI가 제시한 근거입니다. 실제 동작을 검증한 결과는 아닙니다.</p>
  </div>
</template>

<style scoped>
.evidence-links { display: flex; flex-wrap: wrap; gap: 8px 12px; }
.review-evidence { overflow-wrap: anywhere; }
</style>
