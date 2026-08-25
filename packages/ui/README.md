# @agent/ui

除 CLI（Ink）外的对话卡片 View 库：纯 Client 组件 + Zod props + 亮/暗 token + Storybook。

## 分层

| 层 | 职责 | 本包 |
|----|------|------|
| View | 卡片 UI、props 契约、亮/暗 | **是** |
| Transport | interrupt resume / useComponent | 否（Host） |
| Host 适配器 | `AgentInterruptUi` / `AgentDynamicUi` | 否（web） |

- **ask_human**：图必须停 → checkpoint → resume，走 HITL interrupt。
- **weather_current**：纯展示；Host `useComponent` 内联渲染；`WeatherCurrentPropsSchema` 在本包。

## 导出

| 导出 | 说明 |
|------|------|
| `InterruptCard` / `AskHuman*Card` | 6 种中断卡 |
| `WeatherCurrentCard` | 当前天气展示卡 |
| `cardRegistry` / `getCard` / `CardNameSchema` | 统一注册表 |
| Zod schemas | View props（weather 再导出 proto） |
| `@agent/ui/styles/tokens.css` | `:root` / `.dark` 出厂语义色 |

## 命令

```bash
pnpm --filter @agent/ui storybook   # 或根目录 pnpm storybook
pnpm --filter @agent/ui tc
```
