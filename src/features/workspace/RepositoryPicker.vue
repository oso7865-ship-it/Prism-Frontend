<script setup lang="ts">
import { nextTick, onMounted, ref } from 'vue'
import { AuthError } from '../auth/api'
import { userMessage } from '../../shared/presentation'
import RepositoryPickerView from './RepositoryPickerView.vue'
import { connectSelected, isExpired, loadCandidates, type CandidateList, type SelectResult } from './repositoryPicker'

const props = defineProps<{ workspaceId: string; installationUrl: string | null }>()
const emit = defineEmits<{ close: []; connected: []; restart: []; unauthorized: [] }>()

const list = ref<CandidateList | null>(null)
const loading = ref(true), busy = ref(false)
const error = ref(''), expired = ref(false)
const search = ref('')
const chosen = ref<number[]>([])
const results = ref<SelectResult[]>([])
const view = ref<InstanceType<typeof RepositoryPickerView> | null>(null)

async function load() {
  loading.value = true; error.value = ''; expired.value = false
  try {
    list.value = await loadCandidates(props.workspaceId)
    // Keep only choices that can still be connected after a reload.
    const open = new Set(list.value.items.filter(item => item.state === 'AVAILABLE').map(item => item.github_repository_id))
    chosen.value = chosen.value.filter(id => open.has(id))
  } catch (e) {
    if (e instanceof AuthError && e.status === 401) { emit('unauthorized'); return }
    list.value = null
    if (isExpired(e)) expired.value = true
    else error.value = userMessage(e, '저장소 목록을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.')
  } finally { loading.value = false }
}

async function connect() {
  if (busy.value || !chosen.value.length) return
  busy.value = true; error.value = ''; results.value = []
  try {
    results.value = await connectSelected(props.workspaceId, chosen.value)
    if (results.value.some(item => item.status === 'CONNECTED')) emit('connected')
    if (results.value.every(item => item.status === 'CONNECTED')) { emit('close'); return }
    chosen.value = []
    await load()
  } catch (e) {
    if (e instanceof AuthError && e.status === 401) { emit('unauthorized'); return }
    if (isExpired(e)) { expired.value = true; list.value = null }
    else error.value = userMessage(e, '저장소를 연결하지 못했어요. 잠시 후 다시 시도해 주세요.')
  } finally { busy.value = false }
}

onMounted(async () => { await load(); await nextTick(); view.value?.focus() })
</script>

<template>
  <RepositoryPickerView ref="view" v-model:search="search" v-model:chosen="chosen" :list="list" :loading="loading" :busy="busy" :expired="expired" :error="error" :results="results" :installation-url="installationUrl" @close="emit('close')" @restart="emit('restart')" @connect="connect" />
</template>
