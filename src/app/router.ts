import { createRouter, createWebHistory, type RouterHistory } from 'vue-router'
import HomeView from './HomeView.vue'
import LoginView from './LoginView.vue'
import WorkspacePanel from '../features/workspace/WorkspacePanel.vue'
import { restoreSession, sessionUser } from '../features/auth/session'
import { clearReturn, pendingReturn, rememberReturn, safeReturn } from '../features/auth/returnLocation'

export function createAppRouter(history: RouterHistory = createWebHistory()) {
const router = createRouter({
  history,
  routes: [
    { path: '/', redirect: to => ({ path: to.hash.startsWith('#invite=') ? '/app/team' : to.query.repository_result ? '/app/repositories' : to.query.auth_error ? '/login' : '/app', query: to.query, hash: to.hash }) },
    { path: '/login', component: LoginView, meta: { title: '로그인' } },
    { path: '/app', component: HomeView, meta: { requiresAuth: true }, children: [
      { path: '', component: WorkspacePanel, meta: { page: 'home', title: '홈' } },
      { path: 'repositories', component: WorkspacePanel, meta: { page: 'repositories', title: '저장소와 변경 요청' } },
      { path: 'team', component: WorkspacePanel, meta: { page: 'team', title: '팀 설정' } },
    ] },
    { path: '/:pathMatch(.*)*', redirect: '/app' },
  ],
  scrollBehavior: (to, from, saved) => saved || (to.path !== from.path ? { top: 0 } : {}),
})
router.beforeEach(async to => {
  await restoreSession()
  if (to.meta.requiresAuth && !sessionUser.value) {
    rememberReturn(to.fullPath)
    return { path: '/login', query: { next: to.fullPath.split('#')[0] }, hash: to.hash }
  }
  if (sessionUser.value && to.path === '/login' && !to.query.auth_error) {
    const target = safeReturn(typeof to.query.next === 'string' ? to.query.next + to.hash : null) || pendingReturn() || '/app'
    clearReturn(); return target
  }
  if (sessionUser.value && to.redirectedFrom?.path === '/' && !to.query.repository_result) {
    const target = pendingReturn(); clearReturn()
    if (target && target !== to.fullPath) return target
  }
})
router.afterEach(to => { if (typeof document !== 'undefined') document.title = `${to.meta.title || '작업 공간'} · PRism` })
return router
}
