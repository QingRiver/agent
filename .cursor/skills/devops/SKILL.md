---
name: devops
description: >-
  本仓库基础设施与 E2E 的统一入口。用户或 agent 要启动/检查 Docker infra（postgres、qdrant、markitdown、qlib）、
  跑 kb/auth e2e、qlib 数据更新时，先读本 skill，再执行 `pnpm devops` 子命令；不要散落调用已废弃的
  kb:infra:* / kb:e2e / qlib:init 等根脚本。
---

# DevOps（infra + e2e + qlib）

**唯一 CLI**：`pnpm devops <command> ...`（实现：`packages/e2e/src/cli.ts`，infra/e2e/qlib 逻辑均在 `packages/e2e/src/devops/`）

Agent 执行启停、健康检查、E2E 时**必须**走此入口，不要直接拼 docker compose 或复制旧 package.json 脚本名。

## 快速参考

| 场景 | 命令 |
|------|------|
| 启动知识库依赖 | `pnpm devops infra up kb` |
| 启动 server 持久化 | `pnpm devops infra up postgres` |
| 启动全部 infra | `pnpm devops infra up all` |
| 健康检查 | `pnpm devops infra status kb` |
| 停止知识库 infra | `pnpm devops infra down kb` |
| E2E 账号 + kb 数据 + vitest | `pnpm devops e2e all` |
| kb agent SSE（需 server） | `pnpm devops e2e agent` |
| hitl 图 vitest | `pnpm devops e2e hitl` |
| hitl agent SSE（需 server） | `pnpm devops e2e hitl-agent` |
| qlib 每日更新 | `pnpm devops qlib update` |
| qlib 首次初始化 | `pnpm devops qlib init` |

## infra 目标

| 目标 | 包含服务 |
|------|----------|
| `postgres` | PostgreSQL `:5432`（server 持久化：auth + drizzle + checkpoint） |
| `qdrant` | 向量库 `:6333` |
| `markitdown` | 文档转换 `:8200` |
| `qlib` | 行情 API `:8000` |
| `kb` | qdrant + markitdown（RAG 默认） |
| `all` | postgres + qdrant + markitdown + qlib |

```bash
pnpm devops infra up kb [--build]   # --build 强制 rebuild 镜像
pnpm devops infra down all
pnpm devops infra status all
```

`status` 会检查 Docker 容器是否 running，并对 HTTP `/health(z)` 探活；postgres 用容器内 `pg_isready`。

## e2e

测试账号（`pnpm devops e2e auth` 写入 postgres）：

- 邮箱：`agent-e2e@cursor.local`
- 密码：`agent-e2e-pass`

> 前置：`pnpm devops infra up postgres`（E2E 账号 + server 持久化都落库于此）。

```bash
pnpm devops e2e all          # auth seed → kb seed → kb/hitl vitest（不含 agent SSE）
pnpm devops e2e seed         # auth seed + kb seed
pnpm devops e2e auth         # 写入 E2E 测试账号到 postgres（需 infra up postgres）
pnpm devops e2e kb           # packages/kb vitest E2E=1（需 infra up kb）
pnpm devops e2e hitl         # packages/graph hitlGraph vitest（不需 server）
pnpm devops e2e agent        # kb CopilotKit SSE（需 pnpm dev + infra up kb + e2e seed）
pnpm devops e2e hitl-agent   # hitl 4 步 interrupt + resume SSE（需 pnpm dev + e2e auth）
```

> **实现位置**：agent flow（`hitl-agent` / `agent`）的测试逻辑在 `packages/e2e/src/flows/`，经 `packages/e2e/src/runner.ts` 调度；devops 仅作调用入口（`pnpm exec tsx packages/e2e/src/runner.ts <flow>`）。新增 flow 改 `@agent/e2e`，不动 skill。

推荐顺序：

- **kb**：`infra up kb` → `e2e seed` → `e2e kb` → `dev` → `e2e agent`
- **hitl**：`e2e auth` → `e2e hitl`（图级）→ `dev` → `e2e hitl-agent`（SSE 全链路）

## qlib

委托仓库 `scripts/qlib-daily-update.ts` 与 `scripts/qlib-package-source.ts`，不重复实现逻辑。

```bash
pnpm devops qlib init
pnpm devops qlib update
pnpm devops qlib update -- --date 20260702 --dry-run
pnpm devops qlib package
pnpm devops qlib unpack
```

## 与开发服务器的关系

- `pnpm dev`：启动 server + client（不在 devops 内）
- kb RAG 本地验证：`infra up kb` → `e2e seed` → `dev` → `e2e agent`

## 故障排查

1. **Docker 未运行** → 先开 Docker Desktop，再 `infra up`
2. **kb e2e vitest 跳过** → 确认 `E2E=1` 由 devops 注入；先 `infra status kb`
3. **e2e agent 无输出** → server 是否 `https://localhost:3000`；是否已 seed；新建对话 thread
4. **e2e hitl-agent 403 Origin** → Node fetch 需 `Origin: https://localhost:5173`（脚本已内置 `DEV_ORIGIN`）
5. **qlib 无 CSV** → `pnpm devops qlib unpack` 后再 `qlib init`
