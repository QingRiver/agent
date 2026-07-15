# server

基于 [Hono](https://hono.dev/) + [@hono/node-server](https://github.com/honojs/node-server) 的 HTTP/2 HTTPS 服务：LangGraph 图、AG-UI 流、CopilotRuntime、会话管理、知识库 API 与 PostgreSQL checkpoint 持久化。

## 前置条件

- Node.js `>=26 <27`（见仓库根 `package.json`）
- pnpm、mkcert（本地 HTTPS 证书，与 client 共用 `certificates/`）
- PostgreSQL（`pnpm devops infra up postgres`）

知识库 / RAG 还需 Qdrant + MarkItDown（`pnpm devops infra up kb`）。详见仓库根 [README](../../README.md) 与 [`.cursor/skills/devops/SKILL.md`](../../.cursor/skills/devops/SKILL.md)。

## 快速开始

```bash
# 仓库根目录
pnpm install
cp .env.example .env
pnpm devops infra up postgres

pnpm --filter server cert
pnpm --filter server dev
# 或根目录 pnpm dev（同时启动 client）
```

默认地址：`https://localhost:3000`（`PORT` 可改）。

`pnpm dev` 经 [scripts/dev.ts](scripts/dev.ts) 预检 Node、`.env`、证书后执行 `tsx watch src/index.ts`。启动时 [src/db/bootstrap.ts](src/db/bootstrap.ts) 自动迁移 better-auth 表、Drizzle 表与 LangGraph checkpoint 表。

### 环境变量

见仓库根 [`.env.example`](../../.env.example)。复制：`cp .env.example .env`

| 变量 | 说明 |
|------|------|
| `DATABASE_URL` | PostgreSQL（auth + 会话 + checkpoint） |
| `BETTER_AUTH_SECRET` / `BETTER_AUTH_URL` | better-auth |
| `OPENAI_*` / `ANTHROPIC_*` | LLM（各 Agent 图按需） |
| `QDRANT_URL` / `SILICONFLOW_*` / `KB_*` | 知识库 RAG |
| `TUSHARE_TOKEN` | A 股分析 Agent |
| `PORT` / `DATA_DIR` | Server 专有项，可在 `apps/server/.env` 覆盖 |

## API

路径挂载在 server 根（非 `/api`）；client 开发代理将 `/api` 去掉前缀后转发。

### 心跳

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/`、`/heartbeat` | JSON 心跳（含 ALPN 协议） |
| GET | `/:param` | 动态参数调试 |

### 认证

| 方法 | 路径 | 说明 |
|------|------|------|
| * | `/api/auth/*` | [better-auth](https://www.better-auth.com/)（注册、登录、session） |

### 会话（需登录，`Authorization: Bearer`）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/conversations/graphs` | 可选 Agent 列表 `{ graphs: [{ name, description }] }` |
| GET | `/conversations/list` | 当前用户会话列表 |
| POST | `/conversations/create` | body: `{ agentId: GraphsName }` |
| GET | `/conversations/detail` | query: `id` |
| GET | `/conversations/messages` | query: `id` → `messages` + `threadState` |
| POST | `/conversations/pin` | 置顶 |
| POST | `/conversations/unpin` | 取消置顶 |
| POST | `/conversations/delete` | 删除会话并 `deleteThread` checkpoint |

`agentId` 与 `packages/graph` 的 `Graphs` 键一致（见下方 Agent 列表）。

### CopilotKit

| 方法 | 路径 | 说明 |
|------|------|------|
| * | `/copilotkit/*` | CopilotRuntime；需登录；校验 thread 归属 |

AG-UI 流：`streamEvents(v3)` + `@agent/graph` `AguiTransformer`；各 agent 在 [src/agent/graphAgents.ts](src/agent/graphAgents.ts) 注册到 `copilotRuntime`。

`connect` 时由 [src/copilot/checkpointConnectRunner.ts](src/copilot/checkpointConnectRunner.ts) 从 PostgreSQL checkpoint hydrate 历史消息（`MESSAGES_SNAPSHOT`）。

### 知识库（需登录）

基础路径 `/kb`（client 代理后为 `/api/kb`）。路由风格：动词进 path，全 `POST`。

| 分组 | 路径前缀 | 说明 |
|------|----------|------|
| 文件夹 | `/kb/nodes/*` | 树形节点 CRUD、移动 |
| 文档 | `/kb/documents/*` | 草稿编辑、提交索引、删除 |
| 标签 | `/kb/tags/*` | 标签 CRUD |
| 导入 | `/kb/ingest/*` | 文件 / ZIP / 文本导入（MarkItDown） |
| 检索 | `/kb/query` | 混合召回（调试用） |

完整接口、状态机与存储模型见 [docs/kb-api.md](docs/kb-api.md)。

### curl 示例

```bash
curl -sk https://localhost:3000/heartbeat
curl -sk https://localhost:3000/copilotkit/info
# 会话 / 知识库 API 需 Bearer token，见 client 登录后 DevTools
```

## 可用 Agent

图定义在 `packages/graph`，注册与流式入口在 [src/agent/graphAgents.ts](src/agent/graphAgents.ts)。

| 名称 | 说明 |
|------|------|
| `simpleToolCall` | 工具调用示例 |
| `weather` | Weather ReAct（Open-Meteo） |
| `hitl` | 人在回路（`interrupt` + resume） |
| `kb` | 知识库 RAG（混合召回 + rerank + 引文） |
| `tushare` | A 股个股分析（Tushare MCP） |
| `writer` | 中文文本润色 |
| `claudeAgent` | Claude Agent SDK + checkpoint + AG-UI |

## 项目结构

```text
src/
├── index.ts                    # Hono 入口、auth、copilotKit、apiRoutes
├── agent/
│   ├── graphAgents.ts          # Graphs 编译、GRAPH_AGENT_DEFINITIONS、copilotAgents
│   ├── streamGraphAguiEvents.ts
│   └── graphTransformerAguiAgent.ts
├── auth/                       # better-auth 配置
├── conversation/
│   ├── toAgUiMessages.ts       # checkpoint BaseMessage → AG-UI Message
│   ├── threadHydrate.ts
│   ├── threadState.ts          # pendingInterrupt 投影
│   └── threadGuard.ts          # thread 归属校验
├── copilot/
│   ├── runtime.ts
│   ├── checkpointConnectRunner.ts
│   └── honoBridge.ts
├── db/
│   ├── bootstrap.ts            # auth + drizzle + checkpoint 启动迁移
│   ├── checkpointer.ts         # PostgresSaver（唯一 checkpointer）
│   ├── schema.ts               # conversation_threads、kb_* 等
│   └── migrate.ts
├── handlers/
│   ├── conversations.ts
│   └── kb.ts
├── routes/
│   ├── index.ts                # 导出 AppType（client 类型安全 client）
│   ├── conversations.ts
│   ├── kb.ts
│   └── default.ts
└── service/
    ├── conversation.ts
    └── kb.ts
shared/                         # 与 client 共享的 zod 契约
docs/kb-api.md                  # 知识库 API 详细文档
```

## 中间件顺序

```text
logger → static → auth session → copilotKit → apiRoutes（default、conversations、kb）
```

## 常用命令

```bash
pnpm --filter server dev          # 开发（含预检）
pnpm --filter server cert         # 生成本地 HTTPS 证书
pnpm --filter server db:generate  # Drizzle 生成迁移
pnpm --filter server db:studio    # Drizzle Studio

# 仓库根目录
pnpm run lint                     # ESLint
pnpm tc                           # 类型检查
pnpm test                         # Vitest（含 kb.e2e.test.ts）
pnpm devops e2e kb                # 知识库 E2E
```

## 相关文档

- 仓库根 [README](../../README.md)
- 知识库 API：[docs/kb-api.md](docs/kb-api.md)
- AG-UI / HITL：[wiki/LangGraph-AGUI-事件映射.md](../../wiki/LangGraph-AGUI-事件映射.md)、[wiki/LangGraph-AGUI-人在回路.md](../../wiki/LangGraph-AGUI-人在回路.md)
