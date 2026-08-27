import type { DirRow } from '@agent/project'
import type { DirDbRow } from '../db/schema'
import { randomUUID } from 'node:crypto'
import {
  assertCanDelete,
  assertMoveValid,
  buildDirTree,
  dirVdir,
  makeDir,
  movedProjectId,
  ProjectDirError,
  recomputeSubtreeVdirs,
  renameDir,
  subtreeDirIds,
} from '@agent/project'
import { and, eq, inArray, isNull } from 'drizzle-orm'
import { db } from '../db/drizzle'
import { dirs, gtdTasks, kbDocuments, kbs, skills, versionTexts } from '../db/schema'
import { ancestorIdsOf, assertMoveAllowed, SkillService } from './skill'

/**
 * 统一 dirs 树在线服务（project 根 + dir 子树）。
 *
 * 结构靠 parent_id 链；层级查询走「按 projectId 拉全树 + buildDirTree 内存组装」。
 * project_id 是 walkToProjectRoot 派生冗余缓存（server 维护，非 LWW）：
 * - create/move 后落库重算受影响行的 projectId
 * - 跨 project move 级联子树 dirs 的 projectId（gtd_tasks 仅认 mountDirId）
 *
 * 错误：结构违规 → ProjectDirError（→409）；不可见/已删 → notFound（→404）。
 * ACL v1 骨架：单用户期 owner 恒过，grants 空。
 */

/** drizzle 事务 tx 类型 */
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

/** DB 行（timestamptz Date）→ 领域 DirRow（ISO string） */
function dbRowToDir(row: DirDbRow): DirRow {
  return {
    id: row.id,
    parentId: row.parentId,
    kind: row.kind as DirRow['kind'],
    name: row.name,
    sortOrder: row.sortOrder,
    projectId: row.projectId,
    vdir: row.vdir,
    acl: (row.acl ?? {}) as DirRow['acl'],
    ownerId: row.ownerId,
    etag: row.etag,
    deleted: row.deleted,
    createdAt: row.createdAt.toISOString(),
    updatedAt: (row.updatedAt ?? row.createdAt).toISOString(),
  }
}

/** 拉某用户全部 live dirs → DirRow[]（按 sortOrder 排序交给 buildDirTree） */
async function loadLiveDirs(userId: string, tx?: Tx): Promise<DirRow[]> {
  const q = (tx ?? db).select().from(dirs).where(and(eq(dirs.userId, userId), eq(dirs.deleted, false)))
  const rows = await q
  return rows.map(dbRowToDir)
}

/** 按 id 查单条 live dir（含归属校验：非本人 → 404） */
async function loadOwnedDir(id: string, userId: string, tx?: Tx): Promise<DirRow> {
  const [row] = await (tx ?? db).select().from(dirs).where(and(eq(dirs.id, id), eq(dirs.deleted, false))).limit(1)
  if (!row || row.userId !== userId)
    throw new ProjectDirError('dir/project 不存在或不可见')
  return dbRowToDir(row)
}

export interface DirDto {
  id: string
  userId: string
  parentId: string | null
  kind: 'project' | 'dir'
  name: string
  sortOrder: number
  projectId: string
  vdir: string
  acl: DirRow['acl']
  ownerId: string
  etag: number
  createdAt: string
  updatedAt: string | null
}

function toDto(row: DirDbRow): DirDto {
  return {
    id: row.id,
    userId: row.userId,
    parentId: row.parentId,
    kind: row.kind as DirDto['kind'],
    name: row.name,
    sortOrder: row.sortOrder,
    projectId: row.projectId,
    vdir: row.vdir,
    acl: (row.acl ?? {}) as DirRow['acl'],
    ownerId: row.ownerId,
    etag: row.etag,
    createdAt: row.createdAt.toISOString(),
    updatedAt: (row.updatedAt ?? row.createdAt).toISOString(),
  }
}

