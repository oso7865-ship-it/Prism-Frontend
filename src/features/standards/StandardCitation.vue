<script setup lang="ts">
import { onUnmounted, ref } from 'vue'
import { authClient } from '../auth/api'
import type { Citation, StandardDocument } from './types'
const props = defineProps<{ citation: Citation; workspaceId: string; repositoryId?: string }>()
const open = ref(false), busy = ref(false), text = ref(''), error = ref('')
let disposed = false
async function toggle() {
  if (open.value) { open.value = false; text.value = ''; return }
  if (!props.repositoryId || busy.value) return
  busy.value = true; error.value = ''; open.value = true
  try {
    const c = props.citation
    const data = await authClient.request<StandardDocument>(`/api/v1/workspaces/${props.workspaceId}/repositories/${props.repositoryId}/standards/${c.document_id}/versions/${c.version}`)
    if (!disposed && open.value) { const section = data.sections?.find(s => s.id === c.section); text.value = section?.text || ''; if (!section) error.value = '이 문서에서 근거 섹션을 찾을 수 없어요.' }
  } catch { if (!disposed) error.value = '문서가 삭제되었거나 읽을 수 없어요. 문서 관리에서 확인해 주세요.' }
  finally { if (!disposed) busy.value = false }
}
onUnmounted(() => { disposed = true; text.value = '' })
</script>
<template>
  <div class="standard-citation"><button type="button" class="text-button" :disabled="busy || !repositoryId" :aria-expanded="open" @click="toggle">{{ citation.title }} · 버전 {{ citation.version }} · {{ citation.heading }} <span>{{ open ? '접기' : '근거 문서 보기' }}</span></button><div v-if="open"><p v-if="busy" role="status">근거 문서를 불러오고 있어요…</p><p v-if="error" role="alert">{{ error }}</p><p v-if="text" class="document-excerpt">{{ text }}</p></div></div>
</template>
<style scoped>
.standard-citation { padding: 10px 12px; background: var(--brand-soft); border-radius: 8px; margin-top: 10px; min-width: 0; }
.standard-citation button { width: 100%; justify-content: flex-start; flex-wrap: wrap; text-align: left; white-space: normal; overflow-wrap: anywhere; }
.document-excerpt { white-space: pre-wrap; overflow-wrap: anywhere; font-size: 13px; padding-top: 12px; }
</style>
