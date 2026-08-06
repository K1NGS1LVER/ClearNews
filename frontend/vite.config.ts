import fs from 'node:fs'
import path from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const CONTENT_TYPES: Record<string, string> = {
  '.mjs': 'text/javascript',
  '.js': 'text/javascript',
  '.wasm': 'application/wasm',
}

/** onnxruntime-web (used by the VAD/STT mic input, see src/lib/vad.ts) does a
    raw `import()` of /vad/ort-wasm-simd-threaded.mjs, a plain file living
    under public/. Vite's dev server explicitly refuses to serve public/ files
    through its module-transform pipeline ("should not be imported from
    source code") - it only works when the request happens to land on Vite's
    plain static-file middleware instead, which depends on transient
    dev-server state (public-file scan timing, dep-optimizer re-crawls, HMR
    invalidation), so it 500s intermittently. Serve /vad/* ourselves, first,
    always as raw bytes, so it never touches Vite's module pipeline. */
function serveVadAssetsRaw(): Plugin {
  const vadDir = path.resolve(__dirname, 'public/vad')
  return {
    name: 'serve-vad-assets-raw',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith('/vad/')) return next()
        const relPath = decodeURIComponent(req.url.slice('/vad/'.length).split('?')[0])
        const filePath = path.join(vadDir, relPath)
        if (!filePath.startsWith(vadDir + path.sep)) return next()
        fs.stat(filePath, (err, stat) => {
          if (err || !stat.isFile()) return next()
          res.setHeader('Content-Type', CONTENT_TYPES[path.extname(filePath)] ?? 'application/octet-stream')
          fs.createReadStream(filePath).pipe(res)
        })
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [serveVadAssetsRaw(), react(), tailwindcss()],
  server: {
    proxy: {
      '/api': 'http://localhost:8000',
    },
  },
})
