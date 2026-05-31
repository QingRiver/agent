# agent

pnpm monorepo，用于 agent / chatbot 相关实验与后端服务。

## 结构

```
apps/
  server/          # Koa 3 HTTP/2 HTTPS 服务（装饰器路由）
packages/          # 共享包（预留）
```

## 前置条件

- Node.js >= 20
- [pnpm](https://pnpm.io/)（见根目录 `packageManager` 字段）

## 快速开始

```bash
pnpm install

# 启动 server 开发服务
pnpm --filter server cert   # 首次：生成本地 HTTPS 证书
pnpm --filter server dev    # https://localhost:3000
```

Server 的 API、路由机制与 curl 示例见 [apps/server/README.md](./apps/server/README.md)。

## 开发

```bash
pnpm exec tsc --noEmit      # 类型检查
pnpm exec eslint .          # Lint
pnpm exec vitest            # 测试（packages 下 *.test.ts）
```

## 技术栈

- TypeScript、tsx、Vitest、ESLint（@antfu/eslint-config）
- Server：Koa 3、`@koa/router`、Radash
