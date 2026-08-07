import type { DirRow } from './schema'
import { DIR_KIND } from './types'
import { dirVdir } from './vdir'

/** dir 树领域错误（结构不变量违反） */
export class ProjectDirError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ProjectDirError'
  }
}

/**
 * kind 不变量：project ⇔ parentId null。
 *
 * - project 必为根（parentId null）
 * - dir 必有 parent（parentId not null）
 * - 不存在 project 子 project、dir→project
 */
export function assertKindInvariant(dir: Pick<DirRow, 'kind' | 'parentId'>): void {
  if (dir.kind === DIR_KIND.PROJECT && dir.parentId != null)
    throw new ProjectDirError('project 必为根（parentId 须为 null）')
  if (dir.kind === DIR_KIND.DIR && dir.parentId == null)
    throw new ProjectDirError('dir 必须有 parent（parentId 不可为 null）')
}

/**
 * 构造 DirRow（派生 vdir + 默认 acl/etag/timestamps）。
 *
 * `projectId` 必填：project 根传自身 id，dir 传父的 projectId（= walkToRoot 派生）。
 * `parentVdir` 对 dir 必填（来自父行），project 根传 null。
 * `now` 由调用方传入（可测性，避免 new Date() 副作用）。
 */
export function makeDir(input: {
  id: string
  parentId: string | null
  kind: DirRow['kind']
  name: string
  ownerId: string
  now: string
  projectId?: string
  parentVdir?: string | null
  sortOrder?: number
  acl?: DirRow['acl']
}): DirRow {
  assertKindInvariant(input)
  // project 根的 projectId = 自身；dir 用传入的父 projectId
  const projectId = input.kind === DIR_KIND.PROJECT ? input.id : input.projectId
  if (!projectId)
    throw new ProjectDirError('dir 必须有 projectId（= 父的 projectId）')
  const vdir = dirVdir(input.parentVdir ?? null, input.name)
  return {
    id: input.id,
    parentId: input.parentId,
    kind: input.kind,
    name: input.name,
    sortOrder: input.sortOrder ?? 0,
    projectId,
    vdir,
    acl: input.acl ?? {},
    ownerId: input.ownerId,
    etag: 1,
    deleted: false,
    createdAt: input.now,
    updatedAt: input.now,
  }
}

/**
 * 改名：返回新行（**结构不变**——parentId/projectId 不动，仅 name/vdir/etag/updatedAt 变）。
 *
 * 仅改本行；子树其他行的 vdir 由 `recomputeSubtreeVdirs` 另算（service 层负责）。
 * project 根 vdir = name（无 `/`）；dir 的 vdir = `parentVdir/name`，去尾段换新名。
 */
export function renameDir(dir: DirRow, newName: string, now: string): DirRow {
  const newVdir = dir.kind === DIR_KIND.PROJECT
    ? newName
    : `${dir.vdir.slice(0, dir.vdir.lastIndexOf('/'))}/${newName}`
  return {
    ...dir,
    name: newName,
    vdir: newVdir,
    etag: dir.etag + 1,
    updatedAt: now,
  }
}
