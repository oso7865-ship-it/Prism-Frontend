import type { Evidence } from './AIReviewEvidence.vue'
export type ReviewIssue = Evidence & { key: string; file_path: string; line: number; severity: string; basis?: string; title: string; evidence: string; suggestion: string }
export type ReviewFeedback = { key: string; state: string; note: string; updated_at?: string }
export const feedbackLabels: Record<string, string> = { OPEN: '확인 전', ACKNOWLEDGED: '확인 완료', PLANNED: '수정 예정', INTENDED: '의도한 동작', FALSE_POSITIVE: '문제로 보지 않음' }
export function classifyReview(result: { issues: ReviewIssue[]; questions?: ReviewIssue[] }) {
  return {
    findings: result.issues.filter(i => i.basis === 'SUPPORTED'),
    questions: [...result.issues.filter(i => i.basis !== 'SUPPORTED'), ...(result.questions || [])],
  }
}
export function compareReview(current: ReviewIssue[], previous: ReviewIssue[]) {
  const identity = (i: ReviewIssue) => i.key || `${i.file_path}:${i.title.trim().toLowerCase()}`
  const before = new Set(previous.map(identity)), after = new Set(current.map(identity))
  return { added: current.filter(i => !before.has(identity(i))).length, repeated: current.filter(i => before.has(identity(i))).length, notSeen: previous.filter(i => !after.has(identity(i))).length }
}
