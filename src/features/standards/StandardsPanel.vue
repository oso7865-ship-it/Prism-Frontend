<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ApiError, AuthError, authClient } from '../auth/api'
import { sessionUser } from '../auth/session'
import { loginLocation } from '../auth/returnLocation'
import { displayLabel } from '../../shared/presentation'
import DisclosureSummary from '../../shared/ui/DisclosureSummary.vue'
import { kindLabels, ruleLabels, type StandardDocument, type StandardRule, type StandardSection, type StandardKind } from './types'

const props = defineProps<{ workspaceId: string; repositoryId: string; owner: boolean }>()
const emit = defineEmits<{ close: []; changed: [] }>()
const router = useRouter()
const base = `/api/v1/workspaces/${props.workspaceId}/repositories/${props.repositoryId}/standards`
const documents = ref<StandardDocument[]>([]), versions = ref<StandardDocument[]>([]), selected = ref<StandardDocument | null>(null)
const editing = ref(false), busy = ref(false), loaded = ref(false), error = ref(''), message = ref('')
const title = ref(''), kind = ref<StandardKind>('CONVENTION'), content = ref(''), include = ref('**'), exclude = ref(''), required = ref(false), rules = ref<StandardRule[]>([]), sections = ref<StandardSection[]>([])
const titleInput = ref<HTMLInputElement | null>(null)
let disposed = false
const size = computed(() => new TextEncoder().encode(content.value).length)
const patterns = (text: string) => text.split(',').map(v => v.trim()).filter(Boolean)
const body = () => ({ title: title.value, kind: kind.value, content: content.value, include: patterns(include.value), exclude: patterns(exclude.value), required: required.value, rules: rules.value, expected_version: selected.value?.current_version || 0 })
const errors: Record<string, string> = {
  INVALID_INPUT: '문서 형식을 확인해 주세요. UTF-8 텍스트 64KiB 이하, 비밀정보 없이 입력하고 규칙의 근거 섹션과 경로를 확인하세요.',
  STANDARD_CONFLICT: '다른 곳에서 문서가 바뀌었어요. 목록에서 문서를 다시 열어 주세요.',
  STANDARD_LIMIT: '저장소에는 문서 8개, 문서마다 버전 20개까지 보관할 수 있어요.',
  STANDARD_NOT_FOUND: '삭제되었거나 볼 수 없는 문서예요. 목록을 새로고침해 주세요.',
}
async function action(fn: () => Promise<void>) {
  if (busy.value || disposed) return
  busy.value = true; error.value = ''; message.value = ''
  try { await fn() } catch (e) {
    if (disposed) return
    if (e instanceof AuthError && e.status === 401) { sessionUser.value = null; await router.replace(loginLocation(router.currentRoute.value.fullPath)) }
    else error.value = e instanceof ApiError ? displayLabel(errors, e.code, '문서를 처리하지 못했어요. 권한과 연결 상태를 확인해 주세요.') : '파일을 읽거나 문서를 처리하지 못했어요. 다시 시도해 주세요.'
  } finally { if (!disposed) busy.value = false }
}
async function load() {
  const result = await authClient.request<{ items: StandardDocument[] }>(base)
  if (!disposed) { documents.value = result.items; loaded.value = true }
}
function fill(doc: StandardDocument | null) {
  selected.value = doc; title.value = doc?.title || ''; kind.value = doc?.kind || 'CONVENTION'
  content.value = doc?.content || ''; include.value = doc?.include.join(', ') || '**'; exclude.value = doc?.exclude.join(', ') || ''
  required.value = doc?.required || false; rules.value = structuredClone(doc?.rules || []); sections.value = doc?.sections || []; editing.value = true
}
async function open(doc: StandardDocument, version = doc.version) {
  const [data, history] = await Promise.all([
    authClient.request<StandardDocument>(`${base}/${doc.id}/versions/${version}`),
    authClient.request<{ items: StandardDocument[] }>(`${base}/${doc.id}/versions`),
  ])
  if (!disposed) { fill(data); versions.value = history.items; await nextTick(); titleInput.value?.focus() }
}
async function create() { fill(null); versions.value = []; await nextTick(); titleInput.value?.focus() }
async function preview() {
  const data = await authClient.request<{ sections: StandardSection[] }>(`${base}/preview`, { method: 'POST', body: JSON.stringify({ ...body(), rules: [] }) })
  if (!disposed) { sections.value = data.sections; message.value = `${data.sections.length}개 섹션을 확인했어요. 규칙에 맞는 근거 섹션을 선택하세요.` }
}
async function upload(event: Event) {
  const input = event.target as HTMLInputElement, file = input.files?.[0]
  input.value = ''
  if (!file) return
  if (!/\.(md|txt)$/i.test(file.name) || file.size > 65536) { error.value = '.md 또는 .txt 파일을 64KiB 이하로 선택해 주세요.'; return }
  const value = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer())
  if (disposed) return
  content.value = value; sections.value = []; rules.value = []
  if (!title.value) title.value = file.name.replace(/\.(md|txt)$/i, '').slice(0, 120)
  message.value = '파일을 읽었어요. 내용을 확인한 뒤 저장해 주세요.'
}
async function save() {
  const doc = await authClient.request<StandardDocument>(selected.value ? `${base}/${selected.value.id}` : base, { method: selected.value ? 'PUT' : 'POST', body: JSON.stringify(body()) })
  if (disposed) return
  await load(); await open(doc); message.value = `문서 ${doc.version}번째 버전을 저장했어요.`; emit('changed')
}
async function toggle(doc: StandardDocument) {
  await authClient.request(`${base}/${doc.id}`, { method: 'PATCH', body: JSON.stringify({ active: !doc.active, expected_version: doc.current_version }) })
  if (disposed) return
  await load(); if (selected.value?.id === doc.id) selected.value.active = !doc.active
  message.value = doc.active ? '이 문서를 새 리뷰에서 사용하지 않아요.' : '이 문서를 새 리뷰에서 사용해요.'; emit('changed')
}
async function remove(doc: StandardDocument) {
  if (!confirm(`“${doc.title}”의 모든 버전과 원문을 삭제할까요? 과거 리뷰의 출처 이름은 남지만 문서를 다시 열 수 없어요.`)) return
  await authClient.request(`${base}/${doc.id}?expected_version=${doc.current_version}`, { method: 'DELETE' })
  if (disposed) return
  selected.value = null; editing.value = false; content.value = ''; sections.value = []; await load(); message.value = '문서와 모든 원문 버전을 삭제했어요.'; emit('changed')
}
function addRule() { rules.value.push({ kind: 'NAME_SUFFIX', value: '', section: sections.value[0]?.id || '', include: ['**'], exclude: [] }) }
onMounted(() => void action(load))
onUnmounted(() => { disposed = true; content.value = ''; sections.value = [] })
</script>

