<script setup lang="ts">
import { sourceLink } from './sourceLink'

export interface ReviewCoverage {
  files: { file_id: string; file_path: string; provided_lines: number }[]
  excluded: { file_path: string | null; reason: string }[]
  unfetched_files: number | null
}
defineProps<{ coverage?: ReviewCoverage; githubUrl: string; headSha: string }>()
const reasons: Record<string, string> = {
  INVALID_PATH: '유효하지 않은 파일 경로',
  SENSITIVE_PATH: '민감정보가 의심되는 파일 이름',
  UNSUPPORTED_LANGUAGE: '지원하지 않는 언어',
  EXCLUDED_PATH: '검토 제외 경로',
  PATCH_UNAVAILABLE: 'GitHub 변경 코드 없음',
  SECRET_SUSPECTED: '비밀정보 의심 내용 포함',
  PATCH_TOO_LARGE: '파일 변경 코드가 8KiB 초과',
  FILE_LIMIT: '최대 8개 파일 한도',
  INPUT_LIMIT: '전체 입력 24KiB 한도',
  NO_HEAD_LINES: '검토할 HEAD 코드 없음',
}
</script>

<template>
  <details v-if="coverage" class="ai-coverage">
    <summary>검토한 파일과 제외 사유</summary>
    <p class="helper">요약의 f1, f2는 아래 파일 식별자입니다. 줄 수는 실제 제공한 변경·주변 코드이며 전체 파일을 검토했다는 뜻은 아닙니다.</p>
    <h5>검토한 파일 · {{ coverage.files.length }}개</h5>
    <ul class="ai-coverage-list">
      <li v-for="file in coverage.files" :key="file.file_id">
        <span class="badge badge--accent">{{ file.file_id }}</span>
        <a :href="sourceLink(githubUrl, headSha, file.file_path, null, null)" target="_blank" rel="noopener noreferrer">{{ file.file_path }} ↗</a>
        <span class="helper">제공 {{ file.provided_lines }}줄</span>
      </li>
    </ul>
    <h5>제외한 파일 · {{ coverage.excluded.length }}개</h5>
    <p v-if="!coverage.excluded.length" class="helper">가져온 변경 파일 중 제외한 파일이 없습니다.</p>
    <ul v-else class="ai-coverage-list">
      <li v-for="(file, index) in coverage.excluded" :key="index">
        <span class="ai-coverage-path">{{ file.file_path || '파일 이름 비공개' }}</span>
        <span class="helper">{{ reasons[file.reason] || '검토 범위에서 제외' }}</span>
      </li>
    </ul>
    <p v-if="coverage.unfetched_files === null" class="notice">전체 변경 파일 수를 확인하지 못했습니다. 이 목록은 가져온 첫 페이지의 파일만 포함합니다.</p>
    <p v-else-if="coverage.unfetched_files > 0" class="notice">첫 100개 이후의 {{ coverage.unfetched_files }}개 파일은 가져오지 않아 검토하지 않았습니다.</p>
  </details>
  <p v-else class="helper ai-coverage-legacy">이 리뷰는 파일별 검토 범위 기록이 추가되기 전에 생성됐습니다. 당시의 파일 목록과 제외 사유는 확인할 수 없습니다.</p>
</template>