/** 落库 upsert 一行 dir（领域 DirRow → DB insert 列；ISO→Date） */
async function upsertDir(dir: DirRow, tx: Tx): Promise<void> {
  const values = {
    id: dir.id,
    userId: dir.ownerId, // 单用户期：dir 的 userId = owner；多用户期需显式 userId 列传递
    parentId: dir.parentId,
    kind: dir.kind,
    name: dir.name,
    sortOrder: dir.sortOrder,
    projectId: dir.projectId,
    vdir: dir.vdir,
    acl: dir.acl,
    ownerId: dir.ownerId,
    etag: dir.etag,
    deleted: dir.deleted,
    createdAt: new Date(dir.createdAt),
    updatedAt: new Date(dir.updatedAt ?? dir.createdAt),
  }
  await tx.insert(dirs).values(values).onConflictDoUpdate({
    target: dirs.id,
    set: {
      parentId: dir.parentId,
      kind: dir.kind,
      name: dir.name,
      sortOrder: dir.sortOrder,
      projectId: dir.projectId,
      vdir: dir.vdir,
      acl: dir.acl,
      ownerId: dir.ownerId,
      etag: dir.etag,
      deleted: dir.deleted,
      updatedAt: new Date(dir.updatedAt ?? dir.createdAt),
    },
  })
}

export class ProjectService {
  /** 列出用户全部 live dirs 树（扁平 DirDto[]，client 端 buildDirTree 组装） */
  static async listTree(userId: string): Promise<DirDto[]> {
    const rows = await db.select().from(dirs).where(and(eq(dirs.userId, userId), eq(dirs.deleted, false)))
    return rows.map(toDto)
  }

  /** 仅列出 project 根（kind=project） */
  static async listProjects(userId: string): Promise<DirDto[]> {
    const rows = await db.select().from(dirs).where(and(eq(dirs.userId, userId), eq(dirs.deleted, false), eq(dirs.kind, 'project')))
    return rows.map(toDto)
  }

  /** 创建 project 根 */
  static async createProject(userId: string, input: { name: string, sortOrder?: number }): Promise<DirDto> {
    const now = new Date().toISOString()
    const id = randomUUID()
    const dir = makeDir({
      id,
      parentId: null,
      kind: 'project',
      name: input.name,
      ownerId: userId,
      now,
      sortOrder: input.sortOrder ?? 0,
    })
    await db.transaction(async (tx) => {
      await assertNameUnique(tx, userId, null, input.name, id)
      await upsertDir(dir, tx)
    })
    const [row] = await db.select().from(dirs).where(eq(dirs.id, id)).limit(1)
    return toDto(row!)
  }

  /** 创建 dir 子节点 */
  static async createDir(userId: string, input: { parentId: string, name: string, sortOrder?: number }): Promise<DirDto> {
    const now = new Date().toISOString()
    const id = randomUUID()
    const dir = await db.transaction(async (tx) => {
      const parent = await loadOwnedDir(input.parentId, userId, tx)
      await assertNameUnique(tx, userId, input.parentId, input.name, id)
      const dir = makeDir({
        id,
        parentId: parent.id,
        kind: 'dir',
        name: input.name,
        ownerId: userId,
        now,
        projectId: parent.projectId,
        parentVdir: parent.vdir,
        sortOrder: input.sortOrder ?? 0,
      })
      await upsertDir(dir, tx)
      return dir
    })
    const [row] = await db.select().from(dirs).where(eq(dirs.id, dir.id)).limit(1)
    return toDto(row!)
  }

  /** 改名（不动结构；重算子树 vdir） */
  static async rename(userId: string, id: string, newName: string): Promise<DirDto> {
    await db.transaction(async (tx) => {
      const node = await loadOwnedDir(id, userId, tx)
      if (node.name === newName)
        return
      await assertNameUnique(tx, userId, node.parentId, newName, id)
      const now = new Date().toISOString()
      const renamed = renameDir(node, newName, now)
      await upsertDir(renamed, tx)
      // 子树 vdir 重算（rename 改本行 vdir，后代 vdir 前缀随之变）
      const allDirs = await loadLiveDirs(userId, tx)
      const subtree = collectSubtree(allDirs, id)
      const newVdirs = recomputeSubtreeVdirs(subtree, renamed.parentId == null ? null : parentVdirOf(allDirs, renamed.parentId))
      for (const d of subtree) {
        const v = newVdirs.get(d.id)
        if (v && v !== d.vdir) {
          await tx.update(dirs).set({ vdir: v, etag: d.etag + 1, updatedAt: new Date(now) }).where(eq(dirs.id, d.id))
        }
      }
    })
    const [row] = await db.select().from(dirs).where(eq(dirs.id, id)).limit(1)
    return toDto(row!)
  }

