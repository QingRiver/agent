import type { KbDocSummary, KbNodeRow } from '@apis/kb-api'

export interface KbTreeFolder {
  kind: 'folder'
  id: string
  name: string
  children: KbTreeNode[]
}

export interface KbTreeDoc {
  kind: 'doc'
  id: string
  name: string
  doc: KbDocSummary
}

export type KbTreeNode = KbTreeFolder | KbTreeDoc

/** 用 nodes.parentId + docs.parentNodeId 拼树；根级文件夹/文档挂在 root */
export function buildKbTree(nodes: KbNodeRow[], docs: KbDocSummary[]): KbTreeNode[] {
  const byParent = new Map<string | null, KbNodeRow[]>()
  for (const n of nodes) {
    const key = n.parentId
    const list = byParent.get(key) ?? []
    list.push(n)
    byParent.set(key, list)
  }
  for (const list of byParent.values())
    list.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))

  const docsByParent = new Map<string | null, KbDocSummary[]>()
  for (const d of docs) {
    const key = d.parentNodeId
    const list = docsByParent.get(key) ?? []
    list.push(d)
    docsByParent.set(key, list)
  }
  for (const list of docsByParent.values())
    list.sort((a, b) => b.updatedAt - a.updatedAt)

  function build(parentId: string | null): KbTreeNode[] {
    const folders = (byParent.get(parentId) ?? []).map((n): KbTreeFolder => ({
      kind: 'folder',
      id: n.id,
      name: n.name,
      children: build(n.id),
    }))
    const files = (docsByParent.get(parentId) ?? []).map((d): KbTreeDoc => ({
      kind: 'doc',
      id: d.id,
      name: d.name,
      doc: d,
    }))
    return [...folders, ...files]
  }

  return build(null)
}

/** nodeId 是否在 ancestorId 子树内（含自身） */
export function isUnderFolder(
  nodes: KbNodeRow[],
  ancestorId: string,
  nodeId: string,
): boolean {
  if (ancestorId === nodeId)
    return true
  const byId = new Map(nodes.map(n => [n.id, n]))
  let cur: string | null = nodeId
  const guard = new Set<string>()
  while (cur != null && !guard.has(cur)) {
    if (cur === ancestorId)
      return true
    guard.add(cur)
    cur = byId.get(cur)?.parentId ?? null
  }
  return false
}

/** 文件夹能否移到 targetParentId（含根 null）；禁止环与无变更 */
export function canMoveFolderTo(
  nodes: KbNodeRow[],
  folderId: string,
  targetParentId: string | null,
): boolean {
  const folder = nodes.find(n => n.id === folderId)
  if (!folder)
    return false
  if (folder.parentId === targetParentId)
    return false
  if (targetParentId == null)
    return true
  if (targetParentId === folderId)
    return false
  return !isUnderFolder(nodes, folderId, targetParentId)
}
