<script setup lang="ts">
import DisclosureSummary from '../../shared/ui/DisclosureSummary.vue'
import { displayLabel } from '../../shared/presentation'
import { sourceLink } from './sourceLink'

export interface ReviewCoverage {
  files: { file_id: string; file_path: string; provided_lines: number; role?: string }[]
  excluded: { file_path: string | null; reason: string }[]
  unfetched_files: number | null
  context_notes?: { file_id: string; reason: string }[]
  prior_feedback_count?: number
}
defineProps<{ coverage?: ReviewCoverage; githubUrl: string; headSha: string }>()
const reasons: Record<string, string> = {
  FUNCTION_PARTIAL: '함수 일부만 제공되어 전체 분기 확인에 한계가 있음',
  QUERY_LIMIT: '변경된 함수가 많아 일부 함수의 관련 코드 검색을 생략',
  SYNTAX_PARTIAL: '일부 코드 구조를 읽지 못해 확인 가능한 부분만 제공',
  CONTEXT_UNAVAILABLE: '주변 코드를 수집하지 못해 확인 가능한 변경 코드만 제공',
  SOURCE_UNAVAILABLE: '주변 코드를 가져오지 못해 변경 코드만 검토',
  CONTEXT_LIMIT: '주변 코드를 더 보낼 수 없는 크기에 도달',
  TREE_TRUNCATED: '관련 파일 목록을 일부만 가져옴',
  RELATED_SEARCH_UNAVAILABLE: '관련 파일을 찾지 못함',
  RELATED_CONTEXT_LIMIT: '관련 코드가 보낼 수 있는 크기를 넘음',
  RELATED_SOURCE_UNAVAILABLE: '관련 파일의 코드를 가져오지 못함',
  INVALID_PATH: '유효하지 않은 파일 경로',
  SENSITIVE_PATH: '민감정보가 의심되는 파일 이름',
  UNSUPPORTED_LANGUAGE: '지원하지 않는 언어',
  EXCLUDED_PATH: '검토 제외 경로',
  PATCH_UNAVAILABLE: 'GitHub 변경 코드 없음',
  SECRET_SUSPECTED: '비밀정보 의심 내용 포함',
  PATCH_TOO_LARGE: '파일 변경 코드가 해당 리뷰의 크기 한도를 넘음',
  FILE_LIMIT: '최대 8개 파일 한도',
  INPUT_LIMIT: '전체 코드 입력 한도에 도달',
  NO_HEAD_LINES: '현재 커밋에 검토할 코드 없음',
}
</script>

<template>
  <details v-if="coverage" class="ai-coverage">
    <DisclosureSummary>살펴본 파일과 제외한 이유</DisclosureSummary>
    <p class="helper">요약의 f1, f2는 아래 파일의 AI 참조 번호입니다. 줄 수는 실제 제공한 변경·주변 코드이며 전체 파일을 검토했다는 뜻은 아닙니다.</p>
    <h5>검토한 파일 · {{ coverage.files.length }}개</h5>
    <ul class="ai-coverage-list">
      <li v-for="file in coverage.files" :key="file.file_id">
        <span class="badge badge--accent">{{ displayLabel({changed:'변경 파일', related:'관련 파일'}, file.role ?? 'changed', '파일 유형 미확인') }} · {{ /^([fc])\d+$/.test(file.file_id) ? file.file_id : '참조 번호 미확인' }}</span>
        <a :href="sourceLink(githubUrl, headSha, file.file_path, null, null)" target="_blank" rel="noopener noreferrer">{{ file.file_path }} ↗</a>
        <span class="helper">{{ file.role === 'related' ? '관련 코드 · ' : '' }}제공 {{ file.provided_lines }}줄</span>
      </li>
    </ul>
    <p v-if="coverage.context_notes?.length" class="helper">가져오지 못한 코드와 이유: {{ coverage.context_notes.map(n => [coverage?.files.find(f => f.file_id === n.file_id)?.file_path, displayLabel(reasons, n.reason, '추가 코드를 가져오지 못함 · 이유 확인 필요')].filter(Boolean).join(' · ')).join(' / ') }}</p>
    <p v-if="coverage.prior_feedback_count !== undefined" class="helper">이전 검토 메모 {{ coverage.prior_feedback_count }}개 참고 · 코드가 사용되는 모든 경로를 확인한 것은 아니에요.</p>
    <h5>제외한 파일 · {{ coverage.excluded.length }}개</h5>
    <p v-if="!coverage.excluded.length" class="helper">가져온 변경 파일 중 제외한 파일이 없습니다.</p>
    <ul v-else class="ai-coverage-list">
      <li v-for="(file, index) in coverage.excluded" :key="index">
        <span class="ai-coverage-path">{{ file.file_path || '파일 이름 비공개' }}</span>
        <span class="helper">{{ displayLabel(reasons, file.reason, '이번 리뷰에서 제외됨 · 이유 확인 필요') }}</span>
      </li>
    </ul>
    <p v-if="coverage.unfetched_files === null" class="notice">전체 변경 파일 수를 확인하지 못했어요. 먼저 가져온 파일만 이 목록에 포함돼요.</p>
    <p v-else-if="coverage.unfetched_files > 0" class="notice">첫 100개 이후의 {{ coverage.unfetched_files }}개 파일은 가져오지 않아 검토하지 않았습니다.</p>
  </details>
  <p v-else class="helper ai-coverage-legacy">이 리뷰는 파일별 검토 범위 기록이 추가되기 전에 생성됐습니다. 당시의 파일 목록과 제외 사유는 확인할 수 없습니다.</p>
</template>
