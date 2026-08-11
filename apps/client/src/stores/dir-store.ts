import type { PerspectiveEntityRef } from '@agent/gtd'
import type { DirRow, DirTree } from '@agent/project'
import type { DirDto } from '@apis/dir-api'
import { buildDirTree, subtreeDirIds, walkToProjectRoot } from '@agent/project'
import { DirApi } from '@apis/dir-api'
import { atom, getDefaultStore } from 'jotai'

/**
 * 统一 dirs 树客户端内存 store（project 根 + dir 子树）。
 *
 * project/folder 退出 GTD sync，改走在线 Dir API。dirs 量小，纯内存（不进 IDB
 * rows store），list 拉全量扁平行，client 端 buildDirTree 组装。mutation 后 refresh 全量
 * 重拉（量小，简单可靠）。
 *
 * 派生：dirsById（id→DirDto）、dirTree（buildDirTree）、projectRefs（透视校验
 * 上下文用）、mountDirIdsOf(projectDirId)（task 聚合用 subtreeDirIds）。
 * projectOf(task) = walkToProjectRoot(mountDirId, dirsById) 供 RowStore 投影槽注入。
 */
export class DirStore {
  static readonly dirsAtom = atom<DirDto[]>([])

  static readonly dirsByIdAtom = atom((get) => {
    const map = new Map<string, DirDto>()
    for (const d of get(DirStore.dirsAtom))
      map.set(d.id, d)
    return map
  })

  /** buildDirTree 需要 DirRow；DirDto 字段兼容（缺 deleted，但 buildDirTree 不读） */
  static readonly dirTreeAtom = atom<DirTree>(get =>
    buildDirTree(get(DirStore.dirsAtom) as unknown as DirRow[]))

  /** 透视校验上下文：project 根引用（id+name） */
  static readonly projectRefsAtom = atom<PerspectiveEntityRef[]>(get =>
    get(DirStore.dirsAtom).filter(d => d.kind === 'project').map(d => ({ id: d.id, name: d.name })))

  /** 透视校验上下文聚合（projects） */
  static readonly validationRefsAtom = atom(get => ({
    projects: get(DirStore.projectRefsAtom),
  }))

  private static store() {
    return getDefaultStore()
  }

  static reset(): void {
    DirStore.store().set(DirStore.dirsAtom, [])
  }

  /** 拉全量 dirs 树 */
  static async refresh(): Promise<void> {
    try {
      const dirs = await DirApi.list()
      DirStore.store().set(DirStore.dirsAtom, dirs)
    }
    catch {
      // dirs 拉取失败不阻断 GTD 主流程
    }
  }

  static async createProject(name: string, sortOrder?: number): Promise<DirDto> {
    const dir = await DirApi.createProject({ name, ...(sortOrder != null ? { sortOrder } : {}) })
    await DirStore.refresh()
    return dir
  }

  static async createDir(parentId: string, name: string, sortOrder?: number): Promise<DirDto> {
    const dir = await DirApi.createDir({ parentId, name, ...(sortOrder != null ? { sortOrder } : {}) })
    await DirStore.refresh()
    return dir
  }

  static async rename(id: string, name: string): Promise<void> {
    await DirApi.rename(id, name)
    await DirStore.refresh()
  }

  static async move(id: string, newParentId: string, sortOrder?: number): Promise<void> {
    await DirApi.move(id, { newParentId, ...(sortOrder != null ? { sortOrder } : {}) })
    await DirStore.refresh()
  }

  static async reorder(id: string, sortOrder: number): Promise<void> {
    await DirApi.reorder(id, sortOrder)
    await DirStore.refresh()
  }

  /** 批量重排（移动项 + 受影响兄弟），单次 refresh 避免多次全量拉取 */
  static async reorderBatch(updates: { id: string, sortOrder: number }[]): Promise<void> {
    for (const u of updates)
      await DirApi.reorder(u.id, u.sortOrder)
    await DirStore.refresh()
  }

  static async delete(id: string): Promise<void> {
    await DirApi.delete(id)
    await DirStore.refresh()
  }

  // ---------------- 派生查询（供 gtd-store 注入/聚合） ----------------

  /** task 的派生 projectId = walkToProjectRoot(mountDirId)；null=Inbox/无挂载 */
  static projectOf(dirsById: Map<string, DirDto>, mountDirId: string | null | undefined): string | null {
    return walkToProjectRoot(mountDirId ?? null, dirsById as unknown as Map<string, DirRow>)
  }

  /** 某 project/dir 子树下全部 dir id（含自身），供 task 聚合（mountDirId ∈ 子树） */
  static subtreeDirIds(tree: DirTree, rootDirId: string): Set<string> {
    return subtreeDirIds(tree, rootDirId)
  }
}
