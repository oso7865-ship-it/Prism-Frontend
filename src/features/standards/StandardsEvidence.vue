<script setup lang="ts">
import { computed } from 'vue'
import DisclosureSummary from '../../shared/ui/DisclosureSummary.vue'
import { displayLabel } from '../../shared/presentation'
import StandardCitation from './StandardCitation.vue'
import { ruleLabels, type StandardsResult } from './types'
const props = defineProps<{ result: StandardsResult; workspaceId: string; repositoryId?: string }>()
const issues = computed(() => props.result.standard_checks?.filter(r => r.status === 'VIOLATION') || [])
const statuses: Record<string, string> = { VIOLATION: '규칙과 다름', CHECKED: '경로 기준 확인', LIMITED: '제공된 변경 import만 확인' }
</script>
<template>
  <section class="standards-evidence" aria-label="팀 규칙 검사와 근거 문서">
    <h4>정해진 규칙으로 확인한 결과 · {{ issues.length }}건</h4><p class="helper">AI 판단과 별개로 파일 이름·폴더 위치·변경된 import를 확인했어요. 제공되지 않은 코드와 동적 import는 검사하지 않아요.</p>
    <p v-if="!result.standard_checks?.length" class="empty-note">이 코드에 적용할 자동 검사 규칙이 없어요. 문서 관리에서 규칙을 추가할 수 있어요.</p>
    <ul v-if="issues.length" class="standard-checks"><li v-for="check in issues" :key="check.rule + check.file_id"><strong>{{ displayLabel(ruleLabels, check.kind, '팀 규칙') }} · {{ check.value }}</strong><p>{{ check.file_path }}<span v-if="check.line"> · {{ check.line }}줄</span></p><StandardCitation :citation="check.citation" :workspace-id="workspaceId" :repository-id="repositoryId" /></li></ul>
    <details v-if="result.standard_checks?.length"><DisclosureSummary>자동 검사 범위 {{ result.standard_checks.length }}개</DisclosureSummary><ul class="standard-checks"><li v-for="check in result.standard_checks" :key="check.rule + check.file_id"><strong>{{ displayLabel(statuses, check.status, '상태 확인 필요') }} · {{ displayLabel(ruleLabels, check.kind, '팀 규칙') }}</strong><p>{{ check.file_path }} · {{ check.value }}</p></li></ul></details>
    <details v-if="result.standards"><DisclosureSummary>AI가 참고한 팀 문서</DisclosureSummary><p class="helper">적용 경로와 문서의 단어를 기준으로 검색했어요. 필수 섹션은 모두 포함해요. 적용 가능한 {{ result.standards.candidate_count }}개 섹션 중 {{ result.standards.omitted_sections }}개는 이번 AI 입력에 포함되지 않았어요.</p><p v-if="result.standards.scope_fallback" class="helper">코드와 일치하는 단어가 없어 적용 경로가 맞는 문서에서 한도 안의 섹션을 선택했어요. 빠뜨리면 안 되는 규칙은 문서 관리에서 필수 검토로 지정하세요.</p><StandardCitation v-for="source in result.standard_sources" :key="source.document_id + ':' + source.section" :citation="source" :workspace-id="workspaceId" :repository-id="repositoryId" /></details>
  </section>
</template>
<style scoped>
.standards-evidence { display: grid; gap: 12px; margin: 24px 0; padding-top: 20px; border-top: 1px solid var(--line); }
.standard-checks { display: grid; gap: 12px; }
.standard-checks li { border: 1px solid var(--line); padding: 14px; border-radius: 8px; overflow-wrap: anywhere; }
.standard-checks p { font-size: 12px; margin-top: 5px; }
</style>
