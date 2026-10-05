<script setup lang="ts">
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppIcon from '../shared/ui/AppIcon.vue'
import AccountMenu from '../features/auth/AccountMenu.vue'
import { authClient, type ReviewMode } from '../features/auth/api'
import { sessionUser } from '../features/auth/session'
import { checkReadiness } from '../shared/api/health'
import { clearReturn } from '../features/auth/returnLocation'
const router = useRouter(), route = useRoute()
const busy = ref(false), message = ref(''), state = ref('확인 전'), checking = ref(false)
const modeBusy = ref(false), modeError = ref('')
const result = route.query.repository_result
if (result) {
  message.value = result === 'connected' ? '저장소를 연결했어요. 최신 변경 요청을 가져오고 있어요.' : '저장소 연결을 완료하지 못했어요. 설치·관리자 권한을 확인하고 다시 시도하세요.'
  const query = { ...route.query }; delete query.repository_result
  void router.replace({ path: route.path, query, hash: route.hash })
}
async function logout() {
  busy.value = true
  try { await authClient.logout(); clearReturn(); sessionUser.value = null; await router.replace('/login') }
  catch { message.value = '로그아웃하지 못했어요. 다시 시도해 주세요.' }
  finally { busy.value = false }
}
async function changeMode(mode: ReviewMode) {
  if (modeBusy.value || !sessionUser.value || sessionUser.value.review_mode === mode) return
  modeBusy.value = true; modeError.value = ''
  try { sessionUser.value = await authClient.updateReviewMode(mode) }
  catch { modeError.value = '설명 모드를 저장하지 못했어요. 잠시 후 다시 시도해 주세요.' }
  finally { modeBusy.value = false }
}
async function check() {
  checking.value = true
  try { state.value = await checkReadiness() ? '서버와 저장 공간에 연결됐어요' : '저장 공간에 연결하는 중이에요' }
  catch { state.value = '서버 연결을 확인해 주세요' }
  finally { checking.value = false }
}
function closeDisclosure(event: KeyboardEvent) {
  const disclosure = (event.target as HTMLElement).closest('details[open]')
  if (!disclosure) return
  disclosure.removeAttribute('open')
  disclosure.querySelector('summary')?.focus()
  event.preventDefault()
}
</script>
<template>
  <div class="app-frame" @keydown.esc="closeDisclosure">
    <a class="skip-link" href="#workspace-content">본문으로 이동</a>
    <header class="app-header">
      <RouterLink to="/app" class="brand" aria-label="PRism 홈"><span class="brand-symbol" aria-hidden="true">P</span>PRism<span class="brand-caption">코드 리뷰 작업 공간</span></RouterLink>
      <AccountMenu v-if="sessionUser" :user="sessionUser" :busy="busy" :mode-busy="modeBusy" :mode-error="modeError" @logout="logout" @mode="changeMode" />
    </header>
    <div v-if="message" class="global-message" role="status">{{ message }}<button class="icon-button" aria-label="알림 닫기" @click="message = ''"><AppIcon name="close" /></button></div>
    <main v-if="sessionUser"><RouterView v-slot="{ Component }"><component :is="Component" :user-id="sessionUser.id" :key="sessionUser.id" /></RouterView></main>
    <footer class="app-footer"><span>PRism · 코드 리뷰 작업 공간</span><details><summary>서비스 연결 상태</summary><div class="inline-group"><button class="text-button" :disabled="checking" @click="check">연결 확인</button><span role="status">{{ checking ? '확인 중…' : state }}</span></div></details></footer>
  </div>
</template>
