import type { DirDto } from '@apis/dir-api'

/** 自 dirId 沿 parent 向上找最近已绑定知识库根；无则 null */
export function findEnclosingKbDirId(
  dirsById: Map<string, DirDto>,
  kbsByDirId: Map<string, unknown>,
  dirId: string,
): string | null {
  let cur: string | null = dirId
  const guard = new Set<string>()
  while (cur && !guard.has(cur)) {
    if (kbsByDirId.has(cur))
      return cur
    guard.add(cur)
    cur = dirsById.get(cur)?.parentId ?? null
  }
  return null
}

/** 新建 kb 文档名：无扩展名则补 .md；非 md/markdown 则强制改成 .md */
export function normalizeKbDocName(raw: string): string {
  const name = raw.trim()
  if (!name)
    return '未命名.md'
  const lower = name.toLowerCase()
  if (lower.endsWith('.md') || lower.endsWith('.markdown'))
    return name
  if (name.includes('.'))
    return `${name.replace(/\.[^.]+$/, '')}.md`
  return `${name}.md`
}
