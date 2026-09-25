<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { checkReadiness } from '../shared/api/health'
import { authClient, type UserProfile } from '../features/auth/api'

const user = ref<UserProfile | null>(null)
const busy = ref(true)
const authMessage = ref('로그인 상태를 확인하고 있습니다…')

async function restore() {
  busy.value = true
  try {
    user.value = await authClient.currentUser()
    authMessage.value = user.value ? '로그인되었습니다.' : 'GitHub 계정으로 시작하세요.'
  } catch {
    authMessage.value = '서버에 연결하지 못했습니다. 실행 상태를 확인하고 다시 시도해 주세요.'
  } finally {
    busy.value = false
  }
}

async function logout() {
  busy.value = true
  try {
    await authClient.logout()
    user.value = null
    authMessage.value = '로그아웃되었습니다.'
  } catch {
    authMessage.value = '로그아웃에 실패했습니다. 다시 시도해 주세요.'
  } finally {
    busy.value = false
  }
}

onMounted(async () => {
  const problem = new URLSearchParams(window.location.search).get('auth_error')
  // Remove the generic outcome marker from browser history; no OAuth secrets enter the SPA.
  if (problem) window.history.replaceState(null, '', '/')
  await restore()
  if (problem) authMessage.value = problem === 'cancelled'
    ? 'GitHub 로그인이 취소되었습니다. 다시 시작할 수 있습니다.'
    : '로그인에 실패했습니다. GitHub 로그인을 다시 시작해 주세요.'
})

const state = ref('확인 전')
const checking = ref(false)
async function check() {
  checking.value = true
  state.value = '확인 중…'
  try {
    state.value = await checkReadiness() ? 'API와 데이터베이스 연결 완료' : '데이터베이스 연결 준비 중'
  } catch {
    state.value = '서버 연결을 확인해 주세요'
  } finally {
    checking.value = false
  }
}
</script>

<template>
  <main>
    <p class="eyebrow">PR REVIEW WORKSPACE</p>
    <h1>PRism<span>프리즘</span></h1>
    <p>코드의 변화를 더 명확하게.</p>
    <section aria-labelledby="login-title" :aria-busy="busy">
      <h2 id="login-title">{{ user ? '내 계정' : 'GitHub로 시작하기' }}</h2>
      <template v-if="user">
        <p><strong>{{ user.display_name || user.login }}</strong> <span>@{{ user.login }}</span></p>
        <p>팀과 저장소 연결 기능은 다음 단계에서 제공됩니다.</p>
        <button :disabled="busy" @click="logout">로그아웃</button>
      </template>
      <a v-else-if="!busy" class="login-link" href="/api/v1/auth/github/start">GitHub로 로그인</a>
      <button class="secondary" :disabled="busy" @click="restore">로그인 상태 확인</button>
      <p role="status" aria-live="polite">{{ authMessage }}</p>
    </section>
    <section aria-labelledby="setup-title">
      <h2 id="setup-title">개발 환경 준비</h2>
      <p>서버와 데이터베이스의 연결을 확인할 수 있습니다.</p>
      <button :disabled="checking" @click="check">연결 확인</button>
      <p role="status" aria-live="polite">{{ state }}</p>
    </section>
  </main>
</template>
