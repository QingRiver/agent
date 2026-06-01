# client

`apps/client` 是 Vite + React + TypeScript 前端，使用 TanStack Router 做路由，Tailwind CSS 4 做样式，通过 HTTPS 代理访问 server 的 LangGraph SSE 接口。

## 技术栈

- React 19
- Vite 8
- TypeScript 6
- [TanStack Router](https://tanstack.com/router)（文件路由 + `@tanstack/router-plugin`）
- Tailwind CSS 4（`@tailwindcss/vite`）

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

| 路径   | 说明                                                 |
| ------ | ---------------------------------------------------- |
| `/`    | 首页，入口链接到 SSE 演示                            |
| `/sse` | 请求 `GET /sample/simpleGraph/sse`，流式打印后端事件 |

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
│   ├── routes/              # TanStack Router 文件路由
│   │   ├── __root.tsx       # 布局与导航
│   │   ├── index.tsx        # /
│   │   └── sse.tsx          # /sse 流式页
│   ├── lib/
│   │   └── streamSimpleGraph.ts   # fetch + ReadableStream 解析 SSE
│   ├── routeTree.gen.ts     # 插件生成，勿手改
│   ├── main.tsx
│   └── index.css
├── vite.config.ts           # HTTPS、Tailwind、Router 插件、/api 代理
└── index.html
```

## HTTPS 与代理

`vite.config.ts` 会读取 `../server/certificates/` 下的 mkcert 证书；不存在则开发服务器使用 HTTP。

```text
浏览器  https://localhost:5173/sse
    → fetch /api/sample/simpleGraph/sse
    → Vite proxy
    → https://localhost:3000/sample/simpleGraph/sse
```

## Tailwind

无需 `tailwind.config.js`，在 `src/index.css` 中：

```css
@import 'tailwindcss';
```

## 开发说明

- 新页面：在 `src/routes/` 新增路由文件，保存后插件会更新 `routeTree.gen.ts`。
- 页面组件与 `Route` 导出写在同文件（路由目录已关闭 `react-refresh/only-export-components`）。
- ESLint 配置继承仓库根目录 `eslint.config.mjs`，无本地 `eslint.config.js`。
