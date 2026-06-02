# agent

## 结构

```
apps/
  server/          # Koa 3 HTTP/2 HTTPS API（装饰器路由、LangGraph）
  client/          # Vite + React + TanStack Router + Tailwind
packages/          # 共享包（预留）
```

## 前置条件

- Node.js >= 22（`pnpm --filter server dev` 会校验）
- [pnpm](https://pnpm.io/)
- [mkcert](https://github.com/FiloSottile/mkcert)（本地 HTTPS 证书，server / client 共用）

## 快速开始

### 1. 安装依赖

```bash
pnpm install
```

### 2. 配置环境变量（server）

Weather Agent 需要调用 DeepSeek（OpenAI 兼容接口）；`/sse` 与 `/hitl` 不依赖 LLM，可不配 Key。

```bash
# 在 apps/server 下从模板复制（勿提交 .env）
cp apps/server/.env.example apps/server/.env
```

编辑 `apps/server/.env`，至少填写：

```env
OPENAI_API_KEY=sk-你的-deepseek-key   # https://platform.deepseek.com/api_keys
OPENAI_MODEL=deepseek-v4-flash
OPENAI_BASE_URL=https://api.deepseek.com
```

| 变量              | 必填         | 说明                                               |
| ----------------- | ------------ | -------------------------------------------------- |
| `OPENAI_API_KEY`  | **dev 必填** | DeepSeek API Key                                   |
| `OPENAI_BASE_URL` | **dev 必填** | 如 `https://api.deepseek.com`                      |
| `OPENAI_MODEL`    | 否           | 默认 `deepseek-v4-flash`，可改为 `deepseek-v4-pro` |
| `PORT`            | 否           | 默认 `3000`                                        |

服务启动时会 `import 'dotenv/config'`，自动加载 `apps/server/.env`（在 `apps/server` 目录执行 `pnpm dev` 时生效）。

### 3. 本地 HTTPS 证书（首次）

```bash
pnpm --filter server cert
```

证书写入 `apps/server/certificates/`，client 开发服务器会复用。

### 4. 启动

```bash
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
- 演示页面（先完成上文 **env 配置** 再访问 `/weather`）：

| 页面                             | 说明                                 |
| -------------------------------- | ------------------------------------ |
| `https://localhost:5173/sse`     | 简单两节点图 SSE                     |
| `https://localhost:5173/weather` | Weather Agent 聊天气泡 + 工具调用    |
| `https://localhost:5173/hitl`    | LangGraph `interrupt` + 人工审批恢复 |

Server 代码分层：`graphs/` 编排 LangGraph，`tools/` 放 Agent 工具实现（如 Open-Meteo）。
