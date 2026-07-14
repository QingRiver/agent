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
