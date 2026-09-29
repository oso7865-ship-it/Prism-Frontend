<script setup lang="ts">
import { computed, nextTick, ref, useId, watch } from 'vue'
import { sourceLink } from './sourceLink'
import { useReviewSource } from './useReviewSource'

const props = defineProps<{ endpoint: string; filePath: string; headSha: string; githubUrl: string; line?: number; evidenceLines?: number[] }>()
const emit = defineEmits<{ close: [] }>()
const { code, busy, error, load } = useReviewSource()
const titleId = useId(), target = ref(props.line || 1)
const codeBlock = ref<HTMLElement | null>(null)
const end = computed(() => code.value ? code.value.start_line + code.value.lines.length - 1 : 0)
const focused = computed(() => new Set([props.line, ...(props.evidenceLines || [])]))
function show(line: number) { target.value = line; void load(props.endpoint, line) }
watch(() => [props.endpoint, props.line] as const, () => show(props.line || 1), { immediate: true })
watch(code, async value => {
  if (!value || !props.line) return
  await nextTick()
  const pre = codeBlock.value, row = pre?.querySelector<HTMLElement>(`[data-line="${props.line}"]`)
  if (pre && row) pre.scrollTop += row.getBoundingClientRect().top - pre.getBoundingClientRect().top - pre.clientHeight / 2
})
</script>

<template>
  <section class="review-code source-viewer" :aria-labelledby="titleId" :aria-busy="busy">
    <div class="source-toolbar"><div><strong :id="titleId">리뷰 당시 코드</strong><p class="helper">커밋 {{ headSha.slice(0, 7) }} · AI에 제공된 줄보다 넓은 범위를 볼 수 있어요.</p></div><button class="secondary" @click="emit('close')">코드 닫기</button></div>
    <div class="source-file"><span>{{ filePath }}</span><a :href="sourceLink(githubUrl, headSha, filePath, line || null, line || null)" target="_blank" rel="noopener noreferrer">GitHub에서 보기 ↗</a></div>
    <p v-if="busy" class="helper" role="status">코드를 불러오는 중이에요.</p>
    <div v-if="error" role="alert"><p class="notice notice--error">{{ error }}</p><button class="secondary" @click="show(target)">코드 다시 불러오기</button></div>
    <template v-if="code">
      <p v-if="!code.lines.length" class="helper">이 커밋의 파일은 비어 있어요.</p>
      <pre v-else ref="codeBlock" tabindex="0" aria-label="리뷰 당시 코드와 줄 번호"><code><span v-for="(text, i) in code.lines" :key="code.start_line+i" :data-line="code.start_line+i" class="source-line" :class="{ 'source-line--focus': focused.has(code.start_line+i) }"><span class="line-number">{{ code.start_line+i }}</span>{{ text }}</span></code></pre>
      <div class="source-toolbar"><span class="helper" role="status">{{ code.total_lines ? `${code.start_line}–${end}줄 / 전체 ${code.total_lines}줄` : '0줄' }}</span><div class="button-group"><button class="secondary" :disabled="busy || code.start_line <= 1" @click="show(Math.max(1, code.start_line - 80))">이전 코드</button><button class="secondary" :disabled="busy || end >= code.total_lines" @click="show(end + 1)">다음 코드</button></div></div>
      <p v-if="code.truncated" class="helper">긴 줄은 300자까지 표시해요. 전체 줄은 GitHub에서 확인할 수 있어요.</p>
    </template>
  </section>
</template>

<style scoped>
.source-viewer { margin-top: 16px; min-width: 0; }
.source-toolbar, .source-file { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; }
.source-toolbar p { margin: 4px 0 0; }
.source-toolbar > div:first-child { flex: 1; min-width: min(220px, 100%); }
.source-file { margin: 16px 0; font-size: 12px; }
.source-file > span { flex: 1; min-width: min(200px, 100%); overflow-wrap: anywhere; }
.source-file a { white-space: nowrap; }
.source-viewer pre { margin: 16px 0; }
.source-toolbar .button-group { margin: 0; }
</style>
