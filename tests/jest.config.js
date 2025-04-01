const path = require('path');

const resolveTestPaths = (paths) => {
    if (!paths) {
        return [];
    }

    return paths.split(',').map((dir) => path.resolve(process.cwd(), dir));
};

const resolvedTestPaths = resolveTestPaths(process.env.DIPLODOC_TEST_PATHS);

module.exports = {
    transform: {
        '^.+\\.ts?$': [
            'ts-jest',
            {
                compilerOptions: {
                    target: 'es2018',
                    module: 'commonjs',
                    declaration: true,
                    outDir: './dist',
                    resolveJsonModule: true,
                    strict: true,
                    esModuleInterop: true,
                    skipLibCheck: true,
                    forceConsistentCasingInFileNames: true,
                    rootDir: '.',
                },
            },
        ],
    },
    verbose: true,
    preset: 'ts-jest',
    testMatch: [
        '<rootDir>/**/*.@(test|spec).ts',
        ...resolvedTestPaths.map((dir) => `${dir}/**/*.@(test|spec).ts`),
    ],
    haste: {
        retainAllFiles: true,
    },
    transformIgnorePatterns: ['<rootDir>/node_modules/'],
    testPathIgnorePatterns: ['<rootDir>/node_modules/'],
    testEnvironment: 'node',
    roots: ['<rootDir>', ...resolvedTestPaths],
    collectCoverageFrom: ['../src/**/*.ts', '!../src/**/*.d.ts'],
    coverageProvider: 'v8',
    coverageDirectory: '<rootDir>/coverage',
    moduleDirectories: [
        'node_modules',
        path.join(__dirname, '../src'),
        path.join(__dirname, '../tests'),
    ],
    snapshotSerializers: ['jest-serializer-html'],
};
