/**
 * materialize：EntityRow[] → GtdDocument。
 *
 * 与 dematerialize 互逆：把行形（task_tag 行 / task.data.repeatRule 内联）
 * 折叠成文档形（task.tagIds[] / doc.repeatRules[]）。仅用于导入/导出边界，
 * 不作为运行时同步真相。
 */
import type { GtdDocument, RepeatRule } from './schema'
import type { EntityRow } from './sync-schema'
import { RowStore } from './rows'

/** EntityRow[] → GtdDocument（task_tag 行聚合 → task.tagIds；repeatRule 内联 → doc.repeatRules[]） */
export function materialize(rows: EntityRow[]): GtdDocument {
  const store = new RowStore(rows)
  const tasks = store.liveTasks()
  const folders = store.liveFolders()
  const tags = store.liveTags()
  const projects = store.liveProjects()
  const perspectives = store.livePerspectives()
  const attachments = store.liveAttachments()

  const repeatRuleMap = new Map<string, RepeatRule>()
  for (const t of tasks) {
    if (t.data.repeatRule)
      repeatRuleMap.set(t.data.repeatRule.id, t.data.repeatRule)
  }

  const now = new Date(0).toISOString()
  return {
    version: '1.0.0',
    meta: { createdAt: now, updatedAt: now, schemaVersion: '1' },
    folders: folders.map(f => ({ id: f.id, ...f.data })),
    tags: tags.map(t => ({ id: t.id, ...t.data })),
    projects: projects.map(p => ({ id: p.id, ...p.data })),
    tasks: tasks.map(t => ({
      id: t.id,
      ...t.data,
      tagIds: store.tagIdsOf(t.id),
      attachmentIds: store.attachmentIdsOf(t.id),
    })),
    perspectives: perspectives.map(p => ({ id: p.id, ...p.data })),
    repeatRules: [...repeatRuleMap.values()],
    attachments: attachments.map(a => ({ id: a.id, ...a.data })),
  }
}
