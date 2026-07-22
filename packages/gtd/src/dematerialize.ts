/**
 * dematerialize：GtdDocument → EntityRow[]（导入边界用）。
 *
 * 与 materialize 互逆：把文档形（task.tagIds[] / doc.repeatRules[]）
 * 拆成行形（task_tag 行 / task.data.repeatRule 内联）。
 * 导入路径用（解析 JSON → doc → dematerialize → 冲突检测 → push）。
 */
import type { GtdDocument } from './schema'
import type { EntityRow } from './sync-schema'

/** GtdDocument → EntityRow[]（拆 tagIds→task_tag 行，repeatRules→task.data.repeatRule 内联） */
export function dematerialize(doc: GtdDocument, userId = 'u1'): EntityRow[] {
  const rows: EntityRow[] = []
  const ruleById = new Map(doc.repeatRules.map(r => [r.id, r]))

  for (const t of doc.tasks) {
    const { tagIds: _t, attachmentIds: _a, ...taskFields } = t
    const rule = t.repeatRuleId ? ruleById.get(t.repeatRuleId) ?? null : null
    rows.push({
      entity: 'task',
      id: t.id,
      userId,
      syncId: 0,
      deleted: false,
      data: { ...taskFields, repeatRule: rule },
    } as unknown as EntityRow)
    for (const tagId of t.tagIds) {
      rows.push({
        entity: 'task_tag',
        id: `${t.id}|${tagId}`,
        userId,
        syncId: 0,
        deleted: false,
        data: { taskId: t.id, tagId },
      })
    }
  }
  for (const p of doc.projects) {
    rows.push({ entity: 'project', id: p.id, userId, syncId: 0, deleted: false, data: p } as unknown as EntityRow)
  }
  for (const f of doc.folders) {
    rows.push({ entity: 'folder', id: f.id, userId, syncId: 0, deleted: false, data: f } as unknown as EntityRow)
  }
  for (const t of doc.tags) {
    rows.push({ entity: 'tag', id: t.id, userId, syncId: 0, deleted: false, data: t } as unknown as EntityRow)
  }
  for (const p of doc.perspectives) {
    rows.push({ entity: 'perspective', id: p.id, userId, syncId: 0, deleted: false, data: p } as unknown as EntityRow)
  }
  for (const a of doc.attachments) {
    rows.push({ entity: 'attachment', id: a.id, userId, syncId: 0, deleted: false, data: a } as unknown as EntityRow)
  }
  return rows
}
