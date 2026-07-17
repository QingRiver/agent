import type { PerspectivePromptVars } from './perspective-prompt'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { formatPromptExamplesMarkdown } from './__tests__/perspective-prompt-fixtures'
import { formatFilterMatrixMarkdown } from './perspective-input'

const __dirname = dirname(fileURLToPath(import.meta.url))

/** 服务端专用：从 markdown 文件加载模板（勿从浏览器入口 re-export） */
export function loadPerspectivePromptTemplateFromDisk(): string {
  return readFileSync(join(__dirname, 'prompts/perspective.md'), 'utf8').trim()
}

/** 使用磁盘 markdown + 代码注入变量渲染完整 Prompt */
export function renderPerspectivePromptFromDisk(): string {
  const vars: PerspectivePromptVars = {
    filter_matrix: formatFilterMatrixMarkdown(),
    examples: formatPromptExamplesMarkdown(),
  }
  const template = loadPerspectivePromptTemplateFromDisk()
  return template
    .replace(/\$\{filter_matrix\}/, vars.filter_matrix)
    .replace(/\$\{examples\}/, vars.examples)
}
