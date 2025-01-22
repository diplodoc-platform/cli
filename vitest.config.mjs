import { defineConfig } from 'vite'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
    plugins: [tsconfigPaths({
        root: './'
    })],
    test: {
        exclude: ['node_modules', 'tests', 'external'],
        coverage: {
            enabled: true,
            provider: 'v8',
            include: [
                'src/commands',
                'src/core',
            ],
            exclude: [
                'assets/**',
                'tests/**',
                'coverage/**',
                'dist/**',
                '**/[.]**',
                'packages/*/test?(s)/**',
                '**/*.d.ts',
                '**/virtual:*',
                'cypress/**',
                'test?(s)/**',
                'test?(-*).?(c|m)[jt]s?(x)',
                '**/*{.,-}{test,spec}.?(c|m)[jt]s?(x)',
                '**/__tests__/**',
                '**/{karma,rollup,webpack,vite,vitest,jest,ava,babel,nyc,cypress,tsup,build}.config.*',
                '**/vitest.{workspace,projects}.[jt]s?(on)',
                '**/.{eslint,mocha,prettier}rc.{?(c|m)js,yml}',
            ]
        }
    },
})
