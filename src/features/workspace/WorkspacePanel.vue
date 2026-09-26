<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { AuthError, authClient } from '../auth/api'
import { sessionUser } from '../auth/session'
import AppIcon from '../../shared/ui/AppIcon.vue'
import StatusBadge from '../../shared/ui/StatusBadge.vue'
import PullRequestDetail from './PullRequestDetail.vue'
import { findGitHubUser, type GitHubPerson } from './githubUser'
import type { PR, Review } from './types'
type Team = { id: string; name: string; role: string }
type Member = { user_id: string; role: string }
type Invite = { id: string; target_github_user_id: number; role: string; expires_at: string }
type Repo = { id: string; owner_login: string; repository_name: string; status: string; last_sync_success_at: string | null }
type Sync = { id: string; status: string; fetched_count: number; error_code: string | null; next_cursor: string | null }
type Page<T> = { items: T[]; next_cursor: string | null }
const route = useRoute(), router = useRouter()
const page = computed(() => route.meta.page as 'home' | 'repositories' | 'team')
const query = ref(''), stateFilter = ref('ALL'), loadedKind = ref('')
const toolsOpen = ref(false), repoToolsOpen = ref(false)
const invitePerson = ref<GitHubPerson | null>(null)
const failed = ref(false), initialized = ref(false)
const createDisclosure = ref<HTMLDetailsElement | null>(null), joinDisclosure = ref<HTMLDetailsElement | null>(null)
const visiblePRs = computed(() => prs.value.filter(pr => (stateFilter.value === 'ALL' || (stateFilter.value === 'MERGED' ? pr.merge_status === 'MERGED' : stateFilter.value === 'CLOSED' ? pr.state === 'CLOSED' && pr.merge_status !== 'MERGED' : pr.state === stateFilter.value)) && `${pr.title} ${pr.pr_number}`.toLowerCase().includes(query.value.toLowerCase())))
const currentRepo = computed(() => repos.value.find(r => r.id === activeRepo.value?.id) || activeRepo.value)
const prUrl = computed(() => activeRepo.value && detail.value ? `https://github.com/${activeRepo.value.owner_login}/${activeRepo.value.repository_name}/pull/${detail.value.pr_number}` : '')
const formatTime = (value: string | null) => value ? new Date(value).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '아직 동기화하지 않음'
async function visitRepo(repo: Repo) { await openRepo(repo) }
async function visitPR(pr: PR) { await openPR(pr) }
async function closeDetail() { const id = detail.value?.id; detail.value = null; await router.push({ path: route.path, query: { ...route.query, pr: undefined, analysis: undefined } }); await nextTick(); document.getElementById(`pr-${id}`)?.focus() }
const props = defineProps<{ userId: string }>()
async function revealCreateTeam() { toolsOpen.value = true; await nextTick(); if (createDisclosure.value) { createDisclosure.value.open = true; createDisclosure.value.querySelector('input')?.focus() } }
watch(() => route.path, async () => { await nextTick(); document.getElementById('page-title')?.focus({ preventScroll: true }) })
const teams = ref<Team[]>([]), selected = ref(typeof route.query.team === 'string' ? route.query.team : ''), name = ref(''), busy = ref(false), message = ref('')
const members = ref<Member[]>([]), invites = ref<Invite[]>([]), repos = ref<Repo[]>([])
const target = ref(''), inviteRole = ref('MEMBER'), token = ref(''), inviteLink = ref(''), fullName = ref('')
const app = ref<{ configured: boolean; installation_url: string | null }>({ configured: false, installation_url: null })
const activeRepo = ref<Repo | null>(null), prs = ref<PR[]>([]), sync = ref<Sync | null>(null), detail = ref<PR | null>(null), reviews = ref<Review[]>([])
const team = computed(() => teams.value.find(t => t.id === selected.value))
const canManage = computed(() => ['OWNER', 'ADMIN'].includes(team.value?.role || ''))
watch(target, () => { invitePerson.value = null; inviteLink.value = '' })
async function lookupPerson() { invitePerson.value = null; invitePerson.value = await findGitHubUser(target.value) }
const base = () => `/api/v1/workspaces/${selected.value}`
watch(() => [route.query.team, busy.value] as const, async ([value]) => {
  if (typeof value === 'string' && value !== selected.value && teams.value.some(t => t.id === value)) {
    // Wait for the active request so results from the previous team cannot overwrite this one.
    if (busy.value) return
    selected.value = value
    await action(loadTeam)
  }
})
async function action(fn: () => Promise<void>) {
  if (busy.value) return
  busy.value = true; message.value = ''; failed.value = false
  try { await fn() } catch (error) {
    if (error instanceof AuthError && error.status === 401) { sessionUser.value = null; await router.replace('/login'); return }
    failed.value = true; message.value = error instanceof Error ? error.message : '요청에 실패했습니다.'
  }
  finally { busy.value = false }
}
const api = authClient.request
const json = (method: string, body: unknown) => ({ method, body: JSON.stringify(body) })
async function all<T>(path: string): Promise<T[]> {
  const items: T[] = []; let cursor: string | null = null
  do {
    const result: Page<T> = await api(`${path}${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`)
    items.push(...result.items); cursor = result.next_cursor
  } while (cursor && items.length < 1000)
  return items
}
async function loadTeams() {
  teams.value = await all<Team>('/api/v1/workspaces')
  if (!teams.value.some(t => t.id === selected.value)) selected.value = teams.value[0]?.id || ''
  await loadTeam()
}
async function loadTeam() {
  invitePerson.value = null; inviteRole.value = 'MEMBER'; loadedKind.value = ''; query.value = ''; stateFilter.value = 'ALL'
  members.value = []; invites.value = []; repos.value = []; prs.value = []; detail.value = null; reviews.value = []; activeRepo.value = null; sync.value = null; inviteLink.value = ''
  if (!selected.value) return
  if (route.query.team !== selected.value) await router.replace({ path: route.path, query: { ...route.query, team: selected.value }, hash: route.hash })
  const [m, r] = await Promise.all([all<Member>(`${base()}/members`), all<Repo>(`${base()}/repositories`)])
  members.value = m; repos.value = r
  if (canManage.value) invites.value = await all<Invite>(`${base()}/invitations`)
  const first = repos.value.find(r => r.id === route.query.repo && r.status === 'ACTIVE') || repos.value.find(r => r.status === 'ACTIVE')
  if (first) { await openRepo(first, false); const pr = prs.value.find(p => p.id === route.query.pr); if (pr) await openPR(pr, false) }
}
async function createTeam() { const made = await api<Team>('/api/v1/workspaces', json('POST', { name: name.value })); selected.value = made.id; name.value = ''; await loadTeams(); if (createDisclosure.value) createDisclosure.value.open = false; message.value = '팀을 만들었습니다.' }
async function invite() {
  if (!invitePerson.value) throw new Error('먼저 GitHub 계정을 확인하세요.')
  const id = invitePerson.value.id
  const made = await api<{ token: string }>(`${base()}/invitations`, json('POST', { target_github_user_id: id, role: inviteRole.value }))
  await loadTeam(); inviteLink.value = `${location.origin}/app/team#invite=${made.token}`
  message.value = '초대 링크를 복사해 대상자에게 전달하세요. 링크는 이 화면에서만 확인할 수 있습니다.'
}
async function accept() { const joined = await api<Team>('/api/v1/invitations/accept', json('POST', { token: token.value.trim() })); token.value = ''; selected.value = joined.id; await loadTeams(); if (joinDisclosure.value) joinDisclosure.value.open = false; message.value = '팀에 가입했습니다.' }
async function remove(member: Member) { if (!confirm('이 멤버의 팀 접근을 종료할까요?')) return; await api(`${base()}/members/${member.user_id}`, { method: 'DELETE' }); await loadTeams() }
async function role(member: Member) { await api(`${base()}/members/${member.user_id}`, json('PATCH', { role: member.role === 'ADMIN' ? 'MEMBER' : 'ADMIN' })); await loadTeam() }
async function transfer(member: Member) { if (!confirm('소유권을 이전하면 내 역할은 ADMIN으로 바뀝니다. 진행할까요?')) return; await api(`${base()}/transfer-ownership`, json('POST', { user_id: member.user_id })); await loadTeams() }
async function connect() { const start = await api<{ authorization_url: string }>(`${base()}/repositories/connect`, json('POST', { full_name: fullName.value.trim() })); const url = new URL(start.authorization_url); if (url.origin !== 'https://github.com' || url.pathname !== '/login/oauth/authorize') throw new Error('연결 주소를 확인할 수 없습니다.'); location.assign(url.href) }
async function disconnect(repo: Repo) { if (!confirm('저장소 연결을 해제할까요? 새 동기화가 중단됩니다.')) return; await api(`${base()}/repositories/${repo.id}`, { method: 'DELETE' }); await loadTeam() }
async function openRepo(repo: Repo, navigate = true) { const result = await all<PR>(`${base()}/repositories/${repo.id}/pull-requests`); activeRepo.value = repo; query.value = ''; stateFilter.value = 'ALL'; loadedKind.value = '';  detail.value = null; reviews.value = []; sync.value = null; prs.value = result; if (navigate) await router.push({ path: '/app/repositories', query: { team: selected.value, repo: repo.id } }) }
async function requestSync(page = 1) { if (!activeRepo.value) return; sync.value = await api<Sync>(`${base()}/repositories/${activeRepo.value.id}/syncs`, json('POST', { page })); message.value = '동기화를 접수했습니다. 상태 확인 버튼으로 결과를 확인하세요.' }
async function checkSync() { if (!sync.value || !activeRepo.value) return; sync.value = await api<Sync>(`${base()}/repositories/${activeRepo.value.id}/syncs/${sync.value.id}`); if (sync.value.status === 'COMPLETED') { prs.value = await all<PR>(`${base()}/repositories/${activeRepo.value.id}/pull-requests`); repos.value = await all<Repo>(`${base()}/repositories`) } }
async function openPR(pr: PR, navigate = true) { loadedKind.value = ''; detail.value = await api<PR>(`${base()}/pull-requests/${pr.id}`); reviews.value = []; if (navigate) await router.push({ path: '/app/repositories', query: { team: selected.value, repo: activeRepo.value?.id, pr: pr.id } }) }
let restoredLocation = ''
watch(() => [route.fullPath, busy.value, initialized.value] as const, async () => {
  if (busy.value || !initialized.value || route.query.team !== selected.value || page.value !== 'repositories') return
  if (restoredLocation === route.fullPath) return
  restoredLocation = route.fullPath
  const repo = repos.value.find(r => r.id === route.query.repo && r.status === 'ACTIVE')
  const requestedPR = prs.value.find(p => p.id === route.query.pr)
  if ((repo && repo.id !== activeRepo.value?.id) || requestedPR?.id !== detail.value?.id) {
    await action(async () => {
      if (repo && repo.id !== activeRepo.value?.id) await openRepo(repo, false)
      const pr = prs.value.find(p => p.id === route.query.pr)
      if (pr && detail.value?.id !== pr.id) await openPR(pr, false)
      else if (!pr) detail.value = null
    })
  }
})
async function loadReviews(kind: string) { if (!detail.value) return; const result = await api<Page<Review>>(`${base()}/pull-requests/${detail.value.id}/github-reviews?kind=${kind}`); reviews.value = result.items; loadedKind.value = kind; message.value = result.next_cursor ? '최근 응답 30개를 표시합니다. 나머지는 GitHub에서 확인하세요.' : '조회했습니다.' }
onMounted(() => { const pending = new URLSearchParams(location.hash.slice(1)).get('invite'); if (pending) { toolsOpen.value = true; token.value = pending; if (joinDisclosure.value) joinDisclosure.value.open = true; void router.replace({ path: route.path, query: route.query, hash: '' }) } void action(async () => { app.value = await api('/api/v1/github-app'); await loadTeams(); initialized.value = true }) })
</script>

