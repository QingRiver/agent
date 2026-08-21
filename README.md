# agent

多 Agent 实验场：LangGraph 图编排 + CopilotKit AG-UI 流式协议 + 会话持久化（PostgreSQL checkpoint）。

支持 ReAct 工具调用、人在回路（HITL）、知识库 RAG、A 股分析（Tushare）、文本润色等能力；Web / CLI 共用同一套图定义。

## 结构

| 路径 | 说明 |
|------|------|
| [apps/server/gateway](./apps/server/gateway/README.md) | Hono HTTPS API、CopilotRuntime、会话 / 认证 / 知识库 |
| [apps/server/rsc-engine](./apps/server/rsc-engine/README.md) | Waku RSC 编译引擎（loopback `3010`） |
| [apps/client/web](./apps/client/web/README.md) | Vite + React：会话聊天、HITL、知识库、文本编辑器、RSC 演示 |
| [packages/graph](./packages/graph/README.md) | `@agent/graph` — LangGraph 图与 AguiTransformer |
| [packages/kb](./packages/kb/README.md) | `@agent/kb` — 向量召回、rerank、入库算法 |
| [packages/proto](./packages/proto/README.md) | `@agent/proto` — HITL / 引文 / Writer 中性契约 |
| [packages/claude](./packages/claude/README.md) | `@agent/claude` — Claude Agent SDK 适配 |
| [packages/tools](./packages/tools/README.md) | `@agent/tools` — Open-Meteo、Tushare / MCP |
| [packages/markdown](./packages/markdown/README.md) | `@agent/markdown` — Markdown → HTML + TOC |
| [packages/env](./packages/env/README.md) | `@agent/env` — 根 `.env` 加载 + zod 校验 |
| [packages/cli](./packages/cli/README.md) | `@agent/cli` — 终端交互实验 |
| [packages/e2e](./packages/e2e/README.md) | `@agent/e2e` — agent / UI E2E（经 `pnpm devops`） |
| [infra/](./infra/) | postgres、qdrant、markitdown、qlib |



## 前置条件

- Node.js `>=26 <27`（推荐 Volta / `.nvmrc` 锁定的 26.x）
- [pnpm](https://pnpm.io/) `10.x`
- [mkcert](https://github.com/FiloSottile/mkcert)（本地 HTTPS，server / client 共用）
- Docker（可选；启动 postgres / 知识库 / qlib 等 infra 时需要）



## 快速开始



### 1. 安装依赖

```bash
pnpm install
```



### 2. 配置环境变量

```bash
cp .env.example .env
```

根目录 `.env` 由 [`@agent/env`](./packages/env/README.md) 加载并经 zod 校验；`apps/server/gateway/.env` 可选，仅覆盖 `PORT`、`DATA_DIR` 等 server 专有项。**改 LLM / 密钥只改根** `.env`**。**


| 变量                                                    | 说明                                           |
| ----------------------------------------------------- | -------------------------------------------- |
| `OPENAI_API_KEY` / `OPENAI_BASE_URL` / `OPENAI_MODEL` | DeepSeek 等 OpenAI 兼容 API                     |
| `ANTHROPIC_*`                                         | Claude Agent SDK（可走兼容端点）                     |
| `DATABASE_URL`                                        | PostgreSQL（auth + 会话 + LangGraph checkpoint） |
| `BETTER_AUTH_SECRET` / `BETTER_AUTH_URL`              | better-auth                                  |
| `QDRANT_URL` / `SILICONFLOW_*` / `KB_*`               | 知识库 RAG（可选）                                  |
| `TUSHARE_TOKEN`                                       | A 股行情 MCP（可选）                                |
| `PORT`                                                | Server 端口，默认 `3000`                          |


完整列表见 `[.env.example](./.env.example)`。

### 3. 基础设施

多数功能需要 PostgreSQL；知识库 / RAG 还需 Qdrant 与 MarkItDown：

```bash
pnpm devops infra up postgres   # 认证、会话、checkpoint
pnpm devops infra up kb         # qdrant + markitdown（RAG）
# 或一次性：pnpm devops infra up all
pnpm devops infra status all
```

更多子命令：`pnpm devops --help`（见 `[.cursor/skills/devops/SKILL.md](./.cursor/skills/devops/SKILL.md)`）。

### 4. 本地 HTTPS 证书（首次）

```bash
pnpm --filter server cert
```



### 5. 启动

```bash
pnpm dev
```


| 服务     | 地址                       |
| ------ | ------------------------ |
| Server | `https://localhost:3000` |
| Client | `https://localhost:5173` |


注册/登录后：


| 路径             | 说明                            |
| -------------- | ----------------------------- |
| `/`            | 会话聊天：侧边栏管理 thread，新建时选择 Agent |
| `/kb`          | 知识库管理与导入                      |
| `/text-editor` | AI 文本润色编辑器                    |


更细的 API / 前端说明见 [apps/server/gateway/README.md](./apps/server/gateway/README.md)、[apps/client/web/README.md](./apps/client/web/README.md)。

## 可用 Agent（Graphs）

图定义在 [`packages/graph`](./packages/graph/README.md)，注册与流式入口在 `apps/server/gateway/src/agent/graphAgents.ts`。


| 名称               | 说明                                    |
| ---------------- | ------------------------------------- |
| `simpleToolCall` | 工具调用示例（模拟订单）                          |
| `weather`        | Weather ReAct（Open-Meteo）             |
| `hitl`           | 人在回路（`interrupt` + resume）            |
| `kb`             | 知识库 RAG（混合召回 + rerank + 引文）           |
| `tushare`        | A 股个股分析（Tushare MCP + ask_human）      |
| `editor`         | 文本编辑器（job 润色/⌘K；chat Ask/Write）   |
| `claudeAgent`    | Claude Agent SDK + checkpoint + AG-UI |
| `reactAgent`     | 通用 ReAct（可配 prompt）                   |




## 常用命令

```bash
pnpm dev                 # server + client 并行
pnpm cli                 # 终端 CLI（见 packages/cli/README.md）
pnpm devops --help       # infra / e2e / qlib 统一入口
pnpm run lint            # ESLint（apps + packages）
pnpm tc                  # 全仓类型检查
pnpm test                # Vitest
```



## 技术栈


| 层级     | 技术                                                                            |
| ------ | ----------------------------------------------------------------------------- |
| 根目录    | pnpm workspace、TypeScript、ESLint（@antfu）、Vitest                               |
| Server | Hono 4、better-auth、Drizzle、CopilotKit Runtime、LangGraph、PostgreSQL checkpoint |
| Client | React 19、CopilotKit、TanStack Router、Jotai、Tailwind 4                          |
| Agent  | LangGraph、AG-UI、`AguiTransformer`（`@agent/graph`）                             |
| 知识库    | Qdrant、SiliconFlow embedding/rerank、MarkItDown                                |




## 文档

### 包 README

| 包 | 文档 |
|----|------|
| Server / Client | [apps/server/gateway](./apps/server/gateway/README.md)、[apps/client/web](./apps/client/web/README.md) |
| Graph / KB / Proto | [graph](./packages/graph/README.md)、[kb](./packages/kb/README.md)、[proto](./packages/proto/README.md) |
| Claude / Tools / Markdown | [claude](./packages/claude/README.md)、[tools](./packages/tools/README.md)、[markdown](./packages/markdown/README.md) |
| Env / CLI / E2E | [env](./packages/env/README.md)、[cli](./packages/cli/README.md)、[e2e](./packages/e2e/README.md) |

## License

[Apache-2.0](./LICENSE)