import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    coverage: {
      // Only source coverage matters, not the tests' own coverage.
      include: ['src/**/*.ts'],
      provider: 'v8',
      reporter: ['text'],
      reportsDirectory: './coverage',
    },
    include: ['test/**/*.test.ts'],
  },
})
