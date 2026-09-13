// Vite's dev server refuses to dynamically `import()` a JS module that also
// lives under public/ - and that's exactly what MediaPipe's wasm loader script
// does when self-hosted (@mediapipe/tasks-vision resolves it relative to the
// `wasmPath` passed to FilesetResolver.forVisionTasks). In dev, use the
// MediaPipe CDN instead so the import is cross-origin and never touches Vite's
// module graph. The production build keeps the self-hosted, offline-cacheable
// path copied into public/mediapipe/wasm by scripts/prepare.mjs.
//
// Keep this version aligned with the @mediapipe/tasks-vision dependency in
// package.json; a minor mismatch is harmless (the wasm ABI is stable within
// 0.10.x) since this path is dev-only.
const CDN_WASM = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm';

export const WASM_PATH = import.meta.env.DEV ? CDN_WASM : '/mediapipe/wasm';
