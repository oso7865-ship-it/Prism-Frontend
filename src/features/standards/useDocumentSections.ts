import { computed, ref } from 'vue'
import type { StandardRule, StandardSection } from './types'

/** Section IDs are positional: edited text must never reuse the old rule bindings. */
export function useDocumentSections() {
  const content = ref(''), sections = ref<StandardSection[]>([]), rules = ref<StandardRule[]>([])
  const bindingsValid = computed(() => rules.value.every(rule => sections.value.some(section => section.id === rule.section)))
  function editContent(value: string) {
    if (value === content.value) return false
    content.value = value; sections.value = []
    rules.value = rules.value.map(rule => ({ ...rule, section: '' }))
    return true
  }
  return { content, sections, rules, bindingsValid, editContent }
}
