import type { RunAgentInput } from '@ag-ui/core'
import { describe, expect, it } from 'vitest'
import { resolveResumeFromRunAgentInput } from './resolveResumeInput'

function baseInput(overrides: Partial<RunAgentInput> = {}): RunAgentInput {
  return {
    threadId: 't1',
    runId: 'r1',
    messages: [],
    tools: [],
    context: [],
    ...overrides,
  }
}

describe('resolveResumeFromRunAgentInput', () => {
  it('returns undefined when resume is missing', () => {
    expect(resolveResumeFromRunAgentInput(baseInput())).toBeUndefined()
    expect(resolveResumeFromRunAgentInput(baseInput({ resume: [] }))).toBeUndefined()
  })

  it('returns single resolved payload', () => {
    expect(resolveResumeFromRunAgentInput(baseInput({
      resume: [{
        interruptId: 'i1',
        status: 'resolved',
        payload: { approved: true },
      }],
    }))).toEqual({ approved: true })
  })

  it('maps multiple resolved entries by interruptId', () => {
    expect(resolveResumeFromRunAgentInput(baseInput({
      resume: [
        { interruptId: 'a', status: 'resolved', payload: { value: '1' } },
        { interruptId: 'b', status: 'resolved', payload: { value: '2' } },
      ],
    }))).toEqual({
      a: { value: '1' },
      b: { value: '2' },
    })
  })

  it('maps all-cancelled to rejection decision', () => {
    expect(resolveResumeFromRunAgentInput(baseInput({
      resume: [
        { interruptId: 'a', status: 'cancelled' },
        { interruptId: 'b', status: 'cancelled' },
      ],
    }))).toEqual({ approved: false, reason: '用户取消' })
  })

  it('ignores forwardedProps.command.resume (no CopilotKit legacy path)', () => {
    expect(resolveResumeFromRunAgentInput(baseInput({
      forwardedProps: {
        command: { resume: { approved: true } },
      },
    }))).toBeUndefined()
  })
})
