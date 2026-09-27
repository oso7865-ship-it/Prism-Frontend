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
  SNAPSHOT_CHANGED: '변경 요청의 코드가 바뀌었어요. 최신 요청 가져오기를 누른 뒤 코드를 다시 점검해 주세요.',
  ANALYSIS_TIMEOUT: '점검 시간이 한도를 넘었어요. 변경 파일 범위를 줄인 뒤 다시 시도해 주세요.',
  ACCESS_REVOKED: '팀 또는 저장소 접근 권한이 변경되어 점검을 중단했어요.',
  GITHUB_ACCESS_UNAVAILABLE: 'GitHub 저장소 접근 권한을 확인해 주세요.',
  ANALYZER_VERSION_CHANGED: '점검 기준이 바뀌었어요. 코드를 다시 점검해 주세요.',
  GITHUB_RATE_LIMIT: 'GitHub 요청 한도에 도달했습니다. 잠시 후 다시 확인하세요.',
  CONNECTION_CHANGED: '저장소 연결이 변경되었습니다. 연결 상태를 확인한 뒤 코드를 다시 점검해 주세요.',
  LEASE_EXPIRED: '실행이 중단되었습니다. 코드를 다시 점검해 주세요.',
  LEASE_LOST: '실행이 중단되었습니다. 최신 점검 상태를 새로고침해 주세요.',
  ANALYSIS_CANCELED: '코드 점검을 취소했어요.',
  GITHUB_UNAVAILABLE: 'GitHub에 연결하지 못했습니다. 잠시 후 다시 점검해 주세요.',
  ANALYSIS_FAILED: '점검 중 문제가 생겼어요. 다시 시도해도 반복되면 관리자에게 알려 주세요.',
  USER_CANCELED: '코드 점검을 취소했어요.',
}
export const coverageLabels: Record<string, string> = { FULL_SCOPE: '선택한 범위 점검 완료', PARTIAL: '일부만 점검됨', NONE: '점검 결과 없음' }
