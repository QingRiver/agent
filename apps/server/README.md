# server

基于 [Koa 3](https://koajs.com/) 的 HTTP/2 HTTPS 服务，使用装饰器注册路由，由 [tsx](https://github.com/privatenumber/tsx) 直接运行 TypeScript。

## 前置条件

- Node.js >= 20
- [pnpm](https://pnpm.io/)
- [mkcert](https://github.com/FiloSottile/mkcert)（生成本地 HTTPS 证书）

## 快速开始

在 monorepo 根目录或本目录下执行：

```bash
# 安装依赖（根目录）
pnpm install

# 生成本地证书（首次）
pnpm --filter server cert

# 启动开发服务（热重载）
pnpm --filter server dev
```

服务默认监听 `https://localhost:3000`（可通过环境变量 `PORT` 修改）。

## API

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/` | 心跳检测，返回路径、时间戳与 HTTP 协议 |
| `GET` | `/:param` | 动态参数路由 |

### 示例

服务使用自签证书，curl 需加 `-k`：

```bash
# 心跳
curl -sk https://localhost:3000/

# 动态参数
curl -sk https://localhost:3000/world

# 触发 @Debug 日志（需 query.debug=1）
curl -sk 'https://localhost:3000/foo?debug=1'
```

## 项目结构

```
src/
├── index.ts              # 入口：Koa 应用、HTTP/2 服务
├── controller/           # 控制器（@Controller / @Get 等装饰器）
├── middleware/           # Koa 中间件
├── router/
│   ├── decorator.ts      # 路由装饰器定义
│   ├── registry.ts       # 扫描控制器、收集路由
│   ├── routeConfig.ts    # 注册哪些 Controller
│   └── index.ts          # 创建 @koa/router 并导出中间件
└── utils/                # Debug、日志脱敏等工具
certificates/             # mkcert 生成的本地证书（gitignore）
```

## 路由机制

1. 在 Controller 上使用 `@Controller(prefix)` 声明路径前缀。
2. 在方法上使用 `@Get('/path')`、`@Post('/path')` 等声明子路由。
3. `routeConfig.ts` 中列出要扫描的 Controller 类。
4. `registry.ts` 读取装饰器元数据，生成路由表并注册到 `@koa/router`。
5. Router 使用 `exclusive: 'specificity'`，静态路由优先于 `/:param` 等参数路由。

### 新增路由

1. 在 `src/controller/` 下编写 Controller，或扩展现有类。
2. 在 `src/router/routeConfig.ts` 中 import 并加入 `collectRoutesFromControllers([...])`。
3. 重启或等待 `tsx watch` 自动重载。

## 中间件顺序

```
bodyParser → koa-static(public) → logger → router
```

## 脚本

| 命令 | 说明 |
|------|------|
| `pnpm dev` | `tsx watch` 启动开发服务 |
| `pnpm cert` | 用 mkcert 生成 `certificates/` 下的 localhost 证书 |

## 技术栈

- Koa 3 + `@koa/router`
- HTTP/2（TLS，支持 HTTP/1.1 回退）
- TypeScript Stage 3 装饰器
- tsx（开发时运行 TS，无需先编译）
