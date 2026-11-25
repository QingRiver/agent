import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const WRITING_SPEC_PATH = join(
  __dirname,
  '..',
  '..',
  'skills',
  'html-card',
  'refs',
  'writing-spec.md',
)

/**
 * HTML/CSS 沙箱卡片写作规约。
 *
 * 内容源为 html_card skill 目录的 `refs/writing-spec.md`（跨 agent 可复用）。
 * reactAgent 经内置 html_card skill 急切注入该规约；本导出仅保留给 dev graph
 * 等不走 skill 装配的路径使用，避免内容漂移。
 */
export const CODE_CARD_SYSTEM_PROMPT = readFileSync(WRITING_SPEC_PATH, 'utf8').trim()
