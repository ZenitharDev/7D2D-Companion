import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// With a custom domain (www.7daystodiecompanion.com) the site is served at
// the domain's own root, not under /7D2D-Companion/ like a default
// user.github.io/repo/ project page would be — so base stays "/" for both
// dev and build. (If the custom domain is ever removed, this needs to go
// back to the repo-name prefix or every asset 404s.)
export default defineConfig({
  plugins: [react()],
  root: '.',
  base: '/',
  server: {
    port: 5173,
  },
  build: {
    // dist/ ya lo usa `npm run build` (tsc) para la librería — separado para no pisarlo.
    outDir: 'dist-web',
  },
});
