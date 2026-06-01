# client

`apps/client` 是 Vite + React + TypeScript 前端，使用 TanStack Router 做路由，Tailwind CSS 4 做样式，通过 HTTPS 代理访问 server 的 LangGraph / HITL / Weather API。

## 技术栈

- React 19
- Vite 8
- TypeScript 6
- [TanStack Router](https://tanstack.com/router)（文件路由 + `@tanstack/router-plugin`）
- Tailwind CSS 4（`@tailwindcss/vite`）
- `@microsoft/fetch-event-source`（SSE，用于 `/weather`）

## 快速开始

在仓库根目录：

```bash
pnpm install
pnpm --filter server cert   # 首次：证书写在 apps/server/certificates，client 复用
pnpm dev                    # 推荐：与 server 并行启动
# 或仅前端：pnpm --filter client dev
```

| 项       | 值                                            |
| -------- | --------------------------------------------- |
| 开发地址 | `https://localhost:5173`（无证书时回退 HTTP） |
| API 代理 | `/api` → `https://localhost:3000`             |

## 页面路由

| 路径       | 说明                                                                   |
| ---------- | ---------------------------------------------------------------------- |
| `/`        | 首页，入口链接到各演示                                                 |
| `/sse`     | `GET /sample/simpleGraph/sse`，流式打印原始 SSE 事件                   |
| `/weather` | `GET /sample/weather?message=...`，聊天气泡 UI（用户右 / AI 与工具左） |
| `/hitl`    | HITL 工作流：启动 → 等待审批 → `Command(resume)` 恢复                  |

## 常用命令

```bash
pnpm --filter client dev
pnpm --filter client build
pnpm --filter client typecheck
pnpm --filter client preview
pnpm --filter client lint      # 使用仓库根目录 @antfu/eslint-config
```

## 目录说明

```text
apps/client
├── src/
│   ├── routes/                    # TanStack Router 文件路由
│   │   ├── __root.tsx             # 布局与导航
│   │   ├── index.tsx              # /
│   │   ├── sse.tsx                # /sse
│   │   ├── weather.tsx            # /weather 聊天页
│   │   └── hitl.tsx               # /hitl 人在回路
│   ├── components/
│   │   └── weather/
│   │       └── WeatherChatBubble.tsx
│   ├── lib/
│   │   ├── streamSimpleGraph.ts   # simpleGraph SSE
│   │   ├── streamWeatherGraph.ts  # weather SSE
│   │   ├── parseWeatherUpdate.ts  # LangGraph update → 聊天气泡
│   │   ├── parseSse.ts            # 通用 SSE 消费（HITL）
│   │   └── hitlWorkflow.ts        # HITL 启动 / 恢复 API
│   ├── routeTree.gen.ts           # 插件生成，勿手改
│   ├── main.tsx
│   └── index.css
├── vite.config.ts                 # HTTPS、Tailwind、Router 插件、/api 代理
└── index.html
```

## HTTPS 与代理

`vite.config.ts` 会读取 `../server/certificates/` 下的 mkcert 证书；不存在则开发服务器使用 HTTP。

```text
浏览器  https://localhost:5173/weather
    → fetch /api/sample/weather?message=北京天气
    → Vite proxy
    → https://localhost:3000/sample/weather?message=北京天气
```

## Weather 页消息解析

`parseWeatherUpdate` 解析 SSE `{ type: "update", data: { agent|tools: { messages } } }` 中的 LangChain 消息，映射为：

| 气泡类型      | 展示                 |
| ------------- | -------------------- |
| `user`        | 右侧绿色，用户输入   |
| `assistant`   | 左侧，模型文本       |
| `tool-call`   | 左侧琥珀色，工具调用 |
| `tool-result` | 左侧紫色，工具返回   |

## Tailwind

无需 `tailwind.config.js`，在 `src/index.css` 中：

```css
@import 'tailwindcss';
```

## 开发说明

- 新页面：在 `src/routes/` 新增路由文件，保存后插件会更新 `routeTree.gen.ts`。
- 页面组件与 `Route` 导出写在同文件。
- ESLint 配置继承仓库根目录 `eslint.config.mjs`。
