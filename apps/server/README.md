# server

基于 [Koa 3](https://koajs.com/) 的 HTTP/2 HTTPS 服务：装饰器注册路由、LangGraph 示例图、SSE 流式输出。开发环境使用 [tsx](https://github.com/privatenumber/tsx) 直接运行 TypeScript。

## 前置条件

- Node.js >= 20
- [pnpm](https://pnpm.io/)
- [mkcert](https://github.com/FiloSottile/mkcert)（证书也会给 client 开发服务器复用）

## 快速开始

```bash
# 在仓库根目录
pnpm install
pnpm --filter server cert
pnpm --filter server dev
# 或根目录：pnpm dev（同时启动 client）
```

默认地址：`https://localhost:3000`（环境变量 `PORT` 可改）

## API

| 方法  | 路径                         | 说明 |
| ----- | ---------------------------- | ---- |
| `GET` | `/`                          | 心跳：路径、时间戳、`protocol`（如 `h2`） |
| `GET` | `/:param`                    | 动态参数路由 |
| `GET` | `/sample/simpleGraph`        | 同步执行 LangGraph，返回最终 state |
| `GET` | `/sample/simpleGraph/sse`    | SSE 流式推送 LangGraph `updates` 事件 |

### curl 示例

自签证书需加 `-k`：

```bash
# 心跳
curl -sk https://localhost:3000/

# 动态参数
curl -sk https://localhost:3000/world

# LangGraph 同步
curl -sk https://localhost:3000/sample/simpleGraph

# LangGraph SSE（流式）
curl -sk -N https://localhost:3000/sample/simpleGraph/sse
```

### SSE 事件格式

每条消息为 `data: <json>\n\n`，例如：

- `{ "type": "start" }`
- `{ "type": "update", "data": { "node_a": { "messages": [...] } } }`
- `{ "type": "done" }`
- 结束帧：`data: [DONE]\n\n`

## 项目结构

```text
src/
├── index.ts                 # Koa + HTTP/2 入口
├── controller/
│   ├── default.ts           # 心跳、动态参数
│   └── sample.ts            # LangGraph 同步 / SSE
├── graphs/
│   └── simpleGraph.ts       # LangGraph 两节点示例
├── middleware/
│   └── logger.ts
├── router/
│   ├── decorator.ts         # @Controller / @Get / @Post
│   ├── registry.ts          # 扫描控制器、排序注册
│   ├── routeConfig.ts       # 注册的 Controller 列表
│   └── index.ts             # @koa/router（exclusive: specificity）
└── utils/
    ├── debug.ts             # @Debug 方法装饰器
    ├── sanitize.ts
    └── sse.ts               # SSE 流封装
certificates/                # mkcert 证书（gitignore）
```

## 路由机制

1. `@Controller(prefix)` 声明类级前缀，`@Get('/sub')` 声明方法路由。
2. 在 `routeConfig.ts` 的 `collectRoutesFromControllers([...])` 中注册 Controller。
3. 静态路由优先于 `/:param`（`exclusive: 'specificity'` + 注册前排序）。

### 新增接口

1. 在 `src/controller/` 添加或扩展 Controller。
2. 在 `src/router/routeConfig.ts` 加入该类。
3. 保存后 `tsx watch` 自动重载。

## 中间件顺序

```text
bodyParser → koa-static(public) → logger → router
```

## 脚本

| 命令        | 说明 |
| ----------- | ---- |
| `pnpm dev`  | `tsx watch` 开发 |
| `pnpm cert` | mkcert 生成 `certificates/` |

## 技术栈

- Koa 3、`@koa/router`
- `@langchain/langgraph`（`simpleGraph`）
- HTTP/2（TLS，`allowHTTP1: true`）
- TypeScript Stage 3 装饰器 + tsx
- Radash（工具库）
