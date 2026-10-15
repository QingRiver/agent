# @agent/code-card

浏览器内把 TSX 字符串编译成可交互卡片。已知卡片仍走 `@agent/ui` 注册表。

## 契约

生成代码是单个 `export default function`，不能写 `import`。可用的标识符只有 `React`、`useState`、`useCardContext`。

`useCardContext()` 返回 `{ info, isLoading, error, triggerAction }`。点击通过 `triggerAction(name, payload)` 交回宿主的 `onAction`。

## 命令

```bash
pnpm --filter @agent/code-card storybook   # http://localhost:6007
pnpm --filter @agent/code-card tc
```
