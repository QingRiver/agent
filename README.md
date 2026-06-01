# agent

pnpm monorepo：Koa HTTPS 后端 + Vite React 前端，含 LangGraph 示例与 SSE 流式联调。

## 结构

```
apps/
  server/          # Koa 3 HTTP/2 HTTPS API（装饰器路由、LangGraph）
  client/          # Vite + React + TanStack Router + Tailwind
packages/          # 共享包（预留）
```

## 前置条件

- Node.js >= 20
- [pnpm](https://pnpm.io/)
- [mkcert](https://github.com/FiloSottile/mkcert)（本地 HTTPS 证书，server / client 共用）

## 快速开始

```bash
pnpm install

# 首次：生成证书（写入 apps/server/certificates）
pnpm --filter server cert

# 并行启动 server + client
pnpm dev
```

| 服务   | 地址                     |
| ------ | ------------------------ |
| Server | `https://localhost:3000` |
| Client | `https://localhost:5173` |

更细的 API 与路由说明见：

- [apps/server/README.md](./apps/server/README.md)
- [apps/client/README.md](./apps/client/README.md)

## 常用命令

```bash
pnpm dev                    # server + client 并行开发
pnpm run format             # ESLint 检查并自动修复（apps 目录）
pnpm exec tsc --noEmit      # 根目录类型检查
pnpm --filter client build  # 前端生产构建
pnpm --filter client typecheck
```

## 技术栈

| 层级   | 技术                                               |
| ------ | -------------------------------------------------- |
| 根目录 | TypeScript、ESLint（@antfu/eslint-config）、Vitest |
| Server | Koa 3、`@koa/router`、LangGraph、Radash、tsx       |
| Client | React 19、Vite 8、TanStack Router、Tailwind CSS 4  |

## 联调说明

- Client 通过 Vite 代理将 `/api/*` 转发到 Server（去掉 `/api` 前缀）。
- LangGraph SSE 页面：`https://localhost:5173/sse` → 请求 `GET /sample/simpleGraph/sse`。
