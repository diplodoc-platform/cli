import {defineConfig} from 'vitest/config';
import path from 'node:path';

const resolveTestPaths = (paths: string | undefined) => {
    if (!paths) {
        return [];
    }

    return paths.split(',').map((dir) => path.resolve(process.cwd(), dir));
};

const resolvedTestPaths = resolveTestPaths(process.env.DIPLODOC_TEST_PATHS);

export default defineConfig({
    test: {
        globals: false,
        environment: 'node',
        include: [
            'tests/e2e/**/*.{test,spec}.ts',
            ...resolvedTestPaths.map((testPath) => `${testPath}/**/*.{test,spec}.ts`),
        ],
        exclude: ['node_modules'],
        root: __dirname,
        testTimeout: 60000,
    },
});
