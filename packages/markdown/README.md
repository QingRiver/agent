# @agent/markdown

客户端 Markdown → HTML：GFM 标题 id、脚注、KaTeX、highlight.js，并提取 TOC。供知识库预览等前端场景使用。

## 导出

```ts
import { renderMarkdown, type TocItem } from '@agent/markdown'

const { html, toc } = renderMarkdown(md)
// TocItem: { text, level, slug }
```

## 使用

Client：`KbMarkdownPreview`、`KbMarkdownToc` 等。不依赖 graph / server。

## 常用命令

```bash
pnpm --filter @agent/markdown tc
pnpm test
```

## 相关文档

- 仓库根 [README](../../README.md)
- [apps/client/README.md](../../apps/client/README.md)
- [wiki/RAG.md](../../wiki/RAG.md) — 知识库预览上下文
