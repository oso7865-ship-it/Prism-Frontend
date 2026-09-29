import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  test: { projects: [
    { extends: true, test: { name: 'ssr', include: ['tests/**/*.test.ts'], exclude: ['tests/history-state.test.ts'] } },
    { extends: true, test: { name: 'state', include: ['tests/history-state.test.ts'], environment: './tests/helpers/clientEnvironment.ts' } },
  ] },
})