<template>
  <section class="standards-manager" aria-labelledby="standards-title" :aria-busy="busy">
    <header class="section-heading"><div><p class="eyebrow">저장소 설정</p><h3 id="standards-title">우리 팀의 개발 기준</h3><p class="helper">문서를 등록하면 코드 컨벤션과 패키지 구조를 팀 기준으로 검토해요.</p></div><button class="secondary" :disabled="busy" @click="emit('close')">닫기</button></header>
    <p class="notice">문서 원문과 버전을 팀 비공개 공간에 보관해요. 팀 규칙 리뷰에 동의하면 필요한 섹션을 AI에 보내요. 비밀키·개인정보는 넣지 마세요.</p>
    <p v-if="!owner" class="helper">팀 소유자만 문서를 관리할 수 있어요. 등록한 문서는 팀원 모두 볼 수 있어요.</p>
    <div class="button-group"><button v-if="owner" :disabled="busy || documents.length >= 8" @click="create">문서 등록</button><button class="secondary" :disabled="busy" @click="action(load)">목록 새로고침</button><span class="helper">{{ documents.length }} / 8개</span></div>
    <p v-if="error" class="notice notice--error" role="alert">{{ error }}</p><p v-if="message" class="notice" role="status">{{ message }}</p><p v-if="busy" class="helper" role="status">문서를 처리하고 있어요…</p>
    <div class="standards-layout">
      <div><p v-if="loaded && !documents.length" class="empty-note">아직 팀 문서가 없어요. 코드 컨벤션이나 패키지 구조 문서를 등록해 주세요.</p><ul class="standard-documents"><li v-for="doc in documents" :key="doc.id" :class="{ selected: selected?.id === doc.id }"><button class="standard-document-select" :disabled="busy" @click="action(() => open(doc))"><strong>{{ doc.title }}</strong><span>{{ kindLabels[doc.kind] }} · 버전 {{ doc.version }}</span><span class="badge">{{ doc.active ? '리뷰에 사용 중' : '사용 안 함' }}</span></button><div v-if="owner" class="button-group"><button class="text-button" :disabled="busy" @click="action(() => toggle(doc))">{{ doc.active ? '사용 중지' : '다시 사용' }}</button><button class="text-button" :disabled="busy" @click="action(() => remove(doc))">삭제</button></div></li></ul></div>
      <form v-if="editing" class="standard-editor" @submit.prevent="action(save)">
        <label v-if="versions.length">보관된 버전<select :value="selected?.version" :disabled="busy" @change="action(() => open(selected!, Number(($event.target as HTMLSelectElement).value)))"><option v-for="version in versions" :key="version.version" :value="version.version">버전 {{ version.version }}{{ version.version === version.current_version ? ' · 최신' : '' }}</option></select></label>
        <p v-if="selected && selected.version !== selected.current_version" class="notice">이전 버전을 보고 있어요. 저장하면 이 내용으로 새 버전을 만들어요.</p>
        <label>문서 이름<input ref="titleInput" v-model="title" maxlength="120" required :readonly="!owner" :disabled="busy" /></label>
        <label>문서 종류<select v-model="kind" :disabled="busy || !owner"><option value="CONVENTION">코드 컨벤션</option><option value="STRUCTURE">패키지 구조</option></select></label>
        <label v-if="owner">문서 파일 가져오기 <span class="helper">선택 · UTF-8 .md / .txt · 최대 64KiB</span><input type="file" accept=".md,.txt,text/plain,text/markdown" :disabled="busy" @change="event => action(() => upload(event))" /></label>
        <label>문서 내용 <span class="helper">{{ (size / 1024).toFixed(1) }} / 64KiB · # 제목으로 섹션을 나눠 주세요</span><textarea v-model="content" rows="12" required :readonly="!owner" :disabled="busy" spellcheck="false" /></label>
        <div class="standard-fields"><label>적용할 경로<input v-model="include" required :readonly="!owner" :disabled="busy" placeholder="src/**, app/**" /></label><label>제외할 경로<input v-model="exclude" :readonly="!owner" :disabled="busy" placeholder="tests/**, **/*.test.ts" /></label></div><p class="helper">쉼표로 구분해요. **는 모든 경로예요. 예외 경로가 적용 경로보다 우선해요.</p>
        <label class="standard-checkbox"><input v-model="required" type="checkbox" :disabled="busy || !owner" /><span>적용 파일이 있으면 모든 섹션을 필수로 검토<span class="helper">문맥 한도를 넘으면 일부를 빼지 않고 축약을 요청해요.</span></span></label>
        <button class="secondary" type="button" :disabled="busy || !title.trim() || !content.trim() || size > 65536" @click="action(preview)">섹션 확인</button>
        <details v-if="sections.length"><DisclosureSummary>검색에 사용할 섹션 {{ sections.length }}개</DisclosureSummary><ol class="standard-sections"><li v-for="section in sections" :key="section.id"><strong>{{ section.id.slice(1) }}. {{ section.heading }}</strong><p>{{ section.text }}</p></li></ol></details>
        <fieldset :disabled="busy || !owner"><legend>자동으로 확인할 규칙 <span class="helper">선택 · 문서 내용과 일치하는 규칙만 추가하세요</span></legend><div v-for="(rule, index) in rules" :key="index" class="standard-rule"><label>확인할 내용<select v-model="rule.kind"><option v-for="(label, value) in ruleLabels" :key="value" :value="value">{{ label }}</option></select></label><label>규칙 값<input v-model="rule.value" required maxlength="160" :placeholder="rule.kind === 'NAME_SUFFIX' ? '예: Service.java' : rule.kind === 'PATH_PREFIX' ? '예: src/domain' : '예: app.infrastructure'" /></label><label>근거 섹션<select v-model="rule.section" required><option value="" disabled>섹션 확인 후 선택하세요</option><option v-for="section in sections" :key="section.id" :value="section.id">{{ section.id.slice(1) }}. {{ section.heading }}</option></select></label><label>규칙 적용 경로<input :value="rule.include.join(', ')" required @input="rule.include = patterns(($event.target as HTMLInputElement).value)" /></label><label>규칙 제외 경로<input :value="rule.exclude.join(', ')" @input="rule.exclude = patterns(($event.target as HTMLInputElement).value)" /></label><button type="button" class="secondary" @click="rules.splice(index, 1)">규칙 {{ index + 1 }} 삭제</button></div><button v-if="owner" type="button" class="secondary" :disabled="rules.length >= 20 || !sections.length" @click="addRule">규칙 추가</button><p class="helper">문서에서 추출한 섹션을 먼저 확인하세요. 파일 이름·폴더 위치는 경로로 확인하고, 금지 패키지는 제공된 변경 줄의 import 구문만 확인해요.</p></fieldset>
        <div class="button-group"><button v-if="owner" :disabled="busy || size > 65536">{{ selected ? '새 버전 저장' : '문서 저장' }}</button><button type="button" class="secondary" :disabled="busy" @click="editing = false; content = ''; sections = []">편집 닫기</button></div>
      </form><div v-else-if="documents.length" class="empty-note">문서를 선택해 내용과 보관된 버전을 확인하세요.</div>
    </div>
  </section>
