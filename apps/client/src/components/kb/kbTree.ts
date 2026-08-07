import type { DirTree, DirTreeNode } from '@agent/project'
import type { KbDocSummary } from '@apis/kb-api'

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

/**
 * 由 DirStore.dirTreeAtom（统一 dirs 树：project 根 + dir 子树）+ 文档列表
 * （按 mountDirId 挂载）组装渲染树。mountDirId=null 的文档挂根级（Inbox）。
 *
 * 替代旧 buildKbTree(nodes, docs)：KB 不再独立持树，文件夹即 dirs。
 */
export function buildKbTree(tree: DirTree, docs: KbDocSummary[]): KbTreeNode[] {
  const docsByMount = new Map<string | null, KbDocSummary[]>()
  for (const d of docs) {
    const list = docsByMount.get(d.mountDirId) ?? []
    list.push(d)
    docsByMount.set(d.mountDirId, list)
  }
  for (const list of docsByMount.values())
    list.sort((a, b) => b.updatedAt - a.updatedAt)

  function buildChildren(node: DirTreeNode): KbTreeNode[] {
    const folders = node.children.map((n): KbTreeNode => ({
      kind: 'folder',
      id: n.dir.id,
      name: n.dir.name,
      children: buildChildren(n),
    }))
    const files = (docsByMount.get(node.dir.id) ?? []).map((d): KbTreeNode => ({
      kind: 'doc',
      id: d.id,
      name: d.name,
      doc: d,
    }))
    return [...folders, ...files]
  }

  const roots: KbTreeNode[] = tree.roots.map((n): KbTreeNode => ({
    kind: 'folder',
    id: n.dir.id,
    name: n.dir.name,
    children: buildChildren(n),
  }))
  const rootDocs = (docsByMount.get(null) ?? []).map((d): KbTreeNode => ({
    kind: 'doc',
    id: d.id,
    name: d.name,
    doc: d,
  }))
  return [...roots, ...rootDocs]
}

/** nodeId 是否在 ancestorId 子树内（含自身）——基于 DirTree 的 parentId 链 */
export function isUnderFolder(tree: DirTree, ancestorId: string, nodeId: string): boolean {
  if (ancestorId === nodeId)
    return true
  let cur: string | null = nodeId
  const guard = new Set<string>()
  while (cur != null && !guard.has(cur)) {
    if (cur === ancestorId)
      return true
    guard.add(cur)
    cur = tree.byId.get(cur)?.dir.parentId ?? null
  }
  return false
}

/**
 * 文件夹（dir）能否移到 targetParentId。
 * project 根不可移动；dir 不可移到根（null）——统一树中根级只有 project。
 * 禁止环与无变更移动。
 */
export function canMoveFolderTo(tree: DirTree, folderId: string, targetParentId: string | null): boolean {
  const folder = tree.byId.get(folderId)
  if (!folder)
    return false
  if (folder.dir.kind === 'project')
    return false
  if (folder.dir.parentId === targetParentId)
    return false
  if (targetParentId == null)
    return false
  if (targetParentId === folderId)
    return false
  return !isUnderFolder(tree, folderId, targetParentId)
}
