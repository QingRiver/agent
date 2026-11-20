import type { EntityRowOf } from './row-schema'
import { describe, expect, it } from 'vitest'
import { makeTaskRow, makeTaskTagRow } from '../fixtures'
import { normalizeRows } from './normalize-rows'

function taskData(rows: ReturnType<typeof normalizeRows>, id: string) {
  const row = rows.find((r): r is EntityRowOf<'task'> => r.entity === 'task' && r.id === id)
  return row?.data
}

describe('normalizeRows', () => {
  it('过滤指向不存在任务的标签绑定', () => {
    const rows = normalizeRows([makeTaskTagRow('gone', 'g')])
    expect(rows).toEqual([])
  })

  it('按 isTagLive 过滤标签', () => {
    const rows = normalizeRows(
      [makeTaskRow('t1'), makeTaskTagRow('t1', 'live'), makeTaskTagRow('t1', 'dead')],
      { isTagLive: id => id === 'live' },
    )
    expect(rows.filter(r => r.entity === 'task_tag').map(r => r.id)).toEqual(['t1|live'])
  })

  it('子任务挂载跟随根任务，失效则收件箱', () => {
    const input = [
      makeTaskRow('root', { mountDirId: 'gone' }),
      makeTaskRow('child', { parentId: 'root', mountDirId: 'ignored' }),
    ]
    const rows = normalizeRows(input, { isMountValid: () => false })
    expect(taskData(rows, 'root')?.mountDirId).toBeNull()
    expect(taskData(rows, 'child')?.mountDirId).toBeNull()
  })
})
