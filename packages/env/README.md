# @agent/env

Monorepo 统一环境变量：加载根 `.env`（及可选 `apps/server/.env` 覆盖），经 zod 校验后导出 `env`。

## 导出

| 导出 | 说明 |
|------|------|
| `env` | 校验后的环境对象（LLM、auth、DB、Qdrant、KB、Tushare 等） |
| `dataDirPath` | 数据目录绝对路径 |
| `ServerEnvSchema` / `ServerEnv` | 服务端 schema 与类型 |

**注意**：`import { env } from '@agent/env'` 会执行加载与校验；缺少根 `.env` 或必填项不合规会抛错。

## 目录

```text
src/
├── load.ts       # 根 .env + server 覆盖
├── schema.ts     # zod schema
├── data-dir.ts
├── env.ts
└── index.ts
```

## 使用

```ts
import { env, dataDirPath } from '@agent/env'

console.log(env.OPENAI_MODEL, dataDirPath)
```

被 server、graph、kb、cli 及各类脚本共同依赖。改 LLM / 密钥只改根 `.env`；`PORT`、`DATA_DIR` 等可在 `apps/server/.env` 覆盖。

## 常用命令

```bash
# 仓库根目录
cp .env.example .env
pnpm --filter @agent/env tc
pnpm test
```

## 相关文档

- 仓库根 [README](../../README.md)
- [`.env.example`](../../.env.example)
- [apps/server/README.md](../../apps/server/README.md)
