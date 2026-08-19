import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// GitHub Pages serves project sites at https://<user>.github.io/<repo>/, not
// at the domain root, so the build needs that prefix baked into every asset
// URL. The dev server stays at "/" so `npm run dev:web` keeps working normally.
export default defineConfig(({ command }) => ({
  plugins: [react()],
  root: '.',
  base: command === 'build' ? '/7D2D-Companion/' : '/',
  server: {
    port: 5173,
  },
  build: {
    // dist/ ya lo usa `npm run build` (tsc) para la librería — separado para no pisarlo.
    outDir: 'dist-web',
  },
}));
