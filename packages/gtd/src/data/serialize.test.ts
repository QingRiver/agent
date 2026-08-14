import type { EntityRow } from './sync-schema'
import { describe, expect, it } from 'vitest'
import { makeRepeatRule, makeTaskRow, makeTaskTagRow } from '../fixtures'
import { NOW_ISO } from '../fixtures/constants'
import { FILTER_FIELD, LEAF_OP, LOGIC_OP } from '../view/filter'
import {
  orderImportRows,
  parseRows,
  remapRowIds,
  serializeRows,
} from './serialize'
import { ATTACHMENT_KIND } from './types'

function makePerspectiveRow(
  id: string,
  filter: unknown = null,
  opts: Partial<Pick<EntityRow, 'userId' | 'syncId' | 'deleted'>> = {},
): EntityRow {
  return {
    entity: 'perspective',
    id,
    userId: opts.userId ?? 'u1',
    syncId: opts.syncId ?? 0,
    deleted: opts.deleted ?? false,
    data: {
      name: '透视',
      icon: null,
      filter: filter as never,
      groupBy: [],
      sortBy: [],
      createdAt: NOW_ISO,
      updatedAt: null,
    },
  }
}

function makeAttachmentRow(id: string, taskId: string): EntityRow {
  return {
    entity: 'attachment',
    id,
    userId: 'u1',
    syncId: 0,
    deleted: false,
    data: {
      taskId,
      kind: ATTACHMENT_KIND.LINK,
      url: 'https://example.com',
      filename: 'x',
      createdAt: NOW_ISO,
    },
  }
}

describe('serializeRows / parseRows', () => {
  it('四种 entity round-trip（无 tag）', () => {
    const rule = makeRepeatRule({ id: 'rr1' })
    const rows: EntityRow[] = [
      makePerspectiveRow('p1'),
      makeTaskRow('t1', { name: '任务', repeatRuleId: 'rr1', repeatRule: rule, mountDirId: 'dir-1' }),
      makeTaskTagRow('t1', 'g1'),
      makeAttachmentRow('a1', 't1'),
    ]
    const now = new Date('2026-08-11T12:00:00.000Z')
    const json = serializeRows(rows, now)
    const parsed = parseRows(json)
    expect(JSON.parse(json).version).toBe('2.0.0')
    expect(JSON.parse(json).exportedAt).toBe(now.toISOString())
    expect(parsed).toHaveLength(4)
    expect(parsed.map(r => r.entity).sort()).toEqual([
      'attachment',
      'perspective',
      'task',
      'task_tag',
    ].sort())
  })

  it('仅导出 deleted=false，且 syncId 重置 0', () => {
    const rows: EntityRow[] = [
      makeTaskRow('t1', { name: '活' }, { syncId: 9 }),
      makeTaskRow('t2', { name: '坟' }, { syncId: 3, deleted: true }),
    ]
    const live = parseRows(serializeRows(rows, new Date('2026-01-01T00:00:00.000Z')))
    expect(live).toHaveLength(1)
    expect(live[0]!.id).toBe('t1')
    expect(live[0]!.syncId).toBe(0)
  })

  it('旧 version 1.0.0 报错', () => {
    expect(() => parseRows(JSON.stringify({
      version: '1.0.0',
      meta: {},
      projects: [],
      tags: [],
      tasks: [],
      perspectives: [],
      repeatRules: [],
      attachments: [],
    }))).toThrow()
  })
})

