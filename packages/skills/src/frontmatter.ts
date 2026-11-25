import yaml from 'js-yaml'

/**
 * SKILL.md frontmatter 解析结果。
 * - `name` / `description`：通用必填标量，单独抽出便于直接取用。
 * - `body`：frontmatter 之后的 markdown 正文。
 * - `raw`：完整 frontmatter（含 `allowed-tools` 等扩展字段），透传不丢，
 *   供跨 agent（Claude Code 等）按各自扩展字段消费。无 frontmatter 时为空对象。
 */
export interface SkillFrontmatter {
  name?: string
  description?: string
  body: string
  raw: Record<string, unknown>
}

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/

/**
 * 解析 SKILL.md frontmatter（YAML）+ body。兼容 LF / CRLF。
 * 用 js-yaml 完整解析 frontmatter，保留所有扩展字段。
 * YAML 解析失败时回退为空 frontmatter，body 取全文（不抛）。
 */
export function parseFrontmatter(content: string): SkillFrontmatter {
  const m = FRONTMATTER_RE.exec(content)
  if (!m)
    return { body: content, raw: {} }
  const block = m[1] ?? ''
  const body = content.slice(m[0].length)

  let raw: Record<string, unknown> = {}
  try {
    const parsed = yaml.load(block)
    if (parsed != null && typeof parsed === 'object' && !Array.isArray(parsed))
      raw = parsed as Record<string, unknown>
  }
  catch {
    // 恶意/畸形 YAML 不抛，按无 frontmatter 处理
    raw = {}
  }

  const name = typeof raw.name === 'string' ? raw.name : undefined
  const description = typeof raw.description === 'string' ? raw.description : undefined
  return {
    ...(name != null ? { name } : {}),
    ...(description != null ? { description } : {}),
    body,
    raw,
  }
}

/** 把 frontmatter + body 序列化回 SKILL.md 文本（name/description 必填）。 */
export function serializeFrontmatter(frontmatter: Record<string, unknown>, body: string): string {
  const dump = yaml.dump(frontmatter, { lineWidth: -1, quotingType: '"' })
  return `---\n${dump}---\n${body}`
}
