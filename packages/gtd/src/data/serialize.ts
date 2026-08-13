/**
 * 行级导入导出：EntityRow[] ↔ JSON（version 2.0.0）。
 * 替代已废的 GtdDocument materialize/dematerialize 边界。
 */
import type { FilterNode } from '../view/filter'
import type { EntityRow, EntityRowOf, SyncEntity } from './sync-schema'
import { match } from 'ts-pattern'
import { z } from 'zod'
import { EntityRowSchema } from './sync-schema'

export const EXPORT_FILE_VERSION = '2.0.0' as const

export const ExportFileSchema = z.object({
  version: z.literal(EXPORT_FILE_VERSION),
  exportedAt: z.string(),
  rows: z.array(EntityRowSchema),
})

export type ExportFile = z.infer<typeof ExportFileSchema>

/** 行级导出：仅 live 行，syncId 重置 0。`now` 由调用方注入。 */
export function serializeRows(rows: EntityRow[], now: Date): string {
  const live = rows.filter(r => !r.deleted).map(r => ({ ...r, syncId: 0 }))
  const file: ExportFile = {
    version: EXPORT_FILE_VERSION,
    exportedAt: now.toISOString(),
    rows: EntityRowSchema.array().parse(live),
  }
  return JSON.stringify(file)
}

/** 行级导入：旧 1.0.0 因 version literal 校验失败直接 throw。 */
export function parseRows(json: string): EntityRow[] {
  return ExportFileSchema.parse(JSON.parse(json)).rows
}

/**
 * 导入 id remap：GTD 行集内 id 全换新 uuid；mountDirId/projectId 保留；
 * 递归更新 perspective.filter 内 EntityRef.id；信封重置。
 */
export function remapRowIds(rows: EntityRow[], userId: string): EntityRow[] {
  const idMap = new Map<string, string>()
  const mapId = (oldId: string): string => {
    let n = idMap.get(oldId)
    if (!n) {
      n = crypto.randomUUID()
      idMap.set(oldId, n)
    }
    return n
  }
  const mapOpt = (id: string | null | undefined): string | null =>
    id == null ? null : mapId(id)

  for (const r of rows) {
    if (r.entity === 'task' || r.entity === 'tag' || r.entity === 'perspective' || r.entity === 'attachment')
      mapId(r.id)
  }

  return rows.map((r) => {
    const base = { userId, syncId: 0, deleted: false as const }
    return match(r)
      .with({ entity: 'tag' }, row => ({
        ...base,
        entity: 'tag' as const,
        id: mapId(row.id),
        data: { ...row.data },
      }))
      .with({ entity: 'perspective' }, (row) => {
        const { filter, ...rest } = row.data
        return {
          ...base,
          entity: 'perspective' as const,
          id: mapId(row.id),
          data: {
            ...rest,
            filter: filter == null ? null : remapFilterNode(filter, idMap),
          },
        }
      })
      .with({ entity: 'attachment' }, row => ({
        ...base,
        entity: 'attachment' as const,
        id: mapId(row.id),
        data: { ...row.data, taskId: mapId(row.data.taskId) },
      }))
      .with({ entity: 'task_tag' }, (row) => {
        const taskId = mapId(row.data.taskId)
        const tagId = mapId(row.data.tagId)
        return {
          ...base,
          entity: 'task_tag' as const,
          id: `${taskId}|${tagId}`,
          data: { taskId, tagId },
        }
      })
      .with({ entity: 'task' }, (row) => {
        const d = row.data
        const repeatRule = d.repeatRule
          ? { ...d.repeatRule, id: mapId(d.repeatRule.id) }
          : (d.repeatRule ?? null)
        return {
          ...base,
          entity: 'task' as const,
          id: mapId(row.id),
          data: {
            ...d,
            parentId: mapOpt(d.parentId),
            repeatRuleId: mapOpt(d.repeatRuleId),
            repeatedFromTaskId: mapOpt(d.repeatedFromTaskId),
            // mountDirId / projectId：dirs 树不在行集，保留原值
            mountDirId: d.mountDirId,
            projectId: d.projectId,
            repeatRule,
          },
        }
      })
      .exhaustive()
  })
}

/** 导入拓扑序：tags → perspectives → tasks(父先子) → task_tag → attachments */
export function orderImportRows(rows: EntityRow[]): EntityRow[] {
  const byEntity = <E extends SyncEntity>(e: E): EntityRowOf<E>[] =>
    rows.filter((r): r is EntityRowOf<E> => r.entity === e)

  const tags = byEntity('tag')
  const perspectives = byEntity('perspective')
  const taskTags = byEntity('task_tag')
  const attachments = byEntity('attachment')
  const tasks = byEntity('task')

  const taskById = new Map(tasks.map(t => [t.id, t]))
  const orderedTasks: EntityRowOf<'task'>[] = []
  const seen = new Set<string>()
  const visit = (t: EntityRowOf<'task'>) => {
    if (seen.has(t.id))
      return
    seen.add(t.id)
    const parentId = t.data.parentId
    if (parentId) {
      const parent = taskById.get(parentId)
      if (parent)
        visit(parent)
    }
    orderedTasks.push(t)
  }
  for (const t of tasks)
    visit(t)

  return [...tags, ...perspectives, ...orderedTasks, ...taskTags, ...attachments]
}

// ---------- filter EntityRef remap（结构遍历，避免 data→view 硬依赖类型） ----------

function remapEntityRef(value: unknown, idMap: Map<string, string>): unknown {
  if (value == null || typeof value !== 'object' || Array.isArray(value))
    return value
  const obj = value as Record<string, unknown>
  const hasId = typeof obj.id === 'string'
  const hasName = typeof obj.name === 'string'
  if (!hasId && !hasName)
    return value
  // EntityRef：至少 id 或 name；有 id 且在映射表则替换
  if (hasId && idMap.has(obj.id as string)) {
    return { ...obj, id: idMap.get(obj.id as string) }
  }
  return value
}

function remapFilterNode(node: FilterNode, idMap: Map<string, string>): FilterNode {
  switch (node.op) {
    case 'and':
    case 'or':
      return {
        op: node.op,
        children: node.children.map(c => remapFilterNode(c, idMap)),
      }
    case 'not':
      return {
        op: node.op,
        child: remapFilterNode(node.child, idMap),
      }
    default: {
      const v = node.value
      if (Array.isArray(v)) {
        return { op: node.op, field: node.field, value: v.map(item => remapEntityRef(item, idMap)) }
      }
      return { op: node.op, field: node.field, value: remapEntityRef(v, idMap) }
    }
  }
}
