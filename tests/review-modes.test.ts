import { describe, expect, it, vi } from 'vitest'
import { createSSRApp } from 'vue'
import { renderToString } from 'vue/server-renderer'
import AccountMenu from '../src/features/auth/AccountMenu.vue'
import { createAuthClient, type UserProfile } from '../src/features/auth/api'

const profile: UserProfile = { id: 'user-id', github_user_id: 42, login: 'tester', display_name: null, avatar_url: null, review_mode: 'SENIOR' }
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status })

async function render(props: Record<string, unknown>) {
  const html = await renderToString(createSSRApp(AccountMenu, { user: profile, busy: false, ...props }))
  return { html, text: html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ') }
}

describe('review mode preference', () => {
  it('sends only the closed mode value and returns the saved profile', async () => {
    const fetcher = vi.fn<typeof fetch>(async (input, init) => {
      if (input === '/api/v1/auth/refresh') return json({ access_token: 'token' })
      expect(input).toBe('/api/v1/users/me/preferences')
      expect(init?.method).toBe('PATCH')
      expect(JSON.parse(String(init?.body))).toEqual({ review_mode: 'JUNIOR' })
      return json({ ...profile, review_mode: 'JUNIOR' })
    })
    expect((await createAuthClient(fetcher).updateReviewMode('JUNIOR')).review_mode).toBe('JUNIOR')
  })

  it('does not accept a response that disagrees with the request or an unknown mode', async () => {
    const wrong = createAuthClient(async input => input === '/api/v1/auth/refresh' ? json({ access_token: 't' }) : json({ ...profile, review_mode: 'SENIOR' }))
    await expect(wrong.updateReviewMode('JUNIOR')).rejects.toThrow()
    const unknown = createAuthClient(async input => input === '/api/v1/auth/refresh' ? json({ access_token: 't' }) : json({ ...profile, review_mode: 'MIDDLE' }))
    await expect(unknown.updateReviewMode('JUNIOR')).rejects.toThrow()
  })

  it('treats a server that omits the mode as senior and rejects unknown values on profile load', async () => {
    const { review_mode: _omitted, ...legacy } = profile
    const old = createAuthClient(async input => input === '/api/v1/auth/refresh' ? json({ access_token: 't' }) : json(legacy))
    expect((await old.currentUser())?.review_mode).toBe('SENIOR')
    const bad = createAuthClient(async input => input === '/api/v1/auth/refresh' ? json({ access_token: 't' }) : json({ ...legacy, review_mode: 'x' }))
    await expect(bad.currentUser()).rejects.toThrow()
  })

  it('shows an accessible two-option group with the stored mode selected', async () => {
    const senior = await render({})
    expect(senior.html).toContain('<fieldset')
    expect(senior.text).toContain('AI 리뷰 설명 모드')
    expect(senior.text).toContain('시니어')
    expect(senior.text).toContain('주니어')
    expect(senior.html.match(/type="radio"/g)).toHaveLength(2)
    expect(senior.html).toMatch(/value="SENIOR"[^>]*checked/)
    const junior = await render({ user: { ...profile, review_mode: 'JUNIOR' } })
    expect(junior.html).toMatch(/value="JUNIOR"[^>]*checked/)
    expect(junior.html).not.toMatch(/value="SENIOR"[^>]*checked/)
  })

  it('explains scope, disables while saving and announces a failed save', async () => {
    const saving = await render({ modeBusy: true })
    expect(saving.html).toMatch(/<fieldset[^>]*aria-busy="true"/)
    expect(saving.html).not.toMatch(/<fieldset[^>]*disabled/)
    expect(saving.text).toContain('저장하는 중')
    expect(saving.text).toContain('이미 만든 리뷰는 바뀌지 않아요')
    const failed = await render({ modeError: '설명 모드를 저장하지 못했어요.' })
    expect(failed.html).toContain('role="alert"')
    expect(failed.text).toContain('설명 모드를 저장하지 못했어요.')
  })
})

describe('review card for each mode', () => {
  const issue = { key: 'k', file_path: 'a.py', line: 2, title: '제목', severity: 'ERROR', basis: 'SUPPORTED', trigger: '입력 상황', consequence: '결과 문장', evidence: '이유 설명', suggestion: '개선 방법' }
  const renderCard = async (props: Record<string, unknown>) => {
    const { default: Card } = await import('../src/features/analysis/ReviewIssueCard.vue')
    return renderToString(createSSRApp(Card, { issue, question: false, workspaceId: 'w', runId: 'r', githubUrl: '', headSha: 'a'.repeat(40), ...props }))
  }

  it('opens the reason and fix by default only when asked (junior)', async () => {
    expect(await renderCard({ defaultOpen: true })).toMatch(/<details[^>]*review-card-details[^>]*open/)
    expect(await renderCard({})).not.toMatch(/<details[^>]*review-card-details[^>]*open/)
  })

  it('does not repeat the consequence that the card already shows on top', async () => {
    const html = await renderCard({})
    expect(html.match(/결과 문장/g)).toHaveLength(1)
    expect(html).toContain('입력 상황')
    expect(html).toContain('이유 설명')
  })

  it('keeps the consequence in the details of a question, which shows its premise on top', async () => {
    const html = await renderCard({ question: true, issue: { ...issue, basis: 'NEEDS_CONTEXT', assumptions: ['확인할 전제'] } })
    expect(html.match(/결과 문장/g)).toHaveLength(1)
    expect(html).toContain('확인할 전제')
  })
})
