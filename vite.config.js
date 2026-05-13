import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import tailwindcss from '@tailwindcss/vite'
import { execSync } from 'child_process'
import path from 'path'

function generateCards() {
  return {
    name: 'generate-cards',
    buildStart() {
      execSync(`node ${path.resolve('scripts/generate-cards.js')}`, { stdio: 'inherit' });
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [generateCards(), svelte(), tailwindcss()],
  server: {
    cors: {
      origin: "https://www.owlbear.rodeo",
    },
  },
})
