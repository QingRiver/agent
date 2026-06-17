import { env } from '@agent/env'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { createSecureServer } from 'node:http2'
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { getAuth } from './auth/auth'
import { resolveDevCorsOrigin } from './auth/devOrigins'
import { bootstrapDatabases } from './db/bootstrap'
import { copilotKitMiddleware } from './copilot/honoBridge'
import { logger } from './middleware/logger'
import { apiRoutes } from './routes'
import type { AppEnv } from './types'

const port = env.PORT

const app = new Hono<AppEnv>()

app.use('*', logger)

const publicDir = path.resolve(process.cwd(), 'public')
if (fs.existsSync(publicDir))
  app.use('*', serveStatic({ root: publicDir }))

app.use(
  '/api/auth/*',
  cors({
    origin: resolveDevCorsOrigin,
    credentials: true,
    allowHeaders: ['Content-Type', 'Authorization'],
    allowMethods: ['POST', 'GET', 'OPTIONS'],
    exposeHeaders: ['set-auth-token', 'Content-Length'],
  }),
)

app.on(['POST', 'GET'], '/api/auth/*', c => getAuth().handler(c.req.raw))

app.use('*', async (c, next) => {
  const session = await getAuth().api.getSession({ headers: c.req.raw.headers })
  c.set('user', session?.user ?? null)
  c.set('session', session?.session ?? null)
  await next()
})

app.use('*', copilotKitMiddleware)
app.route('/', apiRoutes)

app.onError((err, c) => {
  console.error('[server]', err)
  return c.json({ error: err.message }, 500)
})

const certificatesDir = path.resolve(process.cwd(), 'certificates')

async function startServer(): Promise<void> {
  await bootstrapDatabases()

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
}

void startServer()
