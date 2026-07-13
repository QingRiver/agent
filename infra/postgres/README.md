# PostgreSQL 服务

server 的统一持久化后端：better-auth（账户/会话）、drizzle（`conversation_threads`）、LangGraph checkpoint 全部落库于此，取代旧的三套 SQLite（`auth/app/checkpoints.sqlite`）。

## 前置条件

- Docker / Docker Compose
- 仓库根目录 [`.env`](../../.env) 配置 `DATABASE_URL` / `POSTGRES_*`（见根 [`.env.example`](../../.env.example)）

## 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `POSTGRES_PORT` | `5432` | 宿主机映射端口 |
| `POSTGRES_USER` | `postgres` | 超级用户（首次建卷生效） |
| `POSTGRES_PASSWORD` | `postgres` | 超级用户密码 |
| `POSTGRES_DB` | `agent` | 默认库 |
| `DATABASE_URL` | `postgresql://postgres:postgres@localhost:5432/agent` | Node 客户端连接串（根 `.env`，server 共用） |

## 快速启动

```bash
cd infra/postgres
docker compose up -d
```

健康检查：

```bash
docker exec postgres pg_isready -q && echo ok
# 或走 devops：pnpm devops infra status postgres
```

连接（psql 等价）：

```bash
docker exec -it postgres psql -U postgres -d agent
```

停止服务：

```bash
docker compose down
```

## schema 初始化

容器只需把库跑起来；表结构由 server 启动时 `bootstrapDatabases()` 自动建：

- **better-auth** 表（`user` / `session` / `account` / `verification`）：better-auth 迁移系统建。
- **conversation_threads**：drizzle 迁移建（`pnpm --filter server db:generate` 生成，`migrateAppSchema()` 应用）。
- **checkpoints** 等：`PostgresSaver.setup()` 建。

E2E 账号种子（写入 `user`/`account` 等）：

```bash
pnpm devops e2e auth
```

## 数据卷

```
infra/postgres/
└── pg_data/        # Postgres 数据（gitignore）
```

> 旧 SQLite 文件仍留在 `apps/server/data/`（已废弃，不再读写）。
