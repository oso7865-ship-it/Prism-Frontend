export interface AnalysisRun {
  id: string; pr_id: string; requested_by: string; status: string; base_sha: string; head_sha: string
  generation: number; rule_set_version: string; coverage_status: string | null; coverage_reason: string | null
  total_files: number; included_files: number; excluded_files: number; failed_files: number
  not_evaluated_rules: number; finding_count: number; created_at: string; error_code: string | null
}
export interface Finding {
  id: string; rule_id: string; severity: string; confidence: string; category: string; file_path: string
  start_line: number | null; end_line: number | null; scope_location: string; sanitized_message: string
}
export interface FileResult {
  id: string; file_path: string; status: string; reason_code: string | null; finding_limit_reached: boolean
  rule_outcomes: { rule_id: string; status: string; reason_code: string | null }[]
}
export const severityRank: Record<string, number> = { CRITICAL: 0, ERROR: 1, WARNING: 2, INFO: 3 }
export const analysisErrors: Record<string, string> = {
  SNAPSHOT_CHANGED: 'PR의 커밋이 변경되었습니다. PR을 동기화한 뒤 최신 커밋으로 분석해 주세요.',
  ANALYSIS_TIMEOUT: '분석 시간 제한을 초과했습니다. 변경 파일 범위를 줄여 다시 시도하세요.',
  ACCESS_REVOKED: '팀 또는 저장소 접근 권한이 변경되어 분석을 중단했습니다.',
  GITHUB_ACCESS_UNAVAILABLE: 'GitHub 저장소 접근 권한을 확인해 주세요.',
  ANALYZER_VERSION_CHANGED: '분석기 버전이 변경되었습니다. 새 분석을 요청해 주세요.',
  GITHUB_RATE_LIMIT: 'GitHub 요청 한도에 도달했습니다. 잠시 후 다시 확인하세요.',
  USER_CANCELED: '분석을 취소했습니다.',
}
export const coverageLabels: Record<string, string> = { FULL_SCOPE: '선택 범위 검사 완료', PARTIAL: '일부 범위만 검사', NONE: '검사 결과 없음' }
