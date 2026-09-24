<script setup lang="ts">
import { ref } from 'vue'
import { checkReadiness } from '../shared/api/health'

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
    <section aria-labelledby="setup-title">
      <h2 id="setup-title">개발 환경 준비</h2>
      <p>로그인과 PR 분석 기능을 준비하고 있습니다.</p>
      <button :disabled="checking" @click="check">연결 확인</button>
      <p role="status" aria-live="polite">{{ state }}</p>
    </section>
  </main>
</template>
