# server

基于 [Hono](https://hono.dev/) + [@hono/node-server](https://github.com/honojs/node-server) 的 HTTP/2 HTTPS 服务：LangGraph 图、AG-UI 流、CopilotRuntime、会话与 checkpoint 持久化。

## 前置条件

- Node.js >= 22
- pnpm、mkcert（证书与 client 共用）

## 快速开始

```bash
pnpm install
pnpm --filter server cert
pnpm --filter server dev
# 或根目录 pnpm dev（同时启动 client）
```

默认：`https://localhost:3000`（`PORT` 可改）。`pnpm dev` 经 [scripts/dev.ts](scripts/dev.ts) 预检 Node、`.env`、证书后 `tsx watch src/index.ts`。

### 环境变量

见 `apps/server/.env.example`（`OPENAI_*` 等）。复制：`cp apps/server/.env.example apps/server/.env`

## API

### 心跳

| 方法 | 路径          | 说明     |
| ---- | ------------- | -------- |
| GET  | `/`、`/heartbeat` | JSON 心跳 |
| GET  | `/:param`     | 动态参数 |

路径前缀：经 `index.ts` 挂载为根路径（非 `/api`）；client 代理将 `/api` 转到 server 根。

### 认证

| 方法 | 路径           | 说明        |
| ---- | -------------- | ----------- |
| *    | `/api/auth/*`  | better-auth |

### 会话（需登录，`Authorization: Bearer`）

| 方法 | 路径                      | 说明                                      |
| ---- | ------------------------- | ----------------------------------------- |
| GET  | `/conversations/graphs`   | 可选 Agent 列表 `{ name, description }`   |
| GET  | `/conversations/list`     | 当前用户会话列表                          |
| POST | `/conversations/create`   | body: `{ agentId: GraphsName }`           |
| GET  | `/conversations/detail`   | query: `id`                               |
| GET  | `/conversations/messages` | query: `id` → `messages` + `threadState`  |
| POST | `/conversations/pin` 等   | 置顶 / 取消 / 删除（删除同时 `deleteThread` checkpoint） |

`agentId` 取值与 `packages/graph` 的 `Graphs` 键一致（如 `simple`、`weather`、`hitl`、`claudeAgent`）。

### CopilotKit

| 方法 | 路径            | 说明                                       |
| ---- | --------------- | ------------------------------------------ |
| *    | `/copilotkit/*` | CopilotRuntime；需登录；thread 归属校验      |

AG-UI 流：`streamEvents(v3)` + `@agent/graph` `AguiTransformer`；各 agent 由 `graphAgents.ts` 注册到 `copilotRuntime`。

### curl 示例

```bash
curl -sk https://localhost:3000/heartbeat
curl -sk https://localhost:3000/copilotkit/info
# 会话 API 需 Bearer token，见 client 登录后 DevTools
```

## 项目结构

```text
src/
├── index.ts                 # Hono 入口、auth、copilotKit、apiRoutes
├── agent/
│   ├── graphAgents.ts       # Graphs 编译、GRAPH_AGENT_DEFINITIONS、copilotAgents
│   ├── streamGraphAguiEvents.ts
│   └── graphTransformerAguiAgent.ts
├── conversation/
│   ├── toAgUiMessages.ts    # checkpoint BaseMessage → AG-UI Message
│   ├── threadHydrate.ts
│   └── threadState.ts
├── copilot/
│   ├── runtime.ts
│   ├── checkpointConnectRunner.ts
│   └── honoBridge.ts
├── db/
│   └── checkpointer.ts      # SqliteSaver（唯一 checkpointer）
├── handlers/conversations.ts
├── routes/
│   ├── index.ts
│   ├── conversations.ts
│   └── default.ts
└── service/conversation.ts
shared/                      # 与 client 共享的 zod 契约（经 Hono 类型导出）
packages/graph/              # 图定义（monorepo 包）
```

## 中间件顺序

```text
logger → static → auth session → copilotKit → apiRoutes（default、conversations）
```

## Lint

仓库根目录：`pnpm run lint`（覆盖 `apps/server`）。
