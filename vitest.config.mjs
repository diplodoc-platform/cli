import { defineConfig } from 'vite'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
    plugins: [tsconfigPaths({
        root: './'
    })],
    test: {
        exclude: ['node_modules', 'tests'],

        /* for example, use global to avoid globals imports (describe, test, expect): */
        // globals: true,
    },
})

// module.exports = {
//     plugins: [
//         'vite-tsconfig-paths'
//     ],
//
// };
