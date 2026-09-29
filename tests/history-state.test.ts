// @vitest-environment ./tests/helpers/clientEnvironment.ts
import { afterEach, expect, it, vi } from 'vitest'
import { authClient } from '../src/features/auth/api'
import ReviewVerification from '../src/features/analysis/ReviewVerification.vue'
import StandardCitation from '../src/features/standards/StandardCitation.vue'
import { mountStateful } from './helpers/memoryRenderer'

vi.mock('../src/features/analysis/ReviewCodeViewer.vue', () => ({ default: { props: ['filePath'], template: '<aside>{{ filePath }}</aside>' } }))
afterEach(() => vi.restoreAllMocks())
const citation = { document_id: 'd', version: 1, section: 's1', title: '규칙', heading: '구조' }
const excerpt = (text: string) => ({ sections: [{ id: 's1', text }] })

it('closes the selected verification source when another run reuses its file ID', async () => {
  const verification = { status: 'CHECKED', file_checks: [{ file_id: 'f1', file_path: 'old.py', line: 1, outcome: 'LIMITED', observation: 'limited' }] }
  const view = mountStateful(ReviewVerification, { verification, empty: true, workspaceId: 'w', runId: 'old', headSha: 'a', githubUrl: '' })
  view.find('button', '코드 보기').props.onClick(); await view.settle()
  expect(view.find('aside', 'old.py')).toBeDefined()
  await view.update({ runId: 'new', verification: { ...verification, file_checks: [{ ...verification.file_checks[0], file_path: 'new.py' }] } })
  expect(view.find('aside', 'old.py')).toBeUndefined()
  view.find('button', '코드 보기').props.onClick(); await view.settle()
  expect(view.find('aside', 'new.py')).toBeDefined(); view.unmount()
})

it('clears an open excerpt on version changes and fetches the selected version', async () => {
  const request = vi.spyOn(authClient, 'request').mockResolvedValueOnce(excerpt('old body')).mockResolvedValueOnce(excerpt('new body'))
  const view = mountStateful(StandardCitation, { citation, workspaceId: 'w', repositoryId: 'r' })
  await view.find('button', '근거 문서 보기').props.onClick(); await view.settle()
  expect(view.text()).toContain('old body')
  await view.update({ citation: { ...citation, version: 2 } })
  expect(view.text()).not.toContain('old body')
  await view.find('button', '근거 문서 보기').props.onClick(); await view.settle()
  expect(request).toHaveBeenLastCalledWith('/api/v1/workspaces/w/repositories/r/standards/d/versions/2')
  expect(view.text()).toContain('new body'); view.unmount()
})

it('a delayed old excerpt cannot replace the new version or clear its loading state', async () => {
  let old!: (v: unknown) => void, current!: (v: unknown) => void
  vi.spyOn(authClient, 'request').mockImplementationOnce(() => new Promise(r => { old = r })).mockImplementationOnce(() => new Promise(r => { current = r }))
  const view = mountStateful(StandardCitation, { citation, workspaceId: 'w', repositoryId: 'r' })
  const first = view.find('button', '근거 문서 보기').props.onClick(); await view.settle()
  await view.update({ citation: { ...citation, version: 2 } })
  const second = view.find('button', '근거 문서 보기').props.onClick(); await view.settle()
  old(excerpt('old body')); await first; await view.settle()
  expect(view.text()).not.toContain('old body'); expect(view.text()).toContain('불러오고')
  current(excerpt('new body')); await second; await view.settle()
  expect(view.text()).toContain('new body'); view.unmount()
})
