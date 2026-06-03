# server

基于 [Hono](https://hono.dev/) + [@hono/node-server](https://github.com/honojs/node-server) 的 HTTP/2 HTTPS 服务：LangGraph 图、AG-UI 适配层、CopilotRuntime。开发环境使用 [tsx](https://github.com/privatenumber/tsx) 直接运行 TypeScript。

LangGraph 与 CopilotKit 的接法说明见 wiki：[CopilotKit Runtime × LangGraph × AG-UI](../../wiki/CopilotKit-Runtime-LangGraph-AGUI.md)（官方 `@copilotkit/runtime/langgraph` vs 本仓库 `src/agui`）。

## 前置条件

- Node.js >= 22
- [pnpm](https://pnpm.io/)
- [mkcert](https://github.com/FiloSottile/mkcert)（证书也会给 client 开发服务器复用）

## 快速开始

```bash
# 在仓库根目录
pnpm install
pnpm --filter server cert
pnpm --filter server dev
# 或根目录：pnpm dev（同时启动 client）
```

默认地址：`https://localhost:3000`（环境变量 `PORT` 可改）

`pnpm dev` 会先执行 [scripts/dev.ts](scripts/dev.ts) 预检：Node 版本、`.env` 中 `OPENAI_API_KEY` / `OPENAI_BASE_URL`、`certificates/` 证书，通过后启动 `tsx watch src/index.ts`。

### 环境变量

在 `apps/server/.env` 中配置（勿提交到 git）：

| 变量              | 说明                                                               |
| ----------------- | ------------------------------------------------------------------ |
| `PORT`            | 监听端口，默认 `3000`                                              |
| `OPENAI_API_KEY`  | **dev 必填**；[控制台申请](https://platform.deepseek.com/api_keys) |
| `OPENAI_BASE_URL` | **dev 必填**；如 `https://api.deepseek.com`                        |
| `OPENAI_MODEL`    | 可选，默认 `deepseek-v4-flash`                                     |

复制模板：`cp apps/server/.env.example apps/server/.env`

## API

| 方法   | 路径                      | 说明                                                    |
| ------ | ------------------------- | ------------------------------------------------------- |
| `GET`  | `/`、`/heartbeat`         | 心跳 JSON                                               |
| `GET`  | `/:param`                 | 动态参数                                                |
| `GET`  | `/sample/simpleGraph`     | 同步 invoke simpleGraph                                 |
| `POST` | `/api/agent/:agentId/run` | AG-UI SSE（`agentId`: `hitl` \| `simple` \| `weather`） |
| `*`    | `/copilotkit/*`           | CopilotRuntime（前端 CopilotKit 使用）                  |

### curl 示例

```bash
# 心跳
curl -sk https://localhost:3000/heartbeat

# CopilotKit runtime 信息
curl -sk https://localhost:3000/copilotkit/info

# AG-UI agent run（hitl）
curl -sk -N -X POST https://localhost:3000/api/agent/hitl/run \
  -H 'Content-Type: application/json' \
  -d '{"threadId":"t1","runId":"r1","messages":[{"id":"m1","role":"user","content":"开始"}]}'
```

SSE 帧：`event: agent_event`，`data` 为 AG-UI `BaseEvent` JSON。

HITL 挂起时，finalize 会依次发出 `CUSTOM`（`name: on_interrupt`，`value` 为审批载荷）与 `RUN_FINISHED`（`outcome.type: interrupt`）。客户端用 CopilotKit `useInterrupt` + `resolve(decision)`，经 `forwardedProps.command.resume` 恢复为 `Command({ resume })`（不再伪造 `human_approval` TOOL_CALL）。

## 项目结构

```text
src/
├── index.ts
├── graphs/
│   ├── index.ts         # 注入 checkpointer，绑定 @agent/graph
│   └── memoryCheckpointer.ts
├── agent/
│   ├── index.ts         # getAgent、agents 注册表
│   ├── hitl.ts
│   ├── simple.ts
│   └── weather.ts
├── agui/
│   ├── stream/fromLangGraphEvents.ts   # graph.streamEvents(v2) → Observable
│   ├── map/langGraphEventToAgUi.ts
│   ├── pipeline/runGraphAguiStream.ts  # RxJS：RUN 生命周期 + finalize
│   ├── interrupt/emitInterrupt.ts      # CUSTOM(on_interrupt) + outcome.interrupt
│   ├── runGraphAsAguiStream.ts
│   └── LangGraphAguiAgent.ts
├── copilot/
│   ├── runtime.ts
│   └── honoBridge.ts    # /copilotkit
├── controller/
│   ├── agent.ts         # POST /api/agent/:agentId/run（AG-UI SSE）
│   ├── default.ts       # 心跳
│   └── sample.ts        # LangGraph 示例
├── middleware/logger.ts
└── router/
certificates/
```

## 中间件顺序

```text
logger → serveStatic(public) → copilotKit → decoratorRoutes（含 AgentController）
```

## 技术栈

- Hono 4、`@hono/node-server`
- `@ag-ui/client`、`@ag-ui/core`、`@copilotkit/runtime`
- `@langchain/langgraph`、`@langchain/openai`
- HTTP/2（TLS，`allowHTTP1: true`）

## Lint

仓库根目录：`pnpm lint`（覆盖 `apps/server`）。
