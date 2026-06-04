# client

Vite + React + TanStack Router 前端。演示 **纯 LangGraph SSE**（`fetch-event-source`）与 **CopilotKit AG-UI** 两套调用方式。

## 技术栈

- React 19、Vite 8、TypeScript 6
- [TanStack Router](https://tanstack.com/router)
- Tailwind CSS 4
- `@microsoft/fetch-event-source`（sample SSE）
- `@copilotkit/react-core`（HITL / simple / weather AG-UI）

## 快速开始

```bash
pnpm install
pnpm --filter server cert
pnpm dev
```

| 项       | 值                                                      |
| -------- | ------------------------------------------------------- |
| 开发地址 | `https://localhost:5173`                                |
| Copilot  | `/api/copilotkit` → `https://localhost:3000/copilotkit` |
| Sample   | `/api` → `https://localhost:3000`（`/sample/...` SSE）  |

## 页面路由

| 路径           | 调用方式   | 后端入口                         |
| -------------- | ---------- | -------------------------------- |
| `/sse`         | 纯 SSE     | `GET /sample/simpleGraph/sse`    |
| `/simple`            | CopilotKit | `simple` agent                   |
| `/simple-tool-call`  | CopilotKit | `simpleToolCall` agent           |
| `/weather/sse`       | 纯 SSE     | `GET /sample/weather?message=`   |
| `/weather`     | CopilotKit | `weather` agent                  |
| `/hitl`        | CopilotKit | `hitl` agent + 审批 tool call UI |

## 目录说明

```text
src/
├── routes/sse.tsx | simple.tsx | weather.tsx | weather.index.tsx | weather.sse.tsx | hitl.tsx
├── lib/streamSampleSse.ts | parseWeatherUpdate.ts | hitlContracts.ts
├── components/
│   ├── copilot/CopilotAgentShell.tsx
│   ├── weather/WeatherChatBubble.tsx
│   └── hitl/…
└── lib/agentIds.ts
```

## 常用命令

```bash
pnpm --filter client dev
pnpm --filter client typecheck
pnpm --filter client build
```

根目录：`pnpm lint`
