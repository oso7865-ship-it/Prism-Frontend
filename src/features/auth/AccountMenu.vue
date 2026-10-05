<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import AppIcon from '../../shared/ui/AppIcon.vue'
import type { ReviewMode, UserProfile } from './api'

const props = defineProps<{ user: UserProfile; busy: boolean; modeBusy?: boolean; modeError?: string }>()
const emit = defineEmits<{ logout: []; mode: [value: ReviewMode] }>()
const displayName = computed(() => props.user.display_name || props.user.login)
const menu = ref<HTMLDetailsElement | null>(null)
const modes: { value: ReviewMode; label: string; help: string }[] = [
  { value: 'SENIOR', label: '시니어', help: '핵심만 간결하게. 개념 설명 없이 조건과 영향 위주' },
  { value: 'JUNIOR', label: '주니어', help: '왜 문제인지 단계별로 쉽게. 올바른 방법과 이유까지' },
]
// The radio shows the choice immediately; a failed save restores the stored value.
// The group is not disabled while saving: a disabled control drops keyboard focus.
const selected = ref<ReviewMode>(props.user.review_mode)
watch(() => props.user.review_mode, value => { selected.value = value })
watch(() => props.modeError, message => { if (message) selected.value = props.user.review_mode })
function choose(value: ReviewMode) {
  if (props.modeBusy || value === props.user.review_mode) { selected.value = props.user.review_mode; return }
  selected.value = value
  emit('mode', value)
}

function closeMenu(event: KeyboardEvent) {
  if (!menu.value?.open) return
  menu.value.open = false
  menu.value.querySelector('summary')?.focus()
  event.preventDefault()
}
</script>

<template>
  <details ref="menu" class="account-menu" @keydown.esc.stop="closeMenu">
    <summary class="account-trigger" :aria-label="`계정 메뉴: ${displayName}`" :title="displayName">
      <span class="avatar account-avatar" aria-hidden="true">{{ displayName.slice(0, 1) }}</span>
      <span class="account-name">{{ displayName }}</span>
      <AppIcon name="chevron-down" class="account-chevron" />
    </summary>
    <div class="account-panel">
      <strong>{{ displayName }}</strong>
      <p class="account-login">@{{ user.login }}</p>
      <p class="helper">GitHub 계정 연결됨</p>
      <fieldset class="mode-picker" :class="{ 'mode-picker--busy': modeBusy }" :aria-busy="modeBusy ? 'true' : 'false'">
        <legend>AI 리뷰 설명 모드</legend>
        <label v-for="item in modes" :key="item.value" class="mode-option">
          <input type="radio" name="review-mode" :value="item.value" :checked="selected === item.value" @change="choose(item.value)" />
          <span><strong>{{ item.label }}</strong><span class="helper">{{ item.help }}</span></span>
        </label>
        <p class="helper mode-note">내가 시작한 AI 리뷰의 설명 방식에 적용돼요. 이미 만든 리뷰는 바뀌지 않아요.</p>
        <p v-if="modeBusy" class="helper" role="status">저장하는 중…</p>
        <p v-if="modeError" class="notice notice--error" role="alert">{{ modeError }}</p>
      </fieldset>
      <button class="secondary full-width" :disabled="busy" @click="$emit('logout')">
        {{ busy ? '로그아웃 중…' : '로그아웃' }}
      </button>
    </div>
  </details>
</template>
