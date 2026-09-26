<script setup lang="ts">
import { nextTick, onMounted, ref, watch } from 'vue'
import AppIcon from '../../shared/ui/AppIcon.vue'
import StatusBadge from '../../shared/ui/StatusBadge.vue'
import AnalysisPanel from '../analysis/AnalysisPanel.vue'
import type { PR, Review } from './types'
const props = defineProps<{ workspaceId: string; userId: string; canManage: boolean; owner: boolean; pr: PR; reviews: Review[]; busy: boolean; loadedKind: string; githubUrl: string }>()
defineEmits<{ close: []; reviews: [kind: string] }>()
const heading = ref<HTMLElement | null>(null)
const focusHeading = async () => { await nextTick(); heading.value?.focus() }
onMounted(focusHeading)
watch(() => props.pr.id, focusHeading)
const reviewKinds = [{ id: 'reviews', label: '리뷰' }, { id: 'comments', label: '대화' }, { id: 'review_comments', label: '코드 코멘트' }, { id: 'commits', label: '커밋' }]
</script>
<template>
  <article class="pr-detail surface" aria-labelledby="pr-detail-title">
    <header class="section-heading"><span class="eyebrow">PULL REQUEST · #{{ pr.pr_number }}</span><button class="text-button detail-back" aria-label="PR 상세 닫기" @click="$emit('close')">목록으로 <AppIcon name="close" /></button></header>
    <h3 id="pr-detail-title" ref="heading" tabindex="-1">{{ pr.title }}</h3>
    <div class="inline-group"><StatusBadge :value="pr.merge_status === 'MERGED' ? 'MERGED' : pr.is_draft ? 'DRAFT' : pr.state" /><span class="muted">{{ pr.author_login || '작성자 미확인' }}</span></div>
    <dl class="metadata"><div><dt>병합 여부</dt><dd>{{ pr.merge_status === 'UNKNOWN' ? '미확인' : pr.merge_status === 'MERGED' ? '병합됨' : '병합 전' }}</dd></div><div><dt>커밋</dt><dd><code :title="pr.head_sha || ''">{{ pr.head_sha?.slice(0, 12) || '정보 없음' }}</code></dd></div></dl>
    <a :href="githubUrl" target="_blank" rel="noopener noreferrer" class="button secondary full-width">GitHub에서 PR 보기 <AppIcon name="arrow" /></a>
    <AnalysisPanel :key="`${workspaceId}:${pr.id}`" :workspace-id="workspaceId" :pr-id="pr.id" :github-url="githubUrl" :head-sha="pr.head_sha" :user-id="userId" :can-manage="canManage" :owner="owner" />
    <div class="detail-activity"><h4>PR 활동</h4><div class="segmented" aria-label="PR 활동 종류"><button v-for="kind in reviewKinds" :key="kind.id" :aria-pressed="loadedKind === kind.id" :disabled="busy" @click="$emit('reviews', kind.id)">{{ kind.label }}</button></div>
      <p class="helper">본문과 코드 변경 내용은 GitHub에서 확인할 수 있어요.</p>
      <p v-if="!loadedKind" class="empty-note">활동 종류를 선택해 기록을 확인하세요.</p>
      <p v-else-if="!reviews.length && !busy" class="empty-note">아직 표시할 기록이 없어요.</p>
      <ul v-else class="activity-list"><li v-for="(r, i) in reviews" :key="`${r.id}-${i}`"><div><strong>{{ r.author || (loadedKind === 'commits' ? '커밋' : 'GitHub 활동') }}</strong><span class="muted">{{ r.state || (loadedKind === 'commits' ? r.id.slice(0, 12) : '') }}</span></div><a :href="r.github_url" target="_blank" rel="noopener noreferrer">GitHub에서 보기 <AppIcon name="arrow" /></a></li></ul>
    </div>
  </article>
</template>
