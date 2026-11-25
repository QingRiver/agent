import { isReservedSkillCode } from './spec'

const SLUG_RE = /^[a-z][a-z0-9_-]{0,63}$/

/** name 是否为合法 skill slug（仅形态校验，不查保留名）。 */
export function isValidSkillSlug(name: string): boolean {
  return SLUG_RE.test(name.trim().toLowerCase())
}

/**
 * 把任意字符串 slugify 成合法 skill code。
 * 中文等非 [a-z0-9_] 字符会被替换/清空；保留名加 `s_` 前缀避让。
 */
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

/**
 * SKILL.md frontmatter `name` 作为用户 skill 唯一标识时，必须已是合法 slug。
 * 中文等无法作为 code；保留名同样拒绝（用户不能用内置 code 建同名）。
 * 内置 skill 自身的 code 是保留名，读取目录时用 `isValidSkillSlug` 而非本函数。
 */
export function canonicalSkillCode(name: string): string | null {
  const t = name.trim().toLowerCase()
  if (!SLUG_RE.test(t))
    return null
  if (isReservedSkillCode(t))
    return null
  return t
}