  /**
   * 移动 dir 到新父。
   * 跨 project move：级联子树 dirs 的 projectId（movedProjectId）。
   * 同 project move：仅改 parentId + 重算子树 vdir，不动 projectId。
   * gtd_tasks 仅认 mountDirId（无 projectId 列），不级联刷 task。
   */
  static async move(userId: string, id: string, input: { newParentId: string, sortOrder?: number }): Promise<DirDto> {
    const moveResult = await db.transaction(async (tx) => {
      const node = await loadOwnedDir(id, userId, tx)
      if (node.kind === 'project')
        throw new ProjectDirError('project 不可移动（仅作根）')
      const newParent = await loadOwnedDir(input.newParentId, userId, tx)
      const allDirs = await loadLiveDirs(userId, tx)
      const tree = buildDirTree(allDirs)
      const siblingNames = allDirs
        .filter(d => d.parentId === newParent.id && d.id !== node.id)
        .map(d => d.name)
      assertMoveValid(node, newParent, tree, siblingNames)
      await assertMoveAllowed(userId, id, newParent.id)

      // kb/skill 互斥 + 文档归属：事务内拦截避免 partial failure
      const movingSubtree = collectSubtree(allDirs, id)
      const movingSubtreeIds = movingSubtree.map(d => d.id)
      const destChain = ancestorIdsOf(allDirs, newParent.id)
      const [destKb] = await tx.select({ dirId: kbs.dirId })
        .from(kbs)
        .where(and(eq(kbs.userId, userId), inArray(kbs.dirId, destChain)))
        .limit(1)
      if (destKb) {
        // 目标在 kb 子树 → 移动子树不能含 skill 或 version_text（互斥）
        const [hasSkill] = await tx.select({ id: skills.id })
          .from(skills)
          .where(and(eq(skills.userId, userId), inArray(skills.dirId, movingSubtreeIds)))
          .limit(1)
        if (hasSkill)
          throw new ProjectDirError('含 skill 的目录不能移入知识库子树')
        const [hasText] = await tx.select({ id: versionTexts.id })
          .from(versionTexts)
          .where(and(eq(versionTexts.userId, userId), inArray(versionTexts.mountDirId, movingSubtreeIds)))
          .limit(1)
        if (hasText)
          throw new ProjectDirError('含 skill 文本的目录不能移入知识库子树')
      }
      else {
        // 目标不在 kb 子树 → 移动子树不能含文档（文档必须挂在 kb 子树内）
        const [hasDoc] = await tx.select({ id: kbDocuments.id })
          .from(kbDocuments)
          .where(and(eq(kbDocuments.userId, userId), inArray(kbDocuments.mountDirId, movingSubtreeIds)))
          .limit(1)
        if (hasDoc)
          throw new ProjectDirError('含文档的目录只能移动到知识库子树内')
      }

      const oldRoot = node.projectId
      const newRoot = newParent.projectId
      if (oldRoot !== newRoot)
        throw new ProjectDirError('禁止跨项目移动目录')
      const now = new Date().toISOString()
      const newProjectId = movedProjectId(oldRoot, newRoot) // null=同 project，不动

      // 本行：parentId + vdir + sortOrder（+ projectId 若跨 project）
      const moved: DirRow = {
        ...node,
        parentId: newParent.id,
        projectId: newProjectId ?? node.projectId,
        vdir: dirVdir(newParent.vdir, node.name),
        sortOrder: input.sortOrder ?? node.sortOrder,
        etag: node.etag + 1,
        updatedAt: now,
      }
      await upsertDir(moved, tx)

      // 后代重算 vdir + 跨 project 级联 projectId（自身已由 moved 落库，跳过）
      const subtree = collectSubtree(allDirs, id)
      const newVdirs = recomputeSubtreeVdirs(subtree, newParent.vdir)
      for (const d of subtree) {
        if (d.id === id)
          continue
        const v = newVdirs.get(d.id) ?? d.vdir
        const pid = newProjectId ?? d.projectId
        if (v !== d.vdir || pid !== d.projectId) {
          await tx.update(dirs)
            .set({ vdir: v, projectId: pid, etag: d.etag + 1, updatedAt: new Date(now) })
            .where(eq(dirs.id, d.id))
        }
      }

      return { subtreeIds: [...subtreeDirIds(tree, id)], newProjectId: newProjectId ?? oldRoot }
    })
    // 级联子树挂载 KB 文档的 kbId + projectId（PG）+ Qdrant setPayload（不重 embed）。
    // 同 project move 只刷 kbId（projectId 不变，冗余写无害）；跨 project 刷两者。
    // 经 KbService 委托，保持 project 域不直接触 Qdrant。tx 外执行（Qdrant 非 PG 事务边界）。
    // 动态 import 破 kb↔project 静态循环。
    const { KbService } = await import('./kb')
    await KbService.syncProjectIdForSubtree(userId, moveResult.subtreeIds, moveResult.newProjectId)
    const [row] = await db.select().from(dirs).where(eq(dirs.id, id)).limit(1)
    return toDto(row!)
  }

