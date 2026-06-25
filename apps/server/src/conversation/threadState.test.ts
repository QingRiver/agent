import { describe, expect, it } from 'vitest'
import { extractPendingInterruptFromSnapshot } from './threadState'

describe('extractPendingInterruptFromSnapshot', () => {
  it('解析 select 中断的 options 字段', () => {
    const pending = extractPendingInterruptFromSnapshot({
      tasks: [{
        interrupts: [{
          id: '90c3ab50eec592187749233e7ca613bc',
          value: {
            type: 'select',
            message: '请选择优先级',
            options: [{ label: '高', value: 'high' }],
          },
        }],
      }],
    } as never)

    expect(pending).toEqual({
      interruptId: '90c3ab50eec592187749233e7ca613bc',
      type: 'select',
      message: '请选择优先级',
      options: [{ label: '高', value: 'high' }],
    })
  })
})
