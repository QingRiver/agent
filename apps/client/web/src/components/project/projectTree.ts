import type { DirTree, DirTreeNode } from '@agent/project'
import type { DirDto } from '@apis/dir-api'
import type { SkillRow, VersionTextRow } from '@apis/skill-api'

export type ProjectTreeNode
  = | {
    kind: 'folder'
    id: string
    name: string
    skill: SkillRow | null
    children: ProjectTreeNode[]
  }
  | { kind: 'text', id: string, name: string, dirId: string }
  | { kind: 'doc', id: string, name: string }
  | { kind: 'task', id: string, name: string }

export interface ProjectLeafDoc {
  id: string
  name: string
  mountDirId: string | null
}

export interface ProjectLeafTask {
  id: string
  name: string
  mountDirId: string | null
}

export function buildProjectTree(
  tree: DirTree,
  projectId: string,
  skillsByDirId: Map<string, SkillRow>,
  texts: VersionTextRow[],
  docs: ProjectLeafDoc[],
  tasks: ProjectLeafTask[],
): ProjectTreeNode | null {
  const root = tree.byId.get(projectId)
  if (!root)
    return null

  const textsByDir = groupByDir(texts.map(t => ({ id: t.id, name: t.filename, dirId: t.mountDirId })))
  const docsByDir = groupByNullable(docs)
  const tasksByDir = groupByNullable(tasks)

  function fromDir(node: DirTreeNode): ProjectTreeNode {
    const folders = node.children.map(fromDir)
    const files: ProjectTreeNode[] = (textsByDir.get(node.dir.id) ?? []).map(t => ({
      kind: 'text' as const,
      id: t.id,
      name: t.name,
      dirId: t.dirId,
    }))
    const docLeaves: ProjectTreeNode[] = (docsByDir.get(node.dir.id) ?? []).map(d => ({
      kind: 'doc' as const,
      id: d.id,
      name: d.name,
    }))
    const taskLeaves: ProjectTreeNode[] = (tasksByDir.get(node.dir.id) ?? []).map(t => ({
      kind: 'task' as const,
      id: t.id,
      name: t.name,
    }))
    return {
      kind: 'folder',
      id: node.dir.id,
      name: node.dir.name,
      skill: skillsByDirId.get(node.dir.id) ?? null,
      children: [...folders, ...files, ...docLeaves, ...taskLeaves],
    }
  }

  return fromDir(root)
}

export function projectRoots(dirs: DirDto[]): DirDto[] {
  return dirs.filter(d => d.kind === 'project').slice().sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
}

function groupByDir(items: { id: string, name: string, dirId: string }[]): Map<string, { id: string, name: string, dirId: string }[]> {
  const map = new Map<string, { id: string, name: string, dirId: string }[]>()
  for (const item of items) {
    const list = map.get(item.dirId) ?? []
    list.push(item)
    map.set(item.dirId, list)
  }
  for (const list of map.values())
    list.sort((a, b) => a.name.localeCompare(b.name))
  return map
}

function groupByNullable<T extends { id: string, name: string, mountDirId: string | null }>(items: T[]): Map<string, T[]> {
  const map = new Map<string, T[]>()
  for (const item of items) {
    if (item.mountDirId == null)
      continue
    const list = map.get(item.mountDirId) ?? []
    list.push(item)
    map.set(item.mountDirId, list)
  }
  for (const list of map.values())
    list.sort((a, b) => a.name.localeCompare(b.name))
  return map
}
