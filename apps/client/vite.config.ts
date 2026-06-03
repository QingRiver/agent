import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const dir = path.dirname(fileURLToPath(import.meta.url))
const certDir = path.resolve(dir, '../server/certificates')

function loadDevHttps() {
  const keyPath = path.join(certDir, 'localhost-key.pem')
  const certPath = path.join(certDir, 'localhost.pem')
  if (!fs.existsSync(keyPath) || !fs.existsSync(certPath))
    return undefined
  return {
    key: fs.readFileSync(keyPath),
    cert: fs.readFileSync(certPath),
  }
}

const https = loadDevHttps()

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    tanstackRouter({ target: 'react', autoCodeSplitting: true }),
    react(),
    tailwindcss(),
  ],
  server: {
    ...(https ? { https } : {}),
    proxy: {
      // 更具体的路径必须写在 /api 之前
      '/api/copilotkit': {
        target: 'https://127.0.0.1:3000',
        changeOrigin: true,
        secure: false,
        rewrite: path => path.replace(/^\/api\/copilotkit/, '/copilotkit'),
      },
      '/api': {
        target: 'https://127.0.0.1:3000',
        changeOrigin: true,
        secure: false,
        rewrite: path => path.replace(/^\/api/, ''),
      },
    },
  },
})