describe('remapRowIds', () => {
  it('换新 id、保留 mountDirId、保留 task_tag.tagId、更新引用与信封', () => {
    const rule = makeRepeatRule({ id: 'rr1' })
    const rows: EntityRow[] = [
      makeTaskRow('parent', { name: '父', mountDirId: 'dir-keep' }),
      makeTaskRow('child', {
        name: '子',
        parentId: 'parent',
        mountDirId: 'dir-keep',
        repeatRuleId: 'rr1',
        repeatedFromTaskId: 'parent',
        repeatRule: rule,
      }),
      makeTaskTagRow('child', 'ext-tag-g1'),
      makeAttachmentRow('a1', 'child'),
    ]
    const out = remapRowIds(rows, 'user-new')
    const byOldShape = {
      tasks: out.filter(r => r.entity === 'task'),
      taskTags: out.filter(r => r.entity === 'task_tag'),
      attachments: out.filter(r => r.entity === 'attachment'),
    }
    expect(byOldShape.tasks.map(t => t.id)).not.toContain('parent')
    expect(byOldShape.tasks.map(t => t.id)).not.toContain('child')

    const parent = byOldShape.tasks.find(t => t.data.name === '父')!
    const child = byOldShape.tasks.find(t => t.data.name === '子')!
    expect(parent.data.mountDirId).toBe('dir-keep')
    expect(child.data.mountDirId).toBe('dir-keep')
    expect(child.data.parentId).toBe(parent.id)
    expect(child.data.repeatedFromTaskId).toBe(parent.id)
    expect(child.data.repeatRuleId).toBe(child.data.repeatRule!.id)
    expect(child.data.repeatRule!.id).not.toBe('rr1')

    const tt = byOldShape.taskTags[0]!
    expect(tt.data.tagId).toBe('ext-tag-g1')
    expect(tt.data.taskId).toBe(child.id)
    expect(tt.id).toBe(`${child.id}|ext-tag-g1`)

    expect(byOldShape.attachments[0]!.data.taskId).toBe(child.id)
    expect(out.every(r => r.userId === 'user-new' && r.syncId === 0 && r.deleted === false)).toBe(true)
  })

  it('递归 remap perspective.filter 内 EntityRef.id；外部 tag id / name 引用不动', () => {
    const filter = {
      op: LOGIC_OP.AND,
      children: [
        {
          op: LOGIC_OP.NOT,
          child: {
            op: LEAF_OP.SOME,
            field: FILTER_FIELD.TAG,
            value: [{ id: 'ext-tag-g1' }, { name: '按名' }],
          },
        },
        {
          op: LEAF_OP.SOME,
          field: FILTER_FIELD.PROJECT,
          value: [{ id: 't1' }],
        },
      ],
    }
    const rows: EntityRow[] = [
      makeTaskRow('t1', { name: '任务' }),
      makePerspectiveRow('p1', filter),
    ]
    const out = remapRowIds(rows, 'u2')
    const taskId = out.find(r => r.entity === 'task')!.id
    const pers = out.find(r => r.entity === 'perspective')!
    const f = pers.data.filter as unknown as {
      children: [
        { child: { value: Array<{ id?: string, name?: string }> } },
        { value: Array<{ id?: string }> },
      ]
    }
    // tag catalog 外部：不 remap
    expect(f.children[0].child.value[0]!.id).toBe('ext-tag-g1')
    expect(f.children[0].child.value[1]).toEqual({ name: '按名' })
    // 行集内 task id 仍 remap
    expect(f.children[1].value[0]!.id).toBe(taskId)
  })
})

describe('orderImportRows', () => {
  it('perspectives → tasks(父先子) → task_tag → attachments', () => {
    const rows: EntityRow[] = [
      makeAttachmentRow('a1', 'child'),
      makeTaskTagRow('child', 'g1'),
      makeTaskRow('child', { parentId: 'parent', name: '子' }),
      makeTaskRow('parent', { name: '父' }),
      makePerspectiveRow('p1'),
    ]
    const ordered = orderImportRows(rows)
    expect(ordered.map(r => r.entity)).toEqual([
      'perspective',
      'task',
      'task',
      'task_tag',
      'attachment',
    ])
    const tasks = ordered.filter(r => r.entity === 'task')
    expect(tasks[0]!.data.name).toBe('父')
    expect(tasks[1]!.data.name).toBe('子')
  })
})
