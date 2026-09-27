/** Translate protocol values at the display boundary; never echo unknown codes. */
export function displayLabel(labels: Readonly<Record<string, string>>, value: unknown, fallback: string): string {
  return typeof value === 'string' && Object.hasOwn(labels, value) ? labels[value]! : fallback
}

/** Only locally authored messages may be shown to users. */
export class UserFacingError extends Error {}

export function userMessage(error: unknown, fallback: string): string {
  return error instanceof UserFacingError ? error.message : fallback
}

export function displayTime(value: string | null, empty = '시간 정보 없음'): string {
  if (!value) return empty
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '시간 정보 확인 필요' : date.toLocaleString('ko-KR')
}
