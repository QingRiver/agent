# rsc-engine

Waku（Vite RSC）进程：把 TSX 编成 RSC Flight 流（`text/x-component`）。

## 角色

- **只绑** `127.0.0.1:3010`（HTTP，无证书）。浏览器不直连。
- Gateway 经 `RSC_ENGINE_URL` loopback 调用 `POST /render`。
- 本轮：**不调 LLM**；默认 fixture；可选 body `{ source }` 动态 TSX（禁 `'use client'`，≤32KiB）。
- 动态 TSX：esbuild → 在 Waku RSC 进程内用**同一 React 实例** eval（不走 Vite 动态 import，避免双 React / 未知变量 import）。

## 命令

```bash
pnpm --filter rsc-engine dev
```

## API

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/render` | JSON `{ source?: string }` → `text/x-component` |
| GET | `/health` | `{ ok: true }` |

## 边界

- 无沙箱（禁 fs/net 等未做）；依赖 loopback + gateway 鉴权。
- `'use client'` / 共享 UI 目录留后续。
