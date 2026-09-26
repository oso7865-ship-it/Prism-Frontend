import { ref } from 'vue'
import { authClient, type UserProfile } from './api'

export const sessionUser = ref<UserProfile | null>(null)
export const sessionError = ref('')
let pending: Promise<void> | null = null
export function restoreSession(): Promise<void> {
  if (pending) return pending
  pending = (async () => {
    sessionError.value = ''
    try { sessionUser.value = await authClient.currentUser() }
    catch { sessionUser.value = null; sessionError.value = '서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.' }
  })().finally(() => { pending = null })
  return pending
}
