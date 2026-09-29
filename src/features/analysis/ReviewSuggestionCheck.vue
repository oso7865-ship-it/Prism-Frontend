<script setup lang="ts">
export interface SuggestionCheck {
  status: string
  samples: number
  inferred_from_text?: boolean
  counterexamples?: { inputs: Record<string, unknown>; before: unknown; after: unknown }[]
}
defineProps<{ check?: SuggestionCheck }>()
</script>

<template>
  <aside v-if="check" class="suggestion-check">
    <strong v-if="check.status === 'CHANGES_SUCCESSFUL_SAMPLES'">수정하면 기존에 반환하던 값도 바뀌어요</strong>
    <strong v-else-if="check.status === 'PRESERVES_SAMPLES'">일부 예시 입력에서 기존 반환값을 유지해요</strong>
    <strong v-else>수정안의 실제 동작은 아직 확인하지 않았어요</strong>
    <p class="helper" v-if="check.samples">코드의 식만 {{ check.samples }}개 예시로 비교했어요. 전체 함수의 입력 조건과 동작, 수정 후 문제 해결을 보장하지는 않아요.</p>
    <p v-if="check.inferred_from_text" class="helper">제안에 언급된 식을 비교한 결과예요. 실제 수정 코드나 제안의 다른 분기를 실행한 결과는 아니에요.</p>
    <p class="helper" v-else>제안을 적용하기 전에 실제 입력 조건과 기존 테스트를 함께 확인해 주세요.</p>
    <details v-if="check.counterexamples?.length">
      <summary>결과가 달라지는 예시 보기</summary>
      <dl v-for="(example, index) in check.counterexamples" :key="index">
        <dt>예시 입력</dt><dd><code>{{ JSON.stringify(example.inputs) }}</code></dd>
        <dt>수정 전</dt><dd><code>{{ JSON.stringify(example.before) }}</code></dd>
        <dt>수정 후</dt><dd><code>{{ JSON.stringify(example.after) }}</code></dd>
      </dl>
    </details>
  </aside>
</template>

<style scoped>
.suggestion-check { margin-top: 12px; padding: 14px 16px; border-left: 3px solid var(--accent, #2563eb); background: var(--surface-muted, #f5f8ff); border-radius: 8px; }
.suggestion-check p { margin: 6px 0; }
.suggestion-check summary { cursor: pointer; padding: 8px 0; }
.suggestion-check dl { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 8px 12px; }
.suggestion-check dd { margin: 0; overflow-wrap: anywhere; }
.suggestion-check code { white-space: pre-wrap; }
</style>
