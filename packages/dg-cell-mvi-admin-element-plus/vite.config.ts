import { defineConfig, loadEnv, type PluginOption } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueJsx from '@vitejs/plugin-vue-jsx'
import { compression } from 'vite-plugin-compression2'
import { visualizer } from 'rollup-plugin-visualizer'
import path from 'path'

// Function form so we can read VITE_APP_* from the loaded .env* files to drive the dev proxy, and so
// build optimizations can be toggled per command/mode.
//
// Build optimizations (gzip / manualChunks / bundle visualizer) are applied for `vite build` ONLY —
// dev (`vite` / `vite dev`) stays untouched for fast HMR. `--mode analyze` additionally emits a
// bundle treemap (dist/stats.html). Multi-mode: `--mode staging` etc. just selects the matching
// `.env.<mode>` file; the build pipeline is identical to production.
export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, __dirname, 'VITE_APP_')
  const apiBase = env.VITE_APP_API || '/api'
  const proxyTarget = env.VITE_APP_PROXY_TARGET || 'http://127.0.0.1:7001'

  const isBuild = command === 'build'
  const isAnalyze = mode === 'analyze'

  // Build-only plugins. Kept out of dev so HMR isn't slowed by compression/treemap work.
  const buildPlugins: PluginOption[] = isBuild
    ? [
        // Emit .gz alongside each JS/CSS/HTML/SVG asset over the threshold so a gzip-capable static
        // server (nginx gzip_static, etc.) can serve pre-compressed bytes. Originals are kept.
        compression({
          algorithm: 'gzip',
          threshold: 1024, // don't bother gzipping tiny files
          include: [/\.(js|mjs|cjs|css|html|json|svg)$/],
          deleteOriginalAssets: false,
        }),
      ]
    : []

  // Bundle analyzer — only on `--mode analyze` so normal builds don't pay for / emit the treemap.
  if (isAnalyze) {
    buildPlugins.push(
      visualizer({
        filename: 'dist/stats.html',
        title: 'dg-cell-mvi Admin bundle',
        gzipSize: true,
        brotliSize: true,
        template: 'treemap',
      }) as PluginOption,
    )
  }

  return {
    plugins: [vue(), vueJsx(), ...buildPlugins],
    resolve: {
      alias: {
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
        'dg-cell-mvi-halfcode-contract': path.resolve(
          __dirname,
          '../dg-cell-mvi-halfcode-contract/src/index.ts',
        ),
        'dg-cell-mvi-halfcode-logic': path.resolve(
          __dirname,
          '../dg-cell-mvi-halfcode-logic/src/index.ts',
        ),
        'dg-cell-mvi-halfcode-support': path.resolve(
          __dirname,
          '../dg-cell-mvi-halfcode-support/src/index.ts',
        ),
        'xnl-core': path.resolve(
          __dirname,
          '../../../../lang/xnl.ts/packages/core/src/index.ts',
        ),
        // single instances (the store and the vue adapter must share one alien-signals runtime)
        'alien-signals': path.resolve(__dirname, 'node_modules/alien-signals'),
        xstream: path.resolve(__dirname, 'node_modules/xstream'),
      },
      dedupe: ['vue', 'element-plus', 'alien-signals', 'xstream'],
    },
    build: {
      // Modern evergreen target; admin tooling does not support legacy browsers.
      target: 'es2020',
      cssCodeSplit: true,
      // Vendor splitting keeps the per-route chunks lean and lets big, rarely-changing libs be cached
      // independently of app code. Bumped warning limit so the (expected) large element-plus vendor
      // chunk doesn't spam the build log.
      chunkSizeWarningLimit: 1200,
      rollupOptions: {
        output: {
          // Split big, stable third-party deps into named long-cache vendor chunks. App + per-route
          // code (dynamic imports in the router) keep their own automatic chunks. Order matters:
          // element-plus is matched before the generic vue bucket so its `vue`-prefixed internals
          // don't get pulled into the vue chunk.
          manualChunks(id) {
            if (!id.includes('node_modules')) return undefined
            if (id.includes('element-plus') || id.includes('@element-plus/icons-vue')) {
              return 'vendor-element-plus'
            }
            if (id.includes('@iconify')) return 'vendor-iconify'
            if (id.includes('@tiptap') || id.includes('prosemirror')) return 'vendor-editor'
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
      port: 5174,
      fs: {
        // serve sibling workspace packages used through source aliases
        allow: [path.resolve(__dirname, '../../..')],
      },
      // Dev proxy: forward the VITE_APP_API prefix (e.g. /api) to the backend so the browser stays
      // same-origin (no CORS in dev). Target comes from VITE_APP_PROXY_TARGET (.env.development).
      proxy: {
        [apiBase]: {
          target: proxyTarget,
          changeOrigin: true,
        },
      },
    },
  }
})
