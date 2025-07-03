import {coverageConfigDefaults, defineConfig} from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
    plugins: [
        tsconfigPaths({
            root: './',
        }),
    ],
    test: {
        setupFiles: ['./src/require.ts'],
        environment: 'node',
        include: [
            'src/**/*.{test,spec}.ts',
        ],
        exclude: ['node_modules'],
        coverage: {
            all: true,
            provider: 'v8',
            include: ['src/**'],
            exclude: ['assets/**', 'tests/**', ...coverageConfigDefaults.exclude],
            excludeAfterRemap: true,
            reporter: ['text', 'json', 'html'],
        },
        testTimeout: 60000,
    },
});
