import { createApp } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'
import App from './App.vue'
import HomeView from './HomeView.vue'
import './style.css'

const router = createRouter({
  history: createWebHistory(),
  routes: [{ path: '/', component: HomeView }],
})
createApp(App).use(router).mount('#app')
