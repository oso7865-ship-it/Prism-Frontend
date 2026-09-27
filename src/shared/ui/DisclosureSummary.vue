<script setup lang="ts">
import AppIcon from './AppIcon.vue'
</script>

<template>
  <summary class="disclosure-summary">
    <span class="disclosure-label"><slot /></span>
    <span v-if="$slots.meta" class="disclosure-meta"><slot name="meta" /></span>
    <AppIcon name="chevron-down" class="disclosure-chevron" />
  </summary>
</template>
