import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

// Swap the Devvit server SDK for an in-memory fake so the backend services and
// Hono routes can be exercised without a live Reddit/Redis runtime.
export default defineConfig({
  resolve: {
    alias: {
      '@devvit/web/server': resolve(__dirname, 'tests/mocks/devvitServer.ts'),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    globals: true,
  },
});
