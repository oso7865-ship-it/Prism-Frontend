import { expect, it } from 'vitest'
import { useDocumentSections } from '../src/features/standards/useDocumentSections'

it('preserves rule values but requires explicit rebinding after heading insertion or upload', () => {
  const draft = useDocumentSections()
  draft.content.value = '# Structure\nsrc/domain'
  draft.sections.value = [{ id: 's1', heading: 'Structure', text: 'src/domain' }]
  draft.rules.value = [{ kind: 'PATH_PREFIX', value: 'src/domain', section: 's1', include: ['src/**'], exclude: ['tests/**'] }]
  expect(draft.bindingsValid.value).toBe(true)
  draft.editContent('# New section\nother\n# Structure\nsrc/domain')
  expect(draft.sections.value).toEqual([]); expect(draft.bindingsValid.value).toBe(false)
  expect(draft.rules.value[0]).toEqual({ kind: 'PATH_PREFIX', value: 'src/domain', section: '', include: ['src/**'], exclude: ['tests/**'] })
  draft.sections.value = [{ id: 's1', heading: 'New section', text: 'other' }, { id: 's2', heading: 'Structure', text: 'src/domain' }]
  expect(draft.bindingsValid.value).toBe(false)
  draft.rules.value[0].section = 's2'
  expect(draft.bindingsValid.value).toBe(true)
  expect(draft.editContent(draft.content.value)).toBe(false)
  expect(draft.bindingsValid.value).toBe(true)
})
