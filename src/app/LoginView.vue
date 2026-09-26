<script setup lang="ts">
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppIcon from '../shared/ui/AppIcon.vue'
import { restoreSession, sessionError, sessionUser } from '../features/auth/session'
const route = useRoute(), router = useRouter()
const busy = ref(false)
const authProblem = ref(route.query.auth_error ? '로그인이 취소되었거나 완료되지 않았어요. 다시 시작해 주세요.' : '')
if (route.query.auth_error) void router.replace({ path: '/login' })
async function retry() { busy.value = true; await restoreSession(); busy.value = false; if (sessionUser.value) await router.replace('/app') }
</script>
<template>
  <div class="login-page">
    <header class="login-header">
      <span class="brand"><span class="brand-symbol" aria-hidden="true">P</span>PRism</span>
      <span class="login-header-note">코드 리뷰를 위한 팀의 작업 공간</span>
    </header>
    <main class="login-layout">
      <section class="login-intro" aria-labelledby="login-story-title">
        <p class="eyebrow">A CLEARER VIEW OF YOUR CODE</p>
        <h1 id="login-story-title">변화를 읽고,<br /><span>더 나은 리뷰로.</span></h1>
        <p class="login-description">흩어진 Pull request부터 코드 속 작은 신호까지.<br />팀의 다음 리뷰를 PRism에서 시작하세요.</p>
        <ol class="login-steps">
          <li><span class="step-number">01</span><div><strong>내 저장소를 연결하고</strong><p>개인 프로젝트와 조직의 저장소를 한곳에.</p></div></li>
          <li><span class="step-number">02</span><div><strong>변경 사항을 살펴보고</strong><p>열린 PR과 병합된 PR의 흐름을 확인하세요.</p></div></li>
          <li><span class="step-number">03</span><div><strong>근거를 가진 리뷰로</strong><p>정적 분석으로 파일과 줄 단위의 관찰을 확인하세요.</p></div></li>
        </ol>
        <div class="login-language"><span>STATIC ANALYSIS</span><p>Java · Python · JavaScript · TypeScript</p></div>
      </section>
      <section class="login-card surface" aria-labelledby="login-title">
        <span class="login-icon"><AppIcon name="pr" /></span>
        <p class="eyebrow">WELCOME TO PRISM</p>
        <h2 id="login-title">리뷰를 이어가세요.</h2>
        <p class="muted">GitHub 계정 하나로<br />팀의 코드 리뷰 작업 공간에 연결됩니다.</p>
        <a class="button full-width login-button" href="/api/v1/auth/github/start">GitHub로 로그인 <AppIcon name="arrow" /></a>
        <p v-if="sessionError || authProblem" class="notice notice--error" role="alert">{{ sessionError || authProblem }}</p>
        <button v-if="sessionError" class="secondary full-width" :disabled="busy" @click="retry">연결 다시 확인</button>
        <div class="login-footnote"><AppIcon name="check" /><p>연결할 저장소는 로그인 후 직접 선택합니다.</p></div>
        <p class="login-availability">정적 분석 사용 가능 <span>AI 리뷰는 로그인 후 확인</span></p>
      </section>
    </main>
    <footer class="login-footer"><span>PRism · 코드의 변화를 더 명확하게.</span><span>내 코드에서 시작하는 좋은 리뷰</span></footer>
  </div>
</template>
