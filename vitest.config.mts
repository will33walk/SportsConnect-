import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

// Node environment, not jsdom. Everything under test here is pure domain logic
// lifted out of server actions and components: the live-game event replay,
// scheduling, draft order, pricing windows, age math. Component tests would
// need their own jsdom project; add one only when there are components whose
// behaviour isn't already covered by testing the logic underneath them.
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    fileParallelism: false,
  },
});
