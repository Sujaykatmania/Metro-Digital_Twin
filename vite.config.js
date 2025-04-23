import { defineConfig } from 'vite';
import alias from '@rollup/plugin-alias';

export default defineConfig({
    plugins: [
        alias({
            entries: [
                { find: 'three', replacement: 'three/build/three.module.js' },
                { find: /^three\/examples\/jsm\/(.*)/, replacement: 'three/examples/jsm/$1' }
            ]
        })
    ]
});