import fs from 'node:fs'
import http2 from 'node:http2'
import path from 'node:path'
import process from 'node:process'
import Koa from 'koa'
import bodyParser from 'koa-bodyparser'
import serve from 'koa-static'
import { logger } from './middleware/logger'
import { sseResponder } from './middleware/sseResponder'
import { router } from './router/index'

const app = new Koa()
const port = process.env.PORT || 3000

app.use(bodyParser()) // 解析请求体中间件
app.use(serve('public')) // 静态文件服务
app.use(logger)
app.use(sseResponder)
app.use(router)

const certificatesDir = path.resolve(process.cwd(), 'certificates')
const server = http2.createSecureServer(
  {
    key: fs.readFileSync(path.join(certificatesDir, 'localhost-key.pem')),
    cert: fs.readFileSync(path.join(certificatesDir, 'localhost.pem')),
    allowHTTP1: true, // 允许 HTTP/1.1 回退
  },
  app.callback(),
)

server.listen(port, () => {
  console.log(`HTTP/2 Server is running on https://localhost:${port}`)
})
