# server

基于 [Hono](https://hono.dev/) + [@hono/node-server](https://github.com/honojs/node-server) 的 HTTP/2 HTTPS 服务：LangGraph 图、AG-UI 适配层、CopilotRuntime。开发环境使用 [tsx](https://github.com/privatenumber/tsx) 直接运行 TypeScript。

LangGraph 与 CopilotKit 的接法见 wiki：[事件映射](../../wiki/LangGraph-v3-AGUI-事件映射.md)、[HITL](../../wiki/LangGraph-v3-AGUI-HITL.md)。AG-UI 流统一走 `streamEvents(v3)` + `@agent/graph` `AguiTransformer`（各 `src/agent/*Agent.ts` + `streamGraphAguiEvents.ts`）。

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
| `GET`  | `/sample/simpleGraph/sse` | simpleGraph LangGraph SSE 演示                          |
| `GET`  | `/sample/weather`         | weatherGraph LangGraph SSE 演示                         |
| `*`    | `/copilotkit/*`           | CopilotRuntime（前端 CopilotKit AG-UI 使用）            |

### curl 示例

```bash
# 心跳
curl -sk https://localhost:3000/heartbeat

# CopilotKit runtime 信息
curl -sk https://localhost:3000/copilotkit/info

# Sample LangGraph SSE（simpleGraph）
curl -sk -N https://localhost:3000/sample/simpleGraph/sse
```

AG-UI 流（`hitl`、`weather` 等 agent）统一经 `/copilotkit/*` 由 CopilotRuntime 输出；HITL 挂起时发出 `STATE_SNAPSHOT`、`CUSTOM(on_interrupt)` 与 `RUN_FINISHED`（`outcome.type: interrupt`）。恢复：`forwardedProps.command.resume` 或 `RunAgentInput.resume[]` → `Command({ resume })`。

## 项目结构

```text
src/
├── index.ts
├── graphs/
│   └── memoryCheckpointer.ts     # 开发环境 MemorySaver
├── agent/
│   ├── index.ts                  # Agent 导出
│   ├── streamGraphAguiEvents.ts  # v3 编排：aguiEvents → BaseEvent
│   ├── graphTransformerAguiAgent.ts
│   └── *Agent.ts                 # 图 compile + stream 输入 + CopilotKit 导出
├── copilot/
│   ├── runtime.ts                # CopilotRuntime agent 注册表
│   └── honoBridge.ts             # /copilotkit
├── controller/
│   ├── default.ts       # 心跳
│   └── sample.ts        # LangGraph SSE 示例
├── middleware/logger.ts
└── router/
certificates/
```

## 中间件顺序

```text
logger → serveStatic(public) → copilotKit → decoratorRoutes（default、sample）
```

## 技术栈

- Hono 4、`@hono/node-server`
- `@ag-ui/client`、`@ag-ui/core`、`@copilotkit/runtime`
- `@langchain/langgraph`
- HTTP/2（TLS，`allowHTTP1: true`）

## Lint

仓库根目录：`pnpm lint`（覆盖 `apps/server`）。
