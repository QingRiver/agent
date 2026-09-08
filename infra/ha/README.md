# Home Assistant（infra/ha/）

官方 [Home Assistant](https://www.home-assistant.io/) Container：提供 **管理 UI**（`:8123`）与可选 **MCP Server**（`/api/mcp`）。  
本仓库 Node [`createHaMcp`](../../packages/tools/src/mcp/haClient.ts) / `haGraph` 作为 MCP Client 连接此实例。

## 启动

```bash
pnpm devops infra up ha
# 或
cd infra/ha && docker compose up -d
```

浏览器打开：<http://localhost:8123>（端口可用根 `.env` 的 `HA_PORT` 覆盖）。

首次启动需在 UI 完成 onboarding（建管理员账号）。配置持久化在 `./config`（已 gitignore）。

## 接 Agent MCP

1. HA：**设置 → 设备与服务 → 添加集成 → Model Context Protocol Server**（[文档](https://www.home-assistant.io/integrations/mcp_server/)）
2. **设置 → 人物 → 用户 → 长期访问令牌** 创建 Token
3. Assist / 暴露实体：把要给 MCP 控制的设备暴露出去
4. 仓库根 `.env`：

```bash
HA_URL=http://localhost:8123
HA_TOKEN=<long-lived-access-token>
```

5. 启动 gateway 后选用 agent **`ha`**

## 健康

```bash
pnpm devops infra status ha
# 或浏览器打开 http://localhost:8123
```

## 说明

- **不**纳入 `infra up test` / `all`（镜像与首次配置较重，按需启动）
- [`apps/server/ha`](../../apps/server/ha/) 是本仓库 Python/uv 扩展口，**不是** HA Core；后台管理一律用本 Docker 实例
