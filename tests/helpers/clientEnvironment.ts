import type { Environment } from 'vitest/environments'

// Compile SFCs with their client render function for the in-memory Vue renderer.
export default {
  name: 'memory-client', viteEnvironment: 'client',
  setup() { return { teardown() {} } },
} satisfies Environment
