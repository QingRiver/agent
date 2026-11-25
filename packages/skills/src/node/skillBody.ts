import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SKILLS_ROOT = join(__dirname, '..', '..', 'skills')

const FRONTMATTER_RE = /^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/

/**
 * 读 `skills/<skillDir>/SKILL.md` 的 body（剥 frontmatter）。
 * 供需要 skill 正文作 system prompt 的图复用（tushare / ha 等），避免在 TS 重写字面量。
 */
export function readSkillBody(skillDir: string): string {
  return readFileSync(join(SKILLS_ROOT, skillDir, 'SKILL.md'), 'utf8').replace(FRONTMATTER_RE, '').trim()
}
