import {defineConfig} from 'vitest/config';

export default defineConfig({
    test: {
        globals: false,
        environment: 'node',
        include: [
            'tests/e2e/**/*.{test,spec}.ts',
            // 'tests/e2e/alternates.test.ts',
        ],
        exclude: ['node_modules'],
        root: __dirname,
        testTimeout: 60000,
    },
});
