import { createSSRApp, type Component } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { createMemoryHistory, createRouter } from 'vue-router'

/** SSR fixture runner; the test maps mounted data loading to server prefetch. */
export async function renderFixture(component: Component, props: Record<string, unknown>, path = '/app/repositories?tab=static') {
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/:pathMatch(.*)*', component: { template: '<div />' }, meta: {page: path.includes('/team') ? 'team' : 'repositories'} }] })
  await router.push(path)
  const app = createSSRApp(component, props)
  app.use(router)
  const html = await renderToString(app)
  return { html, text: () => html.replace(/<[^>]*>/g, ' ') }
}
