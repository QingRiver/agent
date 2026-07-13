export * from './auth'
// 客户端层：连接信息 + 认证 fetch。
// 上层（support/flows）只 import 这里，不直接碰 fetch/Headers。
export * from './config'
