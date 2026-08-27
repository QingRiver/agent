/** 入口文件名（相对 skill 根） */
export const SKILL_ENTRY_FILENAME = 'SKILL.md'

export const READ_SKILL_FILE_TOOL_NAME = 'read_skill_file'

export const RESERVED_SKILL_CODES = [
  'kb_search',
  'ask_input',
  'ask_choice',
  'ask_multi_choice',
  'ask_confirm',
  READ_SKILL_FILE_TOOL_NAME,
] as const

const RESERVED_SET = new Set<string>(RESERVED_SKILL_CODES)

const ALLOWED_EXTS = new Set(['.md', '.json', '.yaml', '.yml', '.ts', '.mts', '.js', '.mjs'])

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/

export function isReservedSkillCode(code: string): boolean {
  return RESERVED_SET.has(code)
}

export function slugifySkillCode(name: string): string {
  const s = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 64)
  const code = s.length > 0 ? s : 'skill'
  if (isReservedSkillCode(code))
    return `s_${code}`.slice(0, 64)
  return code
}

/** SKILL.md `name` 作为唯一标识时必须已经是合法 slug；中文等无法作为 code。 */
export function canonicalSkillCode(name: string): string | null {
  const t = name.trim().toLowerCase()
  if (!/^[a-z][a-z0-9_-]{0,63}$/.test(t))
    return null
  if (isReservedSkillCode(t))
    return null
  return t
}

export interface SkillFrontmatter {
  name?: string
  description?: string
  body: string
}

/** 只取 name / description 标量；正则同时吃 LF 与 CRLF。无 yaml 依赖。 */
export function parseFrontmatter(content: string): SkillFrontmatter {
  const m = FRONTMATTER_RE.exec(content)
  if (!m) {
    return { body: content }
  }
  const block = m[1] ?? ''
  const body = content.slice(m[0].length)
  let name: string | undefined
  let description: string | undefined
  for (const rawLine of block.split(/\r?\n/)) {
    const line = rawLine.trim()
    const colon = line.indexOf(':')
    if (colon <= 0)
      continue
    const key = line.slice(0, colon).trim()
    if (!/^\w+$/.test(key))
      continue
    const value = stripScalar(line.slice(colon + 1))
    if (key === 'name' && value)
      name = value
    else if (key === 'description')
      description = value
  }
  return {
    ...(name != null ? { name } : {}),
    ...(description != null ? { description } : {}),
    body,
  }
}

function stripScalar(raw: string): string {
  const t = raw.trim()
  if (
    (t.startsWith('"') && t.endsWith('"'))
    || (t.startsWith('\'') && t.endsWith('\''))
  ) {
    return t.slice(1, -1)
  }
  return t
}

export interface SkillPathOk { ok: true, path: string }
export interface SkillPathErr { ok: false, error: string }

/**
 * 去 `./`、禁 `..` 与绝对路径。允许 `/`。后缀白名单。
 * 空 path 视为 SKILL.md。
 */
export function normalizeSkillPath(raw: string | undefined): SkillPathOk | SkillPathErr {
  const input = (raw ?? '').trim() || SKILL_ENTRY_FILENAME
  if (input.startsWith('/') || /^[a-z]:/i.test(input))
    return { ok: false, error: 'SKILL_PATH_ABSOLUTE' }
  const parts = input.replace(/\\/g, '/').split('/')
  const out: string[] = []
  for (const p of parts) {
    if (p === '' || p === '.')
      continue
    if (p === '..')
      return { ok: false, error: 'SKILL_PATH_ESCAPE' }
    out.push(p)
  }
  if (out.length === 0)
    return { ok: false, error: 'SKILL_PATH_INVALID' }
  const path = out.join('/')
  const dot = path.lastIndexOf('.')
  const ext = dot >= 0 ? path.slice(dot).toLowerCase() : ''
  if (!ALLOWED_EXTS.has(ext))
    return { ok: false, error: 'SKILL_TYPE_UNSUPPORTED' }
  return { ok: true, path }
}

/**
 * 读单个 skill 的 files 映射。未绑定 / 类型不支持 / 不存在返回可给 LLM 看的错误串，不抛。
 */
export function readSkillFile(
  files: Record<string, string> | null | undefined,
  path?: string,
): string {
  if (files == null)
    return '错误：SKILL_NOT_BOUND（未绑定该 skill 或无权加载）'
  const norm = normalizeSkillPath(path)
  if (!norm.ok)
    return `错误：${norm.error}`
  const content = files[norm.path]
  if (content == null)
    return `错误：SKILL_FILE_NOT_FOUND（${norm.path}）`
  return content
}

export interface SkillIndexEntry {
  name: string
  code: string
  description: string
}

/**
 * 只写 code + description。code 与 SKILL.md frontmatter name 相同。
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
