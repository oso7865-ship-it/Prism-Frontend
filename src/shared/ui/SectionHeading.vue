<script setup lang="ts">
import AppIcon from './AppIcon.vue'
withDefaults(defineProps<{
  title: string
  titleId?: string
  level?: 'h2' | 'h3' | 'h4'
  icon?: 'search' | 'pr'
  eyebrow?: string
  description?: string
}>(), { level: 'h4' })
</script>

<template>
  <div class="section-title">
    <div class="section-title-main">
      <span v-if="icon" class="section-title-icon"><AppIcon :name="icon" /></span>
      <div class="section-title-copy">
        <p v-if="eyebrow" class="eyebrow">{{ eyebrow }}</p>
        <component :is="level" :id="titleId">{{ title }}</component>
        <p v-if="description" class="helper">{{ description }}</p>
      </div>
    </div>
    <div v-if="$slots.default" class="section-title-meta"><slot /></div>
  </div>
</template>
