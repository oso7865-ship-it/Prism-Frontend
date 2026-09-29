<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { activityLabel, mergeLabel } from './presentation'
import AppIcon from '../../shared/ui/AppIcon.vue'
import StatusBadge from '../../shared/ui/StatusBadge.vue'
import AnalysisPanel from '../analysis/AnalysisPanel.vue'
import type { PR, Review } from './types'
const props = defineProps<{ workspaceId: string; repositoryId?: string; userId: string; canManage: boolean; owner: boolean; pr: PR; reviews: Review[]; busy: boolean; loadedKind: string; githubUrl: string }>()
defineEmits<{ close: []; standards: []; reviews: [kind: string] }>()
const route = useRoute(), router = useRouter()
const tabs = [{id:'overview',label:'한눈에 보기'},{id:'static',label:'코드 점검'},{id:'ai',label:'코드 리뷰'},{id:'security',label:'취약점'},{id:'standards',label:'팀 규칙'},{id:'activity',label:'변경 기록'}] as const
const tab = computed(() => tabs.find(t => t.id === route.query.tab)?.id || 'overview')
async function selectTab(id: string) { await router.push({path:route.path,query:{...route.query,tab:id}}) }
async function tabKey(event: KeyboardEvent) {
  if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return
  event.preventDefault()
  const index = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length-1 : (tabs.findIndex(t=>t.id===tab.value) + (event.key==='ArrowRight'?1:tabs.length-1)) % tabs.length
  await selectTab(tabs[index]!.id); await nextTick(); document.getElementById('pr-tab-'+tabs[index]!.id)?.focus()
}
const heading = ref<HTMLElement | null>(null)
const focusHeading = async () => { await nextTick(); heading.value?.focus() }
onMounted(focusHeading)
watch(() => props.pr.id, focusHeading)
const reviewKinds = [{ id: 'reviews', label: '리뷰' }, { id: 'comments', label: '대화' }, { id: 'review_comments', label: '코드 의견' }, { id: 'commits', label: '저장 기록' }]
</script>
<template>
  <article class="pr-detail surface" aria-labelledby="pr-detail-title">
    <header class="section-heading"><span class="eyebrow">변경 요청 · #{{ pr.pr_number }}</span><button class="text-button detail-back" aria-label="변경 요청 상세 닫기" @click="$emit('close')">목록으로 <AppIcon name="close" /></button></header>
    <h3 id="pr-detail-title" ref="heading" tabindex="-1">{{ pr.title }}</h3>
    <div class="inline-group"><StatusBadge :value="pr.merge_status === 'MERGED' ? 'MERGED' : pr.is_draft ? 'DRAFT' : pr.state" /><span class="muted">{{ pr.author_login || '작성자 미확인' }}</span></div>
    <dl v-if="tab === 'overview'" class="metadata"><div><dt>코드 반영 여부</dt><dd>{{ mergeLabel(pr.merge_status) }}</dd></div><div><dt>커밋</dt><dd><code :title="pr.head_sha || ''">{{ pr.head_sha?.slice(0, 12) || '정보 없음' }}</code></dd></div></dl>
    <a :href="githubUrl" target="_blank" rel="noopener noreferrer" class="button secondary full-width">GitHub에서 변경 요청 보기 <AppIcon name="arrow" /></a>
    <div class="pr-tabs" role="tablist" aria-label="변경 요청 상세 보기" @keydown="tabKey"><button v-for="item in tabs" :id="'pr-tab-'+item.id" :key="item.id" role="tab" :aria-selected="tab===item.id" :tabindex="tab===item.id ? 0 : -1" aria-controls="pr-tab-panel" @click="selectTab(item.id)">{{ item.label }}</button></div>
    <div id="pr-tab-panel" role="tabpanel" :aria-labelledby="'pr-tab-'+tab">
    <AnalysisPanel v-show="tab !== 'activity'" :mode="tab === 'activity' ? 'overview' : tab" @navigate="selectTab" :key="`${workspaceId}:${pr.id}`" :workspace-id="workspaceId" :repository-id="repositoryId" @standards="$emit('standards')" :pr-id="pr.id" :github-url="githubUrl" :head-sha="pr.head_sha" :user-id="userId" :can-manage="canManage" :owner="owner" />
    <div v-if="tab === 'activity'" class="detail-activity"><h4>리뷰와 변경 기록</h4><div class="segmented" aria-label="변경 기록 종류"><button v-for="kind in reviewKinds" :key="kind.id" :aria-pressed="loadedKind === kind.id" :disabled="busy" @click="$emit('reviews', kind.id)">{{ kind.label }}</button></div>
      <p class="helper">본문과 코드 변경 내용은 GitHub에서 확인할 수 있어요.</p>
      <p v-if="!loadedKind" class="empty-note">리뷰·대화·코드 의견·저장 기록 중 보고 싶은 내용을 선택하세요.</p>
      <p v-else-if="!reviews.length && !busy" class="empty-note">아직 표시할 기록이 없어요.</p>
      <ul v-else class="activity-list"><li v-for="(r, i) in reviews" :key="`${r.id}-${i}`"><div><strong>{{ r.author || (loadedKind === 'commits' ? '커밋' : 'GitHub 활동') }}</strong><span class="muted">{{ activityLabel(loadedKind, r.state, r.id) }}</span></div><a :href="r.github_url" target="_blank" rel="noopener noreferrer">GitHub에서 보기 <AppIcon name="arrow" /></a></li></ul>
    </div>
    </div>
  </article>
</template>
