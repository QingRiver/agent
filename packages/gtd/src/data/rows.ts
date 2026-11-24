/**
 * 行级查询助手（L0，不依赖 state/derived）。
 *
 * `liveTasks` 在此定义，供 `data/normalize-rows`、`state/model` 共用，避免 data 层反向依赖 state。
 */
import type { EntityRow, EntityRowOf } from './row-schema'

export type TaskRow = EntityRowOf<'task'>

/** 未软删的 task 行。 */
export function liveTasks(rows: readonly EntityRow[]): TaskRow[] {
  return rows.filter((row): row is TaskRow => row.entity === 'task' && !row.deleted)
}
