import { createRouter, createWebHistory, type RouterHistory } from 'vue-router'
import HomeView from './HomeView.vue'
import LoginView from './LoginView.vue'
import WorkspacePanel from '../features/workspace/WorkspacePanel.vue'
import { restoreSession, sessionUser } from '../features/auth/session'

export function createAppRouter(history: RouterHistory = createWebHistory()) {
const router = createRouter({
  history,
  routes: [
    { path: '/', redirect: to => ({ path: to.hash.startsWith('#invite=') ? '/app/team' : to.query.repository_result ? '/app/repositories' : to.query.auth_error ? '/login' : '/app', query: to.query, hash: to.hash }) },
    { path: '/login', component: LoginView, meta: { title: '로그인' } },
    { path: '/app', component: HomeView, meta: { requiresAuth: true }, children: [
      { path: '', component: WorkspacePanel, meta: { page: 'home', title: '홈' } },
      { path: 'repositories', component: WorkspacePanel, meta: { page: 'repositories', title: '저장소와 PR' } },
      { path: 'team', component: WorkspacePanel, meta: { page: 'team', title: '팀 설정' } },
    ] },
    { path: '/:pathMatch(.*)*', redirect: '/app' },
  ],
  scrollBehavior: (to, from, saved) => saved || (to.path !== from.path ? { top: 0 } : {}),
})
router.beforeEach(async to => {
  await restoreSession()
  if (to.meta.requiresAuth && !sessionUser.value) return { path: '/login', query: { next: to.path } }
  if (to.path === '/login' && sessionUser.value && !to.query.auth_error) return '/app'
})
router.afterEach(to => { if (typeof document !== 'undefined') document.title = `${to.meta.title || '작업 공간'} · PRism` })
return router
}
