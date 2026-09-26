<script setup lang="ts">
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppIcon from '../shared/ui/AppIcon.vue'
import { authClient } from '../features/auth/api'
import { sessionUser } from '../features/auth/session'
import { checkReadiness } from '../shared/api/health'
const router = useRouter(), route = useRoute()
const busy = ref(false), message = ref(''), state = ref('확인 전'), checking = ref(false)
const result = route.query.repository_result
if (result) {
  message.value = result === 'connected' ? '저장소가 연결되었습니다. PR 동기화를 접수했어요.' : '저장소 연결을 완료하지 못했어요. 설치·관리자 권한을 확인하고 다시 시도하세요.'
  const query = { ...route.query }; delete query.repository_result
  void router.replace({ path: route.path, query, hash: route.hash })
}
async function logout() {
  busy.value = true
  try { await authClient.logout(); sessionUser.value = null; await router.replace('/login') }
  catch { message.value = '로그아웃하지 못했어요. 다시 시도해 주세요.' }
  finally { busy.value = false }
}
async function check() {
  checking.value = true
  try { state.value = await checkReadiness() ? 'API와 데이터베이스 연결 완료' : '데이터베이스 연결 준비 중' }
  catch { state.value = '서버 연결을 확인해 주세요' }
  finally { checking.value = false }
}
</script>
<template>
  <div class="app-frame">
    <a class="skip-link" href="#workspace-content">본문으로 이동</a>
    <header class="app-header"><RouterLink to="/app" class="brand" aria-label="PRism 홈"><span class="brand-symbol" aria-hidden="true">P</span>PRism<span class="brand-caption">REVIEW WORKSPACE</span></RouterLink><details v-if="sessionUser" class="account-menu"><summary><span class="avatar">{{ (sessionUser.display_name || sessionUser.login).slice(0, 1) }}</span><span>{{ sessionUser.display_name || sessionUser.login }}</span><span aria-hidden="true">⌄</span></summary><div class="account-panel"><strong>@{{ sessionUser.login }}</strong><p class="helper">GitHub 숫자 ID · {{ sessionUser.github_user_id }}</p><button class="secondary full-width" :disabled="busy" @click="logout">로그아웃</button></div></details></header>
    <div v-if="message" class="global-message" role="status">{{ message }}<button class="icon-button" aria-label="알림 닫기" @click="message = ''"><AppIcon name="close" /></button></div>
    <main v-if="sessionUser"><RouterView v-slot="{ Component }"><component :is="Component" :user-id="sessionUser.id" :key="sessionUser.id" /></RouterView></main>
    <footer class="app-footer"><span>PRism · 코드 리뷰 작업 공간</span><details><summary>서비스 연결 상태</summary><div class="inline-group"><button class="text-button" :disabled="checking" @click="check">연결 확인</button><span role="status">{{ checking ? '확인 중…' : state }}</span></div></details></footer>
  </div>
</template>
