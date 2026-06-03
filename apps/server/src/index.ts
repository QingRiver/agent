import 'dotenv/config'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { createSecureServer } from 'node:http2'
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'
import { copilotKitMiddleware } from './copilot/honoBridge'
import { logger } from './middleware/logger'
import { registerRoutes } from './router/index'
import type { AppEnv } from './types'

const port = Number(process.env.PORT) || 3000

const app = new Hono<AppEnv>()

app.use('*', logger)

const publicDir = path.resolve(process.cwd(), 'public')
if (fs.existsSync(publicDir))
  app.use('*', serveStatic({ root: publicDir }))

app.use('*', copilotKitMiddleware)
registerRoutes(app)

app.onError((err, c) => {
  console.error('[server]', err)
  return c.json({ error: err.message }, 500)
})

const certificatesDir = path.resolve(process.cwd(), 'certificates')

serve({
  fetch: app.fetch,
  port,
  createServer: createSecureServer,
  serverOptions: {
    key: fs.readFileSync(path.join(certificatesDir, 'localhost-key.pem')),
    cert: fs.readFileSync(path.join(certificatesDir, 'localhost.pem')),
    allowHTTP1: true,
  },
}, (info) => {
  console.log(`HTTP/2 Server is running on https://localhost:${info.port}`)
})
