<script setup lang="ts">
import { computed } from 'vue'
import { displayLabel } from '../presentation'
const props = defineProps<{ value: string; label?: string }>()
const labels: Record<string, string> = { ACTIVE: '연결됨', SUSPENDED: '권한 확인 필요', DISCONNECTED: '연결 해제됨', OPEN: '열림', CLOSED: '닫힘', MERGED: '코드 반영됨', DRAFT: '초안', PENDING: '대기 중', RUNNING: '진행 중', COMPLETED: '완료', FAILED: '실패', CANCELED: '취소됨', OWNER: '소유자', ADMIN: '관리자', MEMBER: '멤버' }
const tone = computed(() => ['ACTIVE', 'COMPLETED', 'OPEN'].includes(props.value) ? 'success' : ['FAILED', 'SUSPENDED'].includes(props.value) ? 'warning' : ['MERGED', 'RUNNING'].includes(props.value) ? 'accent' : 'neutral')
</script>
<template><span class="badge" :class="`badge--${tone}`"><span class="badge-dot" />{{ label || displayLabel(labels, value, '상태 확인 필요') }}</span></template>
