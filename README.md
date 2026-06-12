# agent

多 Agent 对话 demo：LangGraph 图 + CopilotKit AG-UI + 会话持久化（SQLite checkpoint）。

## 结构

```
apps/
  server/          # Hono HTTPS API、CopilotRuntime、会话 CRUD
  client/          # Vite + React + TanStack Router + CopilotKit Chat
packages/
  graph/           # @agent/graph — LangGraph 图与 AguiTransformer
  claudeAgent/     # @agent/claude-agent — Claude Agent SDK 适配
  tools/           # @agent/tools — Open-Meteo、Obsidian 等工具
```

## 前置条件

- Node.js >= 22
- [pnpm](https://pnpm.io/)
- [mkcert](https://github.com/FiloSottile/mkcert)（本地 HTTPS，server / client 共用）

## 快速开始

### 1. 安装依赖

```bash
pnpm install
```

### 2. 配置环境变量（server）

Weather / Obsidian 等 ReAct 图需要 LLM；Claude Agent 图需要 Claude SDK 环境（见 `apps/server/.env.example`）。

```bash
cp apps/server/.env.example apps/server/.env
```

| 变量              | 说明                                    |
| ----------------- | --------------------------------------- |
| `OPENAI_API_KEY`  | DeepSeek 等 OpenAI 兼容 API Key         |
| `OPENAI_BASE_URL` | 如 `https://api.deepseek.com`           |
| `OPENAI_MODEL`    | 默认 `deepseek-v4-flash`                |
| `PORT`            | 默认 `3000`                             |

### 3. 本地 HTTPS 证书（首次）

```bash
pnpm --filter server cert
```

### 4. 启动

```bash
pnpm dev
```

| 服务   | 地址                     |
| ------ | ------------------------ |
| Server | `https://localhost:3000` |
| Client | `https://localhost:5173` |

注册/登录后打开 `https://localhost:5173/`：侧边栏管理会话，新建对话时从 `GET /api/conversations/graphs` 选择 Agent（`GraphsName`）。

更细的 API 说明见 [apps/server/README.md](./apps/server/README.md)、[apps/client/README.md](./apps/client/README.md)。

## 常用命令

```bash
pnpm dev                    # server + client 并行
pnpm run lint               # ESLint（apps + packages）
pnpm typecheck              # 全仓类型检查
pnpm test                   # Vitest
```

## 技术栈

| 层级   | 技术                                                |
| ------ | --------------------------------------------------- |
| 根目录 | TypeScript、ESLint（@antfu/eslint-config）、Vitest  |
| Server | Hono 4、AG-UI、`@copilotkit/runtime`、LangGraph、tsx |
| Client | React 19、CopilotKit v2、TanStack Router、Jotai、Tailwind 4 |

## 联调说明

- Client：`/api/copilotkit` → server `/copilotkit`；`/api/*` → 其余 REST（含 `/conversations`）。
- **Agent 运行时**：仅 CopilotKit `/copilotkit/*`；图定义在 `packages/graph`，编译与注册在 `apps/server/src/agent/graphAgents.ts`。
- **聊天历史**：CopilotKit `connect` → `CheckpointConnectRunner` 从 SQLite checkpoint 补发 `MESSAGES_SNAPSHOT`。
- **HITL 挂起态**：`GET /conversations/messages` 的 `threadState.pendingInterrupt`（client 不消费同响应中的 `messages` 字段渲染聊天）。

Wiki：[ReAct 天气图](./wiki/ReAct.md)、[LangGraph AG-UI 人在回路](./wiki/LangGraph-AGUI-人在回路.md)。技术债审计：[wiki/draft/code-taste-debt.md](./wiki/draft/code-taste-debt.md)。
