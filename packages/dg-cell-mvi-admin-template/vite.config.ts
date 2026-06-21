import { defineConfig, loadEnv, type PluginOption } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueJsx from '@vitejs/plugin-vue-jsx'
import { compression } from 'vite-plugin-compression2'
import path from 'path'

// The external depa-data-graph engine is consumed from source (same as the reference app). It lives
// outside the frontend workspace; override the location with DEPA_DATA_GRAPH_ROOT if your checkout differs.
const DEPA_ROOT =
  process.env.DEPA_DATA_GRAPH_ROOT ||
  path.resolve(__dirname, '../../../depa-data-graph')

// Function form so we can read VITE_APP_* from the loaded .env* files to drive the dev proxy.
//
// This template consumes the dg-cell-mvi-* chassis packages FROM SOURCE via the aliases below — that
// is what makes the chassis hot-reloadable while you develop against it in this monorepo. When you copy
// this template OUT of the monorepo and depend on PUBLISHED dg-cell-mvi-* packages, delete the
// dg-cell-mvi-* + depa-data-graph-* aliases (Vite will then resolve them from node_modules) and remove
// the `server.fs.allow` / DEPA_ROOT lines. The rest of the config is portable as-is.
export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, __dirname, 'VITE_APP_')
  const apiBase = env.VITE_APP_API || '/api'
  const proxyTarget = env.VITE_APP_PROXY_TARGET || 'http://127.0.0.1:7001'

  const isBuild = command === 'build'

  // Build-only gzip: emit .gz next to each asset over the threshold (kept out of dev for fast HMR).
  const buildPlugins: PluginOption[] = isBuild
    ? [
        compression({
          algorithm: 'gzip',
          threshold: 1024,
          include: [/\.(js|mjs|cjs|css|html|json|svg)$/],
          deleteOriginalAssets: false,
        }),
      ]
    : []

  return {
    plugins: [vue(), vueJsx(), ...buildPlugins] as PluginOption[],
    resolve: {
      alias: {
        // ── chassis packages, consumed FROM SOURCE (monorepo dev). Drop these when depending on
        //    PUBLISHED dg-cell-mvi-* packages outside the monorepo. ─────────────────────────────
        'dg-cell-mvi-core': path.resolve(__dirname, '../dg-cell-mvi-core/src/index.ts'),
        'dg-cell-mvi-crud': path.resolve(__dirname, '../dg-cell-mvi-crud/src/index.ts'),
        'dg-cell-mvi-vue': path.resolve(__dirname, '../dg-cell-mvi-vue/src/index.ts'),
        'dg-cell-mvi-element-plus': path.resolve(
          __dirname,
          '../dg-cell-mvi-element-plus/src/index.ts',
        ),
        'dg-cell-mvi-admin-contract': path.resolve(
          __dirname,
          '../dg-cell-mvi-admin-contract/src/index.ts',
        ),
        'dg-cell-mvi-admin-logic': path.resolve(
          __dirname,
          '../dg-cell-mvi-admin-logic/src/index.ts',
        ),
        'dg-cell-mvi-admin-support': path.resolve(
          __dirname,
          '../dg-cell-mvi-admin-support/src/index.ts',
        ),
        'depa-data-graph-core': path.resolve(DEPA_ROOT, 'packages/core/src/index.ts'),
        'depa-data-graph-vue': path.resolve(DEPA_ROOT, 'packages/vue/src/index.ts'),
        // single instances (the store and the vue adapter must share one alien-signals runtime).
        'alien-signals': path.resolve(__dirname, 'node_modules/alien-signals'),
        xstream: path.resolve(__dirname, 'node_modules/xstream'),
      },
      dedupe: ['vue', 'element-plus', 'alien-signals', 'xstream'],
    },
    build: {
      target: 'es2020',
      cssCodeSplit: true,
      chunkSizeWarningLimit: 1200,
      rollupOptions: {
        output: {
          // Split big, stable third-party deps into named long-cache vendor chunks; app + per-route
          // code keep their own automatic chunks. element-plus is matched before the generic vue bucket.
          manualChunks(id) {
            if (!id.includes('node_modules')) return undefined
            if (id.includes('element-plus') || id.includes('@element-plus/icons-vue')) {
              return 'vendor-element-plus'
            }
            if (id.includes('@iconify')) return 'vendor-iconify'
            if (
              id.includes('/vue/') ||
              id.includes('/vue-router/') ||
              id.includes('/vue-i18n/') ||
              id.includes('/@vue/')
            ) {
              return 'vendor-vue'
            }
            if (id.includes('lodash')) return 'vendor-lodash'
            return 'vendor'
          },
        },
      },
    },
    server: {
      host: '0.0.0.0',
      port: 5175,
      fs: {
        // serve sibling workspace packages + the out-of-root depa source (monorepo dev only).
        allow: [path.resolve(__dirname, '../../..'), DEPA_ROOT],
      },
      // Dev proxy: forward the VITE_APP_API prefix (e.g. /api) to a real backend so the browser stays
      // same-origin. Only matters once you set VITE_APP_MOCK=false (otherwise the in-process mock answers).
      proxy: isBuild
        ? undefined
        : {
            [apiBase]: {
              target: proxyTarget,
              changeOrigin: true,
            },
          },
    },
  }
})
