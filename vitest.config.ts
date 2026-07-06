import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node', // web tests opt into jsdom via `// @vitest-environment jsdom`
    // MUST include the existing tests/ dir (72 tests live there) plus the new web tests.
    include: ['tests/**/*.test.ts', 'web/src/**/*.test.{ts,tsx}'],
    setupFiles: ['web/src/test-setup.ts'],
  },
});
