import { defineConfig } from 'vite';
import { configDefaults } from 'vitest/config';
import preact from '@preact/preset-vite';
import { VitePWA } from 'vite-plugin-pwa';

const BASE = '/volley-scout/';

export default defineConfig(({ command, isPreview }) => ({
  // build と preview（ビルド結果の確認）は公開時と同じサブパスで配信する
  base: command === 'build' || isPreview ? BASE : '/',
  plugins: [
    preact(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/apple-touch-icon.png'],
      manifest: {
        name: 'バレー記録',
        short_name: 'バレー記録',
        description: 'バレーボールのスカウティング記録アプリ',
        lang: 'ja',
        display: 'standalone',
        orientation: 'landscape',
        background_color: '#1f2a44',
        theme_color: '#1f2a44',
        start_url: '.',
        scope: '.',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: { globPatterns: ['**/*.{js,css,html,png,svg,webmanifest}'] },
    }),
  ],
  // tests/rules はエミュレーターが必要なので通常の npm test から外す。
  // npm run test:rules（firebase emulators:exec）は FIRESTORE_EMULATOR_HOST を設定するので、そのときだけ含める。
  test: process.env.FIRESTORE_EMULATOR_HOST
    ? { environment: 'node', testTimeout: 30000, hookTimeout: 30000 }
    : { environment: 'node', exclude: [...configDefaults.exclude, 'tests/rules/**'] },
}));
