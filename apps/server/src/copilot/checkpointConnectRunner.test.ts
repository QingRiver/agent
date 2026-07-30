import { EventType } from '@ag-ui/core'
import { describe, expect, it } from 'vitest'
import { buildCheckpointReplayRun } from './checkpointConnectRunner'

describe('buildCheckpointReplayRun', () => {
  it('无 pending 时以 RUN_FINISHED(success) 结束', () => {
    const events = buildCheckpointReplayRun('t1', [{ id: 'm1', role: 'user', content: 'hi' }], null)
    expect(events[0]?.type).toBe(EventType.RUN_STARTED)
    expect(events[1]).toMatchObject({
      type: EventType.MESSAGES_SNAPSHOT,
      messages: [{ id: 'm1', role: 'user', content: 'hi' }],
    })
    expect(events.at(-1)).toMatchObject({
      type: EventType.RUN_FINISHED,
      outcome: { type: 'success' },
    })
  })

  it('有 pending 时投影 RUN_FINISHED(interrupt)', () => {
    const pending = {
      interruptId: 'id-approval',
      type: 'approval' as const,
      message: '确认执行？',
      details: '转账 100',
    }
    const events = buildCheckpointReplayRun('t1', [{ id: 'm1', role: 'assistant', content: '…' }], pending)
    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: EventType.RUN_FINISHED,
        outcome: {
          type: 'interrupt',
          interrupts: [expect.objectContaining({ id: 'id-approval', reason: 'confirmation' })],
        },
      }),
    ]))
    expect(events.some(e => e.type === EventType.RUN_FINISHED && (e as { outcome?: { type: string } }).outcome?.type === 'success')).toBe(false)
  })

  it('无消息但有 pending 时仍投影 interrupt 事件', () => {
    const pending = {
      interruptId: 'id-select',
      type: 'select' as const,
      message: '选城市',
      options: [{ label: '北京', value: 'bj' }],
    }
    const events = buildCheckpointReplayRun('t1', [], pending)
    expect(events[1]).toMatchObject({ type: EventType.MESSAGES_SNAPSHOT, messages: [] })
    expect(events.at(-1)).toMatchObject({
      type: EventType.RUN_FINISHED,
      outcome: { type: 'interrupt' },
    })
  })
})
