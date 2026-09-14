import { createReadStream, statSync } from 'node:fs';
import { join, sep } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import preact from '@preact/preset-vite';
import { VitePWA } from 'vite-plugin-pwa';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { WASM_PATH } from './src/pose/wasmPath';

const WASM_URL_PREFIX = `${WASM_PATH}/`;

function statSyncSafe(path: string) {
  try {
    return statSync(path);
  } catch {
    return null;
  }
}

/**
 * @mediapipe/tasks-vision dynamically `import()`s its wasm loader script
 * relative to the path we give FilesetResolver.forVisionTasks() (WASM_PATH,
 * self-hosted for offline PWA use). Vite's dev server explicitly refuses to
 * serve a public-dir file when the request is flagged as an `import()`
 * ("should not be imported from source code"), so intercept these requests
 * before Vite's own middlewares ever see them and hand back the raw file -
 * same self-hosted asset used in production, just served without going
 * through Vite's module graph.
 */
function serveMediapipeWasmRaw(): Plugin {
  return {
    name: 'serve-mediapipe-wasm-raw',
    apply: 'serve',
    configureServer(server) {
      const baseDir = join(server.config.root, 'public', WASM_PATH) + sep;
      if (!statSyncSafe(baseDir)?.isDirectory()) {
        server.config.logger.warn(
          `[serve-mediapipe-wasm-raw] ${baseDir} not found - run \`npm run prepare:assets\` (or reinstall) to copy it.`,
        );
      }

      server.middlewares.use((req, res, next) => {
        const url = req.url ?? '';
        if (!url.startsWith(WASM_URL_PREFIX)) return next();

        let rel: string;
        try {
          rel = decodeURIComponent(new URL(url, 'http://internal').pathname.slice(WASM_URL_PREFIX.length));
        } catch {
          res.statusCode = 400;
          return res.end();
        }

        // join() can still walk `rel` above baseDir via enough `../` segments;
        // the containment check below is the actual security boundary, not normalize().
        const file = join(baseDir, rel);
        if (!file.startsWith(baseDir)) {
          res.statusCode = 400;
          return res.end();
        }

        if (!statSyncSafe(file)?.isFile()) {
          res.statusCode = 404;
          return res.end();
        }

        res.setHeader('Content-Type', file.endsWith('.wasm') ? 'application/wasm' : 'text/javascript');
        if (req.method === 'HEAD') return res.end();

        createReadStream(file)
          .on('error', () => {
            if (res.headersSent) res.destroy();
            else {
              res.statusCode = 500;
              res.end();
            }
          })
          .pipe(res);
      });
    },
  };
}

// HTTPS in dev (basicSsl) is required so iOS Safari will grant camera access
// when you open the LAN URL on a real iPhone.
export default defineConfig({
  plugins: [
    serveMediapipeWasmRaw(),
    preact(),
    basicSsl(),
    VitePWA({
      registerType: 'autoUpdate',
      devOptions: { enabled: true, type: 'module' },
      includeAssets: ['favicon.svg', 'icons/*.png'],
      workbox: {
        // Precache only the app shell. Heavy, optional payloads are cached on
        // first use instead: the MediaPipe wasm (~11 MB) + pose model (~6 MB),
        // and the TensorFlow.js bundle + MobileNet weights (scene detection).
        globPatterns: ['**/*.{css,html,svg,png,json}', 'assets/*.js'],
        globIgnores: ['**/tfjs-*.js', '**/three-*.js'],
        navigateFallbackDenylist: [/^\/models\//, /^\/mediapipe\//],
        runtimeCaching: [
          {
            urlPattern: /\/(mediapipe|models)\/.*\.(wasm|js|task|bin)$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'posetrace-model',
              expiration: { maxEntries: 12 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /\/assets\/(tfjs|three)-[^/]+\.js$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'posetrace-lazy-code',
              expiration: { maxEntries: 8 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // TensorFlow.js / MobileNet model weights (loaded on demand).
            urlPattern: /^https:\/\/storage\.googleapis\.com\/tfjs-models\/.*/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'posetrace-tfjs',
              expiration: { maxEntries: 40 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      manifest: {
        name: 'PoseTrace',
        short_name: 'PoseTrace',
        description: 'Live pose-trace camera guide',
        lang: 'en',
        theme_color: '#0b0b0f',
        background_color: '#0b0b0f',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
  server: { host: true, port: 5173 },
  worker: { format: 'es' },
  build: {
    chunkSizeWarningLimit: 1400,
    rollupOptions: {
      output: {
        // Keep TensorFlow.js in its own on-demand chunk (excluded from precache).
        manualChunks(id) {
          if (id.includes('node_modules/@tensorflow') || id.includes('node_modules/@tensorflow-models')) {
            return 'tfjs';
          }
          if (id.includes('node_modules/three')) {
            return 'three';
          }
        },
      },
    },
  },
});
