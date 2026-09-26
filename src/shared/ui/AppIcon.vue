<script setup lang="ts">
withDefaults(defineProps<{ name: 'home' | 'repo' | 'team' | 'pr' | 'plus' | 'refresh' | 'arrow' | 'close' | 'check' | 'search' }>(), { name: 'repo' })
const paths = {
  home: 'm3 10 9-7 9 7v10H3V10Zm6 10v-7h6v7',
  repo: 'M4 4h13v16H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Zm0 12h13M7 7h6M7 10h4',
  team: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M16 3a4 4 0 0 1 0 8M22 21v-2a4 4 0 0 0-3-3.87M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z',
  pr: 'M6 7v10M18 17V9a4 4 0 0 0-4-4h-2m2-2-2 2 2 2M8 5a2 2 0 1 1-4 0 2 2 0 0 1 4 0ZM8 19a2 2 0 1 1-4 0 2 2 0 0 1 4 0ZM20 19a2 2 0 1 1-4 0 2 2 0 0 1 4 0Z',
  plus: 'M12 5v14M5 12h14', refresh: 'M20 7v5h-5M4 17v-5h5M6 6a8 8 0 0 1 13 2M18 18a8 8 0 0 1-13-2',
  arrow: 'M7 17 17 7M7 7h10v10', close: 'm6 6 12 12M6 18 18 6', check: 'm5 12 4 4L19 6', search: 'm21 21-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z',
}
</script>
<template><svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path :d="paths[name]" /></svg></template>
