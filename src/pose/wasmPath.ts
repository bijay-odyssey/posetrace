// Self-hosted MediaPipe wasm assets (offline-cacheable by the PWA). In dev,
// `serveMediapipeWasmRaw` in vite.config.ts serves this same path directly,
// bypassing Vite's dev-server guard against `import()`ing a public-dir file.
export const WASM_PATH = '/mediapipe/wasm';
