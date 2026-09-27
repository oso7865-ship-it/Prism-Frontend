<script setup lang="ts">
import { computed, ref } from 'vue'
import AppIcon from '../../shared/ui/AppIcon.vue'
import type { UserProfile } from './api'

const props = defineProps<{ user: UserProfile; busy: boolean }>()
defineEmits<{ logout: [] }>()
const displayName = computed(() => props.user.display_name || props.user.login)
const menu = ref<HTMLDetailsElement | null>(null)

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
      <button class="secondary full-width" :disabled="busy" @click="$emit('logout')">
        {{ busy ? '로그아웃 중…' : '로그아웃' }}
      </button>
    </div>
  </details>
</template>
