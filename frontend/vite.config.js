import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

// Pour GitHub Pages : ajoute le sous-chemin /atelier/ en prod
// (Le repo s'appelle "atelier", donc l'URL sera ayhous.github.io/atelier/)
export default defineConfig(({ command }) => ({
  plugins: [react()],
  base: command === 'build' ? '/atelier/' : '/',
  build: {
    rollupOptions: {
      input: {
        // L'app de l'atelier
        main: resolve(process.cwd(), 'index.html'),
        // Page d'essai du scan en série : accessible par son adresse seulement,
        // aucun lien depuis l'app (/atelier/serie.html)
        serie: resolve(process.cwd(), 'serie.html'),
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:4000',
    },
  },
}));
