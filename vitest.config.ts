import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    coverage: {
      // Solo importa la cobertura del codigo fuente, no de los propios tests.
      include: ['src/**/*.ts'],
      provider: 'v8',
      reporter: ['text'],
      reportsDirectory: './coverage',
    },
    include: ['test/**/*.test.ts'],
  },
})
