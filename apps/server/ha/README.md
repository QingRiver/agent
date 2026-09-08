# ha

本仓库内 **Python/uv 扩展口**（`pnpm --filter ha`），**不是** Home Assistant Core。

正式 HA（管理后台 + MCP）在 Docker：

```bash
pnpm devops infra up ha
# UI: http://localhost:8123
# 说明: infra/ha/README.md
```

Agent 侧用 Node [`createHaMcp`](../../../packages/tools/src/mcp/haClient.ts) 连该实例的 `/api/mcp`（`.env` 的 `HA_URL` / `HA_TOKEN`）。

## 要求

- 本机已安装 [uv](https://docs.astral.sh/uv/)
- Python `>=3.12`（由 uv 按 `.python-version` 拉取）

## 常用命令

```bash
pnpm setup:ha
pnpm dev:ha
pnpm --filter ha run lint
```

根目录 `pnpm install` 的 `prepare` 会自动 `uv sync`（需已装 uv）。
