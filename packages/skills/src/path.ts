import { ALLOWED_EXTS, SKILL_ENTRY_FILENAME } from './spec'

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
