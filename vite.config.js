import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import tailwindcss from '@tailwindcss/vite'
import { execSync } from 'child_process'
import { writeFileSync } from 'fs'
import path from 'path'

function generateCards() {
  return {
    name: 'generate-cards',
    buildStart() {
      execSync(`node ${path.resolve('scripts/generate-cards.js')}`, { stdio: 'inherit' });
    },
  };
}

function dynamicManifest() {
  return {
    name: 'dynamic-manifest',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url !== '/manifest.json') return next();
        const manifest = buildManifest('development');
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(manifest, null, 2));
      });
    },
    writeBundle() {
      const manifest = buildManifest('production');
      writeFileSync(path.resolve('dist/manifest.json'), JSON.stringify(manifest, null, 2));
    },
  };
}

function buildManifest(mode) {
  const isDev = mode === 'development';
  return {
    name: isDev ? 'Cardenveil (Dev)' : 'Cardenveil',
    version: '0.1.0',
    manifest_version: 1,
    author: "Ahmed MOUSSAOUI",
    homepage_url: "https://github.com/smuglilgoat/cardenveil-owlbear",
    icon: "/cardenveil.svg",
    description: "A card-based RPG system and tool",
    action: {
      title: isDev ? 'Cardenveil (Dev)' : 'Cardenveil',
      icon: '/cardenveil.svg',
      popover: '/',
      height: 800,
      width: 800,
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [generateCards(), dynamicManifest(), svelte(), tailwindcss()],
  build: {
    rollupOptions: {
      input: {
        main: path.resolve('index.html'),
        hand: path.resolve('hand.html'),
      },
    },
  },
  server: {
    cors: {
      origin: "https://www.owlbear.rodeo",
    },
  },
})
