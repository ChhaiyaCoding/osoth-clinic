import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

/**
 * Most hosts (Netlify, Cloudflare Pages, Vercel) serve the site from the domain
 * root, so that is the default. GitHub Pages project sites live under
 * `/<repo>/` instead and need `BASE_PATH=/<repo>/` — the deploy workflow sets
 * it. Every asset URL, the manifest and the service worker scope follow it.
 */
const base = process.env.BASE_PATH ?? '/'

// https://vite.dev/config/
export default defineConfig({
  base,
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['apple-touch-icon.png'],
      workbox: {
        // The app must run with no network at all, so every build asset is precached.
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
      },
      manifest: {
        name: 'ប្រព័ន្ធគ្រប់គ្រងឱសថ',
        short_name: 'ឱសថ',
        description: 'ប្រព័ន្ធគ្រប់គ្រងឱសថសម្រាប់គ្លីនិក — Clinic pharmacy management',
        lang: 'km',
        start_url: base,
        scope: base,
        id: base,
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#f4f6f9',
        theme_color: '#f4f6f9',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'pwa-maskable-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
    }),
  ],
})
