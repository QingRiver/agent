import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { renderPrompt } from '../promptTemplate'

const __dirname = dirname(fileURLToPath(import.meta.url))
const TUSHARE_SYSTEM_PROMPT_TEMPLATE = readFileSync(
  join(__dirname, 'prompts/tushare.md'),
  'utf8',
).trim()

function todayYmd(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}${m}${day}`
}

/** 渲染 system prompt：经 zod 校验 ${to_day} 后替换为当日日期（YYYYMMDD），避免模型时间错乱 */
export function renderTushareSystemPrompt(): string {
  return renderPrompt(TUSHARE_SYSTEM_PROMPT_TEMPLATE, { to_day: todayYmd() })
}

/** 进程级渲染一次（多数场景够用；跨午夜长驻进程理论上有 1 天滞后） */
export const TUSHARE_SYSTEM_PROMPT = renderTushareSystemPrompt()
