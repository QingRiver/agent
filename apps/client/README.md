# client

Vite + React + TanStack Router 前端：**登录后会话式 CopilotKit Chat**（多 Agent / 多 thread）。

## 技术栈

- React 19、Vite 8、TypeScript
- TanStack Router、Jotai
- Tailwind CSS 4
- `@copilotkit/react-core` v2
- `@agent/graph`（`GraphsName` 类型）

## 快速开始

```bash
pnpm install
pnpm --filter server cert
pnpm dev
```

| 项       | 值                                                        |
| -------- | --------------------------------------------------------- |
| 开发地址 | `https://localhost:5173`                                  |
| API      | `/api` → `https://localhost:3000`                         |
| Copilot  | `/api/copilotkit` → `https://localhost:3000/copilotkit`   |

## 页面路由

| 路径        | 说明                          |
| ----------- | ----------------------------- |
| `/login`    | 登录                          |
| `/register` | 注册                          |
| `/`         | 会话列表 + CopilotChat（需登录） |

新建对话：`NewConversationDialog` 请求 `GET /conversations/graphs`，选择 graph 后 `POST /conversations/create`。

## 数据流

| 数据           | 来源 |
| -------------- | ---- |
| 聊天消息 UI    | CopilotKit `connect` → `MESSAGES_SNAPSHOT`（服务端 checkpoint hydrate） |
| HITL 挂起审批  | `GET /conversations/messages` 的 `threadState`（`ConversationSync`） |
| 会话列表       | `GET /conversations/list` |

## 目录说明

```text
src/
├── routes/           # login、register、index（Chat）
├── apis/             # Hono 类型安全 client（@server/api）
├── stores/conversation-store.ts
├── components/
│   ├── conversation/ # 侧边栏、新建对话
│   ├── copilot/      # ConversationChat、CopilotKitAppProvider
│   └── hitl/         # HitlInterruptUi、ApprovalCard
└── hooks/useConversations.ts
```

## 常用命令

```bash
pnpm --filter client dev
pnpm --filter client typecheck
pnpm --filter client build
```

根目录：`pnpm run lint`
