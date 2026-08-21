# apps/server

后端应用。包名见各子目录 `package.json`。

| 路径 | 说明 |
|------|------|
| [gateway](./gateway/README.md) | Hono HTTPS API、CopilotRuntime、会话 / 认证 / 知识库 / GTD sync（`pnpm --filter server`） |
| [rsc-engine](./rsc-engine/README.md) | Waku RSC 编译引擎，loopback `3010`（`pnpm --filter rsc-engine`） |
