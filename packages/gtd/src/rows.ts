import type { EntityRow, EntityRowOf, SyncEntity } from './sync-schema'

/**
 * RowStore：EntityRow[] 的封装，作为领域纯函数的输入。
 *
 * 替代 GtdDocument 作为领域纯函数输入：renderPerspective / computeStatus /
 * validateInvariants 等改吃 RowStore，不再经 GtdDocument 整棵树。
 *
 * 类型收窄：liveTasks() 等用类型谓词 filter 返回具体 EntityRowOf<E>，
 * tagIdsOf / attachmentIdsOf 从 task_tag / attachment 行聚合（替代 Task.tagIds[]）。
 *
 * Phase 1（统一 dirs 树）：project/folder entity 退出 sync，project_id 改 server 派生冗余缓存。
 * @agent/gtd 不依赖 @agent/project，故 dirs 派生信息（project 根 / 文件夹语义）由调用方经
 * `projectOf` / `isDirMount` 注入槽提供；缺省回退 task.data.projectId 缓存 / 非 dir 挂载。
 */
export interface DirProjection {
  /** task 所属 project 根 id（优先于 task.data.projectId 缓存）；client 注入 walkToProjectRoot */
  projectOf?: (task: EntityRowOf<'task'>) => string | null
  /** task 的 mountDirId 是否指向 kind=dir 节点（文件夹语义，§8.1）；client 注入 dirs 查询 */
  isDirMount?: (task: EntityRowOf<'task'>) => boolean
}

export class RowStore {
  private rows: EntityRow[]
  readonly projectOf?: ((task: EntityRowOf<'task'>) => string | null) | undefined
  readonly isDirMount?: ((task: EntityRowOf<'task'>) => boolean) | undefined

  constructor(rows: EntityRow[] = [], projection?: DirProjection) {
    this.rows = rows
    this.projectOf = projection?.projectOf
    this.isDirMount = projection?.isDirMount
  }

  /** 全部行（含软删），只读 */
  allRows(): readonly EntityRow[] {
    return this.rows
  }

  /** live 行 by entity（类型谓词收窄） */
  liveTasks(): EntityRowOf<'task'>[] {
    return this.live('task')
  }

  liveTags(): EntityRowOf<'tag'>[] {
    return this.live('tag')
  }

  livePerspectives(): EntityRowOf<'perspective'>[] {
    return this.live('perspective')
  }

  liveAttachments(): EntityRowOf<'attachment'>[] {
    return this.live('attachment')
  }

  liveTaskTags(): EntityRowOf<'task_tag'>[] {
    return this.live('task_tag')
  }

  /** 按 entity + id 查找 live 行 */
  findLive<E extends SyncEntity>(entity: E, id: string): EntityRowOf<E> | undefined {
    return this.rows.find(
      (r): r is EntityRowOf<E> => r.entity === entity && r.id === id && !r.deleted,
    )
  }

  /** task 的 tagId 列表（从 live task_tag 行聚合，替代 Task.tagIds[]） */
  tagIdsOf(taskId: string): string[] {
    return this.liveTaskTags()
      .filter(tt => tt.data.taskId === taskId)
      .map(tt => tt.data.tagId)
  }

  /** task 的 attachment id 列表（从 live attachment 行聚合，替代 Task.attachmentIds[]） */
  attachmentIdsOf(taskId: string): string[] {
    return this.liveAttachments()
      .filter(a => a.data.taskId === taskId)
      .map(a => a.id)
  }

  /** 全部 live 行（不含软删） */
  liveAll(): EntityRow[] {
    return this.rows.filter(r => !r.deleted)
  }

  /** 内部：按 entity 类型谓词 filter */
  private live<E extends SyncEntity>(entity: E): EntityRowOf<E>[] {
    return this.rows.filter(
      (r): r is EntityRowOf<E> => r.entity === entity && !r.deleted,
    )
  }
}
