import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import tailwindcss from '@tailwindcss/vite'
import { execSync } from 'child_process'
import { writeFileSync } from 'fs'
import path from 'path'
import { APP_VERSION } from './src/version.js'

function generateCards() {
  return {
    name: 'generate-cards',
    buildStart() {
      execSync(`node ${path.resolve('scripts/generate-cards.js')}`, { stdio: 'inherit' });
    },
  };
}

function envPreflight() {
  return {
    name: 'env-preflight',
    configureServer(server) {
      // Without these, createClient() throws during module evaluation and the
      // plugin renders a completely blank page (no spinner, no message) inside
      // Owlbear, which is near-impossible to diagnose from the room.
      const missing = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY']
        .filter((key) => !server.config.env[key]);
      if (!missing.length) return;
      server.config.logger.warn(
        `\n  ⚠️  ${missing.join(' + ')} manquant(s) : Cardenveil affichera une page blanche.\n` +
        `      cp .env.example .env.local, renseigne les valeurs Supabase, puis relance.\n`
      );
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
    version: APP_VERSION,
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
    // Persistent per-client page that opens the dice popup for everyone
    background_url: '/background.html',
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [generateCards(), envPreflight(), dynamicManifest(), svelte(), tailwindcss()],
  build: {
    rollupOptions: {
      input: {
        main: path.resolve('index.html'),
        hand: path.resolve('hand.html'),
        dice: path.resolve('dice.html'),
        background: path.resolve('background.html'),
        sheet: path.resolve('sheet.html'),
      },
    },
  },
  server: {
    // The Owlbear extension is installed against a fixed manifest URL
    // (http://localhost:5173/manifest.json). Silently moving to 5174 would
    // leave the room loading a stale or dead server, so fail instead.
    strictPort: true,
    cors: {
      origin: "https://www.owlbear.rodeo",
    },
  },
})
