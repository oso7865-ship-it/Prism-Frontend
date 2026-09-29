import { onScopeDispose, ref } from 'vue'
import { ApiError, AuthError, authClient } from '../auth/api'

export interface ReviewSource {
  file_path: string; head_sha: string; start_line: number; total_lines: number; lines: string[]; truncated: boolean
}

export function useReviewSource() {
  const code = ref<ReviewSource | null>(null), busy = ref(false), error = ref('')
  let generation = 0, controller: AbortController | undefined
  function clear() {
    generation++; controller?.abort(); code.value = null; busy.value = false; error.value = ''
  }
  async function load(endpoint: string, line: number) {
    clear(); const request = generation
    controller = new AbortController(); busy.value = true
    try {
      const value = await authClient.request<ReviewSource>(`${endpoint}?line=${line}`, { signal: controller.signal })
      if (request === generation) code.value = value
    } catch (e) {
      if (request !== generation) return
      error.value = e instanceof AuthError && e.status === 401 ? '로그인이 만료됐어요. 다시 로그인한 뒤 코드를 열어 주세요.'
        : e instanceof ApiError && e.code === 'ACCESS_REVOKED' ? '저장소 연결이나 접근 권한이 바뀌었어요. 연결 상태를 확인해 주세요.'
        : '코드를 불러오지 못했어요. 다시 시도하거나 GitHub에서 확인해 주세요.'
    } finally { if (request === generation) busy.value = false }
  }
  onScopeDispose(clear)
  return { code, busy, error, clear, load }
}
