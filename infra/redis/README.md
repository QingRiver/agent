# Redis（infra/redis/）

gtd 的 Redis 基础设施预埋。`apps/server/src/gtd/cache.ts` 已移除——派生状态按决策④实时算不缓存；文档快照 / 透视结果 / 分布式锁的缓存策略留待 service 层（P5）重新实现时再消费 Redis。

## 启动

```bash
cd infra/redis && docker compose up -d
# 或经 devops：pnpm devops infra up redis
```

配置从仓库根 `.env` 读取 `REDIS_PORT` / `REDIS_URL`（见 `.env.example`）。

## 健康

```bash
docker exec redis redis-cli ping   # 期望 PONG
pnpm devops infra status redis
```

## 说明

- 默认无密码（dev）。生产环境应在 `docker-compose.yml` 加 `command: redis-server --requirepass ${REDIS_PASSWORD}` 并扩展 env。
- 数据卷 `./redis_data`（已 gitignore）。缓存可丢失，重建即回填。
- 当前无 Node 消费者（cache.ts 已移除）；service 层落地后再接入 ioredis。
