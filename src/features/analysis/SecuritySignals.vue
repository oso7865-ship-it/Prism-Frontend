<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { authClient } from '../auth/api'
import { sourceLink } from './sourceLink'
import { displayLabel } from '../../shared/presentation'
import { severityLabels } from './presentation'
import type { Finding } from './types'
const props = defineProps<{ workspaceId: string; analysisId: string; headSha: string; githubUrl: string }>()
const findings = ref<Finding[]>([]), cursor = ref<string | null>(null), busy = ref(false), error = ref(''), loaded = ref(false)
let disposed = false
async function load(more = false) {
  if (busy.value) return
  busy.value = true; error.value = ''
  try {
    const data = await authClient.request<{ items: Finding[]; next_cursor: string | null }>(`/api/v1/workspaces/${props.workspaceId}/analyses/${props.analysisId}/findings?category=SECURITY${more && cursor.value ? `&cursor=${encodeURIComponent(cursor.value)}` : ''}`)
    if (!disposed) { findings.value = more ? [...findings.value, ...data.items] : data.items; cursor.value = data.next_cursor; loaded.value = true }
  } catch { if (!disposed) error.value = '보안 규칙 결과를 가져오지 못했어요. 다시 시도해 주세요.' }
  finally { if (!disposed) busy.value = false }
}
onMounted(() => void load())
onUnmounted(() => { disposed = true })
</script>
<template>
  <section class="security-signals" aria-label="보안 규칙 탐지"><h4>보안 규칙으로 찾은 항목</h4><p class="helper">코드 점검에서 찾은 보안 관련 패턴이에요. 아래의 AI 취약점 검토와 별개예요. 원문 비밀값은 표시하지 않아요.</p><p v-if="busy" role="status">보안 점검 결과를 불러오고 있어요…</p><p v-if="error" role="alert" class="notice notice--error">{{ error }} <button class="secondary" :disabled="busy" @click="load()">다시 시도</button></p><ul class="security-list"><li v-for="finding in findings" :key="finding.id"><span class="badge">{{ displayLabel(severityLabels, finding.severity, '중요도 확인 필요') }}</span><strong>{{ finding.sanitized_message }}</strong><a :href="sourceLink(githubUrl, headSha, finding.file_path, finding.start_line, finding.end_line)" target="_blank" rel="noopener noreferrer">{{ finding.file_path }} · {{ finding.start_line || '위치 확인 필요' }}줄</a></li></ul><p v-if="loaded && !findings.length" class="empty-note">이 점검의 보안 규칙에서 항목을 찾지 못했어요. 취약점이 없다는 판정은 아니에요.</p><button v-if="cursor" class="secondary" :disabled="busy" @click="load(true)">보안 항목 더 보기</button><p class="helper">현재 규칙과 제공된 파일 범위만 검사해요. 전체 데이터 흐름·실제 공격·의존성 취약점 목록은 확인하지 않았어요.</p></section>
</template>
<style scoped>
.security-signals { display: grid; gap: 12px; margin: 24px 0; padding-bottom: 24px; border-bottom: 1px solid var(--line); }
.security-list { display: grid; gap: 12px; }
.security-list li { display: grid; justify-items: start; gap: 10px; padding: 16px; border: 1px solid var(--line); border-radius: 10px; }
.security-list a { overflow-wrap: anywhere; }
</style>