</template>

<style scoped>
.standards-manager { padding: 24px 0; display: grid; gap: 18px; border-top: 1px solid var(--line); }
.standards-layout { display: grid; gap: 24px; grid-template-columns: minmax(180px, .7fr) minmax(0, 1.6fr); align-items: start; }
.standards-layout > *, .standard-editor > *, .standard-fields > * { min-width: 0; }
.standard-documents { display: grid; gap: 12px; }
.standard-documents li { border: 1px solid var(--line); border-radius: 10px; padding: 10px; }
.standard-documents li.selected { border-color: var(--brand); background: var(--brand-soft); }
.standard-document-select { display: grid; width: 100%; justify-content: start; justify-items: start; gap: 6px; text-align: left; background: transparent; color: var(--ink); overflow-wrap: anywhere; }
.standard-document-select:not(:disabled):hover { background: var(--brand-soft); color: var(--ink); }
.standard-document-select > span { font-size: 12px; font-weight: 400; }
.standard-editor { display: grid; gap: 18px; }
.standard-editor textarea { width: 100%; min-height: 220px; resize: vertical; border: 1px solid #cbd2df; border-radius: 8px; padding: 12px; font: inherit; background: white; color: var(--ink); }
textarea:focus-visible { outline: 3px solid #3186e8; outline-offset: 3px; }
.standard-fields { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.standard-checkbox { display: flex; align-items: flex-start; gap: 10px; background: var(--brand-soft); padding: 12px; border-radius: 8px; }
.standard-checkbox input { width: 18px; min-height: 18px; margin-top: 3px; flex: 0 0 18px; }
.standard-checkbox .helper { display: block; }
.standard-sections { padding-left: 20px; max-height: 360px; overflow: auto; }
.standard-sections p { white-space: pre-wrap; overflow-wrap: anywhere; margin: 8px 0 20px; font-size: 13px; }
fieldset { border: 1px solid var(--line); border-radius: 8px; padding: 16px; margin: 0; min-width: 0; }
legend { max-width: 100%; }
legend .helper { display: block; }
.standard-rule { display: grid; gap: 12px; padding-bottom: 20px; margin-bottom: 20px; border-bottom: 1px solid var(--line); }
@media (max-width: 900px) { .standards-layout { grid-template-columns: minmax(0, 1fr); } }
@media (max-width: 480px) { .standard-fields { grid-template-columns: minmax(0, 1fr); } .standards-manager { padding: 16px 0; } }
</style>
