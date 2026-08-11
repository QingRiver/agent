/**
 * 共享 fixture barrel（单测 + 未来 client Storybook 同源）。
 *
 * 导入：
 * - 包内单测：`from '../fixtures'` / `from '../../fixtures'`
 * - client Storybook（未来）：`from '@agent/gtd/fixtures'`（见 package.json `exports`）
 *
 * 内容：常量 + 领域/行级工厂 + 富场景 + sync 报文助手 + perspective prompt + Forecast 锚点。
 */
export * from './constants'
export * from './factories'
export * from './forecast'
export * from './perspective-prompt'
export * from './scenarios'
export * from './sync'
