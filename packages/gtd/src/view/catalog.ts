/**
 * 目录投影（project / dir / tag 名称）：真相在 DirStore / TagsStore，
 * 注入 FilterEvalContext / RenderContext，不挂在 RowStore 上。
 */
import type { EntityRowOf } from '../data/sync-schema'

export interface CatalogProjection {
  /** task 所属 project 根 id；client 注入 walkToProjectRoot(mountDirId) */
  projectOf?: (task: EntityRowOf<'task'>) => string | null
  /** dirs id → 展示名（project 分组标题） */
  dirNameOf?: (dirId: string) => string | null
  /** tag id → 展示名（tag 分组标题） */
  tagNameOf?: (tagId: string) => string | null
}
