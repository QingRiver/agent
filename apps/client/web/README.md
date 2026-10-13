# client

Vite + React + TanStack Router 前端：登录后的多 Agent 会话聊天、人在回路审批、知识库管理与 AI 文本润色编辑器。

## 技术栈

- React 19、Vite 8、TypeScript
- TanStack Router、Jotai
- Tailwind CSS 4、Radix UI
- `@assistant-ui/react`、`@assistant-ui/react-langgraph`
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
| 图流 | `/api/graphs/:name/stream`、`/api/graphs/:name/state` |

代理配置见 [vite.config.ts](vite.config.ts)。web 与 gateway 共用 `apps/server/gateway/certificates/` 下的 mkcert 证书。

## 页面路由

| 路径 | 说明 |
|------|------|
| `/login` | 登录（公开页） |
| `/register` | 注册（公开页） |
| `/` | 首页（需登录） |
| `/chat` | 会话列表 + assistant-ui 聊天 |
| `/kb` | 知识库：文件树、Markdown 编辑、导入、召回调试 |
| `/text-editor` | AI 文本润色编辑器（`editor` Agent） |
| `/rsc` | RSC 演示：Suspense + use() 解码 gateway 透传的 Flight 流 |

顶栏导航在 [src/routes/__root.tsx](src/routes/__root.tsx)；`RequireAuth` 对非 `/login`、`/register` 路径要求登录。

### 新建对话

`NewConversationDialog` 请求 `GET /conversations/graphs`，选择 Agent 后 `POST /conversations/create`，侧边栏切换到新 thread。

## 数据流

### 会话聊天

| 数据 | 来源 |
|------|------|
| 聊天消息 | `POST /graphs/:name/stream` 的 `messages`，刷新用 `GET /graphs/:name/state` |
| HITL 挂起审批 | 同一条流的 `updates.__interrupt__`，卡片经 `command.resume` 续跑 |
| 会话列表 / 当前 thread | `GET /conversations/list`、`conversation-store` |
| 编辑器错误 | 图流 `event: "error"` 的 `message`，`AgentErrorBanner` 只显示这一句 |

HITL 图（`reactAgent`、`tushare`、`dev` 等）挂起时由 `DevInterruptUi` 渲染 `@agent/ui` 的 `InterruptCard`。天气等工具卡挂在 assistant-ui 的 `MessagePrimitive.Parts`。

### 知识库

| 数据 | 来源 |
|------|------|
| 文件树 / 文档列表 | `POST /kb/nodes/list`、`POST /kb/documents/list`（`kb-store`） |
| 草稿编辑 | `POST /kb/documents/:id/save-draft` |
| 提交索引 | `POST /kb/documents/:id/commit` |
| 导入 | `POST /kb/ingest/*` |
| 召回调试 | `POST /kb/query`（`KbRecallPanel`） |

`kb` 图的集合 id 由服务端从 `configurable.kbId` 读取，缺省用 `KB_COLLECTION`。Agent Lab 通过 `configurable` 传入。

### 文本编辑器

`TextEditor`：Yjs 正文 + ⌘K 幽灵改写 + ⌘J/editor Ask·Write；全文改稿以多段红绿幽灵审阅。

## 目录说明

```text
src/
├── routes/                 # TanStack Router 文件路由
│   ├── __root.tsx          # 顶栏、AuthProvider、RequireAuth
│   ├── index.tsx           # 首页
│   ├── chat.tsx            # 会话聊天
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
│   ├── assistant/          # assistant-ui runtime、线程、中断卡、天气卡
│   ├── kb/                 # 文件树、编辑器、导入、标签、召回面板
│   ├── text-editor/        # Yjs + CodeMirror 润色编辑器
│   └── ui/                 # shadcn 风格基础组件
├── contexts/AuthContext.tsx
└── hooks/                  # useAuth、useConversations、useKbDocuments
```

## 类型安全 API

Vite alias `@server/api` 指向 `apps/server/gateway/src/routes/index.ts`，导出 `AppType`。client 通过 Hono `hc<AppType>` 调用 REST，请求/响应类型与 server zod schema 同步。

共享契约另见 `apps/server/gateway/shared/`（`conversation.ts`、`kb.ts` 等），经 `@apis/api-types` 再导出。

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

- 仓库根 [README](../../../README.md)
- Server API：[apps/server/gateway/README.md](../../server/gateway/README.md)
