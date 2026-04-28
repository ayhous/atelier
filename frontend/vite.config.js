import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Pour GitHub Pages : ajoute le sous-chemin /atelier/ en prod
// (Le repo s'appelle "atelier", donc l'URL sera ayhous.github.io/atelier/)
export default defineConfig(({ command }) => ({
  plugins: [react()],
  base: command === 'build' ? '/atelier/' : '/',
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:4000',
    },
  },
}));