  /** 重排（仅改 sortOrder，不动结构；project 根不可 move 但可 reorder） */
  static async reorder(userId: string, id: string, sortOrder: number): Promise<DirDto> {
    await db.transaction(async (tx) => {
      const node = await loadOwnedDir(id, userId, tx)
      await tx.update(dirs).set({ sortOrder, etag: node.etag + 1, updatedAt: new Date() }).where(eq(dirs.id, id))
    })
    const [row] = await db.select().from(dirs).where(eq(dirs.id, id)).limit(1)
    return toDto(row!)
  }

  /** 更新 ACL（v1 骨架） */
  static async updateAcl(userId: string, id: string, acl: DirRow['acl']): Promise<DirDto> {
    await db.transaction(async (tx) => {
      const node = await loadOwnedDir(id, userId, tx)
      await tx.update(dirs).set({ acl, etag: node.etag + 1, updatedAt: new Date() }).where(eq(dirs.id, id))
    })
    const [row] = await db.select().from(dirs).where(eq(dirs.id, id)).limit(1)
    return toDto(row!)
  }

  /** 软删（须空：无子 dir + 无挂载 task/doc；v1 不级联） */
  static async delete(userId: string, id: string): Promise<void> {
    await db.transaction(async (tx) => {
      const node = await loadOwnedDir(id, userId, tx)
      const hasChildren = await tx.select({ id: dirs.id }).from(dirs).where(and(eq(dirs.parentId, id), eq(dirs.deleted, false))).limit(1)
      const hasTaskMounts = await tx.select({ id: gtdTasks.id }).from(gtdTasks).where(and(eq(gtdTasks.userId, userId), eq(gtdTasks.mountDirId, id), eq(gtdTasks.deleted, false))).limit(1)
      const hasDocMounts = await tx.select({ id: kbDocuments.id }).from(kbDocuments).where(and(eq(kbDocuments.userId, userId), eq(kbDocuments.mountDirId, id))).limit(1)
      const hasTextMounts = await SkillService.hasVersionTextMount(userId, id, tx)
      assertCanDelete(hasChildren.length > 0, hasTaskMounts.length > 0 || hasDocMounts.length > 0 || hasTextMounts)
      await tx.update(dirs).set({ deleted: true, etag: node.etag + 1, updatedAt: new Date() }).where(eq(dirs.id, id))
    })
  }
}

// ---------------- 内部 helpers ----------------

/** 同级名唯一校验（partial unique index 兜底；此处提前抛 409 友好错误） */
async function assertNameUnique(tx: Tx, userId: string, parentId: string | null, name: string, excludeId: string): Promise<void> {
  const cond = parentId == null
    ? and(eq(dirs.userId, userId), isNull(dirs.parentId), eq(dirs.name, name), eq(dirs.deleted, false))
    : and(eq(dirs.userId, userId), eq(dirs.parentId, parentId), eq(dirs.name, name), eq(dirs.deleted, false))
  const [dup] = await tx.select({ id: dirs.id }).from(dirs).where(cond).limit(1)
  if (dup && dup.id !== excludeId)
    throw new ProjectDirError(`同级已存在同名: ${name}`)
}

/** 收集 rootDirId 子树全部 DirRow（含自身），扁平 */
function collectSubtree(allDirs: DirRow[], rootDirId: string): DirRow[] {
  const byId = new Map(allDirs.map(d => [d.id, d]))
  const result: DirRow[] = []
  const stack = [rootDirId]
  const seen = new Set<string>()
  while (stack.length > 0) {
    const cur = stack.pop()!
    if (seen.has(cur))
      continue
    seen.add(cur)
    const d = byId.get(cur)
    if (!d)
      continue
    result.push(d)
    for (const child of allDirs) {
      if (child.parentId === cur)
        stack.push(child.id)
    }
  }
  return result
}

/** 取某 dir 的 vdir（用于 recompute 的 newParentVdir 参数） */
function parentVdirOf(allDirs: DirRow[], parentId: string): string | null {
  return allDirs.find(d => d.id === parentId)?.vdir ?? null
}
