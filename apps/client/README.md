# client

Vite + React + TanStack Router 前端：登录后的多 Agent 会话聊天、人在回路审批、知识库管理与 AI 文本润色编辑器。

## 技术栈

- React 19、Vite 8、TypeScript
- TanStack Router、Jotai
- Tailwind CSS 4、Radix UI
- `@copilotkit/react-core`（CopilotKit v2）
- `@agent/graph`（`GraphsName`）、`@agent/markdown`、`@agent/protocol`
- CodeMirror 6 + Yjs（文本编辑器协同）

## 前置条件

- Node.js `>=26 <27`、pnpm
- server 本地 HTTPS 证书（`pnpm --filter server cert`）
- 运行中的 server（`pnpm dev` 或单独 `pnpm --filter server dev`）

## 快速开始

```bash
# 仓库根目录
pnpm install
cp .env.example .env
pnpm devops infra up postgres   # server 认证与会话持久化
pnpm --filter server cert
pnpm dev                        # server + client 并行
```

| 项 | 值 |
|----|-----|
| 开发地址 | `https://localhost:5173` |
| REST API | `/api/*` → `https://localhost:3000/*` |
| 认证 | `/api/auth/*` → server `/api/auth/*` |
| CopilotKit | `/api/copilotkit/*` → server `/copilotkit/*` |

代理配置见 [vite.config.ts](vite.config.ts)。client 与 server 共用 `apps/server/certificates/` 下的 mkcert 证书。

## 页面路由

| 路径 | 说明 |
|------|------|
| `/login` | 登录（公开页） |
| `/register` | 注册（公开页） |
| `/` | 会话列表 + CopilotChat（需登录） |
| `/kb` | 知识库：文件树、Markdown 编辑、导入、召回调试 |
| `/text-editor` | AI 文本润色编辑器（`writer` Agent） |

顶栏导航在 [src/routes/__root.tsx](src/routes/__root.tsx)；`RequireAuth` 对非 `/login`、`/register` 路径要求登录。

### 新建对话

`NewConversationDialog` 请求 `GET /conversations/graphs`，选择 Agent 后 `POST /conversations/create`，侧边栏切换到新 thread。

## 数据流

### 会话聊天

| 数据 | 来源 |
|------|------|
| 聊天消息 UI | CopilotKit `connect` → `MESSAGES_SNAPSHOT`（server checkpoint hydrate） |
| HITL 挂起审批 | `GET /conversations/messages` 的 `threadState.pendingInterrupt`（`ConversationSync` 轮询） |
| 会话列表 / 当前 thread | `GET /conversations/list`、`conversation-store` |
| Agent 错误 | CopilotKit 流 + `AgentErrorBanner` |

HITL 图（`hitl`、`tushare` 等）在挂起时由 `HitlInterruptUi` 渲染审批卡片；`useHitlResume` 经 CopilotKit 发送 resume。

聊天 UI **不**用 `GET /conversations/messages` 返回的 `messages` 字段渲染，仅消费 `threadState`。

### 知识库

| 数据 | 来源 |
|------|------|
| 文件树 / 文档列表 | `POST /kb/nodes/list`、`POST /kb/documents/list`（`kb-store`） |
| 草稿编辑 | `POST /kb/documents/:id/save-draft` |
| 提交索引 | `POST /kb/documents/:id/commit` |
| 导入 | `POST /kb/ingest/*` |
| 召回调试 | `POST /kb/query`（`KbRecallPanel`） |

`kb` Agent 对话时，`KbAgentState` 将当前知识库 ID 注入 CopilotKit state。

### 文本编辑器

`TextEditor`：Yjs 正文 + ⌘K 幽灵改写 + ⌘J/editorChat Ask·Write；全文改稿以多段红绿幽灵审阅。详见 [wiki/文本编辑器.md](../../wiki/文本编辑器.md)。

## 目录说明

```text
src/
├── routes/                 # TanStack Router 文件路由
│   ├── __root.tsx          # 顶栏、AuthProvider、CopilotKit、RequireAuth
│   ├── index.tsx           # 会话聊天
│   ├── kb.tsx              # 知识库页
│   ├── text-editor.tsx     # 文本润色编辑器
│   ├── login.tsx
│   └── register.tsx
├── apis/                   # Hono 类型安全 client
│   ├── api-client.ts       # 基于 @server/api 的 hc client
│   ├── auth-client.ts      # better-auth client
│   ├── conversation-api.ts
│   └── kb-api.ts
├── stores/
│   ├── conversation-store.ts
│   └── kb-store.ts
├── layouts/
│   ├── ChatLayout.tsx
│   └── KbLayout.tsx
├── components/
│   ├── auth/               # RequireAuth、UserAvatarMenu
│   ├── conversation/       # 侧边栏、新建对话、ConversationSync
│   ├── copilot/            # ConversationChat、CopilotKitAppProvider
│   ├── hitl/               # HitlInterruptUi、ApprovalCard、resume hooks
│   ├── kb/                 # 文件树、编辑器、导入、标签、召回面板
│   ├── text-editor/        # Yjs + CodeMirror 润色编辑器
│   └── ui/                 # shadcn 风格基础组件
├── contexts/AuthContext.tsx
└── hooks/                  # useAuth、useConversations、useKbDocuments
```

## 类型安全 API

Vite alias `@server/api` 指向 `apps/server/src/routes/index.ts`，导出 `AppType`。client 通过 Hono `hc<AppType>` 调用 REST，请求/响应类型与 server zod schema 同步。

共享契约另见 `apps/server/shared/`（`conversation.ts`、`kb.ts` 等），经 `@apis/api-types` 再导出。

## 常用命令

```bash
pnpm --filter client dev      # 仅前端
pnpm --filter client build    # 生产构建
pnpm --filter client tc       # 类型检查
pnpm --filter client preview  # 预览构建产物

# 仓库根目录
pnpm dev                      # server + client
pnpm run lint                 # ESLint
pnpm tc                       # 全仓类型检查
pnpm devops e2e ui            # Playwright UI E2E（需 dev + e2e auth）
```

## 相关文档

- 仓库根 [README](../../README.md)
- Server API：[apps/server/README.md](../server/README.md)、[apps/server/docs/kb-api.md](../server/docs/kb-api.md)
- HITL：[wiki/LangGraph-AGUI-人在回路.md](../../wiki/LangGraph-AGUI-人在回路.md)
- 文本编辑器：[wiki/文本编辑器.md](../../wiki/文本编辑器.md)
- 知识库 RAG：[wiki/RAG.md](../../wiki/RAG.md)
