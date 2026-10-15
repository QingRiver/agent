# apps/server

后端应用。包名见各子目录 `package.json`。

| 路径 | 说明 |
|------|------|
| [gateway](./gateway/README.md) | Hono HTTPS API、LangGraph 图流、会话 / 认证 / 知识库 / GTD sync（`pnpm --filter server`） |
| [ha](./ha/README.md) | Home Assistant Python/uv 扩展口（`pnpm --filter ha`）；正式 HA 见 [`infra/ha`](../../infra/ha/README.md) |
