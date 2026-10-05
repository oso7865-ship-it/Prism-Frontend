<script setup lang="ts">
import { computed, ref } from 'vue'
import AppIcon from '../../shared/ui/AppIcon.vue'
import { groupByOwner, matches, MAX_CONNECT, resultLabels, stateReasons, type CandidateList, type SelectResult } from './repositoryPicker'

const props = defineProps<{ list: CandidateList | null; loading: boolean; busy: boolean; expired: boolean; error: string; results: SelectResult[]; installationUrl: string | null }>()
const search = defineModel<string>('search', { default: '' })
const chosen = defineModel<number[]>('chosen', { default: () => [] })
const emit = defineEmits<{ close: []; restart: []; connect: [] }>()
const heading = ref<HTMLElement | null>(null)
defineExpose({ focus: () => heading.value?.focus() })

const visible = computed(() => (props.list?.items ?? []).filter(item => matches(item, search.value)))
const groups = computed(() => groupByOwner(visible.value))
const selectable = computed(() => visible.value.filter(item => item.state === 'AVAILABLE'))
const allVisibleChosen = computed(() => selectable.value.length > 0 && selectable.value.every(item => chosen.value.includes(item.github_repository_id)))
const names = computed(() => new Map((props.list?.items ?? []).map(item => [item.github_repository_id, `${item.owner_login}/${item.repository_name}`])))
const failures = computed(() => props.results.filter(item => item.status !== 'CONNECTED'))
const tooMany = computed(() => chosen.value.length > MAX_CONNECT)

function toggleVisible() {
  const ids = selectable.value.map(item => item.github_repository_id)
  chosen.value = allVisibleChosen.value ? chosen.value.filter(id => !ids.includes(id)) : [...new Set([...chosen.value, ...ids])]
}
</script>

<template>
  <section class="surface repository-picker" aria-labelledby="picker-title">
    <div class="section-heading">
      <div><p class="eyebrow">GitHub</p><h2 id="picker-title" ref="heading" tabindex="-1">연결할 저장소 고르기</h2></div>
      <button type="button" class="secondary" :disabled="busy" @click="emit('close')">닫기</button>
    </div>

    <p v-if="loading" role="status" class="helper">GitHub에서 허용한 저장소를 불러오는 중이에요…</p>

    <div v-else-if="expired" class="notice" role="alert">
      <p>목록이 만료됐어요. GitHub에서 저장소를 다시 가져와 주세요.</p>
      <button type="button" @click="emit('restart')"><AppIcon name="arrow" />GitHub에서 다시 가져오기</button>
    </div>

    <p v-else-if="error && !list" class="notice notice--error" role="alert">{{ error }}</p>

    <template v-else-if="list">
      <div v-if="!list.items.length" class="empty-state compact">
        <AppIcon name="repo" />
        <h3>GitHub에서 허용된 저장소가 없어요</h3>
        <p>GitHub 앱을 설치하고 연결할 저장소를 허용한 뒤 다시 가져와 주세요.</p>
        <div class="button-group">
          <a v-if="installationUrl" :href="installationUrl" target="_blank" rel="noopener noreferrer" class="button secondary">GitHub 앱 설치·허용 변경 <AppIcon name="arrow" /></a>
          <button type="button" @click="emit('restart')">다시 가져오기</button>
        </div>
      </div>

      <template v-else>
        <p class="helper">GitHub에서 허용한 저장소예요. 체크한 저장소만 이 팀에 연결하고 변경 요청을 가져와요. 연결한 저장소의 변경 요청, 리뷰 결과, 리뷰에 필요한 일부 코드는 팀 멤버에게 공유돼요.</p>
        <p v-if="list.truncated" class="notice">저장소가 많아 일부만 보여 줘요. 찾는 저장소가 없으면 GitHub에서 허용 범위를 줄인 뒤 다시 가져와 주세요.</p>
        <p v-if="list.skipped_installations" class="notice">권한이 부족하거나 중지된 GitHub 앱 설치 {{ list.skipped_installations }}개는 건너뛰었어요.</p>

        <div class="picker-toolbar">
          <label class="picker-search">저장소 검색<input v-model="search" type="search" placeholder="소유자 또는 저장소 이름" :disabled="busy" autocomplete="off" /></label>
          <button type="button" class="secondary" :disabled="busy || !selectable.length" @click="toggleVisible">{{ allVisibleChosen ? '보이는 항목 선택 해제' : '보이는 항목 모두 선택' }}</button>
        </div>
        <p role="status" class="helper picker-count">전체 {{ list.items.length }}개 · 검색 결과 {{ visible.length }}개 · 선택 {{ chosen.length }}개</p>

        <p v-if="!visible.length" class="empty-note">검색 결과가 없어요. 다른 이름으로 찾아보세요.</p>
        <fieldset v-else class="picker-list" :aria-busy="busy ? 'true' : 'false'">
          <legend>연결할 저장소 선택</legend>
          <div v-for="group in groups" :key="group.owner" class="picker-group">
            <h3>{{ group.owner }}</h3>
            <ul>
              <li v-for="item in group.items" :key="item.github_repository_id">
                <label class="picker-option" :class="{ 'is-disabled': item.state !== 'AVAILABLE' }">
                  <input v-model="chosen" type="checkbox" :value="item.github_repository_id" :disabled="item.state !== 'AVAILABLE' || busy" />
                  <span>
                    <strong>{{ item.repository_name }}</strong>
                    <span v-if="item.is_private" class="badge">비공개</span>
                    <span v-if="item.state !== 'AVAILABLE'" class="helper">{{ stateReasons[item.state] }}</span>
                  </span>
                </label>
              </li>
            </ul>
          </div>
        </fieldset>

        <p v-if="tooMany" class="notice" role="alert">한 번에 최대 {{ MAX_CONNECT }}개까지 연결할 수 있어요. 선택을 줄여 주세요.</p>
        <p v-if="error" class="notice notice--error" role="alert">{{ error }}</p>
        <div v-if="results.length" class="picker-results" role="status">
          <p v-if="failures.length"><strong>일부 저장소는 연결하지 못했어요.</strong></p>
          <ul>
            <li v-for="item in results" :key="item.github_repository_id">{{ item.owner_login && item.repository_name ? `${item.owner_login}/${item.repository_name}` : names.get(item.github_repository_id) ?? '알 수 없는 저장소' }} — {{ resultLabels[item.status] }}</li>
          </ul>
        </div>

        <div class="picker-actions">
          <button type="button" :disabled="busy || !chosen.length || tooMany" @click="emit('connect')"><AppIcon name="plus" />{{ busy ? '연결하는 중…' : `선택한 ${chosen.length}개 연결` }}</button>
          <a v-if="installationUrl" :href="installationUrl" target="_blank" rel="noopener noreferrer" class="helper">GitHub에서 허용 저장소 바꾸기 ↗</a>
        </div>
      </template>
    </template>
  </section>
</template>
