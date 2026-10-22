import { defineConfig } from 'vitest/config';

// Run through `npm run test:rules`, which starts the Firestore and Storage emulators first.
export default defineConfig({
  test: {
    include: ['tests/rules/**/*.spec.ts'],
    environment: 'node',
    globals: true,
    testTimeout: 20_000,
    fileParallelism: false,
  },
});
