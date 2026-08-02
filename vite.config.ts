import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { viteStaticCopy } from 'vite-plugin-static-copy';

const BASE = '/ander-gym/';

export default defineConfig({
  base: BASE,

  plugins: [
    react(),

    // `data/` stays at the repo root as the source of truth. Copy it into dist/data
    // on build; the plugin also serves it from the same URLs in dev.
    viteStaticCopy({
      targets: [
        { src: 'data/exercises.json', dest: 'data' },
        { src: 'data/images', dest: 'data' },
      ],
    }),

    VitePWA({
      registerType: 'autoUpdate',
      // No `includeAssets`: globPatterns below already covers public/icons/*,
      // and listing them twice duplicates entries in the precache manifest.
      manifest: {
        name: 'Ander Gym',
        short_name: 'Gym',
        description: 'Local-first gym session tracker',
        start_url: BASE,
        scope: BASE,
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#0f1216',
        theme_color: '#0f1216',
        icons: [
          { src: `${BASE}icons/icon-192.png`, sizes: '192x192', type: 'image/png' },
          { src: `${BASE}icons/icon-512.png`, sizes: '512x512', type: 'image/png' },
          {
            src: `${BASE}icons/icon-maskable-512.png`,
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // Deliberately excludes data/images/**.jpg (11 MB, 1324 files) from the
        // precache; those are cached lazily at runtime instead. See SPEC.md D5.
        globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest}', 'data/exercises.json'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        cleanupOutdatedCaches: true,
        navigateFallback: `${BASE}index.html`,
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.includes('/data/images/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'exercise-images',
              expiration: { maxEntries: 1500, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],

  build: {
    target: 'es2022',
    sourcemap: false,
  },

  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    setupFiles: ['src/test/setup.ts'],
  },
});
