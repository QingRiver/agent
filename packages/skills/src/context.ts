import { READ_SKILL_FILE_TOOL_NAME, SKILL_ENTRY_FILENAME } from './spec'

/**
 * 一个已绑定 skill 的运行时描述。
 * `strategy` 当前固定 `'latest'`（取最大已发布版，无则草稿）；预留扩展。
 * 这是 spec 层类型，graph / gateway / @agent/skills 共用，避免各处重复定义。
 */
export interface SkillBinding {
  code: string
  name?: string
  strategy: 'latest'
}

export interface SkillIndexEntry {
  name: string
  code: string
  description: string
}

/**
 * 只写 code + description。code 与 SKILL.md frontmatter name 相同。
 * 输出给 LLM 的 skill 索引：列出可用 skill，提示用 read_skill_file 取正文。
 */
export function formatSkillContext(entries: SkillIndexEntry[]): string {
  if (entries.length === 0)
    return ''
  const lines = [
    '## 可用 Skill',
    `需要某 skill 的正文时，调用 \`${READ_SKILL_FILE_TOOL_NAME}\`，skill_code 必须是下列反引号中的标识（path 默认 ${SKILL_ENTRY_FILENAME}）。不要猜测未读文件的内容。`,
    '',
  ]
  for (const s of entries) {
    const desc = s.description.trim() ? s.description.trim() : '（无描述）'
    lines.push(`- \`${s.code}\`: ${desc}`)
  }
  return lines.join('\n')
}

/** 把模型传来的 skill_code 解析成已绑定的真实 code（先精确 code，再唯一显示名）。 */
export function resolveBoundSkillCode(
  raw: string,
  bindings: { code: string, name?: string }[],
): string | null {
  const q = raw.trim()
  if (!q || bindings.length === 0)
    return null
  const byCode = bindings.find(b => b.code === q)
  if (byCode)
    return byCode.code
  const byName = bindings.filter(b => b.name != null && b.name === q)
  if (byName.length === 1)
    return byName[0]!.code
  const lower = q.toLowerCase()
  const byCodeI = bindings.filter(b => b.code.toLowerCase() === lower)
  if (byCodeI.length === 1)
    return byCodeI[0]!.code
  const byNameI = bindings.filter(b => b.name != null && b.name.toLowerCase() === lower)
  if (byNameI.length === 1)
    return byNameI[0]!.code
  return null
}
