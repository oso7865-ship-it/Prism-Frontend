import { displayLabel } from '../../shared/presentation'

const reviewStates = { APPROVED: '승인됨', CHANGES_REQUESTED: '수정 요청됨', COMMENTED: '의견 남김', PENDING: '작성 중', DISMISSED: '승인·의견 효력 해제됨' }
export const mergeLabel = (value: string) => displayLabel({ MERGED: '코드 반영됨', NOT_MERGED: '아직 반영 안 됨', UNKNOWN: '코드 반영 여부 미확인' }, value, '코드 반영 여부 미확인')
export function activityLabel(kind: string, state: string, id: string): string {
  if (kind === 'reviews') return displayLabel(reviewStates, state, '리뷰 상태 확인 필요')
  if (kind === 'commits') return /^[a-f\d]{40}$/i.test(id) ? `커밋 ${id.slice(0, 12)}` : '커밋 기록'
  return kind === 'review_comments' ? '코드에 남긴 의견' : kind === 'comments' ? '대화에 남긴 의견' : '활동 기록'
}
export const ownershipTransferMessage = '이 멤버를 팀 소유자로 지정하면 나는 관리자가 돼요. 변경할까요?'
const syncErrors = {
  GITHUB_RATE_LIMIT: 'GitHub 요청 한도에 도달했습니다. 잠시 후 다시 가져와 주세요.',
  GITHUB_ACCESS_UNAVAILABLE: 'GitHub 저장소 접근 권한과 앱 설치 상태를 확인해 주세요.',
  ACCESS_REVOKED: '팀 또는 저장소 접근 권한이 변경되어 가져오기를 중단했어요.',
  GITHUB_SNAPSHOT_CONFLICT: '가져오는 동안 변경 요청의 코드가 바뀌었어요. 다시 가져와 주세요.',
  GITHUB_UNAVAILABLE: 'GitHub에 연결하지 못했습니다. 잠시 후 다시 가져와 주세요.',
  GITHUB_TIMEOUT: 'GitHub 응답 시간이 초과되었습니다. 잠시 후 다시 가져와 주세요.',
  LEASE_EXPIRED: '실행이 중단되었습니다. 다시 가져와 주세요.',
  SYNC_IN_PROGRESS: '이미 가져오는 중이에요. 완료될 때까지 기다려 주세요.',
}
export const syncErrorLabel = (code: string) => displayLabel(syncErrors, code, '최신 내용을 가져오지 못했어요. 연결 상태를 확인한 뒤 다시 시도해 주세요.')