<template>
  <div class="workspace-shell" :class="{ 'detail-open': detail && page === 'repositories' }">
    <aside class="workspace-sidebar" aria-label="작업 공간 탐색">
      <div class="sidebar-section">
        <label class="eyebrow" for="team-select">WORKSPACE</label>
        <select id="team-select" v-model="selected" :disabled="busy || !teams.length" @change="action(loadTeam)"><option value="" disabled>팀을 선택하세요</option><option v-for="t in teams" :key="t.id" :value="t.id">{{ t.name }}</option></select>
        <div v-if="team" class="team-caption"><span>내 역할</span><StatusBadge :value="team.role" /></div>
      </div>
      <nav class="workspace-nav" aria-label="작업 메뉴">
        <RouterLink :to="{ path: '/app', query: selected ? { team: selected } : {} }" :aria-current="page === 'home' ? 'page' : undefined"><AppIcon name="home" />작업 공간 홈</RouterLink>
        <RouterLink :to="{ path: '/app/repositories', query: selected ? { team: selected } : {} }" :aria-current="page === 'repositories' ? 'page' : undefined"><AppIcon name="repo" />저장소와 PR<span class="count">{{ repos.length }}</span></RouterLink>
        <RouterLink :to="{ path: '/app/team', query: selected ? { team: selected } : {} }" :aria-current="page === 'team' ? 'page' : undefined"><AppIcon name="team" />팀 설정</RouterLink>
      </nav>
      <button class="mobile-tools-toggle text-button" :aria-expanded="toolsOpen" aria-controls="team-tools" @click="toolsOpen = !toolsOpen">팀 메뉴 {{ toolsOpen ? '접기' : '더 보기' }}</button><div id="team-tools" class="sidebar-tools" :class="{ 'is-open': toolsOpen }">
        <details ref="createDisclosure"><summary><AppIcon name="plus" />새 팀 만들기</summary><form class="stack-form" @submit.prevent="action(createTeam)"><label>새 팀 이름<input v-model="name" required maxlength="100" placeholder="함께 작업할 팀 이름" :disabled="busy" /></label><button :disabled="busy">팀 만들기</button></form></details>
        <details ref="joinDisclosure"><summary><AppIcon name="team" />초대로 팀 참여</summary><form class="stack-form" @submit.prevent="action(accept)"><label>초대 토큰<input v-model="token" required autocomplete="off" :disabled="busy" /></label><button :disabled="busy">초대 수락</button></form></details>
        <button class="text-button" :disabled="busy" @click="action(async () => { await loadTeams(); initialized = true })"><AppIcon name="refresh" />팀 새로고침</button>
      </div>
      <div class="sidebar-foot"><span class="small-mark">P</span><p>코드의 변화를<br />더 명확하게.</p></div>
    </aside>

    <div id="workspace-content" class="workspace-content" :aria-busy="busy">
      <div class="page-heading"><div><p class="eyebrow">{{ team?.name || '나의 작업 공간' }}</p><h1 id="page-title" tabindex="-1">{{ page === 'home' ? '나의 작업 공간' : page === 'repositories' ? '저장소와 PR' : '팀 설정' }}</h1><p class="muted">{{ page === 'home' ? '팀의 코드 리뷰, 여기서 이어가세요.' : page === 'repositories' ? '연결된 저장소의 변경 사항을 한곳에서 확인하세요.' : '함께 작업할 멤버와 팀 접근 권한을 관리하세요.' }}</p></div><span class="environment-label">로컬 작업 공간</span></div>
      <div class="feedback-slot" aria-live="polite"><p v-if="message" class="notice" :class="{ 'notice--error': failed }" :role="failed ? 'alert' : 'status'">{{ message }}</p><p v-else-if="busy" class="muted" role="status">데이터를 불러오고 있어요…</p></div>
      <div v-if="!initialized && failed" class="empty-state surface"><h2>작업 공간을 불러오지 못했어요</h2><p>연결 상태를 확인한 뒤 다시 시도해 주세요.</p><button :disabled="busy" @click="action(async () => { app = await api('/api/v1/github-app'); await loadTeams(); initialized = true })">다시 불러오기</button></div>
      <div v-else-if="!team && !busy" class="empty-state surface"><span class="empty-icon"><AppIcon name="team" /></span><h2>첫 팀으로 시작하세요</h2><p>팀을 만들거나 전달받은 초대를 수락하면<br />저장소를 연결하고 PR을 확인할 수 있어요.</p><button @click="revealCreateTeam">팀 만들기</button></div>
      <template v-else-if="team && page === 'home'">
        <section v-if="activeRepo && prs.length" class="surface home-section recent-pr-section"><div class="section-heading"><div><p class="eyebrow">{{ activeRepo.repository_name }}</p><h2>가져온 PR 이어보기</h2></div><span class="helper">현재 선택한 저장소</span></div><ul class="recent-pr-list"><li v-for="pr in prs.slice(0,4)" :key="pr.id"><button :disabled="busy" @click="action(()=>visitPR(pr))"><span class="recent-pr-number">#{{ pr.pr_number }}</span><strong>{{ pr.title }}</strong><StatusBadge :value="pr.merge_status === 'MERGED' ? 'MERGED' : pr.is_draft ? 'DRAFT' : pr.state" /><AppIcon name="arrow" /></button></li></ul></section>
        <section class="welcome-panel surface">
          <div><p class="eyebrow">{{ team.name }} / OVERVIEW</p><h2>작업 공간 요약</h2><p class="muted">연결된 저장소에서 변경 사항을 찾고,<br />코드를 이해하는 데 필요한 근거를 확인하세요.</p><RouterLink :to="{path:'/app/repositories', query:{team:selected}}" class="button">PR 살펴보기 <AppIcon name="arrow" /></RouterLink></div>
          <dl class="workspace-summary"><div><dt>연결된 저장소</dt><dd>{{ repos.filter(r => r.status === 'ACTIVE').length }}<small>개</small></dd></div><div><dt>함께하는 멤버</dt><dd>{{ members.length }}<small>명</small></dd></div></dl>
        </section>
        <div class="home-grid">
          <section class="surface home-section"><div class="section-heading"><h2>연결된 저장소</h2><RouterLink :to="{path:'/app/repositories',query:{team:selected}}">전체 보기 <AppIcon name="arrow" /></RouterLink></div>
            <ul class="home-repositories"><li v-for="r in repos.slice(0, 5)" :key="r.id"><button class="home-repository-link" :disabled="busy || r.status !== 'ACTIVE'" @click="action(()=>visitRepo(r))"><span class="repo-icon"><AppIcon name="repo" /></span><span class="home-repository-copy"><strong>{{ r.repository_name }}</strong><span class="helper">{{ r.owner_login }}</span><span class="helper">최근 동기화 · {{ formatTime(r.last_sync_success_at) }}</span></span><StatusBadge :value="r.status" /><AppIcon name="arrow" /></button></li></ul>
            <p v-if="!repos.length" class="empty-note">첫 저장소를 연결해 PR 확인을 시작하세요.</p>
          </section>
          <section class="surface home-section home-guide"><p class="eyebrow">REVIEW WITH CONTEXT</p><h2>리뷰의 시작은<br />변경을 이해하는 것.</h2><p class="muted">PR을 선택하고 정적 분석을 실행하세요. 발견된 항목을 파일과 줄 번호로 확인할 수 있습니다.</p><div class="guide-rule"><AppIcon name="check" /><span>4개 언어 · 23개 정적 규칙</span></div><div class="guide-rule"><AppIcon name="check" /><span>고정 커밋 기준의 분석 이력</span></div><RouterLink :to="{path:'/app/team',query:{team:selected}}" class="guide-team-link">함께 리뷰할 팀 관리 <AppIcon name="arrow" /></RouterLink></section>
        </div>

      </template>
      <template v-else-if="team && page === 'repositories'">
        <section class="surface repository-section" :class="{ 'show-repo-tools': repoToolsOpen }" aria-labelledby="repository-title">
          <div class="mobile-repo-picker"><label>저장소<select :value="activeRepo?.id" :disabled="busy" @change="action(() => openRepo(repos.find(r => r.id === ($event.target as HTMLSelectElement).value)!))"><option v-for="r in repos" :key="r.id" :value="r.id" :disabled="r.status !== 'ACTIVE'">{{ r.owner_login }}/{{ r.repository_name }}</option></select></label><button class="text-button" :aria-expanded="repoToolsOpen" @click="repoToolsOpen = !repoToolsOpen">{{ repoToolsOpen ? '관리 접기' : '저장소 관리' }}</button></div><div class="section-heading"><div><h2 id="repository-title">연결된 저장소 <span class="count">{{ repos.length }}</span></h2><p class="helper">저장소를 선택하면 아래에 PR이 표시됩니다.</p></div></div>
          <div v-if="!app.configured" class="notice">GitHub App 설정이 필요해요. 서버 설정을 완료하면 저장소를 연결할 수 있습니다.</div>
          <details v-if="canManage && app.configured" class="connect-disclosure"><summary class="connect-summary"><AppIcon name="plus" />저장소 연결</summary><div class="connect-body"><div><h3>GitHub 저장소 연결</h3><p class="helper">선택한 저장소의 PR 정보가 이 팀의 멤버에게 공유됩니다.</p><a :href="app.installation_url!" target="_blank" rel="noopener noreferrer" class="button secondary">1. GitHub App 설치 <AppIcon name="arrow" /></a></div><form class="stack-form" @submit.prevent="action(connect)"><label>2. 저장소 이름<input v-model="fullName" placeholder="owner/repository" required :disabled="busy" /></label><button :disabled="busy">권한 확인 후 연결 <AppIcon name="arrow" /></button></form></div></details>
          <div v-if="!repos.length && !busy" class="empty-state compact"><AppIcon name="repo" /><h3>아직 연결된 저장소가 없어요</h3><p>{{ canManage ? '저장소 연결을 눌러 첫 저장소를 추가하세요.' : '팀 관리자에게 저장소 연결을 요청하세요.' }}</p></div>
          <ul v-else class="repository-list"><li v-for="r in repos" :key="r.id" :class="{ 'is-selected': activeRepo?.id === r.id }"><button class="repository-select" :disabled="busy || r.status !== 'ACTIVE'" :aria-pressed="activeRepo?.id === r.id" @click="action(() => openRepo(r))"><span class="repo-icon"><AppIcon name="repo" /></span><span class="repository-name"><strong>{{ r.repository_name }}</strong><span>{{ r.owner_login }}</span></span><StatusBadge :value="r.status" /></button><details v-if="canManage && r.status !== 'DISCONNECTED'" class="repository-manage"><summary :aria-label="`${r.repository_name} 연결 관리`">관리</summary><div><p class="helper">연결을 해제하면 새 동기화가 중단됩니다.</p><button class="danger-button" :disabled="busy" @click="action(() => disconnect(r))">연결 해제</button></div></details></li></ul>
        </section>

        <div v-if="activeRepo" class="pr-workspace" :class="{ 'has-detail': detail }">
          <section class="surface pr-section" aria-labelledby="pr-list-title">
            <div class="section-heading"><div><p class="eyebrow">{{ activeRepo.repository_name }}</p><h2 id="pr-list-title">Pull requests <span class="count">{{ prs.length }}</span></h2></div><button :disabled="busy || !canManage || ['PENDING', 'RUNNING'].includes(sync?.status || '')" @click="action(() => requestSync())"><AppIcon name="refresh" />PR 동기화</button></div>
            <p class="helper">최근 동기화 {{ formatTime(currentRepo?.last_sync_success_at || null) }}<span v-if="!canManage"> · 관리자만 동기화할 수 있어요.</span></p>
            <div v-if="sync" class="sync-status" role="status"><StatusBadge :value="sync.status" /><span>{{ sync.fetched_count }}개 반영</span><span v-if="sync.error_code" class="helper">처리하지 못했어요. 다시 동기화해 주세요.</span><button class="text-button" :disabled="busy" @click="action(checkSync)"><AppIcon name="refresh" />상태 확인</button></div>
            <div class="list-toolbar"><label class="search-field"><span class="sr-only">가져온 PR 검색</span><AppIcon name="search" /><input v-model="query" type="search" placeholder="PR 제목 또는 번호 검색" /></label><label><span class="sr-only">PR 상태 필터</span><select v-model="stateFilter"><option value="ALL">모든 상태</option><option value="OPEN">열린 PR</option><option value="MERGED">병합된 PR</option><option value="CLOSED">닫힌 PR · 미병합</option></select></label></div>
            <ul v-if="visiblePRs.length" class="pr-list"><li v-for="pr in visiblePRs" :key="pr.id"><button :id="`pr-${pr.id}`" class="pr-row" :class="{ 'is-selected': detail?.id === pr.id }" :aria-pressed="detail?.id === pr.id" :disabled="busy" @click="action(() => openPR(pr))"><AppIcon name="pr" :class="{ 'merged-icon': pr.merge_status === 'MERGED' }" /><span class="pr-row-content"><strong>{{ pr.title }}</strong><span>#{{ pr.pr_number }} · {{ pr.author_login || '작성자 미확인' }}</span></span><StatusBadge :value="pr.merge_status === 'MERGED' ? 'MERGED' : pr.is_draft ? 'DRAFT' : pr.state" /></button></li></ul>
            <div v-else-if="!busy" class="empty-state compact"><AppIcon name="pr" /><h3>{{ prs.length ? '검색 결과가 없어요' : '아직 가져온 PR이 없어요' }}</h3><p>{{ prs.length ? '다른 검색어나 상태로 확인해 보세요.' : 'PR을 동기화하면 이곳에 표시됩니다.' }}</p><button v-if="prs.length" class="secondary" @click="query = ''; stateFilter = 'ALL'">필터 초기화</button></div>
            <div class="list-footer"><span>가져온 PR {{ visiblePRs.length }}개 표시</span><button v-if="sync?.next_cursor" class="text-button" :disabled="busy" @click="action(() => requestSync(Number(sync?.next_cursor)))">이전 PR 더 가져오기</button></div>
          </section>
          <PullRequestDetail v-if="detail" :workspace-id="selected" :user-id="userId" :can-manage="canManage" :owner="team.role === 'OWNER'" :pr="detail" :reviews="reviews" :busy="busy" :loaded-kind="loadedKind" :github-url="prUrl" @close="closeDetail" @reviews="kind => action(() => loadReviews(kind))" />
        </div>
        <p class="workspace-note">PR을 선택하면 정적 분석 결과와 GitHub 활동을 함께 확인할 수 있습니다.</p>
      </template>

      <template v-else-if="team && page === 'team'">
        <section class="surface settings-section"><div class="section-heading"><div><h2>팀 멤버 <span class="count">{{ members.length }}</span></h2><p class="helper">{{ team.name }}에서 함께 작업하는 멤버입니다.</p></div></div><ul class="member-list"><li v-for="m in members" :key="m.user_id"><span class="avatar">{{ m.user_id === props.userId ? '나' : 'M' }}</span><div class="member-identity"><strong>{{ m.user_id === props.userId ? '나' : '팀 멤버' }}</strong><span class="helper">{{ m.user_id === props.userId ? '현재 로그인한 계정' : m.user_id }}</span></div><StatusBadge :value="m.role" /><details v-if="m.role !== 'OWNER' && (team.role === 'OWNER' || m.user_id === props.userId || (team.role === 'ADMIN' && m.role === 'MEMBER'))" class="member-actions"><summary>권한 관리</summary><div class="button-group"><template v-if="team.role === 'OWNER'"><button class="secondary" :disabled="busy" @click="action(() => role(m))">{{ m.role === 'ADMIN' ? '멤버로 변경' : '관리자로 변경' }}</button><button class="secondary" :disabled="busy" @click="action(() => transfer(m))">소유권 이전</button></template><button class="danger-button" :disabled="busy" @click="action(() => remove(m))">{{ m.user_id === props.userId ? '팀 탈퇴' : '멤버 제거' }}</button></div></details></li></ul></section>
        <section v-if="canManage" class="surface settings-section"><h2>멤버 초대</h2><p class="helper">GitHub 사용자명을 검색하고 계정을 확인한 후 초대하세요. 초대는 24시간 동안 유효합니다.</p><form class="account-search" @submit.prevent="action(lookupPerson)"><label>GitHub 사용자명<input v-model="target" required maxlength="40" autocomplete="off" placeholder="예: octocat" :disabled="busy" /></label><button class="secondary" :disabled="busy || !target.trim()">{{ busy ? '확인 중…' : '계정 확인' }}</button></form><div v-if="invitePerson" class="verified-person" role="status"><AppIcon name="check" /><div><strong>@{{ invitePerson.login }}</strong><p class="helper">이 계정만 초대를 수락할 수 있습니다.</p></div><a :href="invitePerson.html_url" target="_blank" rel="noopener noreferrer">프로필 보기 ↗</a></div><form v-if="invitePerson" class="invite-form" @submit.prevent="action(invite)"><label>초대할 역할<select v-model="inviteRole" :disabled="busy"><option value="MEMBER">멤버</option><option v-if="team.role === 'OWNER'" value="ADMIN">관리자</option></select></label><button :disabled="busy">초대 링크 만들기</button></form><label v-if="inviteLink" class="invite-result">전달할 초대 링크<input :value="inviteLink" readonly @focus="($event.target as HTMLInputElement).select()" /><span class="helper">지금 복사해 대상자에게 전달하세요. 다시 표시되지 않습니다.</span></label><h3 v-if="invites.length" class="subheading">대기 중인 초대</h3><ul class="invitation-list"><li v-for="i in invites" :key="i.id"><div><strong>GitHub ID {{ i.target_github_user_id }}</strong><p class="helper">{{ formatTime(i.expires_at) }} 만료</p></div><StatusBadge :value="i.role" /><button v-if="team.role === 'OWNER' || i.role === 'MEMBER'" class="text-button danger-text" :disabled="busy" @click="action(async () => { await api(`${base()}/invitations/${i.id}`, { method: 'DELETE' }); await loadTeam() })">초대 취소</button></li></ul></section>
        <p class="workspace-note">팀 멤버는 연결된 저장소의 PR 메타데이터를 볼 수 있습니다. GitHub 원본 저장소 권한은 별도로 관리됩니다.</p>
      </template>
    </div>
  </div>
</template>
